// Chasse aux bugs : toucher les bugs qui apparaissent sur les écrans, sans toucher les fichiers importants
import { sleep } from '../core.js';
import { sfx } from '../audio.js';

const DURATION = 30, GOALS = [200, 400, 600];
// Ordre des touches 1-9 calé sur le pavé numérique (7 8 9 en haut)
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

const BUG = `<svg viewBox="0 0 60 60" aria-hidden="true"><g stroke="#000" stroke-width="3" stroke-linecap="round">
  <path d="M14 26l-8-4M14 34H5M15 42l-8 5M46 26l8-4M46 34h9M45 42l8 5M24 14l-5-7M36 14l5-7"/></g>
  <ellipse cx="30" cy="34" rx="16" ry="18" fill="#90C060" stroke="#000" stroke-width="3"/>
  <path d="M30 17v35" stroke="#000" stroke-width="2.5"/>
  <circle cx="30" cy="18" r="9" fill="#3C2472" stroke="#000" stroke-width="3"/>
  <circle cx="26" cy="17" r="2.5" fill="#fff"/><circle cx="34" cy="17" r="2.5" fill="#fff"/>
  <circle cx="22" cy="32" r="3" fill="#E41E6C"/><circle cx="38" cy="40" r="3" fill="#E41E6C"/></svg>`;
const FILE = `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M8 16h16l4 5h24v27H8z" fill="#FCD260" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
  <path d="M30 27v10" stroke="#E41E6C" stroke-width="5" stroke-linecap="round"/><circle cx="30" cy="43" r="2.8" fill="#E41E6C"/></svg>`;

function start(area, api) {
  let score = 0, combo = 0, alive = true, t0 = Date.now();
  const slots = Array(9).fill(null); // { type, timer }

  area.innerHTML = `<div class="bugs" role="group" aria-label="Écrans">${KEYS.map((k, i) => `
      <button class="screen" data-i="${i}" aria-label="Écran ${k} : vide"><span class="screen-k" aria-hidden="true">${k}</span><span class="screen-in"></span></button>`).join('')}</div>
    <p class="play-tip">Touchez les <b>bugs</b> verts. Ne touchez pas les <b>dossiers jaunes</b> ! Clavier : touches 1 à 9.</p>`;
  const screens = [...area.querySelectorAll('.screen')];

  const elapsed = () => (Date.now() - t0) / 1000;
  const hud = () => {
    const stars = GOALS.filter(g => score >= g).length;
    api.hud(`<span>Score <b>${score}</b></span><span>Combo <b>×${combo}</b></span><span>Temps <b>${Math.max(0, Math.ceil(DURATION - elapsed()))} s</b></span><span class="hud-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`);
  };

  function hide(i) {
    const s = slots[i]; if (!s) return;
    clearTimeout(s.timer);
    slots[i] = null;
    screens[i].classList.remove('bug', 'file');
    screens[i].querySelector('.screen-in').innerHTML = '';
    screens[i].setAttribute('aria-label', `Écran ${KEYS[i]} : vide`);
  }

  function spawn() {
    const free = slots.map((s, i) => (s ? -1 : i)).filter(i => i >= 0);
    if (!free.length) return;
    const i = free[(Math.random() * free.length) | 0];
    const p = Math.min(1, elapsed() / DURATION);      // difficulté croissante
    const type = Math.random() < 0.22 ? 'file' : 'bug';
    const life = 1200 - p * 450;
    slots[i] = { type, timer: setTimeout(() => { if (slots[i]?.type === 'bug') { combo = 0; hud(); } hide(i); }, life) };
    screens[i].classList.add(type);
    screens[i].querySelector('.screen-in').innerHTML = type === 'bug' ? BUG : FILE;
    screens[i].setAttribute('aria-label', `Écran ${KEYS[i]} : ${type === 'bug' ? 'bug' : 'dossier important, ne pas toucher'}`);
  }

  function hit(i) {
    const s = slots[i]; if (!s || !alive) return;
    const scr = screens[i];
    if (s.type === 'bug') {
      combo++;
      score += 10 + Math.min(combo, 10) * 2;
      sfx.hit();
      scr.classList.add('squash'); setTimeout(() => scr.classList.remove('squash'), 250);
    } else {
      combo = 0;
      score = Math.max(0, score - 15);
      sfx.deny();
      scr.classList.add('oops'); setTimeout(() => scr.classList.remove('oops'), 350);
    }
    hide(i);
    hud();
  }

  // Boucle d'apparition : de plus en plus rapide
  (async () => {
    while (alive && elapsed() < DURATION) {
      spawn();
      if (Math.random() < Math.min(1, elapsed() / DURATION) * 0.5) spawn();
      hud();
      await sleep(850 - Math.min(1, elapsed() / DURATION) * 380);
    }
    if (!alive) return;
    slots.forEach((_, i) => hide(i));
    hud();
    await sleep(300);
    if (alive) api.finish({ score, stars: GOALS.filter(g => score >= g).length });
  })();

  const onDown = e => { const b = e.target.closest('.screen'); if (b) { e.preventDefault(); hit(+b.dataset.i); } };
  const onKey = e => { const i = KEYS.indexOf(e.key); if (i >= 0) { e.preventDefault(); hit(i); } };
  // Entrée / Espace sur un écran ciblé au clavier
  const onClick = e => { const b = e.target.closest('.screen'); if (b && e.detail === 0) hit(+b.dataset.i); };
  area.addEventListener('pointerdown', onDown);
  area.addEventListener('click', onClick);
  addEventListener('keydown', onKey);
  hud();

  return () => {
    alive = false;
    slots.forEach((_, i) => hide(i));
    area.removeEventListener('pointerdown', onDown);
    area.removeEventListener('click', onClick);
    removeEventListener('keydown', onKey);
  };
}

export default {
  id: 'bugs',
  name: 'Chasse aux bugs',
  icon: '🐞',
  desc: '30 secondes pour écraser un maximum de bugs sur les écrans du FabLab.',
  start,
};
