// Projets de La Co'Cotte + prestige « Nouvelle saison »
import { DATA, state, currentEra, seedBonus, addCrystals } from './state.js';
import { $, asset, toast, emit, esc } from './core.js';
import { fmt } from './format.js';
import { sfx, setTrack, music } from './audio.js';
import { save } from './save.js';

// ---------- Projets ----------
let projSig = '';
export function renderProjects() {
  const era = currentEra().id;
  const list = DATA.projects.filter(p => p.era <= era + 1); // ère suivante visible en aperçu
  const box = $('#projects');
  // Reconstruction seulement si la liste change ; sinon mise à jour de l'état « achetable »
  const sig = era + '|' + list.map(p => p.id + (state.projects[p.id] ? '1' : '0')).join();
  if (sig === projSig) {
    for (const b of box.querySelectorAll('.proj:not(.done):not(.locked)')) {
      const p = DATA.projects.find(x => x.id === b.dataset.proj);
      b.classList.toggle('can', state.coins >= p.cost);
    }
    return;
  }
  projSig = sig;
  $('#projects-wrap').hidden = !list.length;
  box.innerHTML = list.map(p => {
    const done = !!state.projects[p.id], locked = p.era > era;
    const can = !done && !locked && state.coins >= p.cost;
    return `<li><button class="proj${done ? ' done' : ''}${locked ? ' locked' : ''}${can ? ' can' : ''}" data-proj="${p.id}" ${done || locked ? 'aria-disabled="true"' : ''}>
      <span class="proj-ico" aria-hidden="true">${p.icon}</span>
      <span class="proj-txt"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small><em>${esc(p.effectText)}</em></span>
      <span class="proj-cost">${done ? '✔ Réalisé' : locked ? `Ère ${p.era}` : `<img src="${asset('cocoin')}" alt="">${fmt(p.cost)}`}</span>
    </button></li>`;
  }).join('');
}

function buyProject(id) {
  const p = DATA.projects.find(x => x.id === id);
  if (!p || state.projects[id] || p.era > currentEra().id) return;
  if (state.coins < p.cost) { sfx.deny(); return; }
  state.coins -= p.cost;
  state.projects[id] = true;
  sfx.unlock();
  toast(`📌 Projet réalisé : ${p.name} ! ${p.effectText}`, 6000);
  applyMusicUnlocks();
  save();
  renderProjects();
  emit('refresh');
}

// Piste « Atelier Musique » : visible dans les options si débloquée
export function applyMusicUnlocks() {
  const unlocked = DATA.projects.some(p => state.projects[p.id] && p.effects.some(e => e.type === 'music'))
    || state.prestige.seasons > 0 && state.settings.track === 'atelier';
  const sel = $('#music-track');
  sel.querySelector('[value="atelier"]').disabled = !unlocked;
  sel.querySelector('[value="atelier"]').textContent = unlocked ? 'Atelier Musique' : 'Atelier Musique (projet à réaliser)';
  if (!unlocked && state.settings.track === 'atelier') state.settings.track = 'classique';
  sel.value = state.settings.track;
  setTrack(state.settings.track);
}

// ---------- Nouvelle saison ----------
const P = () => DATA.config.prestige || {};
const seedsFor = lifetime => Math.floor(Math.cbrt(lifetime / (P().divisor ?? 1e9)));
export const pendingSeeds = () => Math.max(0, seedsFor(state.prestige.lifetime) - state.prestige.seeds);

export function renderSeason() {
  const show = currentEra().id >= (P().minEra ?? 3) || state.prestige.seasons > 0;
  $('#season-card').hidden = !show;
  if (!show) return;
  const n = pendingSeeds();
  $('#season-info').innerHTML = `🌱 <strong>${fmt(state.prestige.seeds)}</strong> graine${state.prestige.seeds > 1 ? 's' : ''} de saison · production <strong>+${fmt(seedBonus())} %</strong> pour toujours`
    + (state.prestige.seasons ? ` · saison n°${state.prestige.seasons + 1}` : '');
  $('#season-next').textContent = n > 0
    ? `Une nouvelle saison maintenant rapporterait +${fmt(n)} graine${n > 1 ? 's' : ''} (+${fmt(n * (P().seedPct ?? 2))} %).`
    : `Prochaine graine : produisez encore ${fmt((Math.pow(seedsFor(state.prestige.lifetime) + 1, 3)) * (P().divisor ?? 1e9) - state.prestige.lifetime)} Co'Coins.`;
  $('#btn-season').disabled = n < 1;
}

function openSeasonDialog() {
  const n = pendingSeeds();
  if (n < 1) return;
  $('#season-gain').textContent = `+${fmt(n)} graine${n > 1 ? 's' : ''} de saison (+${fmt(n * (P().seedPct ?? 2))} % de production, pour toujours)`;
  $('#dlg-season').showModal();
}

function newSeason() {
  const n = pendingSeeds();
  if (n < 1) return;
  // Remis à zéro : Co'Coins, bâtiments, améliorations, projets, bonus temporaires
  // Conservé : cristaux, skins, succès, statistiques, mini-jeux, réglages, code joueur
  state.coins = 0;
  state.totalEarned = 0;
  state.handEarned = 0;
  state.buildings = {};
  state.upgrades = {};
  state.projects = {};
  state.buffs = [];
  state.prestige.seeds += n;
  state.prestige.seasons++;
  const c = P().seasonCrystals ?? 5;
  addCrystals(c);
  save();
  $('#dlg-season').close();
  sfx.unlock();
  toast(`🌱 Nouvelle saison ! +${fmt(n)} graines de saison et +${c} 💎`, 7000);
  emit('season');
}

export function initSeason() {
  $('#projects').addEventListener('click', e => {
    const b = e.target.closest('[data-proj]');
    if (b) buyProject(b.dataset.proj);
  });
  $('#btn-season').addEventListener('click', openSeasonDialog);
  $('#btn-season-ok').addEventListener('click', newSeason);
  $('#music-track').addEventListener('change', e => {
    state.settings.track = e.target.value;
    setTrack(state.settings.track);
    if (music.playing) { music.stop(); setTimeout(() => music.start(), 700); }
    save();
  });
  applyMusicUnlocks();
}
