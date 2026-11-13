// Cocotte dorée : apparaît au hasard, à attraper pour un bonus temporaire
import { DATA, state, earn, addCrystals, totalCps, projectEffects, activeBuffs, currentEra, hasTalent } from './state.js';
import { $, toast, emit, reducedMotion } from './core.js';
import { skinSVG } from './skins.js';
import { fmt } from './format.js';
import { sfx } from './audio.js';
import { save } from './save.js';
import { addMats, randomMats, matsText } from './materials.js';

const cfg = () => DATA.config.golden || {};
let timer = null, el = null, img = '';

function nextDelay() {
  const min = cfg().minSec ?? 120, max = cfg().maxSec ?? 300;
  const freq = projectEffects('golden').reduce((m, e) => m * e.freq, 1) * (hasTalent('doree') ? 1.25 : 1);
  return (min + Math.random() * (max - min)) * 1000 / freq;
}
function schedule() { clearTimeout(timer); timer = setTimeout(spawn, nextDelay()); }

// Apparition immédiate (recette « Appeau doré »)
export function spawnGolden() { if (el) return; clearTimeout(timer); spawn(true); }

function spawn(force = false) {
  if ((document.hidden && !force) || el) return schedule();
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
  const life = ((cfg().lifeSec ?? 13) + (hasTalent('doree2') ? 5 : 0)) * 1000;
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
  // Tirage : pépite de cristal, géode, pluie de matériaux, main de maître, inspiration, coup de main, portes ouvertes, jackpot, coup de feu
  if (r < cp) {
    const g = cfg().crystalGain ?? 4;
    addCrystals(g);
    msg = `Pépite de cristal : +${g} 💎`;
  } else if (r < cp + 2) {
    addCrystals(12);
    msg = 'Géode ! +12 💎';
  } else if (r < cp + 14) {
    const [a, b] = DATA.config.materials?.goldenRain || [4, 10];
    const got = randomMats(a + Math.floor(Math.random() * (b - a + 1)));
    addMats(got);
    msg = `Pluie de matériaux ! ${matsText(got)}`;
  } else if (r < cp + 20) {
    addBuff({ id: 'maitre', name: 'Main de maître', click: 15, sec: 60 });
    msg = 'Main de maître ! Clics ×15 pendant 60 s';
  } else if (r < cp + 28) {
    addBuff({ id: 'inspiration', name: 'Inspiration', click: 77, sec: 13 });
    msg = 'Inspiration ! Clics ×77 pendant 13 s';
  } else if (r < cp + 36) {
    // Coup de main : des bénévoles offrent 1 à 3 bâtiments déjà débloqués
    const ownedB = DATA.buildings.filter(b => b.era <= currentEra().id && state.buildings[b.id] > 0);
    const pool = ownedB.length ? ownedB : DATA.buildings.slice(0, 1);
    const b = pool[(Math.random() * pool.length) | 0], n = 1 + ((Math.random() * 3) | 0);
    state.buildings[b.id] = (state.buildings[b.id] || 0) + n;
    msg = `Coup de main ! ${n} × ${b.name} offert${n > 1 ? 's' : ''}`;
  } else if (r < cp + 46) {
    addBuff({ id: 'portesouvertes', name: 'Portes ouvertes', cps: 3, click: 7, sec: 30 });
    msg = 'Portes ouvertes ! Production ×3 et clics ×7 pendant 30 s';
  } else if (r < cp + 76) {
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

// Barre des bonus actifs : mise à jour sur place (pas de reconstruction, sinon l'animation clignote)
export function renderBuffs() {
  const box = $('#buffs'), list = activeBuffs(), ids = new Set(list.map(b => b.id));
  for (const el of [...box.children]) if (!ids.has(el.dataset.id)) el.remove();
  for (const b of list) {
    let el = box.querySelector(`[data-id="${b.id}"]`);
    const eff = [b.cps !== 1 && `production ×${b.cps}`, b.click !== 1 && `clics ×${b.click}`].filter(Boolean).join(', ');
    if (!el || el.dataset.eff !== eff) {
      el?.remove();
      el = document.createElement('span');
      el.className = 'buff';
      el.dataset.id = b.id;
      el.dataset.eff = eff;
      el.innerHTML = `🌟 ${b.name} · ${eff} · <b></b>`;
      box.appendChild(el);
    }
    const s = Math.ceil((b.until - Date.now()) / 1000);
    el.querySelector('b').textContent = s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}` : s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : s + ' s';
  }
}

export function initGolden() { schedule(); }
