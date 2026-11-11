// Améliorations et succès : génération à partir des données, achat, vérification, affichage
import { DATA, state, owned, totalCps, currentEra, achievementBonus, hasTalent } from './state.js';
import { $, asset, toast, emit, esc } from './core.js';
import { fmt } from './format.js';
import { sfx } from './audio.js';
import { save } from './save.js';

// ---------- Construction des listes ----------
export function buildProgress(upg, ach) {
  // Paliers ×2 générés pour chaque bâtiment
  const tiers = DATA.buildings.flatMap(b => upg.buildingTiers.map((t, i) => ({
    id: `${b.id}-t${i + 1}`,
    type: 'building',
    building: b.id,
    mult: 2,
    cost: b.baseCost * t.costMult,
    unlock: { owned: { id: b.id, n: t.owned } },
    name: `${t.name} : ${b.name}`,
    desc: `Production des « ${b.name} » ×2.`,
    img: 'building.' + b.id,
  })));
  DATA.upgradeList = [...tiers, ...upg.upgrades];

  const perBuilding = DATA.buildings.flatMap(b => ach.buildingTemplates.map(t => ({
    id: `${b.id}-${t.n}`,
    cat: 'building',
    img: 'building.' + b.id,
    name: t.name.replace('{b}', b.name),
    desc: t.desc.replace('{b}', b.name),
    cond: { owned: { id: b.id, n: t.n } },
  })));
  DATA.achList = [...ach.list, ...perBuilding];
}

// ---------- Améliorations ----------
function isUnlocked(u) {
  const c = u.unlock || {};
  if (c.owned && owned(c.owned.id) < c.owned.n) return false;
  if (c.clicks && state.totalClicks < c.clicks) return false;
  if (c.earned && state.totalEarned < c.earned) return false;
  if (c.cps && totalCps() < c.cps) return false;
  return true;
}
// Prix réel (talent « Achats groupés »)
export const upgCost = u => u.cost * (hasTalent('soldes2') ? 0.9 : 1);

export const availableUpgrades = () =>
  DATA.upgradeList.filter(u => !state.upgrades[u.id] && isUnlocked(u)).sort((a, b) => a.cost - b.cost);

function buyUpgrade(id) {
  const u = DATA.upgradeList.find(x => x.id === id);
  if (!u || state.upgrades[id]) return;
  if (state.coins < upgCost(u)) { sfx.deny(); return; }
  state.coins -= upgCost(u);
  state.upgrades[id] = true;
  sfx.buy();
  save();
  renderUpgrades(true);
  emit('refresh');
}

let lastSig = '';
// Reconstruit la liste seulement si l'ensemble disponible change, puis met à jour l'état « achetable »
export function renderUpgrades(force = false) {
  const list = availableUpgrades();
  const sig = list.map(u => u.id).join();
  const ul = $('#upgrades');
  if (force || sig !== lastSig) {
    lastSig = sig;
    ul.innerHTML = list.length ? list.map(u => `
      <li><button class="upg" data-upg="${u.id}">
        <span class="upg-ico">${u.img ? `<img src="${asset(u.img)}" alt=""><b>×2</b>` : `<span aria-hidden="true">${u.icon || '⭐'}</span>`}</span>
        <span class="upg-txt"><b>${esc(u.name)}</b><small>${esc(u.desc || '')}</small></span>
        <span class="upg-cost"><img src="${asset('cocoin')}" alt="">${fmt(upgCost(u))}</span>
      </button></li>`).join('')
      : '<li class="upg-empty">De nouvelles améliorations apparaissent en cliquant et en construisant.</li>';
    $('#upg-count').textContent = list.length ? `(${list.length})` : '';
  }
  for (const b of ul.querySelectorAll('.upg')) {
    const u = DATA.upgradeList.find(x => x.id === b.dataset.upg);
    const can = state.coins >= upgCost(u);
    b.classList.toggle('can', can);
    b.classList.toggle('cant', !can);
    b.setAttribute('aria-disabled', String(!can));
    b.setAttribute('aria-label', `${u.name} : ${u.desc || ''} Coût ${fmt(upgCost(u))} Co'Coins${can ? '' : ', pas assez de Co\'Coins'}.`);
  }
}

// ---------- Succès ----------
function stats() {
  return {
    clicks: state.totalClicks,
    earned: state.totalEarned,
    cps: totalCps(),
    era: currentEra().id,
    buildings: Object.values(state.buildings).reduce((a, n) => a + n, 0),
    pulls: state.gacha.pulls,
    skins: Object.keys(state.skins).length,
    legendary: DATA.skins.filter(s => s.rarity === 'legendaire' && state.skins[s.id]).length,
    plays: state.mini.plays,
    stars: state.mini.stars,
    perfect: state.mini.perfect,
    claims: state.claimed.length,
    upgrades: Object.keys(state.upgrades).length,
    golden: state.golden,
    seasons: state.prestige.seasons,
    projects: Object.keys(state.projects).length,
    tips: state.tips.read.length,
    tipsAll: DATA.tips.length && DATA.tips.every(t => state.tips.read.includes(t.id)) ? 1 : 0,
    infosAll: DATA.infos.length && DATA.infos.every(t => state.boosts.infoSeen.includes(t.id)) ? 1 : 0,
    bgs: Object.keys(state.bgs).length,
    bgLegendary: DATA.backgrounds.filter(b => b.rarity === 'legendaire' && state.bgs[b.id]).length,
    puzzles: state.mini.puzzles,
    eventItems: DATA.skins.filter(s => s.event && state.skins[s.id]).length + DATA.backgrounds.filter(b => b.event && state.bgs[b.id]).length,
    glitch: state.skins.glitch ? 1 : 0,
    infos: state.boosts.infoSeen.length,
    quizOk: state.boosts.quizOk,
    streak: state.daily.best,
  };
}
function met(cond, st) {
  return Object.entries(cond).every(([k, v]) => (k === 'owned' ? owned(v.id) >= v.n : (st[k] ?? 0) >= v));
}

// Vérifie les succès ; renvoie le nombre de nouveaux
export function checkAchievements() {
  const st = stats();
  const pct = DATA.config.achievements?.prodBonusPct ?? 1;
  const fresh = DATA.achList.filter(a => !state.achievements[a.id] && met(a.cond, st));
  fresh.forEach(a => (state.achievements[a.id] = Date.now()));
  const n = fresh.length;
  // Au-delà de 2 d'un coup (ex. reprise d'une ancienne partie) : une seule notification groupée
  if (n > 2) toast(`🏆 ${n} succès débloqués d'un coup ! (+${n * pct} % de production)`, 5000);
  else fresh.forEach(a => toast(`🏆 Succès : ${a.name} (+${pct} % de production)`, 5000));
  if (n) { sfx.unlock(); save(); emit('refresh'); }
  return n;
}

const medal = a => a.img ? `<img src="${asset(a.img)}" alt="">` : `<span aria-hidden="true">${a.icon || '🏆'}</span>`;

export function openAchievements() {
  const got = DATA.achList.filter(a => state.achievements[a.id]).length;
  $('#ach-summary').innerHTML = `<strong>${got}/${DATA.achList.length}</strong> succès · bonus de production <strong>+${achievementBonus()} %</strong>`;
  const cats = [['clic', 'Clics'], ['prod', 'Production'], ['cps', 'Vitesse'], ['era', 'Ères'], ['building', 'Bâtiments'],
    ['gacha', 'Imprimante mystère'], ['mini', 'Mini-jeux'], ['special', 'À La Co\'Cotte']];
  $('#ach-list').innerHTML = cats.map(([cat, label]) => {
    const items = DATA.achList.filter(a => a.cat === cat);
    if (!items.length) return '';
    return `<h3>${label}</h3><ul class="ach-grid">${items.map(a => {
      const ok = !!state.achievements[a.id];
      return `<li class="ach cat-${cat}${ok ? ' got' : ''}">
        <span class="medal">${medal(a)}</span>
        <span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span>
        <span class="sr">${ok ? 'obtenu' : 'pas encore obtenu'}</span></li>`;
    }).join('')}</ul>`;
  }).join('');
  $('#dlg-ach').showModal();
}

export function initProgress() {
  $('#upgrades').addEventListener('click', e => {
    const b = e.target.closest('[data-upg]');
    if (b) buyUpgrade(b.dataset.upg);
  });
}
