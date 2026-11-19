// Aventure des compagnons : un idle sans fin. L'équipe (3 compagnons max) combat seule des vagues de virus,
// étage après étage. Les victoires rapportent des fragments 🧬 pour faire monter les compagnons de niveau
// (évolution aux niveaux 10 et 30). Cristaux et matériaux : seulement au 1er passage des étages, plafonnés par jour.
// Continue hors connexion (8 h maximum).
import { DATA, state, addCrystals } from './state.js';
import { $, toast, esc, today } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { fmt } from './format.js';
import { addMats, KINDS } from './materials.js';
import { petById, petEmoji, petName, petLevel, petForm, renderPet } from './cosmetics.js';

const cfg = () => DATA.config.adventure || {};
const BASE = { commune: [10, 60], rare: [13, 76], epique: [17, 96], legendaire: [22, 122] };
const ROLE = { att: [1.35, 0.8], tank: [0.7, 1.7], soin: [0.6, 0.9] };
const ROLE_TXT = { att: '⚔️ Attaque', tank: '🛡️ Défense', soin: '💚 Soin' };
const FORM_MULT = [1, 1.4, 2];
const VIRUSES = [['🦠', 'Virus'], ['🐛', 'Bug'], ['👾', 'Glitch'], ['🧫', 'Malware'], ['🕷️', 'Ver informatique'], ['🪳', 'Cheval de Troie'], ['🦟', 'Spyware'], ['🧿', 'Pop-up maudite']];
const BOSSES = [['🖨️', 'Imprimante folle'], ['☣️', 'Rançongiciel'], ['🤖', 'Robot piraté'], ['🌀', 'Le Grand Bug'], ['💀', 'Virus fantôme'], ['🐲', 'Hydre du réseau']];

// Statistiques d'un compagnon (rareté, rôle, niveau, forme)
export function petStats(id) {
  const p = petById(id);
  if (!p) return { atk: 0, hp: 0, heal: 0 };
  const [a, h] = BASE[p.rarity] || BASE.commune, [ra, rh] = ROLE[p.role] || ROLE.att;
  const g = Math.pow(1.08, petLevel(id) - 1) * FORM_MULT[petForm(id)];
  const atk = a * ra * g;
  return { atk, hp: h * rh * g, heal: p.role === 'soin' ? atk * 1.2 : 0 };
}
const team = () => state.adv.team.filter(id => state.pets[id]);
function teamStats() {
  return team().map(petStats).reduce((t, s) => ({ atk: t.atk + s.atk, hp: t.hp + s.hp, heal: t.heal + s.heal }), { atk: 0, hp: 0, heal: 0 });
}
const isBoss = n => n % 10 === 0;
export function enemy(n) {
  const boss = isBoss(n), [e, name] = boss ? BOSSES[(n / 10 - 1) % BOSSES.length] : VIRUSES[(n - 1) % VIRUSES.length];
  return { e, name: boss ? `${name} (boss)` : name, boss, hp: 60 * Math.pow(1.10, n - 1) * (boss ? 3 : 1), dps: 5 * Math.pow(1.10, n - 1) * (boss ? 1.4 : 1) };
}
// Issue d'un combat : le soin réduit les dégâts reçus de 75 % au plus
export function resolve(n) {
  const t = teamStats(), en = enemy(n);
  const T = en.hp / Math.max(t.atk, 0.01), taken = Math.max(en.dps * 0.25, en.dps - t.heal) * T;
  return { win: t.hp > 0 && taken < t.hp, T, left: Math.max(0, 1 - taken / Math.max(t.hp, 1)), en };
}
export const lvCost = lv => Math.ceil(5 * Math.pow(1.15, lv - 1));
const fragFor = n => 1 + Math.floor(n / 5);
const fightDur = r => Math.min(Math.max(r.T, 2), 12) + 1.5; // secondes (animation + pause)

function rollDay() { const A = state.adv; if (A.day !== today()) { A.day = today(); A.cToday = 0; A.mToday = 0; } }
function randomMat() {
  const ks = KINDS(), tot = ks.reduce((s, k) => s + k.weight, 0);
  let x = Math.random() * tot;
  for (const k of ks) if ((x -= k.weight) < 0) return k.id;
  return ks[0].id;
}

// Applique le résultat d'un combat (out : bilan pour l'affichage)
function apply(n, r, out) {
  const A = state.adv;
  rollDay();
  if (r.win) {
    A.wins++; out.wins++;
    const first = n > A.best;
    const f = fragFor(n) * (first ? 2 : 1);
    A.frag += f; out.frag += f;
    if (first) {
      A.best = n; out.best = n;
      if (A.mToday < (cfg().dailyMats ?? 25)) { const k = randomMat(); addMats({ [k]: 1 }); A.mToday++; out.mats[k] = (out.mats[k] || 0) + 1; }
      if (isBoss(n) && A.cToday < (cfg().dailyCrystals ?? 20)) {
        const c = Math.min(cfg().crystalsPerBoss ?? 5, (cfg().dailyCrystals ?? 20) - A.cToday);
        addCrystals(c); A.cToday += c; out.crystals += c;
      }
      if (A.auto) A.stage = n + 1;
    } else {
      // Farm d'un étage déjà franchi : un matériau de temps en temps, et nouvelle tentative de l'étage suivant
      A.farm++;
      if (A.farm % (cfg().farmMatEvery ?? 20) === 0 && A.mToday < (cfg().dailyMats ?? 25)) { const k = randomMat(); addMats({ [k]: 1 }); A.mToday++; out.mats[k] = (out.mats[k] || 0) + 1; }
      if (A.auto && n === A.best && A.farm % 5 === 0) A.stage = A.best + 1;
    }
  } else {
    out.losses++;
    A.stage = Math.max(1, A.best);
  }
}

// ---------- Boucle idle (tourne en permanence, même dialogue fermé) ----------
let F = null; // combat en cours { n, r, start, dur }
function nextFight() {
  if (!team().length) { F = null; return; }
  const n = Math.max(1, Math.min(state.adv.stage, state.adv.best + 1));
  const r = resolve(n);
  F = { n, r, start: Date.now(), dur: fightDur(r) };
  if ($('#dlg-adv')?.open) animateFight();
}
function tick() {
  if (!F) return nextFight();
  if (Date.now() < F.start + F.dur * 1000) return;
  const out = { wins: 0, losses: 0, frag: 0, crystals: 0, mats: {}, best: 0 };
  apply(F.n, F.r, out);
  state.adv.last = Date.now();
  if (out.best && out.best % 10 === 0) toast(`🦠 Aventure : boss de l'étage ${out.best} vaincu !${out.crystals ? ` +${out.crystals} 💎` : ''}`, 4000);
  if ($('#dlg-adv')?.open) { log(F.r.win ? `✅ Étage ${F.n} : ${F.r.en.name} vaincu ! +${out.frag} 🧬${out.crystals ? ` +${out.crystals} 💎` : ''}${matsTxt(out.mats)}` : `❌ Étage ${F.n} : ${F.r.en.name} trop fort… l'équipe s'entraîne à l'étage ${state.adv.stage}.`); render(); }
  nextFight();
}
const matsTxt = m => Object.entries(m).map(([k, v]) => ` +${v} ${KINDS().find(x => x.id === k)?.icon || ''}`).join('');

// Progression hors connexion (8 h maximum)
function offline() {
  const A = state.adv;
  if (!A.last || !team().length) { A.last = Date.now(); return null; }
  let left = Math.min(Date.now() - A.last, (cfg().offlineHours ?? 8) * 3600e3) / 1000;
  if (left < 30) return null;
  const out = { wins: 0, losses: 0, frag: 0, crystals: 0, mats: {}, best: 0 }, before = A.best;
  for (let i = 0; i < 20000 && left > 0; i++) {
    const n = Math.max(1, Math.min(A.stage, A.best + 1)), r = resolve(n);
    left -= fightDur(r);
    if (left < 0) break;
    apply(n, r, out);
  }
  A.last = Date.now();
  out.gain = A.best - before;
  return out.wins || out.losses ? out : null;
}

// ---------- Affichage ----------
const bar = (pct, cls = '') => `<span class="adv-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`;
function log(txt) {
  const ul = $('#adv-log');
  ul.insertAdjacentHTML('afterbegin', `<li>${txt}</li>`);
  while (ul.children.length > 6) ul.lastElementChild.remove();
}
function animateFight() {
  if (!F) return;
  const t = teamStats(), en = F.r.en, dur = Math.max(0.3, F.dur - 1.5 - (Date.now() - F.start) / 1000);
  $('#adv-enemy').innerHTML = `<span class="adv-ico${en.boss ? ' boss' : ''}">${en.e}</span><b>${esc(en.name)}</b><small>Étage ${F.n} · ❤️ ${fmt(en.hp)} · ⚔️ ${fmt(en.dps)}/s</small>${bar(100, 'en')}`;
  $('#adv-team').innerHTML = `<span class="adv-row">${team().map(id => `<span class="adv-pet" title="${esc(petName(id))}">${petEmoji(id)}</span>`).join('')}</span><b>Votre équipe</b>`
    + `<small>❤️ ${fmt(t.hp)} · ⚔️ ${fmt(t.atk)}/s${t.heal ? ` · 💚 ${fmt(t.heal)}/s` : ''}</small>${bar(100, 'tm')}`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const eb = $('#adv-enemy .adv-bar i'), tb = $('#adv-team .adv-bar i');
    if (!eb || !tb) return;
    // Victoire : le virus tombe à 0 ; défaite : l'équipe tombe à 0 avant
    eb.style.transition = tb.style.transition = `width ${dur}s linear`;
    eb.style.width = F.r.win ? '0%' : `${Math.round(100 * (1 - (dur / Math.max(F.r.T, 0.1))))}%`;
    tb.style.width = F.r.win ? `${Math.round(F.r.left * 100)}%` : '0%';
    $('#adv-arena').classList.toggle('boss', F.r.en.boss);
  }));
}
function render() {
  const A = state.adv;
  $('#adv-top').innerHTML = `<div><b>${A.stage}</b><small>étage en cours</small></div><div><b>${A.best}</b><small>record</small></div>
    <div><b>${fmt(A.frag)}</b><small>🧬 fragments</small></div><div><b>${fmt(A.wins)}</b><small>victoires</small></div>`;
  $('#adv-auto').checked = A.auto;
  rollDay();
  $('#adv-caps').textContent = `Aujourd'hui : ${A.cToday}/${cfg().dailyCrystals ?? 20} 💎 et ${A.mToday}/${cfg().dailyMats ?? 25} matériaux gagnés dans l'Aventure. Hors connexion : ${cfg().offlineHours ?? 8} h maximum.`;
  const owned = DATA.pets.filter(p => state.pets[p.id]);
  $('#adv-pets').innerHTML = owned.map(p => {
    const id = p.id, s = petStats(id), lv = petLevel(id), cost = lvCost(lv), inTeam = A.team.includes(id), next = lv < 10 ? 10 : lv < 30 ? 30 : 0;
    return `<li class="adv-card${inTeam ? ' in' : ''}">
      <span class="adv-ico">${petEmoji(id)}</span>
      <span class="adv-txt"><b>${esc(petName(id))}</b> <small>niv. ${lv}${next ? ` · évolue au niv. ${next}` : ' · forme ultime'}</small>
        <small>${ROLE_TXT[p.role]} · ⚔️ ${fmt(s.atk)} · ❤️ ${fmt(s.hp)}${s.heal ? ` · 💚 ${fmt(s.heal)}` : ''}</small></span>
      <span class="adv-btns">
        <button type="button" data-team="${id}" ${!inTeam && A.team.length >= 3 ? 'disabled' : ''}>${inTeam ? '✓ Équipe' : '+ Équipe'}</button>
        <button type="button" class="primary" data-lvl="${id}" ${A.frag < cost ? 'disabled' : ''}>⬆️ ${fmt(cost)} 🧬</button>
      </span></li>`;
  }).join('');
}

export function openAdventure() {
  render();
  $('#dlg-adv').showModal();
  animateFight();
}

export function initAdventure() {
  const sum = offline();
  if (sum) {
    setTimeout(() => toast(`🦠 Pendant votre absence, vos compagnons ont gagné ${sum.wins} combat${sum.wins > 1 ? 's' : ''} : +${fmt(sum.frag)} 🧬${sum.crystals ? `, +${sum.crystals} 💎` : ''}${matsTxt(sum.mats)}${sum.gain ? ` · record : étage ${state.adv.best}` : ''}.`, 8000), 2500);
    save();
  }
  setInterval(tick, 500);
  $('#btn-adv').addEventListener('click', () => { sfx.ui(); openAdventure(); });
  $('#adv-auto').addEventListener('change', e => { state.adv.auto = e.target.checked; if (e.target.checked) state.adv.stage = state.adv.best + 1; save(); render(); });
  $('#adv-pets').addEventListener('click', e => {
    const t = e.target.closest('[data-team]'), l = e.target.closest('[data-lvl]'), A = state.adv;
    if (t) {
      const id = t.dataset.team;
      if (A.team.includes(id)) { if (A.team.length > 1) A.team = A.team.filter(x => x !== id); else return toast('Gardez au moins un compagnon dans l\'équipe.'); }
      else if (A.team.length < 3) A.team.push(id);
      sfx.ui(); save(); render(); F = null; // nouvelle équipe : le combat recommence
    }
    if (l) {
      const id = l.dataset.lvl, lv = petLevel(id), cost = lvCost(lv);
      if (A.frag < cost) return sfx.deny();
      const form = petForm(id);
      A.frag -= cost;
      state.petLv[id] = { lv: lv + 1, xp: 0 };
      if (petForm(id) > form) { sfx.unlock(); toast(`✨ Évolution ! ${petById(id).forms[form].e} → ${petEmoji(id)} ${petName(id)}`, 5000); } else sfx.buy();
      save(); render(); renderPet();
    }
  });
}
