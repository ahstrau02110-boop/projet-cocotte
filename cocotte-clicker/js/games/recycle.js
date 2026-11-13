// La Recyclerie : trier chaque objet dans le bon bac (consignes de tri françaises). Accessible aux enfants.
import { sfx } from '../audio.js';

const DURATION = 45, GOALS = [15, 30, 50];
const BINS = [
  { id: 'jaune', label: 'Emballages et papiers', color: '#FCD260', icon: '🟡' },
  { id: 'verre', label: 'Verre', color: '#5fbf6a', icon: '🟢' },
  { id: 'compost', label: 'Compost', color: '#a0703c', icon: '🟤' },
  { id: 'gris', label: 'Ordures ménagères', color: '#8c8c8c', icon: '⚫' },
];
const ITEMS = [
  ['🧴', 'Bouteille en plastique', 'jaune'], ['🥫', 'Canette', 'jaune'], ['📦', 'Carton', 'jaune'], ['📰', 'Journal', 'jaune'],
  ['🧃', 'Brique de jus', 'jaune'], ['✉️', 'Enveloppe', 'jaune'], ['📖', 'Magazine', 'jaune'], ['🥡', 'Barquette', 'jaune'],
  ['🍾', 'Bouteille en verre', 'verre'], ['🫙', 'Bocal', 'verre'], ['🍯', 'Pot de confiture', 'verre'], ['🍷', 'Bouteille de vin', 'verre'],
  ['🍎', 'Trognon de pomme', 'compost'], ['🍌', 'Peau de banane', 'compost'], ['🥕', 'Épluchures', 'compost'], ['☕', 'Marc de café', 'compost'],
  ['🥚', "Coquilles d'œuf", 'compost'], ['🍂', 'Feuilles mortes', 'compost'],
  ['🪥', 'Brosse à dents', 'gris'], ['🍽️', 'Assiette cassée', 'gris'], ['🧽', 'Éponge usée', 'gris'], ['🦷', 'Fil dentaire', 'gris'],
];

function start(area, api) {
  let score = 0, streak = 0, errors = 0, sorted = 0, alive = true, item = null, timer = 0;
  const t0 = Date.now();
  area.innerHTML = `<div class="rec-zone">
      <div class="rec-item" aria-live="polite"><span class="rec-emoji"></span><b class="rec-name"></b></div>
      <p class="rec-msg" aria-live="polite"></p>
      <div class="rec-bins">${BINS.map(b => `<button type="button" class="rec-bin" data-bin="${b.id}" style="--bc:${b.color}"><span aria-hidden="true">🗑️</span><b>${b.label}</b></button>`).join('')}</div>
    </div>
    <p class="play-tip">Triez chaque objet dans le bon bac ! Série de bonnes réponses = points bonus. Clavier : touches 1 à 4.</p>`;
  const $ = s => area.querySelector(s);
  const left = () => Math.max(0, DURATION - (Date.now() - t0) / 1000);
  const hud = () => {
    const stars = GOALS.filter(g => score >= g).length;
    api.hud(`<span>Score <b>${score}</b></span><span>Temps <b>${Math.ceil(left())} s</b></span><span class="hud-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`);
  };
  function next() {
    let it;
    do it = ITEMS[(Math.random() * ITEMS.length) | 0]; while (item && it === item && ITEMS.length > 1);
    item = it;
    $('.rec-emoji').textContent = it[0];
    $('.rec-name').textContent = it[1];
    const box = $('.rec-item'); box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
  }
  function choose(bin) {
    if (!alive || !item) return;
    const ok = item[2] === bin, good = BINS.find(b => b.id === item[2]);
    const btn = area.querySelector(`[data-bin="${bin}"]`);
    btn.classList.remove('ok', 'ko'); void btn.offsetWidth; btn.classList.add(ok ? 'ok' : 'ko');
    if (ok) {
      streak++; sorted++;
      score += 1 + (streak >= 5 ? 1 : 0);
      sfx.pop(streak % 6);
      $('.rec-msg').textContent = streak >= 5 ? `Série de ${streak} ! +2` : 'Bravo !';
    } else {
      streak = 0; errors++;
      sfx.deny();
      $('.rec-msg').textContent = `${item[1]} → ${good.icon} ${good.label}`;
    }
    next();
    hud();
  }
  area.querySelector('.rec-bins').addEventListener('click', e => { const b = e.target.closest('[data-bin]'); if (b) choose(b.dataset.bin); });
  const onKey = e => { const i = +e.key - 1; if (BINS[i]) { e.preventDefault(); choose(BINS[i].id); } };
  addEventListener('keydown', onKey);
  timer = setInterval(() => {
    hud();
    if (left() <= 0 && alive) {
      alive = false;
      clearInterval(timer);
      if (!errors && sorted >= 15) api.flag?.('triparfait');
      setTimeout(() => api.finish({ score, stars: GOALS.filter(g => score >= g).length }), 400);
    }
  }, 250);
  next(); hud();
  return () => { alive = false; clearInterval(timer); removeEventListener('keydown', onKey); };
}

export default {
  id: 'recycle',
  name: 'La Recyclerie',
  icon: '♻️',
  desc: 'Triez les déchets dans le bon bac en 45 secondes : emballages, verre, compost ou ordures. Pour apprendre en s\'amusant !',
  start,
};
