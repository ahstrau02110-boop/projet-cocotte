// Cocotte dorée : apparaît au hasard, à attraper pour un bonus temporaire
import { DATA, state, earn, addCrystals, totalCps, projectEffects, activeBuffs } from './state.js';
import { $, toast, emit, reducedMotion } from './core.js';
import { skinSVG } from './skins.js';
import { fmt } from './format.js';
import { sfx } from './audio.js';
import { save } from './save.js';

const cfg = () => DATA.config.golden || {};
let timer = null, el = null, img = '';

function nextDelay() {
  const min = cfg().minSec ?? 120, max = cfg().maxSec ?? 300;
  const freq = projectEffects('golden').reduce((m, e) => m * e.freq, 1);
  return (min + Math.random() * (max - min)) * 1000 / freq;
}
function schedule() { clearTimeout(timer); timer = setTimeout(spawn, nextDelay()); }

function spawn() {
  if (document.hidden || el) return schedule();
  img ||= 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(skinSVG({ gradient: ['#fff6c2', '#FCD260', '#d9a400'], eyes: 'star', accessory: 'crown' }));
  el = document.createElement('button');
  el.className = 'golden';
  el.setAttribute('aria-label', 'Cocotte dorée ! Cliquez vite pour un bonus');
  el.innerHTML = `<img src="${img}" alt="">`;
  // Position au hasard dans la fenêtre (hors barre du haut)
  const top = 110, size = 96;
  el.style.left = Math.round(12 + Math.random() * (innerWidth - size - 24)) + 'px';
  el.style.top = Math.round(top + Math.random() * (innerHeight - top - size - 20)) + 'px';
  el.addEventListener('click', () => catchIt());
  document.body.appendChild(el);
  sfx.printTick(1);
  toast('✨ Une Cocotte dorée est apparue !', 3000);
  const life = (cfg().lifeSec ?? 13) * 1000;
  setTimeout(() => el?.classList.add('leaving'), life - 1500);
  setTimeout(() => remove(), life);
}

function remove() {
  el?.remove();
  el = null;
  schedule();
}

// Tirage du bonus
function catchIt() {
  if (!el) return;
  state.golden++;
  const r = Math.random() * 100, cp = cfg().crystalChancePct ?? 3;
  let msg;
  if (r < cp) {
    addCrystals(2);
    msg = 'Pépite de cristal : +2 💎';
  } else if (r < cp + 12) {
    addBuff({ id: 'inspiration', name: 'Inspiration', click: 77, sec: 13 });
    msg = 'Inspiration ! Clics ×77 pendant 13 s';
  } else if (r < cp + 52) {
    const gain = Math.min(state.coins * 0.15, totalCps() * 900) + 13;
    earn(gain);
    msg = `Jackpot ! +${fmt(gain)} Co'Coins`;
  } else {
    addBuff({ id: 'coupdefeu', name: 'Coup de feu', cps: 7, sec: 77 });
    msg = 'Coup de feu ! Production ×7 pendant 77 s';
  }
  sfx.unlock();
  toast('🌟 ' + msg, 5000);
  el.classList.add('caught');
  const old = el; el = null;
  setTimeout(() => old.remove(), reducedMotion ? 0 : 350);
  schedule();
  save();
  emit('refresh');
}

export function addBuff({ id, name, cps = 1, click = 1, sec }) {
  state.buffs = state.buffs.filter(b => b.id !== id && b.until > Date.now());
  state.buffs.push({ id, name, cps, click, until: Date.now() + sec * 1000 });
}

// Barre des bonus actifs (compte à rebours)
export function renderBuffs() {
  const list = activeBuffs();
  $('#buffs').innerHTML = list.map(b => {
    const left = Math.ceil((b.until - Date.now()) / 1000);
    const eff = b.cps !== 1 ? `production ×${b.cps}` : `clics ×${b.click}`;
    return `<span class="buff">🌟 ${b.name} · ${eff} · <b>${left} s</b></span>`;
  }).join('');
}

export function initGolden() { schedule(); }
