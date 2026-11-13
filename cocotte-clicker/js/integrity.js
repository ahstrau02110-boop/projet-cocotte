// Anti-triche côté jeu : détecte une sauvegarde modifiée à la main et les états impossibles.
// Rien n'est bloqué ici (le jeu tourne dans le navigateur, on ne peut pas tout empêcher) :
// les anomalies sont envoyées au serveur avec le score, et l'équipe décide dans l'espace équipe.
import { DATA, state } from './state.js';

// Empreinte rapide (cyrb53) avec un sel : suffit à repérer une sauvegarde éditée dans le navigateur
const SALT = 'Co\'Cotte·Bohain·02110';
export function sign(str) {
  let h1 = 0xdeadbeef ^ 0x2a, h2 = 0x41c6ce57 ^ 0x2a;
  const s = SALT + str;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Note une anomalie (envoyée au serveur à la prochaine synchronisation)
export function report(reason) {
  const list = new Set((state.net.tamper || '').split(' | ').filter(Boolean));
  list.add(reason);
  state.net.tamper = [...list].join(' | ').slice(0, 300);
}

// Coût total des bâtiments possédés (somme géométrique, sans les réductions)
function buildingsCost() {
  const r = 1.15;
  return DATA.buildings.reduce((s, b) => { const n = state.buildings[b.id] || 0; return s + b.baseCost * (Math.pow(r, n) - 1) / (r - 1); }, 0);
}

// États impossibles dans une vraie partie (marges larges : jamais de faux positif sur une partie normale)
export function checkState() {
  const life = state.prestige.lifetime;
  if (state.coins > life * 1.01 + 100) report(`Co'Coins (${Math.round(state.coins)}) supérieurs au total produit (${Math.round(life)})`);
  if (buildingsCost() > life * 3 + 1e5) report(`Bâtiments achetés pour plus que le total produit`);
  const gachaSkins = DATA.skins.filter(s => !s.default && !s.event && !s.craft && state.skins[s.id]).length;
  if (gachaSkins > state.gacha.pulls) report(`${gachaSkins} Cocottes pour ${state.gacha.pulls} impressions`);
  const gachaBgs = DATA.backgrounds.filter(b => !b.event && state.bgs[b.id]).length;
  if (gachaBgs > state.gacha.bgPulls) report(`${gachaBgs} décors pour ${state.gacha.bgPulls} impressions`);
  if (Object.keys(state.achievements).length > DATA.achList.length) report('Plus de succès que le jeu n\'en propose');
  if (state.crystals > 200000) report(`${state.crystals} cristaux`);
  const mats = Object.values(state.mats).reduce((a, n) => a + n, 0);
  if (mats > state.counters.matsGot + 50) report(`${mats} matériaux pour ${state.counters.matsGot} récoltés`);
}

export function initIntegrity() {
  checkState();
  setInterval(checkState, 120000);
}
