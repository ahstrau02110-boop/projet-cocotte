// Attrape-tout : déplacer la Cocotte pour attraper ce qui tombe, éviter les bugs (3 cœurs)
import { sfx } from '../audio.js';
import { skinImage } from '../skins.js';
import { state } from '../state.js';

const DURATION = 45, GOALS = [20, 40, 60];
const GOOD = [['⚙️', 1], ['🧵', 1], ['🔩', 1], ['💡', 1], ['⭐', 2], ['💎', 3]];

function start(area, api) {
  let score = 0, lives = 3, alive = true, last = performance.now(), spawnT = 0, raf = 0, x = 0.5, dir = 0;
  const t0 = Date.now(), items = [];
  area.innerHTML = `<div class="catch-zone" aria-label="Zone de jeu">
      <div class="catch-pot" aria-hidden="true"><img src="${skinImage(state.skin)}" alt=""></div>
    </div>
    <div class="catch-pad" role="group" aria-label="Déplacer la Cocotte">
      <button type="button" data-d="-1" aria-label="Gauche">⬅️</button><button type="button" data-d="1" aria-label="Droite">➡️</button>
    </div>
    <p class="play-tip">Faites glisser le doigt (ou la souris) pour déplacer la Cocotte. Attrapez les objets, évitez les 🐞 ! Clavier : flèches.</p>`;
  const zone = area.querySelector('.catch-zone'), pot = area.querySelector('.catch-pot');
  const left = () => Math.max(0, DURATION - (Date.now() - t0) / 1000);
  const hud = () => {
    const stars = GOALS.filter(g => score >= g).length;
    api.hud(`<span>Score <b>${score}</b></span><span>${'❤️'.repeat(lives)}${'🤍'.repeat(3 - lives)}</span><span>Temps <b>${Math.ceil(left())} s</b></span><span class="hud-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`);
  };

  const place = () => { pot.style.left = `calc(${x * 100}% - ${pot.offsetWidth / 2}px)`; };
  const toX = clientX => { const r = zone.getBoundingClientRect(); x = Math.min(0.95, Math.max(0.05, (clientX - r.left) / r.width)); place(); };
  const onMove = e => { if (e.buttons || e.pointerType === 'touch') toX(e.clientX); };
  zone.addEventListener('pointermove', onMove);
  zone.addEventListener('pointerdown', e => toX(e.clientX));
  zone.style.touchAction = 'none';
  const pad = area.querySelector('.catch-pad');
  pad.addEventListener('pointerdown', e => { const b = e.target.closest('[data-d]'); if (b) dir = +b.dataset.d; });
  addEventListener('pointerup', () => (dir = 0));
  const onKey = e => {
    if (e.key === 'ArrowLeft') { dir = -1; e.preventDefault(); }
    if (e.key === 'ArrowRight') { dir = 1; e.preventDefault(); }
  };
  const onKeyUp = e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') dir = 0; };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKeyUp);

  function spawn(p) {
    const bad = Math.random() < 0.18 + p * 0.12;
    const [emoji, pts] = bad ? ['🐞', 0] : GOOD[(Math.random() * GOOD.length) | 0];
    const el = document.createElement('span');
    el.className = 'catch-item' + (bad ? ' bad' : '');
    el.textContent = emoji;
    zone.appendChild(el);
    items.push({ el, x: 0.06 + Math.random() * 0.88, y: -40, vy: 120 + Math.random() * 60 + p * 140, bad, pts });
  }

  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const p = 1 - left() / DURATION, H = zone.clientHeight, W = zone.clientWidth;
    if (dir) { x = Math.min(0.95, Math.max(0.05, x + dir * dt * 0.9)); place(); }
    spawnT -= dt;
    if (spawnT <= 0) { spawn(p); spawnT = 0.85 - p * 0.45; }
    const potY = H - pot.offsetHeight * 0.8, potW = pot.offsetWidth / W;
    for (const it of items) {
      if (it.dead) continue;
      it.y += it.vy * dt;
      it.el.style.transform = `translate(${it.x * W - 20}px, ${it.y}px)`;
      if (it.y > potY - 20 && it.y < potY + 30 && Math.abs(it.x - x) < potW / 2) {
        it.dead = true; it.el.remove();
        if (it.bad) {
          lives--; sfx.deny();
          pot.classList.remove('hurt'); void pot.offsetWidth; pot.classList.add('hurt');
        } else {
          score += it.pts; sfx.pop(score % 6);
          pot.classList.remove('yum'); void pot.offsetWidth; pot.classList.add('yum');
        }
      } else if (it.y > H + 20) { it.dead = true; it.el.remove(); }
    }
    hud();
    if (lives <= 0 || left() <= 0) {
      alive = false;
      setTimeout(() => api.finish({ score, stars: GOALS.filter(g => score >= g).length }), 500);
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  requestAnimationFrame(() => { place(); raf = requestAnimationFrame(frame); });
  hud();
  return () => {
    alive = false; cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp);
  };
}

export default {
  id: 'catcher',
  name: 'Attrape-tout',
  icon: '🧺',
  desc: 'Déplacez la Cocotte pour attraper engrenages, étoiles et cristaux… mais pas les bugs !',
  start,
};
