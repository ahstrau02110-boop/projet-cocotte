// Puzzle des skins : reconstituer une de ses Cocottes (sur un de ses décors) en échangeant les pièces
import { DATA, state } from '../state.js';
import { sleep, esc } from '../core.js';
import { skinImage } from '../skins.js';
import { bgById, bgCSS } from '../backgrounds.js';
import { sfx } from '../audio.js';

const RANK = { commune: 0, rare: 1, epique: 2, legendaire: 3 };

function start(area, api) {
  // Skin au hasard parmi ceux possédés ; décor possédé au hasard (sinon décor de l'atelier)
  const skins = DATA.skins.filter(s => state.skins[s.id]);
  const skin = skins[(Math.random() * skins.length) | 0];
  const bgs = DATA.backgrounds.filter(b => state.bgs[b.id]);
  const bg = bgs.length ? bgs[(Math.random() * bgs.length) | 0] : null;
  const bgStyle = bg ? bgCSS(bg) : 'radial-gradient(circle, #7b5a36 3.2px, transparent 3.8px) 0 0/30px 30px, #d8b384';
  const N = RANK[skin.rarity] >= RANK.epique ? 4 : 3;   // 4×4 pour les skins rares à obtenir
  const total = N * N;

  // Ordre mélangé (jamais déjà résolu)
  let order;
  do order = [...Array(total).keys()].sort(() => Math.random() - 0.5); while (order.every((v, i) => v === i));
  // Nombre minimal d'échanges = pièces − cycles de la permutation
  const minSwaps = (() => {
    const seen = new Set(); let cycles = 0;
    for (let i = 0; i < total; i++) { if (seen.has(i)) continue; cycles++; for (let j = i; !seen.has(j); j = order[j]) seen.add(j); }
    return total - cycles;
  })();

  let sel = null, moves = 0, alive = true;
  const t0 = Date.now();
  const inner = `<span class="pz-full" style="background:${bgStyle}"><img src="${skinImage(skin.id)}" alt=""></span>`;
  area.innerHTML = `<div class="pz-wrap">
      <div class="pz-ref"><span class="pz-ref-img" style="background:${bgStyle}"><img src="${skinImage(skin.id)}" alt=""></span>
        <span><b>${esc(skin.name)}</b>${bg ? `<br><small>sur « ${esc(bg.name)} »</small>` : ''}</span></div>
      <div class="pz" style="--n:${N}" role="grid" aria-label="Puzzle ${N} par ${N}"></div>
      <p class="play-tip">Touchez deux pièces pour les échanger et reconstituez l'image. Clavier : Tab puis Entrée.</p>
    </div>`;
  const board = area.querySelector('.pz');

  const render = () => {
    board.innerHTML = order.map((piece, slot) => {
      const r = Math.floor(piece / N), c = piece % N, ok = piece === slot;
      return `<button class="pz-piece${ok ? ' ok' : ''}${sel === slot ? ' sel' : ''}" data-slot="${slot}"
        aria-label="Pièce ${slot + 1}${ok ? ', bien placée' : ''}${sel === slot ? ', sélectionnée' : ''}">
        <span class="pz-in" style="left:${-c * 100}%;top:${-r * 100}%">${inner}</span></button>`;
    }).join('');
    const stars = moves <= minSwaps + 1 ? 3 : moves <= minSwaps + 5 ? 2 : 1;
    api.hud(`<span>Échanges <b>${moves}</b></span><span>Minimum <b>${minSwaps}</b></span><span class="hud-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`);
  };

  const onClick = async e => {
    const b = e.target.closest('.pz-piece');
    if (!b || !alive) return;
    const slot = +b.dataset.slot;
    if (sel === null) { sel = slot; sfx.flip(); render(); board.querySelector(`[data-slot="${slot}"]`).focus(); return; }
    if (sel !== slot) {
      [order[sel], order[slot]] = [order[slot], order[sel]];
      moves++;
      const placed = [sel, slot].filter(s => order[s] === s).length;
      placed ? sfx.pop(placed) : sfx.flip();
    }
    sel = null;
    render();
    board.querySelector(`[data-slot="${slot}"]`)?.focus();
    if (order.every((v, i) => v === i)) {
      board.classList.add('done');
      sfx.unlock();
      state.mini.puzzles++;
      const sec = Math.floor((Date.now() - t0) / 1000);
      const stars = moves <= minSwaps + 1 ? 3 : moves <= minSwaps + 5 ? 2 : 1;
      await sleep(900);
      if (alive) api.finish({ score: Math.max(100, 1200 - (moves - minSwaps) * 60 - sec * 4) * (N === 4 ? 2 : 1), stars });
    }
  };
  board.addEventListener('click', onClick);
  render();
  setTimeout(() => board.querySelector('.pz-piece')?.focus(), 50);
  return () => { alive = false; board.removeEventListener('click', onClick); };
}

export default {
  id: 'puzzle',
  name: 'Puzzle des skins',
  icon: '🖼️',
  desc: 'Reconstituez une de vos Cocottes sur un de vos décors. Plus le skin est rare, plus le puzzle est grand !',
  start,
};
