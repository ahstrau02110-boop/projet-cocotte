// Tutoriel de démarrage : met en lumière chaque zone de l'écran, étape par étape
import { state } from './state.js';
import { $, sleep, reducedMotion, emit } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';

const STEPS = [
  { t: null, title: "Bienvenue dans Co'Clicker !", txt: "Faites grandir La Co'Cotte, de l'atelier de bricolage jusqu'à tout le Vermandois. Petit tour en 1 minute ?" },
  { t: '#pot-wrap', title: 'La Cocotte', txt: "Cliquez (ou touchez) la Cocotte pour gagner des Co'Coins. Chaque clic compte !" },
  { t: '.wallet', title: "Vos Co'Coins", txt: 'Ici : votre réserve et ce que vous gagnez chaque seconde.' },
  { t: '#buildings li:first-child', title: 'Les bâtiments', txt: "Achetez des bénévoles, des machines, des ateliers… Ils produisent des Co'Coins tout seuls, même quand vous êtes absent." },
  { t: '#upgrades', title: 'Les améliorations', txt: 'Elles apparaissent au fil du jeu et multiplient la production. Pensez à y jeter un œil !' },
  { t: '.era-card', title: 'Les ères', txt: 'Atelier, FabLab, Tiers-lieu puis Territoire Vermandois : chaque ère débloque de nouveaux bâtiments et un nouveau décor.' },
  { t: '.actions', title: 'Les activités', txt: 'Mini-jeux, Imprimantes mystère, Événements, Boosts, Astuces, Scanner, Mon QR code… Chaque activité s\'explique toute seule la première fois que vous la touchez !' },
  { t: '.missions-card', title: 'Les missions du jour', txt: 'Trois petits défis chaque jour (cliquer, jouer, lire une astuce…). Chaque mission réussie rapporte des cristaux, et un bonus si vous faites les trois !' },
  { t: '#btn-crystals', title: 'Les cristaux 💎', txt: "Ils se gagnent en jouant… et surtout en venant à La Co'Cotte : montrez votre QR code à l'équipe !" },
  { t: null, title: 'Dernière astuce', txt: 'Une Cocotte dorée apparaît parfois à l\'écran : attrapez-la vite pour un gros bonus. Bon jeu !' },
];

let i = 0, root = null;

function place() {
  const s = STEPS[i], hole = root.querySelector('.tuto-hole'), bub = root.querySelector('.tuto-bubble');
  const el = s.t && document.querySelector(s.t);
  if (el) {
    const r = el.getBoundingClientRect(), pad = 8;
    Object.assign(hole.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: Math.min(r.height, innerHeight * .6) + pad * 2 + 'px' });
    const below = r.top + Math.min(r.height, innerHeight * .6) + pad * 2 + 12;
    const bh = bub.offsetHeight, bw = bub.offsetWidth;
    const top = below + bh < innerHeight - 8 ? below : Math.max(8, r.top - pad - bh - 12);
    bub.style.top = top + 'px';
    bub.style.left = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), innerWidth - bw - 8) + 'px';
    root.classList.remove('center');
  } else {
    root.classList.add('center');
    hole.style.display = 'none';
    bub.style.top = Math.max(8, innerHeight / 2 - bub.offsetHeight / 2) + 'px';
    bub.style.left = Math.max(8, innerWidth / 2 - bub.offsetWidth / 2) + 'px';
  }
}

async function show() {
  const s = STEPS[i];
  root.querySelector('.tuto-title').textContent = s.title;
  root.querySelector('.tuto-txt').textContent = s.txt;
  root.querySelector('.tuto-step').textContent = `${i + 1}/${STEPS.length}`;
  root.querySelector('[data-prev]').hidden = i === 0;
  root.querySelector('[data-next]').textContent = i === 0 ? "C'est parti !" : i === STEPS.length - 1 ? 'Jouer !' : 'Suivant';
  const el = s.t && document.querySelector(s.t);
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    await sleep(reducedMotion ? 30 : 380);
  }
  place();
  root.querySelector('[data-next]').focus();
}

function end() {
  state.tuto = true;
  save();
  root?.remove();
  root = null;
  removeEventListener('resize', place);
  removeEventListener('scroll', place, true);
  scrollTo({ top: 0, behavior: 'smooth' });
  emit('tutoEnd');
}

export function startTutorial() {
  if (root) return;
  i = 0;
  root = document.createElement('div');
  root.className = 'tuto';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'tuto-title');
  root.innerHTML = `<div class="tuto-hole"></div>
    <div class="tuto-bubble">
      <span class="tuto-step"></span>
      <h2 id="tuto-title" class="tuto-title"></h2>
      <p class="tuto-txt"></p>
      <div class="tuto-btns">
        <button class="ghost-btn" data-skip>Passer</button>
        <button class="ghost-btn" data-prev>Précédent</button>
        <button class="big-btn" data-next>Suivant</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  root.addEventListener('click', e => {
    if (e.target.closest('[data-skip]')) end();
    else if (e.target.closest('[data-prev]')) { i = Math.max(0, i - 1); sfx.ui(); show(); }
    else if (e.target.closest('[data-next]')) { sfx.ui(); if (++i >= STEPS.length) end(); else show(); }
  });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') end(); });
  addEventListener('resize', place);
  addEventListener('scroll', place, true);
  show();
}

export function initTutorial() {
  $('#btn-tuto').addEventListener('click', () => { $('#dlg-options').close(); startTutorial(); });
  if (!state.tuto) setTimeout(startTutorial, 900);
}
