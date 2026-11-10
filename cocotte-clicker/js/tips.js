// Astuces numériques : une nouvelle astuce chaque heure, +5 cristaux une fois lue
import { DATA, state, addCrystals } from './state.js';
import { $, toast, emit, esc } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';

const cfg = () => DATA.config.tips || {};
const interval = () => (cfg().intervalMin ?? 60) * 60000;
const left = () => Math.max(0, state.tips.last + interval() - Date.now());
export const tipAvailable = () => left() === 0;

let readTimer = null, notified = false;

// Astuce en attente : choisie au hasard parmi celles pas encore lues (puis toutes, une fois la série finie)
function currentTip() {
  if (state.tips.pending && DATA.tips.some(t => t.id === state.tips.pending)) return DATA.tips.find(t => t.id === state.tips.pending);
  let pool = DATA.tips.filter(t => !state.tips.read.includes(t.id));
  if (!pool.length) pool = DATA.tips;
  const t = pool[(Math.random() * pool.length) | 0];
  state.tips.pending = t.id;
  save();
  return t;
}

const fmtLeft = ms => {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? '1 h' : `${m} min`;
};

function render() {
  clearInterval(readTimer);
  const box = $('#tip-current');
  if (tipAvailable()) {
    const t = currentTip();
    const sec = cfg().readSec ?? 8;
    box.innerHTML = `<article class="tip-card">
        <span class="tip-cat">${esc(t.cat)}</span>
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.text)}</p>
      </article>
      <button id="btn-tip-read" class="big-btn" disabled>Lecture… ${sec} s</button>`;
    // Le bouton se débloque après quelques secondes de lecture
    let s = sec;
    const btn = $('#btn-tip-read');
    readTimer = setInterval(() => {
      if (--s > 0) { btn.textContent = `Lecture… ${s} s`; return; }
      clearInterval(readTimer);
      btn.disabled = false;
      btn.innerHTML = `J'ai lu : +${cfg().crystals ?? 5} 💎`;
    }, 1000);
    btn.addEventListener('click', () => markRead(t));
  } else {
    box.innerHTML = `<div class="tip-wait"><span aria-hidden="true">⏳</span>
      <p>Prochaine astuce dans <strong>${fmtLeft(left())}</strong>.<br>Revenez tout à l'heure pour gagner ${cfg().crystals ?? 5} 💎 de plus !</p></div>`;
  }
  const read = DATA.tips.filter(t => state.tips.read.includes(t.id));
  $('#tip-count').textContent = `${read.length}/${DATA.tips.length}`;
  $('#tip-archive').innerHTML = read.length
    ? read.map(t => `<details><summary><span>${esc(t.cat.split(' ')[0])}</span> ${esc(t.title)}</summary><p>${esc(t.text)}</p></details>`).join('')
    : '<p class="muted">Les astuces lues seront rangées ici pour les relire quand vous voulez.</p>';
}

function markRead(t) {
  if (!tipAvailable()) return;
  const c = cfg().crystals ?? 5;
  addCrystals(c);
  if (!state.tips.read.includes(t.id)) state.tips.read.push(t.id);
  state.tips.last = Date.now();
  state.tips.pending = null;
  notified = false;
  save();
  sfx.unlock();
  toast(`💡 Astuce lue : +${c} 💎 ! Prochaine astuce dans 1 h.`, 5000);
  emit('refresh');
  render();
}

// Tuile « Astuces » : badge quand une astuce attend, sinon compte à rebours
export function renderTipTile() {
  const ok = tipAvailable();
  const tile = $('#btn-tips');
  tile.classList.toggle('ready', ok);
  $('#tip-mini').textContent = ok ? 'Nouvelle astuce !' : `Dans ${fmtLeft(left())}`;
  if (ok && !notified && state.tuto) {
    notified = true;
    toast(`💡 Une nouvelle astuce numérique vous attend (+${cfg().crystals ?? 5} 💎) !`, 5000);
  }
}

export function openTips() {
  render();
  $('#dlg-tips').showModal();
}

export function initTips() {
  $('#btn-tips').addEventListener('click', () => { sfx.ui(); openTips(); });
  $('#dlg-tips').addEventListener('close', () => clearInterval(readTimer));
  renderTipTile();
}
