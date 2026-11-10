// « L'Imprimante mystère » : tirage de skins contre des cristaux + collection
import { DATA, state, addCrystals, collectionBonus } from './state.js';
import { $, $$, emit, toast, sleep, reducedMotion, esc } from './core.js';
import { skinById, rarityOf, skinImage } from './skins.js';
import { save } from './save.js';
import { sfx } from './audio.js';

const RANK = { commune: 0, rare: 1, epique: 2, legendaire: 3 };
const cfg = () => DATA.config.gacha || {};
let busy = false;

// Tirage pondéré d'une rareté, avec garanties
function rollRarity(minRare) {
  const pity = cfg().pityLegendary || 60;
  if (state.gacha.sinceLegend + 1 >= pity) return 'legendaire';
  const total = DATA.rarities.reduce((s, r) => s + r.weight, 0);
  let x = Math.random() * total, pick = DATA.rarities[0].id;
  for (const r of DATA.rarities) { if ((x -= r.weight) < 0) { pick = r.id; break; } }
  if (minRare && RANK[pick] < RANK.rare) pick = 'rare';
  return pick;
}

function rollOne(minRare) {
  const rarity = rollRarity(minRare);
  const pool = DATA.skins.filter(s => s.rarity === rarity && !s.default);
  const skin = pool.length ? pool[(Math.random() * pool.length) | 0] : DATA.skins[0];
  state.gacha.pulls++;
  state.gacha.sinceLegend = rarity === 'legendaire' ? 0 : state.gacha.sinceLegend + 1;
  const isNew = !state.skins[skin.id];
  state.skins[skin.id] = (state.skins[skin.id] || 0) + 1;
  const refund = isNew ? 0 : (cfg().refund?.[rarity] ?? 2);
  addCrystals(refund);
  return { skin, rarity, isNew, refund };
}

async function pull(n) {
  if (busy) return;
  const cost = n === 10 ? cfg().cost10 ?? 225 : (cfg().cost1 ?? 25) * n;
  if (state.crystals < cost) {
    sfx.deny();
    toast(`Il vous manque ${cost - state.crystals} cristaux. Gagnez-en dans les mini-jeux !`);
    return;
  }
  busy = true;
  addCrystals(-cost);
  const results = [];
  for (let i = 0; i < n; i++) {
    // ×10 : la dernière impression est au moins Rare si aucune ne l'était
    const guarantee = n === 10 && i === 9 && !results.some(r => RANK[r.rarity] >= RANK.rare);
    results.push(rollOne(guarantee));
  }
  save();
  emit('refresh');
  renderInfo();
  renderCollection();
  await animate(results);
  busy = false;
}

// Animation : la tête d'impression balaie, la capsule « s'imprime » couche par couche
async function animate(results) {
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
    li.innerHTML = `
      <img src="${skinImage(r.skin.id)}" alt="">
      <span class="rar">${rar.label}</span>
      <b>${esc(r.skin.name)}</b>
      <small>${r.isNew ? 'Nouveau !' : `Doublon : +${r.refund} 💎`}</small>
      ${results.length === 1 ? `<button class="equip-btn" data-equip="${r.skin.id}">Équiper</button>` : ''}`;
    out.appendChild(li);
  });
  $$('#pull1, #pull10').forEach(b => (b.disabled = false));
  if (results.some(r => r.isNew)) toast(`Bonus de collection : +${collectionBonus()} % de production`);
}

function equip(id) {
  if (!state.skins[id]) return;
  state.skin = id;
  save();
  sfx.buy();
  emit('skin');
  renderCollection();
  toast(`${skinById(id).name} équipée !`);
}

function renderInfo() {
  const pity = (cfg().pityLegendary || 60) - state.gacha.sinceLegend;
  const rates = DATA.rarities.map(r => `${r.label} ${r.weight} %`).join(' · ');
  $('#gacha-info').textContent = `Taux : ${rates}. Légendaire garantie dans ${pity} impression${pity > 1 ? 's' : ''} au plus. ×10 : au moins une Rare.`;
  $('#pull1').innerHTML = `Imprimer ×1 <span class="cost">${cfg().cost1 ?? 25} 💎</span>`;
  $('#pull10').innerHTML = `Imprimer ×10 <span class="cost">${cfg().cost10 ?? 225} 💎</span>`;
}

export function renderCollection() {
  const grid = $('#skin-grid');
  const total = DATA.skins.length, got = DATA.skins.filter(s => state.skins[s.id]).length;
  $('#coll-count').textContent = `${got}/${total}`;
  $('#coll-bonus').innerHTML = `Chaque nouveau skin augmente la production : <strong>+${collectionBonus()} %</strong> actuellement.`;
  grid.innerHTML = '';
  const order = [...DATA.skins].sort((a, b) => RANK[a.rarity] - RANK[b.rarity]);
  for (const s of order) {
    const has = !!state.skins[s.id], rar = rarityOf(s.rarity), on = state.skin === s.id;
    const li = document.createElement('li');
    li.className = `skin-card r-${s.rarity}${has ? '' : ' locked'}${on ? ' equipped' : ''}`;
    li.style.setProperty('--rc', rar.color);
    li.innerHTML = has
      ? `<img src="${skinImage(s.id)}" alt=""><span class="rar">${rar.label}</span><b>${esc(s.name)}</b>
         <small>${esc(s.desc || '')}</small>
         <button class="equip-btn" data-equip="${s.id}" ${on ? 'disabled' : ''}>${on ? 'Équipée' : 'Équiper'}</button>`
      : `<img src="${skinImage(s.id)}" alt=""><span class="rar">${rar.label}</span><b>???</b><small>À imprimer</small>`;
    grid.appendChild(li);
  }
}

export function openGacha() {
  renderInfo();
  renderCollection();
  $('#gacha-results').innerHTML = '';
  $('#printer').classList.remove('printing', 'done');
  $('#dlg-gacha').showModal();
}

export function initGacha() {
  $('#pull1').addEventListener('click', () => pull(1));
  $('#pull10').addEventListener('click', () => pull(10));
  $('#dlg-gacha').addEventListener('click', e => {
    const b = e.target.closest('[data-equip]');
    if (b) equip(b.dataset.equip);
  });
}
