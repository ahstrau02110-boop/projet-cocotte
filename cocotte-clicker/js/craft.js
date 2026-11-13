// Établi de fabrication : des recettes qui transforment les matériaux en bonus, cristaux et Cocottes exclusives
import { DATA, state, addCrystals, earn, totalCps, currentEra } from './state.js';
import { $, toast, emit, esc } from './core.js';
import { fmt } from './format.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { addBuff, spawnGolden } from './golden.js';
import { freePull } from './gacha.js';
import { skinImage } from './skins.js';
import { hasMats, spendMats, matsHTML, addMats, matsText, KINDS } from './materials.js';

let recipes = [];
export const setRecipes = list => { recipes = list || []; };

const fmtMin = m => (m >= 60 ? `${m / 60} h` : `${m} min`);

function render() {
  const era = currentEra().id;
  $('#craft-stock').innerHTML = KINDS().map(k => `<span class="mat-chip big"><span aria-hidden="true">${k.icon}</span><b>${state.mats[k.id] || 0}</b><small>${k.name}</small></span>`).join('');
  const groups = [['Bonus', r => r.result.type !== 'skin'], ['Cocottes exclusives', r => r.result.type === 'skin']];
  $('#craft-list').innerHTML = groups.map(([title, f]) => `<h3>${title}</h3><ul class="craft-grid">${recipes.filter(f).map(r => {
    const locked = r.era > era, owned = r.result.type === 'skin' && state.skins[r.result.id];
    const can = !locked && !owned && hasMats(r.cost);
    const visual = r.result.type === 'skin' ? `<img src="${skinImage(r.result.id)}" alt="" class="craft-skin${locked ? ' dim' : ''}">` : `<span class="craft-ico" aria-hidden="true">${r.icon}</span>`;
    return `<li class="craft${can ? ' can' : ''}${locked ? ' locked' : ''}${owned ? ' done' : ''}">
      ${visual}
      <span class="craft-txt"><b>${esc(r.name)}</b><small>${esc(r.desc)}</small>
        <span class="craft-cost">${locked ? `🔒 Ère ${r.era}` : matsHTML(r.cost, true)}</span></span>
      <button type="button" class="mi-btn" data-craft="${r.id}" ${can ? '' : 'disabled'}>${owned ? '✔ Fabriquée' : locked ? 'Bientôt' : 'Fabriquer'}</button>
    </li>`;
  }).join('')}</ul>`).join('');
}

export function openCraft() { render(); $('#dlg-craft').showModal(); }

function craft(id) {
  const r = recipes.find(x => x.id === id);
  if (!r || r.era > currentEra().id) return;
  if (r.result.type === 'skin' && state.skins[r.result.id]) return;
  if (!spendMats(r.cost)) { sfx.deny(); toast('Il manque des matériaux : jouez, attrapez des Cocottes dorées, réussissez des missions…'); return; }
  const res = r.result;
  let msg = '';
  switch (res.type) {
    case 'buff':
      addBuff({ id: 'craft', name: r.name, cps: res.cps || 1, click: res.click || 1, sec: res.min * 60 });
      msg = `${r.name} : ${[res.cps && `production ×${String(res.cps).replace('.', ',')}`, res.click && `clics ×${res.click}`].filter(Boolean).join(' et ')} pendant ${fmtMin(res.min)} ! (remplace le bonus d'Établi précédent)`;
      break;
    case 'crystals': addCrystals(res.n); msg = `+${res.n} 💎`; break;
    case 'coinsSec': { const g = totalCps() * res.sec; earn(g); msg = `+${fmt(g)} Co'Coins`; break; }
    case 'golden': msg = 'Une Cocotte dorée arrive… attrapez-la !'; setTimeout(spawnGolden, 800); break;
    case 'mats': addMats(res.mats); msg = `+${matsText(res.mats)}`; break;
    case 'pull': { const p = freePull(res.machine); msg = p ? `Impression offerte : ${p.item.name}${p.isNew ? ' (nouveau !)' : ' (doublon)'}` : ''; break; }
    case 'skin':
      state.skins[res.id] = (state.skins[res.id] || 0) + 1;
      msg = `Nouvelle Cocotte exclusive : ${r.name} ! Équipez-la dans la Collection.`;
      break;
  }
  state.counters.crafted++;
  sfx.unlock();
  toast(`🛠️ ${msg}`, 5000);
  save();
  render();
  emit('refresh');
}

export function initCraft() {
  $('#btn-craft').addEventListener('click', () => { sfx.ui(); openCraft(); });
  $('#mats-bar').addEventListener('click', () => { sfx.ui(); openCraft(); });
  $('#craft-list').addEventListener('click', e => { const b = e.target.closest('[data-craft]'); if (b) craft(b.dataset.craft); });
}

// Petit indicateur sur la tuile : une recette est faisable
export function renderCraftTile() {
  const era = currentEra().id;
  const n = recipes.filter(r => r.era <= era && !(r.result.type === 'skin' && state.skins[r.result.id]) && hasMats(r.cost)).length;
  $('#btn-craft').classList.toggle('ready', n > 0);
  $('#craft-mini').textContent = n ? `${n} recette${n > 1 ? 's' : ''} possible${n > 1 ? 's' : ''}` : 'Matériaux → objets';
}
