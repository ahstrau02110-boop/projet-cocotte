// Matériaux (bois, filament, composants, batteries) : récupérés en jouant, dépensés à l'Établi,
// pour les projets et les commandes.
import { DATA, state, projectEffects } from './state.js';
import { $, toast } from './core.js';
import { floatText } from './fx.js';
import { save } from './save.js';

const cfg = () => DATA.config.materials || {};
export const KINDS = () => cfg().kinds || [];
export const kind = id => KINDS().find(k => k.id === id) || { id, icon: '❔', name: id };

// Multiplicateur de récolte (projets)
const matsMult = () => projectEffects('mats').reduce((m, e) => m * e.mult, 1);

// Tirage pondéré d'un type de matériau
function pick() {
  const ks = KINDS(), total = ks.reduce((s, k) => s + k.weight, 0);
  let x = Math.random() * total;
  for (const k of ks) if ((x -= k.weight) < 0) return k.id;
  return ks[0]?.id || 'bois';
}

// n matériaux au hasard → { bois: 2, … }
export function randomMats(n, boost = true) {
  const total = Math.max(0, Math.round(n * (boost ? matsMult() : 1)));
  const out = {};
  for (let i = 0; i < total; i++) { const k = pick(); out[k] = (out[k] || 0) + 1; }
  return out;
}

// Ajoute des matériaux (et met à jour les compteurs des missions / succès)
export function addMats(mats) {
  let n = 0;
  for (const [k, v] of Object.entries(mats)) {
    if (!(k in state.mats) || v <= 0) continue;
    state.mats[k] += v;
    n += v;
    if (k === 'batteries') state.counters.batGot += v;
  }
  state.counters.matsGot += n;
  if (n) { renderMatsBar(); firstMats(); }
  return n;
}

export const hasMats = cost => Object.entries(cost || {}).every(([k, v]) => (state.mats[k] || 0) >= v);
export function spendMats(cost) {
  if (!hasMats(cost)) return false;
  for (const [k, v] of Object.entries(cost || {})) state.mats[k] -= v;
  renderMatsBar();
  return true;
}

// « 2 🪵 1 ⚙️ » (en rouge ce qui manque si check)
export function matsHTML(cost, check = false) {
  return Object.entries(cost || {}).filter(([, v]) => v > 0).map(([k, v]) => {
    const miss = check && (state.mats[k] || 0) < v;
    return `<span class="mat${miss ? ' miss' : ''}" title="${kind(k).name}">${v}&nbsp;${kind(k).icon}</span>`;
  }).join(' ');
}
export const matsText = mats => Object.entries(mats).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${kind(k).icon}`).join(' ');

// Barre des matériaux sous les activités
export function renderMatsBar() {
  const bar = $('#mats-bar');
  if (!bar) return;
  if (!bar.childElementCount) {
    bar.innerHTML = KINDS().map(k => `<span class="mat-chip" data-mat="${k.id}" title="${k.name}"><span aria-hidden="true">${k.icon}</span><b></b><span class="sr">${k.name}</span></span>`).join('');
  }
  for (const k of KINDS()) bar.querySelector(`[data-mat="${k.id}"] b`).textContent = state.mats[k.id] || 0;
}

// Récolte au clic sur la Cocotte (petite chance)
export function clickDrop(wrap, x, y) {
  if (Math.random() >= (cfg().clickChance ?? 0.025) * matsMult()) return;
  const k = pick();
  addMats({ [k]: 1 });
  floatText(wrap, x, y - 34, `+1 ${kind(k).icon}`);
}

// Projets « +n matériaux par heure » : calculé au fil du temps (jeu fermé compris, 12 h max)
export function tickMats() {
  const perHour = projectEffects('matsHour').reduce((a, e) => a + e.n, 0);
  const now = Date.now();
  if (!perHour) { state.matsTick = now; return; }
  const hours = Math.min(12, (now - state.matsTick) / 3600e3);
  const n = Math.floor(hours * perHour);
  if (n < 1) return;
  state.matsTick += n / perHour * 3600e3;
  const got = randomMats(n, false);
  addMats(got);
  if (n >= 3) toast(`🌱 Vos projets ont produit des matériaux : ${matsText(got)}`, 5000);
}

// Première récolte : explication
function firstMats() {
  if (state.flags.matsIntro || !state.tuto) return;
  state.flags.matsIntro = 1;
  save();
  setTimeout(() => {
    if (document.querySelector('dialog[open]')) { toast('🪵 Premier matériau ! Utilisez-les à l\'Établi de fabrication 🛠️, pour les projets et les commandes.', 7000); return; }
    $('#dlg-mats-intro')?.showModal();
  }, 400);
}

export function initMaterials() {
  renderMatsBar();
  tickMats();
  setInterval(tickMats, 30000);
}
