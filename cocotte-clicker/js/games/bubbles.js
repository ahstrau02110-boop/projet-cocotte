// Bulles de savon : toucher les bulles qui montent. Aucun piège : idéal pour les plus petits.
import { sfx } from '../audio.js';
import { skinImage } from '../skins.js';
import { state } from '../state.js';

const DURATION = 40, GOALS = [25, 45, 65];
const ITEMS = ['⭐', '💎', '🍬', '🎈', '🌸', '🦋', '🍓', '🎁'];
const COLORS = ['#ff9ac1', '#9fd8f5', '#c6f0d8', '#fff1a8', '#d4c4ff'];

function start(area, api) {
  let score = 0, popped = 0, alive = true, last = performance.now(), spawnT = 0, raf = 0;
  const t0 = Date.now(), bubbles = [];
  area.innerHTML = `<div class="bub-zone" role="group" aria-label="Bulles à éclater"></div>
    <p class="play-tip">Touchez les bulles pour les faire éclater ! Les bulles dorées valent 5 points. Clavier : Entrée sur une bulle.</p>`;
  const zone = area.querySelector('.bub-zone');
  const left = () => Math.max(0, DURATION - (Date.now() - t0) / 1000);
  const hud = () => {
    const stars = GOALS.filter(g => score >= g).length;
    api.hud(`<span>Score <b>${score}</b></span><span>Temps <b>${Math.ceil(left())} s</b></span><span class="hud-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`);
  };

  function spawn() {
    const gold = Math.random() < 0.1, size = 64 + Math.random() * 40;
    const el = document.createElement('button');
    el.className = 'bubble' + (gold ? ' gold' : '');
    el.style.setProperty('--s', size + 'px');
    el.style.setProperty('--c', COLORS[(Math.random() * COLORS.length) | 0]);
    el.innerHTML = gold ? `<img src="${skinImage(state.skin)}" alt="">` : `<span>${ITEMS[(Math.random() * ITEMS.length) | 0]}</span>`;
    el.setAttribute('aria-label', gold ? 'Bulle dorée, 5 points' : 'Bulle');
    const b = { el, x: Math.random() * (zone.clientWidth - size), y: zone.clientHeight + 10, vy: 45 + Math.random() * 45, sway: Math.random() * 6.28, gold };
    el.addEventListener('pointerdown', e => { e.preventDefault(); pop(b); });
    el.addEventListener('click', e => { if (e.detail === 0) pop(b); });
    zone.appendChild(el);
    bubbles.push(b);
  }

  function pop(b) {
    if (b.dead || !alive) return;
    b.dead = true;
    popped++;
    score += b.gold ? 5 : 1;
    sfx.pop(popped % 6);
    b.el.classList.add('popped');
    b.el.disabled = true;
    setTimeout(() => b.el.remove(), 250);
    hud();
  }

  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const p = 1 - left() / DURATION;
    spawnT -= dt;
    if (spawnT <= 0 && left() > 0) { spawn(); spawnT = 0.75 - p * 0.35; }
    for (const b of bubbles) {
      if (b.dead) continue;
      b.y -= b.vy * (1 + p * 0.6) * dt;
      b.sway += dt * 2;
      b.el.style.transform = `translate(${b.x + Math.sin(b.sway) * 14}px, ${b.y}px)`;
      if (b.y < -120) { b.dead = true; b.el.remove(); }
    }
    if (left() <= 0) {
      alive = false;
      setTimeout(() => api.finish({ score, stars: GOALS.filter(g => score >= g).length }), 500);
      return;
    }
    hud();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  hud();
  return () => { alive = false; cancelAnimationFrame(raf); };
}

export default {
  id: 'bubbles',
  name: 'Bulles de savon',
  icon: '🫧',
  desc: 'Pour les petits (et les grands) : touchez un maximum de bulles en 40 secondes. Aucun piège !',
  start,
};
