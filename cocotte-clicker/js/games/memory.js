// Memory des machines : retrouver les paires d'illustrations du FabLab
import { DATA, state } from '../state.js';
import { asset, sleep } from '../core.js';
import { skinImage } from '../skins.js';
import { sfx } from '../audio.js';

function start(area, api) {
  // 6 paires : les bâtiments + la Cocotte du joueur
  const faces = DATA.buildings.slice(0, 5).map(b => ({ id: b.id, name: b.name, img: asset('building.' + b.id) }));
  faces.push({ id: 'cocotte', name: 'La Cocotte', img: skinImage(state.skin) });
  const deck = [...faces, ...faces].map((f, i) => ({ ...f, uid: i })).sort(() => Math.random() - 0.5);

  let first = null, lock = false, moves = 0, pairs = 0, alive = true;
  const t0 = Date.now();

  area.innerHTML = `<div class="mem" role="grid" aria-label="Cartes à retourner">${deck.map((c, i) => `
      <button class="mem-card" data-i="${i}" aria-label="Carte cachée ${i + 1}">
        <span class="mem-in">
          <span class="mem-back" aria-hidden="true">?</span>
          <span class="mem-front"><img src="${c.img}" alt=""></span>
        </span>
      </button>`).join('')}</div>
    <p class="play-tip">Retournez deux cartes : si elles sont identiques, elles restent visibles.</p>`;

  const hud = () => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    api.hud(`<span>Paires <b>${pairs}/6</b></span><span>Essais <b>${moves}</b></span><span>Temps <b>${sec} s</b></span>`);
  };
  const timer = setInterval(hud, 500);
  hud();

  const onClick = async e => {
    const b = e.target.closest('.mem-card');
    if (!b || lock || b.classList.contains('open')) return;
    const card = deck[+b.dataset.i];
    b.classList.add('open'); b.setAttribute('aria-label', `Carte retournée : ${card.name}`);
    sfx.flip();
    if (!first) { first = { b, card }; return; }
    moves++;
    if (first.card.id === card.id) {
      pairs++;
      first.b.classList.add('found'); b.classList.add('found');
      sfx.pop(pairs);
      first = null;
      hud();
      if (pairs === 6) {
        clearInterval(timer);
        const sec = Math.floor((Date.now() - t0) / 1000);
        const score = Math.max(100, 1500 - moves * 40 - sec * 5);
        const stars = moves <= 9 ? 3 : moves <= 13 ? 2 : 1;
        await sleep(600);
        if (alive) api.finish({ score, stars });
      }
    } else {
      lock = true;
      await sleep(850);
      for (const x of [first.b, b]) { x.classList.remove('open'); x.setAttribute('aria-label', `Carte cachée ${+x.dataset.i + 1}`); }
      first = null; lock = false;
      hud();
    }
  };
  area.addEventListener('click', onClick);
  setTimeout(() => area.querySelector('.mem-card')?.focus(), 50);

  return () => { alive = false; clearInterval(timer); area.removeEventListener('click', onClick); };
}

export default {
  id: 'memory',
  name: 'Memory des machines',
  icon: '🃏',
  desc: 'Retrouvez les paires de machines du FabLab en un minimum d\'essais.',
  start,
};
