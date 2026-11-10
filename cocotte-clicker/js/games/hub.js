// Salle de jeux : liste des mini-jeux, partie en cours, récompenses
import { DATA, state, addCrystals, earn, totalCps, projectEffects, hasTalent } from '../state.js';
import { $, emit, toast, today, esc } from '../core.js';
import { save } from '../save.js';
import { sfx } from '../audio.js';
import { fmt } from '../format.js';
import match3 from './match3.js';
import memory from './memory.js';
import bugs from './bugs.js';
import simon from './simon.js';
import puzzle from './puzzle.js';

export const GAMES = [match3, memory, bugs, simon, puzzle];
let cleanup = null, current = null;

const cfg = () => DATA.config.minigames || {};

// Remise à zéro du plafond de cristaux chaque jour
function rollDay() {
  if (state.mini.day !== today()) { state.mini.day = today(); state.mini.crystalsToday = 0; }
}
const crystalsLeft = () => { rollDay(); return Math.max(0, (cfg().dailyCrystalCap ?? 30) + (hasTalent('mini') ? 10 : 0) - state.mini.crystalsToday); };

function renderHub() {
  $('#games-left').textContent = crystalsLeft();
  $('#games-list').innerHTML = GAMES.map(g => `
    <li class="game-card">
      <span class="game-ico" aria-hidden="true">${g.icon}</span>
      <span class="game-txt">
        <b>${esc(g.name)}</b>
        <span>${esc(g.desc)}</span>
        <small>Record : ${fmt(state.mini.best[g.id] || 0)}</small>
      </span>
      <button class="big-btn" data-game="${g.id}">Jouer</button>
    </li>`).join('');
}

export function openGames() {
  renderHub();
  $('#dlg-games').showModal();
}

function start(game) {
  current = game;
  $('#dlg-games').close();
  $('#play-title').textContent = game.name;
  $('#play-hud').textContent = '';
  const area = $('#play-area');
  area.innerHTML = '';
  $('#dlg-play').showModal();
  cleanup = game.start(area, {
    hud: html => ($('#play-hud').innerHTML = html),
    finish: res => finish(game, res),
  });
}

function stop() {
  if (cleanup) { cleanup(); cleanup = null; }
}

// Fin de partie : calcul et affichage des récompenses
function finish(game, { score, stars }) {
  stop();
  rollDay();
  const wanted = stars * (cfg().crystalsPerStar ?? 1) + (stars === 3 ? (cfg().crystalsPerfectBonus ?? 1) : 0);
  const crystals = Math.min(wanted, crystalsLeft());
  state.mini.crystalsToday += crystals;
  addCrystals(crystals);
  const boost = projectEffects('minigameCoins').reduce((m, e) => m * e.mult, 1);
  const coins = stars ? Math.max(25, totalCps() * (cfg().coinSecondsPerStar ?? 20)) * stars * boost : 0;
  earn(coins);
  const record = score > (state.mini.best[game.id] || 0);
  if (record) state.mini.best[game.id] = score;
  state.mini.plays++;
  state.mini.stars += stars;
  if (stars === 3) state.mini.perfect++;
  save();
  emit('refresh');
  stars ? sfx.unlock() : sfx.deny();

  $('#play-area').insertAdjacentHTML('beforeend', `
    <div class="play-end" role="dialog" aria-label="Fin de partie">
      <div class="stars" aria-label="${stars} étoile${stars > 1 ? 's' : ''} sur 3">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('')}</div>
      <p class="end-score">Score : <strong>${fmt(score)}</strong>${record ? ' <span class="badge">Record !</span>' : ''}</p>
      <ul class="end-rewards">
        <li>+${fmt(coins)} Co'Coins</li>
        <li>+${crystals} 💎${crystals < wanted ? ' <small>(limite du jour atteinte)</small>' : ''}</li>
      </ul>
      <div class="row center">
        <button class="big-btn" data-replay>Rejouer</button>
        <button class="ghost-btn" data-back>Autres jeux</button>
      </div>
    </div>`);
  $('#play-area [data-replay]').focus();
}

export function initGames() {
  $('#games-list').addEventListener('click', e => {
    const b = e.target.closest('[data-game]');
    if (b) { sfx.ui(); start(GAMES.find(g => g.id === b.dataset.game)); }
  });
  $('#play-area').addEventListener('click', e => {
    if (e.target.closest('[data-replay]')) start(current);
    if (e.target.closest('[data-back]')) { $('#dlg-play').close(); openGames(); }
  });
  $('#play-quit').addEventListener('click', () => $('#dlg-play').close());
  $('#dlg-play').addEventListener('close', stop);
}
