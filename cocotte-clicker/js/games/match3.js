// Fab'Match : jeu d'alignement (3 pièces identiques ou plus) sur le thème FabLab
import { sleep, reducedMotion } from '../core.js';
import { sfx } from '../audio.js';

const N = 7, KINDS = 6, MOVES = 20, GOALS = [1500, 3000, 4500];
const NAMES = ['engrenage', 'bobine', 'écrou', 'ampoule', 'cœur', 'cube'];

// Engrenage généré (8 dents)
function gear() {
  let d = '';
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 11 : 16, a = Math.PI / 8 * i;
    d += (i ? 'L' : 'M') + (20 + r * Math.cos(a)).toFixed(1) + ' ' + (20 + r * Math.sin(a)).toFixed(1);
  }
  return d + 'z';
}
const S = 'stroke="#000" stroke-width="2.5" stroke-linejoin="round"';
// Formes ET couleurs distinctes (lisible pour les daltoniens)
const ICONS = [
  `<path d="${gear()}" fill="#F07E36" ${S}/><circle cx="20" cy="20" r="5" fill="#fff" ${S}/>`,
  `<rect x="9" y="8" width="22" height="24" rx="3" fill="#90C060" ${S}/><rect x="6" y="5" width="28" height="6" rx="3" fill="#5f8f3a" ${S}/><rect x="6" y="29" width="28" height="6" rx="3" fill="#5f8f3a" ${S}/><path d="M10 16h20M10 21h20M10 26h20" stroke="#2f5a14" stroke-width="2"/>`,
  `<polygon points="35,20 27.5,33 12.5,33 5,20 12.5,7 27.5,7" fill="#7b3fe4" ${S}/><circle cx="20" cy="20" r="6" fill="#fff" ${S}/>`,
  `<circle cx="20" cy="16" r="11" fill="#FCD260" ${S}/><rect x="14" y="26" width="12" height="9" rx="2" fill="#999" ${S}/><path d="M16 17l4 4 4-4" stroke="#000" stroke-width="2" fill="none"/>`,
  `<path d="M20 34C8 26 4 19 4 13a8 8 0 0 1 16-2 8 8 0 0 1 16 2c0 6-4 13-16 21z" fill="#E41E6C" ${S}/>`,
  `<path d="M20 4l15 8v16l-15 8-15-8V12z" fill="#5ac8fa" ${S}/><path d="M5 12l15 8 15-8M20 20v16" stroke="#000" stroke-width="2.5" fill="none" stroke-linejoin="round"/><path d="M20 4l15 8-15 8-15-8z" fill="#bdeaff" ${S}/>`,
];
const LINE_H = '<path d="M3 20h34M8 15l-5 5 5 5M32 15l5 5-5 5" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M3 20h34" stroke="#000" stroke-width="1" opacity=".4"/>';
const LINE_V = '<path d="M20 3v34M15 8l5-5 5 5M15 32l5 5 5-5" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
const BOMB = '<circle cx="20" cy="20" r="15" fill="#000"/><circle cx="20" cy="20" r="12" fill="none" stroke="url(#rb)" stroke-width="5"/><text x="20" y="25" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="13" fill="#FCD260">C\'</text>';

function tileSVG(t) {
  if (!t) return '';
  const body = t.sp === 'bomb' ? BOMB : ICONS[t.k] + (t.sp === 'h' ? LINE_H : t.sp === 'v' ? LINE_V : '');
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="rb"><stop offset="0" stop-color="#E41E6C"/><stop offset=".33" stop-color="#FCD260"/><stop offset=".66" stop-color="#90C060"/><stop offset="1" stop-color="#5ac8fa"/></linearGradient></defs>${body}</svg>`;
}
const label = t => !t ? 'vide' : t.sp === 'bomb' ? 'Cocotte bonus' : NAMES[t.k] + (t.sp ? ' laser' : '');

function start(area, api) {
  let board, sel = null, focus = [3, 3], moves = MOVES, score = 0, busy = false, alive = true;
  const rnd = () => (Math.random() * KINDS) | 0;

  area.innerHTML = `<div class="m3-wrap">
      <div class="m3" role="grid" aria-label="Plateau de jeu ${N} par ${N}"></div>
      <p class="play-tip">Touchez une pièce puis une voisine, ou faites-la glisser. Alignez-en 4 pour un laser, 5 pour une Cocotte bonus. Clavier : flèches, Entrée pour choisir.</p>
    </div>`;
  const grid = area.querySelector('.m3');
  const cells = [];
  for (let r = 0; r < N; r++) {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.className = 'm3-row';
    for (let c = 0; c < N; c++) {
      const b = document.createElement('button');
      b.className = 'm3-cell';
      b.setAttribute('role', 'gridcell');
      b.dataset.r = r; b.dataset.c = c;
      b.tabIndex = -1;
      row.appendChild(b);
      cells.push(b);
    }
    grid.appendChild(row);
  }
  const el = (r, c) => cells[r * N + c];
  const at = ([r, c]) => board[r][c];

  // Plateau initial sans alignement
  board = Array.from({ length: N }, () => Array(N).fill(null));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let k;
    do k = rnd(); while (
      (c >= 2 && board[r][c - 1].k === k && board[r][c - 2].k === k) ||
      (r >= 2 && board[r - 1][c].k === k && board[r - 2][c].k === k));
    board[r][c] = { k, sp: null, f: 0 };
  }

  function render() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const t = board[r][c], b = el(r, c);
      b.innerHTML = tileSVG(t);
      b.classList.toggle('sel', !!sel && sel[0] === r && sel[1] === c);
      b.classList.toggle('special', !!t?.sp);
      b.setAttribute('aria-label', `${label(t)}, ligne ${r + 1}, colonne ${c + 1}${b.classList.contains('sel') ? ', sélectionnée' : ''}`);
      if (t?.f && !reducedMotion) {
        b.style.setProperty('--fall', t.f);
        b.classList.remove('fall'); void b.offsetWidth; b.classList.add('fall');
        t.f = 0;
      }
      b.tabIndex = r === focus[0] && c === focus[1] ? 0 : -1;
    }
    const stars = GOALS.filter(g => score >= g).length;
    api.hud(`<span>Score <b>${score}</b></span><span>Coups <b>${moves}</b></span><span class="hud-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span><span class="hud-goal">prochain ★ : ${GOALS[stars] ?? '—'}</span>`);
  }

  function findRuns() {
    const runs = [];
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        const k = board[r][c]?.sp === 'bomb' ? -1 : board[r][c]?.k;
        let e = c + 1;
        while (e < N && k >= 0 && board[r][e]?.sp !== 'bomb' && board[r][e]?.k === k) e++;
        if (k >= 0 && e - c >= 3) runs.push({ dir: 'h', cells: Array.from({ length: e - c }, (_, i) => [r, c + i]) });
        c = e;
      }
    }
    for (let c = 0; c < N; c++) {
      let r = 0;
      while (r < N) {
        const k = board[r][c]?.sp === 'bomb' ? -1 : board[r][c]?.k;
        let e = r + 1;
        while (e < N && k >= 0 && board[e][c]?.sp !== 'bomb' && board[e][c]?.k === k) e++;
        if (k >= 0 && e - r >= 3) runs.push({ dir: 'v', cells: Array.from({ length: e - r }, (_, i) => [r + i, c]) });
        r = e;
      }
    }
    return runs;
  }

  const swap = (a, b) => { const t = at(a); board[a[0]][a[1]] = at(b); board[b[0]][b[1]] = t; };
  const key = ([r, c]) => r * N + c;
  const pos = k => [Math.floor(k / N), k % N];

  // Étend la zone détruite avec les effets des pièces spéciales (en chaîne)
  function expand(set) {
    const queue = [...set], done = new Set();
    while (queue.length) {
      const k = queue.pop();
      if (done.has(k)) continue;
      done.add(k);
      const [r, c] = pos(k), t = board[r][c];
      if (!t) continue;
      if (t.sp === 'h') for (let i = 0; i < N; i++) { set.add(r * N + i); queue.push(r * N + i); }
      if (t.sp === 'v') for (let i = 0; i < N; i++) { set.add(i * N + c); queue.push(i * N + c); }
      if (t.sp === 'bomb') {
        const kk = rnd();
        for (let i = 0; i < N * N; i++) { const [rr, cc] = pos(i); if (board[rr][cc]?.k === kk) { set.add(i); queue.push(i); } }
      }
    }
  }

  async function clear(set, level) {
    expand(set);
    score += set.size * 20 * (level + 1);
    sfx.pop(level);
    for (const k of set) el(...pos(k)).classList.add('pop');
    render();
    await sleep(reducedMotion ? 60 : 230);
    for (const k of set) { const [r, c] = pos(k); board[r][c] = null; el(r, c).classList.remove('pop'); }
  }

  function gravity() {
    for (let c = 0; c < N; c++) {
      let w = N - 1;
      for (let r = N - 1; r >= 0; r--) if (board[r][c]) {
        const t = board[r][c];
        if (w !== r) { t.f = w - r; board[w][c] = t; board[r][c] = null; }
        w--;
      }
      for (let r = w; r >= 0; r--) board[r][c] = { k: rnd(), sp: null, f: w + 1 };
    }
  }

  async function cascade(level, swapped) {
    for (;;) {
      const runs = findRuns();
      if (!runs.length) break;
      const toClear = new Set(), created = [];
      for (const run of runs) {
        run.cells.forEach(p => toClear.add(key(p)));
        if (run.cells.length >= 4) {
          const at0 = swapped && run.cells.find(p => swapped.some(s => s[0] === p[0] && s[1] === p[1]));
          const p = at0 || run.cells[Math.floor(run.cells.length / 2)];
          const k = board[p[0]][p[1]].k;
          created.push({ p, t: { k, sp: run.cells.length >= 5 ? 'bomb' : run.dir, f: 0 } });
        }
      }
      created.forEach(({ p }) => toClear.delete(key(p)));
      await clear(toClear, level);
      created.forEach(({ p, t }) => (board[p[0]][p[1]] = t));
      gravity();
      render();
      await sleep(reducedMotion ? 60 : 300);
      level++; swapped = null;
    }
  }

  function hasMoves() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const a = [r, c], b = [r + dr, c + dc];
      if (b[0] >= N || b[1] >= N) continue;
      if (at(a).sp === 'bomb' || at(b).sp === 'bomb') return true;
      swap(a, b); const ok = findRuns().length > 0; swap(a, b);
      if (ok) return true;
    }
    return false;
  }

  function shuffle() {
    do {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!board[r][c].sp) board[r][c].k = rnd();
    } while (findRuns().length || !hasMoves());
  }

  async function trySwap(a, b) {
    if (busy || !alive || moves <= 0) return;
    busy = true; sel = null;
    swap(a, b); render();
    await sleep(reducedMotion ? 40 : 140);
    const A = at(a), B = at(b);
    if (A.sp === 'bomb' || B.sp === 'bomb') {
      moves--;
      const set = new Set();
      if (A.sp === 'bomb' && B.sp === 'bomb') for (let i = 0; i < N * N; i++) set.add(i);
      else {
        const other = A.sp === 'bomb' ? B : A, bombP = A.sp === 'bomb' ? a : b;
        board[bombP[0]][bombP[1]].sp = null; // la bombe agit une fois
        set.add(key(bombP));
        for (let i = 0; i < N * N; i++) { const [r, c] = pos(i); if (board[r][c].k === other.k) set.add(i); }
      }
      await clear(set, 1);
      gravity(); render(); await sleep(300);
      await cascade(1, null);
    } else if (findRuns().length) {
      moves--;
      await cascade(0, [a, b]);
    } else {
      swap(a, b); sfx.deny();
      el(...a).classList.add('nope'); setTimeout(() => el(...a).classList.remove('nope'), 300);
    }
    if (!alive) return;
    if (!hasMoves()) { shuffle(); }
    render();
    busy = false;
    if (moves <= 0) {
      await sleep(400);
      if (alive) api.finish({ score, stars: GOALS.filter(g => score >= g).length });
    }
  }

  const adjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
  function choose(p) {
    if (busy) return;
    if (!sel) { sel = p; sfx.ui(); }
    else if (sel[0] === p[0] && sel[1] === p[1]) sel = null;
    else if (adjacent(sel, p)) { trySwap(sel, p); return; }
    else sel = p;
    render();
  }

  // Souris / tactile : clic-clic ou glisser
  let drag = null, swiped = false;
  const onDown = e => {
    const b = e.target.closest('.m3-cell'); if (!b) return;
    drag = { p: [+b.dataset.r, +b.dataset.c], x: e.clientX, y: e.clientY }; swiped = false;
  };
  const onMove = e => {
    if (!drag || swiped) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    swiped = true;
    const d = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
    const t = [drag.p[0] + d[0], drag.p[1] + d[1]];
    if (t[0] >= 0 && t[0] < N && t[1] >= 0 && t[1] < N) trySwap(drag.p, t);
    drag = null;
  };
  const onUp = () => { drag = null; };
  const onClick = e => {
    const b = e.target.closest('.m3-cell'); if (!b || swiped) { swiped = false; return; }
    focus = [+b.dataset.r, +b.dataset.c];
    choose(focus);
  };
  // Clavier : flèches = déplacer le focus (ou échanger si une pièce est choisie)
  const onKey = e => {
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (d) {
      e.preventDefault();
      const t = [focus[0] + d[0], focus[1] + d[1]];
      if (t[0] < 0 || t[0] >= N || t[1] < 0 || t[1] >= N) return;
      if (sel && sel[0] === focus[0] && sel[1] === focus[1]) { trySwap(sel, t); focus = t; return; }
      focus = t; render(); el(...focus).focus();
    }
  };
  grid.addEventListener('pointerdown', onDown);
  grid.addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  grid.addEventListener('click', onClick);
  grid.addEventListener('keydown', onKey);
  grid.style.touchAction = 'none';

  if (!hasMoves()) shuffle();
  render();
  setTimeout(() => el(...focus).focus(), 50);

  return () => { alive = false; removeEventListener('pointerup', onUp); };
}

export default {
  id: 'match3',
  name: "Fab'Match",
  icon: '🧩',
  desc: 'Alignez 3 pièces identiques ou plus. 20 coups pour décrocher 3 étoiles !',
  start,
};
