// Calendrier de l'Avent : une case par jour du 1er au 24 décembre. Les cases manquées restent à ouvrir
// jusqu'au 31 décembre. La date vient du serveur quand il répond (pas de triche en avançant l'horloge).
import { DATA, state, addCrystals } from './state.js';
import { $, toast, emit } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { rpc, netEnabled } from './community.js';
import { addMats, matsText } from './materials.js';
import { freePull } from './gacha.js';
import { petById, fxById, renderPet } from './cosmetics.js';

// Récompenses (jour → contenu)
const R = {
  1: { c: 15 }, 2: { m: { bois: 6, filament: 4 } }, 3: { pull: 'pet' }, 4: { c: 15 }, 5: { m: { composants: 6, batteries: 2 } },
  6: { fx: 'flocons' }, 7: { c: 20 }, 8: { pull: 'cocotte' }, 9: { frag: 60 }, 10: { m: { bois: 8, filament: 6, composants: 4 } },
  11: { c: 20 }, 12: { pet: 'bonhomme' }, 13: { pull: 'decor' }, 14: { c: 25 }, 15: { m: { filament: 8, composants: 6, batteries: 3 } },
  16: { frag: 100 }, 17: { pull: 'pet' }, 18: { skin: 'bonhomme' }, 19: { m: { bois: 10, composants: 8, batteries: 4 } }, 20: { c: 25 },
  21: { pull: 'pet' }, 22: { frag: 150 }, 23: { c: 30 }, 24: { pet: 'renne' },
};
const ICON = r => r.c ? '💎' : r.m ? '📦' : r.pull === 'pet' ? '🐾' : r.pull ? '🎁' : r.frag ? '🧬' : r.fx ? '❄️' : r.pet ? petById(r.pet)?.forms[0].e : r.skin ? '⛄' : '🎁';
// Ordre des cases sur le calendrier (mélangé, toujours le même)
const ORDER = [7, 15, 2, 21, 11, 4, 18, 9, 23, 1, 13, 6, 20, 16, 3, 10, 24, 8, 14, 19, 5, 12, 22, 17];

let now = null; // date du serveur (ou de l'appareil hors ligne)
async function syncDate() {
  if (netEnabled()) {
    const r = await rpc('server_now').catch(() => null);
    const d = typeof r === 'string' ? new Date(r) : null;
    if (d && !isNaN(d)) { now = d; return; } // réponse inattendue : date de l'appareil
  }
  now = new Date();
}
const parisDate = d => { const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
  const g = t => +p.find(x => x.type === t).value; return { y: g('year'), m: g('month'), d: g('day') }; };
const today = () => parisDate(now || new Date());
// Tuile visible du 25 novembre au 31 décembre
const visible = () => { const t = today(); return (t.m === 11 && t.d >= 25) || t.m === 12; };
const openable = day => { const t = today(); return t.m === 12 && day <= t.d; };

function rollYear() { const y = today().y; if (state.advent.year !== y) state.advent = { year: y, opened: [] }; }

function give(day) {
  const r = R[day];
  let msg = '';
  if (r.c) { addCrystals(r.c); msg = `+${r.c} 💎`; }
  if (r.m) { addMats(r.m); msg = `+${matsText(r.m)}`; }
  if (r.frag) { state.adv.frag += r.frag; msg = `+${r.frag} 🧬 fragments pour l'Aventure`; }
  if (r.pull) { const p = freePull(r.pull); msg = p ? `Impression offerte : ${p.item.name || p.item.forms?.[0].name}${p.isNew ? ' (nouveau !)' : ''}` : ''; }
  if (r.fx) { state.fxOwned[r.fx] = 1; msg = `Nouvel effet de clic : ${fxById(r.fx).name} ! (à équiper dans la Collection)`; }
  if (r.pet) { state.pets[r.pet] = (state.pets[r.pet] || 0) + 1; msg = `Nouveau compagnon : ${petById(r.pet).forms[0].e} ${petById(r.pet).forms[0].name} !`; }
  if (r.skin) { if (state.skins[r.skin]) { addCrystals(40); msg = '+40 💎 (vous aviez déjà la Cocotte des neiges)'; } else { state.skins[r.skin] = 1; msg = 'Nouvelle Cocotte : la Cocotte des neiges ⛄ !'; } }
  return msg;
}

function render() {
  rollYear();
  const t = today(), O = state.advent.opened;
  $('#advent-info').innerHTML = t.m === 12 && t.d <= 31
    ? `${O.length}/24 cases ouvertes.${t.d <= 24 ? ' Une nouvelle case chaque jour !' : ''} Les cases oubliées s'ouvrent jusqu'au 31 décembre. 🎅 Case 12 : un compagnon, case 24 : le Renne du Père Noël et le titre « Esprit de Noël ».`
    : `Le calendrier ouvre le 1er décembre : encore ${Math.ceil((Date.UTC(t.y, 11, 1) - Date.UTC(t.y, t.m - 1, t.d)) / 864e5)} jour(s) !`;
  $('#advent-grid').innerHTML = ORDER.map(d => {
    const done = O.includes(d), can = !done && openable(d), isToday = t.m === 12 && t.d === d;
    return `<button type="button" class="adv-door${done ? ' open' : can ? ' can' : ''}${isToday ? ' today' : ''}${d === 24 ? ' big' : ''}" data-day="${d}" ${can ? '' : 'disabled'}
      aria-label="Case ${d}${done ? ' (ouverte)' : can ? ' (à ouvrir)' : ''}"><b>${d}</b>${done ? `<span>${ICON(R[d])}</span>` : can ? '<span>🎁</span>' : '<span>🔒</span>'}</button>`;
  }).join('');
}

async function openDoor(day) {
  await syncDate();
  rollYear();
  if (!openable(day) || state.advent.opened.includes(day)) return render();
  state.advent.opened.push(day);
  const msg = give(day);
  if (state.advent.opened.length >= 12) state.flags.lutin = 1;
  save(); emit('refresh'); renderPet(); sfx.unlock();
  toast(`🎄 Case ${day} : ${msg}`, 6000);
  renderTile(); render();
}

export function renderTile() {
  const el = $('#btn-advent');
  el.hidden = !visible();
  if (el.hidden) return;
  rollYear();
  const t = today(), n = t.m === 12 ? Array.from({ length: Math.min(t.d, 24) }, (_, i) => i + 1).filter(d => !state.advent.opened.includes(d)).length : 0;
  el.classList.toggle('ready', n > 0);
  $('#advent-mini').textContent = t.m === 11 ? 'Ouvre le 1er décembre' : n ? `${n} case${n > 1 ? 's' : ''} à ouvrir !` : `${state.advent.opened.length}/24 ouvertes`;
}

export async function initAdvent() {
  $('#btn-advent').addEventListener('click', async () => { sfx.ui(); await syncDate(); render(); $('#dlg-advent').showModal(); });
  $('#advent-grid').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b && !b.disabled) openDoor(+b.dataset.day); });
  renderTile();
  await syncDate();
  renderTile();
  setInterval(renderTile, 600000);
}
