// Imprimantes mystère : tirage de skins de Cocotte ou de décors du plan de travail + collection
import { DATA, state, addCrystals, collectionBonus, hasTalent } from './state.js';
import { $, $$, emit, toast, sleep, reducedMotion, esc } from './core.js';
import { skinById, rarityOf, skinImage } from './skins.js';
import { bgById, bgThumb } from './backgrounds.js';
import { save } from './save.js';
import { sfx } from './audio.js';

const RANK = { commune: 0, rare: 1, epique: 2, legendaire: 3 };
const cfg = () => DATA.config.gacha || {};
const cost10 = () => (cfg().cost10 ?? 225) - (hasTalent('impression') ? 25 : 0);
let busy = false, machine = 'cocotte', collView = 'cocotte';

// Les deux machines partagent la même logique
const M = {
  cocotte: {
    title: 'Imprimante à Cocottes', label: 'COCOTTE·PRINT', unit: 'skin',
    items: () => DATA.skins.filter(s => !s.default), all: () => DATA.skins,
    owned: () => state.skins, pity: 'sinceLegend', pulls: 'pulls',
    visual: s => `<img src="${skinImage(s.id)}" alt="">`,
    equipped: id => state.skin === id, equip: id => { state.skin = id; }, byId: skinById,
  },
  decor: {
    title: 'Imprimante à décors', label: 'DÉCOR·PRINT', unit: 'décor',
    items: () => DATA.backgrounds, all: () => DATA.backgrounds,
    owned: () => state.bgs, pity: 'bgSinceLegend', pulls: 'bgPulls',
    visual: b => bgThumb(b),
    equipped: id => state.bg === id, equip: id => { state.bg = id; }, byId: bgById,
  },
};

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
  return { item, rarity, isNew, refund };
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
    li.innerHTML = `${m.visual(r.item)}
      <span class="rar">${rar.label}</span>
      <b>${esc(r.item.name)}</b>
      <small>${r.isNew ? 'Nouveau !' : `Doublon : +${r.refund} 💎`}</small>
      ${results.length === 1 ? `<button class="equip-btn" data-equip="${machine}:${r.item.id}">Équiper</button>` : ''}`;
    out.appendChild(li);
  });
  $$('#pull1, #pull10').forEach(b => (b.disabled = false));
  if (results.some(r => r.isNew)) toast(`Bonus de collection : +${fmtPct(collectionBonus())} de production`);
}

const fmtPct = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR') + ' %';

function equip(key) {
  const [mk, id] = key.split(':');
  const m = M[mk];
  if (id !== 'auto' && !m.owned()[id]) return;
  if (mk === 'decor' && id === 'auto') state.bg = 'auto'; else m.equip(id);
  save();
  sfx.buy();
  emit('skin');
  renderCollection();
  toast(id === 'auto' ? "Décor de l'ère rétabli." : `${m.byId(id).name} équipé${mk === 'cocotte' ? 'e' : ''} !`);
}

function renderInfo() {
  const m = M[machine];
  const pity = (cfg().pityLegendary || 60) - state.gacha[m.pity];
  const rates = DATA.rarities.map(r => `${r.label} ${r.weight} %`).join(' · ');
  const got = m.items().filter(s => m.owned()[s.id]).length;
  $('#gacha-title').textContent = m.title;
  $('#printer-label').textContent = m.label;
  $('#printer').dataset.machine = machine;
  $('#gacha-info').textContent = `${got}/${m.items().length} ${m.unit}s obtenus. Taux : ${rates}. Légendaire garanti${machine === 'cocotte' ? 'e' : ''} dans ${pity} impression${pity > 1 ? 's' : ''} au plus. ×10 : au moins un Rare.`;
  $('#pull1').innerHTML = `Imprimer ×1 <span class="cost">${cfg().cost1 ?? 25} 💎</span>`;
  $('#pull10').innerHTML = `Imprimer ×10 <span class="cost">${cost10()} 💎</span>`;
}

export function renderCollection() {
  const m = M[collView];
  const all = m.all(), got = all.filter(s => m.owned()[s.id]).length;
  const skinsGot = DATA.skins.filter(s => state.skins[s.id]).length, bgGot = DATA.backgrounds.filter(b => state.bgs[b.id]).length;
  $('#coll-count').textContent = `${skinsGot + bgGot}/${DATA.skins.length + DATA.backgrounds.length}`;
  $('#coll-bonus').innerHTML = `Chaque nouveau skin de Cocotte donne +${cfg().collectionBonusPct ?? 1} % de production, chaque décor +${cfg().collectionBgPct ?? 0.5} %. Bonus actuel : <strong>+${fmtPct(collectionBonus())}</strong>.`;
  $$('[data-coll]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.coll === collView)));
  $('#coll-sub').textContent = `${got}/${all.length}`;
  const grid = $('#skin-grid');
  const order = [...all].sort((a, b) => RANK[a.rarity] - RANK[b.rarity]);
  let html = collView === 'decor'
    ? `<li class="skin-card r-commune${state.bg === 'auto' ? ' equipped' : ''}" style="--rc:#999"><span class="bg-thumb era-auto" aria-hidden="true"></span>
        <span class="rar">Par défaut</span><b>Décor de l'ère</b><small>Change avec chaque ère</small>
        <button class="equip-btn" data-equip="decor:auto" ${state.bg === 'auto' ? 'disabled' : ''}>${state.bg === 'auto' ? 'Équipé' : 'Équiper'}</button></li>` : '';
  html += order.map(s => {
    const has = !!m.owned()[s.id], rar = rarityOf(s.rarity), on = m.equipped(s.id);
    return `<li class="skin-card r-${s.rarity}${has ? '' : ' locked'}${on ? ' equipped' : ''}" style="--rc:${rar.color}">
      ${m.visual(s)}<span class="rar">${rar.label}</span>
      ${has ? `<b>${esc(s.name)}</b>${s.desc ? `<small>${esc(s.desc)}</small>` : ''}
        <button class="equip-btn" data-equip="${collView}:${s.id}" ${on ? 'disabled' : ''}>${on ? 'Équipé' : 'Équiper'}</button>`
        : '<b>???</b><small>À imprimer</small>'}</li>`;
  }).join('');
  grid.innerHTML = html;
}

function setTab(tab) {
  ['cocotte', 'decor', 'coll'].forEach(t => $(`#tab-${t}`).setAttribute('aria-selected', String(t === tab)));
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
  ['cocotte', 'decor', 'coll'].forEach(t => $(`#tab-${t}`).addEventListener('click', () => { if (!busy) { sfx.ui(); setTab(t); } }));
  $$('[data-coll]').forEach(b => b.addEventListener('click', () => { collView = b.dataset.coll; sfx.ui(); renderCollection(); }));
  $('#dlg-gacha').addEventListener('click', e => {
    const b = e.target.closest('[data-equip]');
    if (b) equip(b.dataset.equip);
  });
}
