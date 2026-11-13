// Découpe laser : touchez les points de découpe au bon moment, quand le cercle se referme. Le tracé se dessine au fil des points.
import { sfx } from '../audio.js';

const PER_SHAPE = 10, SHAPES = 3, LIFE = 1300, GOALS = [45, 75, 95];

// Formes à découper (points entre 0 et 1)
const star = Array.from({ length: PER_SHAPE }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.2 : 0.42; return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]; });
const heart = Array.from({ length: PER_SHAPE }, (_, i) => {
  const t = Math.PI + i / PER_SHAPE * Math.PI * 2;
  const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return [0.5 + x / 40, 0.47 - y / 40];
});
const circle = Array.from({ length: PER_SHAPE }, (_, i) => { const a = i / PER_SHAPE * Math.PI * 2 - Math.PI / 2; return [0.5 + Math.cos(a) * 0.38, 0.5 + Math.sin(a) * 0.38]; });
const zigzag = Array.from({ length: PER_SHAPE }, (_, i) => [0.1 + i * 0.09, i % 2 ? 0.7 : 0.3]);
const ALL = [star, heart, circle, zigzag];

function start(area, api) {
  let score = 0, hits = 0, combo = 0, idx = 0, alive = true, raf = 0;
  const order = [...ALL].sort(() => Math.random() - 0.5).slice(0, SHAPES);
  const pts = order.flatMap((s, k) => s.map(p => ({ p, shape: k })));
  area.innerHTML = `<div class="las-zone" role="group" aria-label="Plaque à découper">
      <svg class="las-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="las-targets"></div>
      <p class="las-msg" aria-live="polite"></p>
    </div>
    <p class="play-tip">Touchez chaque point quand le cercle orange se referme dessus : plus c'est précis, plus ça rapporte. Clavier : Espace.</p>`;
  const zone = area.querySelector('.las-zone'), svg = area.querySelector('.las-svg'), box = area.querySelector('.las-targets');
  let cur = null;
  const hud = () => {
    const stars = GOALS.filter(g => score >= g).length;
    api.hud(`<span>Score <b>${score}</b></span><span>Points <b>${Math.min(idx + 1, pts.length)}/${pts.length}</b></span><span class="hud-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`);
  };
  const msg = t => { const m = area.querySelector('.las-msg'); m.textContent = t; m.classList.remove('pop-in'); void m.offsetWidth; m.classList.add('pop-in'); };

  function spawn() {
    if (idx >= pts.length) return end();
    const { p, shape } = pts[idx];
    // Nouvelle forme : la plaque se nettoie
    if (idx % PER_SHAPE === 0) svg.innerHTML = '';
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'las-target';
    el.style.left = p[0] * 100 + '%';
    el.style.top = p[1] * 100 + '%';
    el.innerHTML = '<span class="las-ring"></span>';
    el.setAttribute('aria-label', 'Point de découpe');
    el.addEventListener('pointerdown', e => { e.preventDefault(); hit(); });
    box.appendChild(el);
    cur = { el, t: performance.now(), p, shape, done: false };
  }
  function line(a, b) {
    const xy = `x1="${a[0] * 100}" y1="${a[1] * 100}" x2="${b[0] * 100}" y2="${b[1] * 100}"`;
    svg.insertAdjacentHTML('beforeend', `<line class="glow" ${xy}/><line ${xy}/>`);
  }
  function resolve(pts_) {
    const c = cur; c.done = true; cur = null;
    c.el.classList.add(pts_ ? 'hit' : 'miss');
    setTimeout(() => c.el.remove(), 250);
    if (pts_) {
      hits++; combo++;
      score += pts_ + (combo >= 10 ? 1 : 0);
      sfx.pop(combo % 6);
      msg(pts_ === 3 ? 'Parfait !' : pts_ === 2 ? 'Bien !' : 'Ok');
      const prev = idx % PER_SHAPE ? pts[idx - 1].p : null;
      if (prev) line(prev, c.p);
      if (idx % PER_SHAPE === PER_SHAPE - 1) line(c.p, pts[idx - PER_SHAPE + 1].p); // ferme la forme
    } else { combo = 0; sfx.deny(); msg('Raté…'); }
    idx++;
    hud();
    setTimeout(() => alive && spawn(), 180);
  }
  function hit() {
    if (!alive || !cur || cur.done) return;
    const age = (performance.now() - cur.t) / LIFE; // 0 → 1 : le cercle se referme
    resolve(age > 0.7 ? 3 : age > 0.45 ? 2 : 1);
  }
  function frame(now) {
    if (!alive) return;
    if (cur && !cur.done) {
      const age = (now - cur.t) / LIFE;
      cur.el.style.setProperty('--k', Math.max(0, 1 - age));
      if (age >= 1.12) resolve(0);
    }
    raf = requestAnimationFrame(frame);
  }
  function end() {
    alive = false;
    cancelAnimationFrame(raf);
    setTimeout(() => api.finish({ score, stars: GOALS.filter(g => score >= g).length }), 500);
  }
  const onKey = e => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); hit(); } };
  addEventListener('keydown', onKey);
  zone.addEventListener('pointerdown', e => { if (!e.target.closest('.las-target')) hit(); }); // tolère un doigt un peu à côté
  spawn(); hud();
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); };
}

export default {
  id: 'laser',
  name: 'Découpe laser',
  icon: '🔥',
  desc: 'Guidez la graveuse : touchez chaque point de découpe au moment où le cercle se referme pour dessiner étoiles, cœurs et cercles.',
  start,
};
