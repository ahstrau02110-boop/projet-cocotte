// Cosmétiques : compagnons (affichés à côté de la Cocotte), effets de clic, titres (affichés dans les classements en ligne).
import { DATA, state } from './state.js';
import { $, on, toast, esc } from './core.js';
import { save } from './save.js';
import { setEffect } from './fx.js';
import { rpc, netEnabled } from './community.js';

export const petById = id => DATA.pets.find(p => p.id === id);
export const fxById = id => DATA.effects.find(f => f.id === id);
export const titleById = id => DATA.titles.find(t => t.id === id);
export const petLevel = id => state.petLv[id]?.lv || 1;
export const petForm = id => { const lv = petLevel(id); return lv >= 30 ? 2 : lv >= 10 ? 1 : 0; };
export const petEmoji = id => { const p = petById(id); return p ? p.forms[petForm(id)].e : '🐣'; };
export const petName = id => { const p = petById(id); return p ? p.forms[petForm(id)].name : ''; };
export const titleLabel = id => (id && titleById(id)?.label) || '';

// Compagnons spéciaux et effets débloqués par une action du jeu
export function grantSpecials() {
  let changed = false;
  const givePet = (id, why) => { if (!state.pets[id] && petById(id)) { state.pets[id] = 1; changed = true; toast(`🐾 Nouveau compagnon : ${petById(id).forms[0].e} ${petById(id).forms[0].name} ! (${why})`, 6000); } };
  const giveFx = (id, why) => { if (!state.fxOwned[id] && fxById(id)) { state.fxOwned[id] = 1; changed = true; toast(`✨ Nouvel effet de clic : ${fxById(id).name} ! (${why})`, 6000); } };
  if (state.surv.wins > 0) givePet('drone', 'victoire à Co\'Survivor');
  if ((state.chess.ai[3]?.w || 0) > 0) givePet('cheval', 'victoire aux échecs en Difficile');
  if ((state.mega?.level || 0) > 0) { givePet('comete', 'Méga-Prestige'); giveFx('etoiles', 'Méga-Prestige'); }
  if (Object.keys(state.achievements).length >= 50) giveFx('coeurs', '50 succès');
  if (changed) save();
}

// ---------- Titres ----------
const COND = {
  apprenti: () => true,
  habitue: () => state.claimed.length >= 5,
  dore: () => state.golden >= 100,
  minijeux: () => state.mini.plays >= 200,
  recettes: () => state.counters.crafted >= 50,
  livreur: () => state.counters.orders >= 50,
  collection: () => DATA.skins.filter(s => !s.custom && state.skins[s.id]).length >= 30,
  betes: () => Object.keys(state.pets).length >= 8,
  aventurier: () => state.adv.best >= 25,
  heros: () => state.adv.best >= 100,
  echecs: () => state.chess.learn.lessons.length >= 14,
  stratege: () => (state.chess.ai[3]?.w || 0) > 0,
  diamant: () => (state.chess.bestElo || 0) >= 1600,
  survivant: () => state.surv.wins > 0,
  surchauffe: () => state.surv.bestHeat >= 5 && state.surv.best >= 300,
  artiste: () => state.pixel.status === 'ok',
  lutin: () => state.advent.opened.length >= 12,
  noel: () => state.advent.opened.length >= 24,
  legende: () => (state.mega?.level || 0) >= 1,
  mythe: () => (state.mega?.level || 0) >= 3,
};
export const titleUnlocked = id => !!COND[id]?.();

// Titre choisi : enregistré sur le serveur (affiché sous le pseudo dans les classements)
export async function setTitle(id) {
  if (id && !titleUnlocked(id)) return;
  state.title = id || '';
  save();
  if (!netEnabled() || !state.net.token) return;
  const r = await rpc('set_title', { p_id: state.playerId, p_token: state.net.token, p_title: state.title }).catch(() => null);
  if (r && r.ok === false && r.error === 'locked') toast('Le serveur n\'a pas encore validé ce titre : il s\'affichera dès que votre progression en ligne sera à jour.');
}

// ---------- Compagnon sur le plan de travail ----------
let hopT = 0;
export function renderPet() {
  const el = $('#pet');
  if (!el) return;
  const id = state.pet;
  el.hidden = !id || !state.pets[id];
  if (el.hidden) return;
  el.textContent = petEmoji(id);
  el.title = `${petName(id)} (niveau ${petLevel(id)})`;
  el.dataset.form = petForm(id);
}
function hop(big = false) {
  const el = $('#pet');
  if (!el || el.hidden) return;
  el.classList.remove('hop', 'love'); void el.offsetWidth;
  el.classList.add(big ? 'love' : 'hop');
}

export function initCosmetics() {
  if (!state.fxOwned.fumee) state.fxOwned.fumee = 1;
  if (!state.pets.poussin) state.pets.poussin = 1;
  setEffect(state.fx);
  renderPet();
  grantSpecials();
  on('potClick', () => { const now = Date.now(); if (now - hopT > 700 && Math.random() < 0.35) { hopT = now; hop(); } });
  on('skin', () => { setEffect(state.fx); renderPet(); });
  on('refresh', () => grantSpecials());
  $('#pet')?.addEventListener('click', e => {
    e.stopPropagation(); hop(true);
    const lines = ['Coucou !', 'On part à l\'aventure ?', 'Encore un clic !', '♥', 'Les virus n\'ont qu\'à bien se tenir !'];
    toast(`${petEmoji(state.pet)} ${esc(petName(state.pet))} : « ${lines[(Math.random() * lines.length) | 0]} »`, 2500);
  });
}
