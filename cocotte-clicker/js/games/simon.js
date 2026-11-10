// Séquence des machines : retenir et rejouer une suite de machines (sons + couleurs)
import { asset, sleep, reducedMotion } from '../core.js';
import { sfx } from '../audio.js';

const PADS = [
  { id: 'pc', name: 'Poste informatique', color: '#5ac8fa', note: 0 },
  { id: 'imprimante3d', name: 'Imprimante 3D', color: '#90C060', note: 2 },
  { id: 'graveuse', name: 'Graveuse laser', color: '#E41E6C', note: 4 },
  { id: 'brodeuse', name: 'Brodeuse numérique', color: '#FCD260', note: 5 },
];
const GOALS = [5, 8, 11]; // longueur de séquence réussie pour 1, 2, 3 étoiles

function start(area, api) {
  let seq = [], pos = 0, listening = false, alive = true, best = 0;
  area.innerHTML = `<div class="simon" role="group" aria-label="Machines">${PADS.map((p, i) => `
      <button class="pad" data-i="${i}" style="--pc:${p.color}" aria-label="${p.name} (touche ${i + 1})">
        <img src="${asset('building.' + p.id)}" alt=""><span class="pad-k" aria-hidden="true">${i + 1}</span>
      </button>`).join('')}</div>
    <p class="play-tip" id="simon-tip">Regardez la séquence, puis rejouez-la dans le même ordre. Clavier : touches 1 à 4.</p>`;
  const pads = [...area.querySelectorAll('.pad')];
  const tip = area.querySelector('#simon-tip');

  const hud = () => {
    const stars = GOALS.filter(g => best >= g).length;
    api.hud(`<span>Séquence <b>${seq.length}</b></span><span>Record <b>${best}</b></span><span class="hud-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`);
  };

  async function flash(i, ms) {
    pads[i].classList.add('lit');
    sfx.pop(PADS[i].note);
    await sleep(ms);
    pads[i].classList.remove('lit');
  }

  async function playSeq() {
    listening = false;
    pads.forEach(p => (p.disabled = true));
    tip.textContent = 'Regardez bien…';
    await sleep(600);
    const speed = Math.max(260, 620 - seq.length * 30);
    for (const i of seq) {
      if (!alive) return;
      await flash(i, reducedMotion ? 450 : speed);
      await sleep(140);
    }
    pos = 0; listening = true;
    pads.forEach(p => (p.disabled = false));
    tip.textContent = 'À vous ! Rejouez la séquence.';
    pads[0].focus();
  }

  function next() {
    seq.push((Math.random() * 4) | 0);
    hud();
    playSeq();
  }

  async function press(i) {
    if (!listening || !alive) return;
    flash(i, 220);
    if (i !== seq[pos]) {
      listening = false;
      sfx.deny();
      area.querySelector('.simon').classList.add('fail');
      tip.textContent = `Raté ! Séquence de ${best} réussie.`;
      await sleep(900);
      if (alive) api.finish({ score: best * 100, stars: GOALS.filter(g => best >= g).length });
      return;
    }
    pos++;
    if (pos === seq.length) {
      best = seq.length;
      listening = false;
      tip.textContent = 'Bravo !';
      hud();
      await sleep(500);
      if (alive) next();
    }
  }

  const onClick = e => { const b = e.target.closest('.pad'); if (b) press(+b.dataset.i); };
  const onKey = e => { const i = ['1', '2', '3', '4'].indexOf(e.key); if (i >= 0) { e.preventDefault(); press(i); } };
  area.addEventListener('click', onClick);
  addEventListener('keydown', onKey);
  next();
  return () => { alive = false; area.removeEventListener('click', onClick); removeEventListener('keydown', onKey); };
}

export default {
  id: 'simon',
  name: 'Séquence des machines',
  icon: '🎹',
  desc: 'Mémorisez la suite de machines qui s\'allument et rejouez-la. Jusqu\'où irez-vous ?',
  start,
};
