// Imprimantes mystère : tirage de skins de Cocotte ou de décors du plan de travail + collection
import { DATA, state, addCrystals, collectionBonus, hasTalent, dupBonus, skinDupes, bgDupes } from './state.js';
import { $, $$, emit, toast, sleep, reducedMotion, esc } from './core.js';
import { skinById, rarityOf, skinImage } from './skins.js';
import { bgById, bgThumb } from './backgrounds.js';
import { save } from './save.js';
import { petById, petEmoji, petName, fxById, titleUnlocked, setTitle, petLevel } from './cosmetics.js';
import { sfx } from './audio.js';

const RANK = { commune: 0, rare: 1, epique: 2, legendaire: 3, evenement: 4 };
const cfg = () => DATA.config.gacha || {};
const cost10 = () => (cfg().cost10 ?? 225) - (hasTalent('impression') ? 25 : 0);
let busy = false, machine = 'cocotte', collView = 'cocotte';

// Les deux machines partagent la même logique
const M = {
  cocotte: {
    title: 'Imprimante à Cocottes', label: 'COCOTTE·PRINT', unit: 'skin',
    items: () => DATA.skins.filter(s => !s.default && !s.event && !s.craft && !s.mega), all: () => DATA.skins,
    owned: () => state.skins, pity: 'sinceLegend', pulls: 'pulls',
    visual: s => `<img src="${skinImage(s.id)}" alt="">`,
    equipped: id => state.skin === id, equip: id => { state.skin = id; }, byId: skinById,
  },
  decor: {
    title: 'Imprimante à décors', label: 'DÉCOR·PRINT', unit: 'décor',
    items: () => DATA.backgrounds.filter(b => !b.event), all: () => DATA.backgrounds,
    owned: () => state.bgs, pity: 'bgSinceLegend', pulls: 'bgPulls',
    visual: b => bgThumb(b),
    equipped: id => state.bg === id, equip: id => { state.bg = id; }, byId: bgById,
  },
  pet: {
    title: 'Imprimante à compagnons', label: 'COMPAGNON·PRINT', unit: 'compagnon',
    items: () => DATA.pets.filter(p => p.src === 'print'), all: () => DATA.pets,
    owned: () => state.pets, pity: 'petSinceLegend', pulls: 'petPulls',
    visual: p => `<span class="pet-card-ico" aria-hidden="true">${state.pets[p.id] ? petEmoji(p.id) : p.forms[0].e}</span>`,
    equipped: id => state.pet === id, equip: id => { state.pet = id; }, byId: id => ({ ...petById(id), name: petName(id) || petById(id)?.forms[0].name }),
  },
  // Collections sans imprimante
  fx: {
    unit: 'effet', all: () => DATA.effects, owned: () => state.fxOwned,
    visual: f => `<span class="pet-card-ico" aria-hidden="true">${f.icon}</span>`,
    equipped: id => state.fx === id, equip: id => { state.fx = id; }, byId: fxById,
  },
  title: {
    unit: 'titre', all: () => DATA.titles, owned: () => Object.fromEntries(DATA.titles.filter(t => titleUnlocked(t.id)).map(t => [t.id, 1])),
    visual: t => `<span class="title-card">« ${esc(t.label)} »</span>`,
    equipped: id => state.title === id, equip: id => { setTitle(id); }, byId: id => ({ name: DATA.titles.find(t => t.id === id)?.label }),
  },
};
const HOW = { advent: 'Calendrier de l\'Avent 🎄', survivor: 'Co\'Survivor 🧟', chess: 'Échecs ♟️', mega: 'Méga-Prestige 🌌', craft: 'À fabriquer (🛠️ Établi)', ach: 'Succès 🏆' };

function rollRarity(m, minRare) {
  const pity = cfg().pityLegendary || 60;
  if (state.gacha[m.pity] + 1 >= pity) return 'legendaire';
  const total = DATA.rarities.reduce((s, r) => s + r.weight, 0);
  let x = Math.random() * total, pick = DATA.rarities[0].id;
  for (const r of DATA.rarities) { if ((x -= r.weight) < 0) { pick = r.id; break; } }
  if (minRare && RANK[pick] < RANK.rare) pick = 'rare';
  return pick;
}

function rollOne(m, minRare) {
  const rarity = rollRarity(m, minRare);
  const pool = m.items().filter(s => s.rarity === rarity);
  const item = pool.length ? pool[(Math.random() * pool.length) | 0] : m.items()[0];
  state.gacha[m.pulls]++;
  state.gacha[m.pity] = rarity === 'legendaire' ? 0 : state.gacha[m.pity] + 1;
  const owned = m.owned();
  const isNew = !owned[item.id];
  owned[item.id] = (owned[item.id] || 0) + 1;
  const refund = isNew ? 0 : (cfg().refund?.[rarity] ?? 2);
  addCrystals(refund);
  if (!isNew && m === M.pet) state.adv.frag += 20; // doublon de compagnon : fragments pour l'Aventure
  return { item, rarity, isNew, refund };
}

// Impression offerte (recettes de l'Établi) : un tirage sans animation
export function freePull(mk) {
  const m = M[mk];
  if (!m) return null;
  const r = rollOne(m, false);
  renderCollection();
  return r;
}

async function pull(n) {
  if (busy) return;
  const m = M[machine];
  const cost = n === 10 ? cost10() : (cfg().cost1 ?? 25) * n;
  if (state.crystals < cost) {
    sfx.deny();
    toast(`Il vous manque ${cost - state.crystals} cristaux. Gagnez-en dans les mini-jeux, les astuces… ou à La Co'Cotte !`);
    return;
  }
  busy = true;
  addCrystals(-cost);
  const results = [];
  for (let i = 0; i < n; i++) {
    const guarantee = n === 10 && i === 9 && !results.some(r => RANK[r.rarity] >= RANK.rare);
    results.push(rollOne(m, guarantee));
  }
  save();
  emit('refresh');
  renderInfo();
  renderCollection();
  await animate(m, results);
  busy = false;
}

async function animate(m, results) {
  const best = results.reduce((a, r) => (RANK[r.rarity] > RANK[a.rarity] ? r : a));
  const printer = $('#printer'), cap = $('#capsule'), out = $('#gacha-results');
  out.innerHTML = '';
  $$('#pull1, #pull10').forEach(b => (b.disabled = true));
  cap.style.setProperty('--cap', rarityOf(best.rarity).color);
  printer.classList.remove('done', 'printing'); void printer.offsetWidth;
  printer.classList.add('printing');
  const dur = reducedMotion ? 200 : 1600;
  if (!reducedMotion) for (let t = 0; t < dur; t += 160) { sfx.printTick(t / dur); await sleep(160); }
  else await sleep(dur);
  printer.classList.replace('printing', 'done');
  RANK[best.rarity] >= RANK.epique ? sfx.unlock() : sfx.buy();

  out.className = 'gacha-results' + (results.length > 1 ? ' multi' : '');
  results.forEach((r, i) => {
    const rar = rarityOf(r.rarity);
    const li = document.createElement('div');
    li.className = `skin-card r-${r.rarity}${r.isNew ? ' is-new' : ''}`;
    li.style.setProperty('--rc', rar.color);
    li.style.animationDelay = (reducedMotion ? 0 : i * 90) + 'ms';
    const dupPct = m === M.cocotte ? (cfg().dupSkinPct ?? 1) : m === M.pet ? 0 : (cfg().dupBgPct ?? 0.5);
    li.innerHTML = `${m.visual(r.item)}
      <span class="rar">${rar.label}</span>
      ${r.isNew ? '' : `<span class="dup-badge">×${m.owned()[r.item.id]}</span>`}
      <b>${esc(r.item.name)}</b>
      <small>${r.isNew ? 'Nouveau !' : m === M.pet ? `Doublon ! +${r.refund} 💎 et +20 🧬 pour l'Aventure` : `Doublon ! +${fmtPct(dupPct)} de production · +${r.refund} 💎`}</small>
      ${results.length === 1 ? `<button class="equip-btn" data-equip="${machine}:${r.item.id}">Équiper</button>` : ''}`;
    out.appendChild(li);
  });
  $$('#pull1, #pull10').forEach(b => (b.disabled = false));
  toast(`Bonus de collection${results.some(r => !r.isNew) ? ' et doublons' : ''} : +${fmtPct(collectionBonus())} de production`);
}

const fmtPct = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR') + ' %';

function equip(key) {
  const [mk, id] = key.split(':');
  const m = M[mk];
  if (id !== 'auto' && id !== 'none' && !(mk === 'title' && id === '') && !m.owned()[id]) return;
  if (mk === 'pet' && id === 'none') state.pet = null;
  else if (mk === 'decor' && id === 'auto') state.bg = 'auto'; else m.equip(id);
  state.counters.equips++;
  if (mk === 'cocotte' && id === 'glitch') state.flags.glitch = 1;
  if (mk === 'cocotte' && DATA.skins.find(s => s.id === id)?.default && Object.keys(state.skins).length >= 20) state.flags.retour = 1;
  save();
  sfx.buy();
  emit('skin');
  renderCollection();
  toast(id === 'auto' ? "Décor de l'ère rétabli." : id === 'none' ? 'Compagnon rangé.' : mk === 'title' ? `Titre affiché : « ${m.byId(id).name} »` : `${m.byId(id).name} équipé${mk === 'cocotte' ? 'e' : ''} !`);
}

function renderInfo() {
  const m = M[machine];
  const pity = (cfg().pityLegendary || 60) - state.gacha[m.pity];
  const rates = DATA.rarities.map(r => `${r.label} ${r.weight} %`).join(' · ');
  const got = m.items().filter(s => m.owned()[s.id]).length;
  $('#gacha-title').textContent = m.title;
  $('#printer-label').textContent = m.label;
  $('#printer').dataset.machine = machine;
  $('#gacha-info').textContent = `${machine === 'pet' ? 'Les compagnons vivent sur votre plan de travail et partent à l\'Aventure contre les virus. ' : ''}${got}/${m.items().length} ${m.unit}s obtenus. Taux : ${rates}. Légendaire garanti${machine !== 'decor' ? 'e' : ''} dans ${pity} impression${pity > 1 ? 's' : ''} au plus. ×10 : au moins un Rare.`;
  $('#pull1').innerHTML = `Imprimer ×1 <span class="cost">${cfg().cost1 ?? 25} 💎</span>`;
  $('#pull10').innerHTML = `Imprimer ×10 <span class="cost">${cost10()} 💎</span>`;
}

export function renderCollection() {
  const m = M[collView];
  const all = m.all(), got = all.filter(s => m.owned()[s.id]).length;
  const skinsGot = DATA.skins.filter(s => !s.custom && state.skins[s.id]).length, bgGot = DATA.backgrounds.filter(b => state.bgs[b.id]).length;
  const petsGot = DATA.pets.filter(p => state.pets[p.id]).length, fxGot = DATA.effects.filter(f => state.fxOwned[f.id]).length;
  $('#coll-count').textContent = `${skinsGot + bgGot + petsGot + fxGot}/${DATA.skins.filter(s => !s.custom).length + DATA.backgrounds.length + DATA.pets.length + DATA.effects.length}`;
  const sd = skinDupes(), bd = bgDupes();
  $('#coll-bonus').innerHTML = `Chaque nouveau skin de Cocotte donne +${fmtPct(cfg().collectionBonusPct ?? 1)} de production, chaque décor +${fmtPct(cfg().collectionBgPct ?? 0.5)}, chaque compagnon +${fmtPct(cfg().petPct ?? 0.3)}, chaque effet de clic +${fmtPct(cfg().fxPct ?? 0.2)}.
    Chaque <b>doublon</b> ajoute encore +${fmtPct(cfg().dupSkinPct ?? 1)} (Cocotte) ou +${fmtPct(cfg().dupBgPct ?? 0.5)} (décor), sans limite.<br>
    Doublons : <strong>${sd}</strong> Cocotte${sd > 1 ? 's' : ''} · <strong>${bd}</strong> décor${bd > 1 ? 's' : ''} (+${fmtPct(dupBonus())}).
    Bonus total : <strong>+${fmtPct(collectionBonus())}</strong>.`;
  $$('[data-coll]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.coll === collView)));
  $('#coll-sub').textContent = `${got}/${all.length}`;
  const grid = $('#skin-grid');
  const order = [...all].filter(s => !s.custom || m.owned()[s.id]).sort((a, b) => RANK[a.rarity] - RANK[b.rarity]);
  let html = collView === 'pet'
    ? `<li class="skin-card r-commune${!state.pet ? ' equipped' : ''}" style="--rc:#999"><span class="pet-card-ico" aria-hidden="true">🚫</span>
        <span class="rar">Aucun</span><b>Pas de compagnon</b><small>Le plan de travail sans compagnon</small>
        <button class="equip-btn" data-equip="pet:none" ${!state.pet ? 'disabled' : ''}>${!state.pet ? 'Choisi' : 'Ranger'}</button></li>`
    : collView === 'title'
    ? `<li class="skin-card r-commune${!state.title ? ' equipped' : ''}" style="--rc:#999"><span class="title-card">(aucun)</span>
        <span class="rar">Aucun</span><b>Pas de titre</b><small>Seulement le pseudo</small>
        <button class="equip-btn" data-equip="title:" ${!state.title ? 'disabled' : ''}>${!state.title ? 'Choisi' : 'Retirer'}</button></li>`
    : collView === 'decor'
    ? `<li class="skin-card r-commune${state.bg === 'auto' ? ' equipped' : ''}" style="--rc:#999"><span class="bg-thumb era-auto" aria-hidden="true"></span>
        <span class="rar">Par défaut</span><b>Décor de l'ère</b><small>Change avec chaque ère</small>
        <button class="equip-btn" data-equip="decor:auto" ${state.bg === 'auto' ? 'disabled' : ''}>${state.bg === 'auto' ? 'Équipé' : 'Équiper'}</button></li>` : '';
  html += order.map(s => {
    const has = !!m.owned()[s.id], rar = rarityOf(s.rarity), on = m.equipped(s.id), n = m.owned()[s.id] | 0;
    return `<li class="skin-card r-${s.rarity}${has ? '' : ' locked'}${on ? ' equipped' : ''}" style="--rc:${rar.color}">
      ${m.visual(s)}<span class="rar">${rar.label}</span>${n > 1 ? `<span class="dup-badge" title="${n - 1} doublon${n > 2 ? 's' : ''}">×${n}</span>` : ''}
      ${has ? `<b>${esc(collView === 'pet' ? petName(s.id) : collView === 'title' ? '' : s.name)}</b>${collView === 'pet' ? `<small>Niveau ${petLevel(s.id)} · ${({ att: '⚔️ Attaque', tank: '🛡️ Défense', soin: '💚 Soin' })[s.role]}</small>` : collView === 'title' ? `<small>${esc(s.how)}</small>` : s.desc ? `<small>${esc(s.desc)}</small>` : ''}
        <button class="equip-btn" data-equip="${collView}:${s.id}" ${on ? 'disabled' : ''}>${on ? 'Équipé' : 'Équiper'}</button>`
        : collView === 'title' ? `<small>🔒 ${esc(s.how)}</small>`
        : (collView === 'pet' || collView === 'fx') && s.src !== 'print' ? `<b>${esc(collView === 'pet' ? s.forms[0].name : s.name)}</b><small>${HOW[s.src] || ''}</small>`
        : s.event ? `<b>${esc(s.name)}</b><small>Objet d'événement (onglet 🎉)</small>`
        : s.craft ? `<b>${esc(s.name)}</b><small>À fabriquer (🛠️ Établi)</small>`
        : s.mega ? `<b>${esc(s.name)}</b><small>Méga-Prestige niveau ${s.mega} 🌌</small>` : '<b>???</b><small>À imprimer</small>'}</li>`;
  }).join('');
  grid.innerHTML = html;
}

function setTab(tab) {
  ['cocotte', 'decor', 'pet', 'coll'].forEach(t => $(`#tab-${t}`).setAttribute('aria-selected', String(t === tab)));
  $('#panel-print').hidden = tab === 'coll';
  $('#panel-coll').hidden = tab !== 'coll';
  if (tab !== 'coll') {
    machine = tab;
    $('#gacha-results').innerHTML = '';
    $('#printer').classList.remove('printing', 'done');
    renderInfo();
  } else renderCollection();
}

export function openGacha(tab = 'cocotte') {
  setTab(tab);
  renderCollection();
  $('#dlg-gacha').showModal();
}

export function initGacha() {
  $('#pull1').addEventListener('click', () => pull(1));
  $('#pull10').addEventListener('click', () => pull(10));
  ['cocotte', 'decor', 'pet', 'coll'].forEach(t => $(`#tab-${t}`).addEventListener('click', () => { if (!busy) { sfx.ui(); setTab(t); } }));
  $$('[data-coll]').forEach(b => b.addEventListener('click', () => { collView = b.dataset.coll; sfx.ui(); renderCollection(); }));
  $('#dlg-gacha').addEventListener('click', e => {
    const b = e.target.closest('[data-equip]');
    if (b) equip(b.dataset.equip);
  });
}
