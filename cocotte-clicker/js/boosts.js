// Station Boosts : « Le saviez-vous ? » sur La Co'Cotte et quiz express, contre un bonus de production temporaire
import { DATA, state, hasTalent } from './state.js';
import { $, toast, emit, esc } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { addBuff } from './golden.js';

const cfg = () => DATA.config.boosts || {};
const cd = () => (hasTalent('boost') ? 10 : cfg().cooldownMin ?? 15) * 60000;
const leftOf = key => Math.max(0, state.boosts[key] + cd() - Date.now());
export const boostReady = () => !leftOf('infoLast') || !leftOf('quizLast');
const fmtLeft = ms => `${Math.ceil(ms / 60000)} min`;
let readTimer = null;

// Élément suivant : d'abord ceux jamais vus, au hasard
function pick(list, seenKey) {
  let pool = list.filter(x => !state.boosts[seenKey].includes(x.id));
  if (!pool.length) pool = list;
  return pool[(Math.random() * pool.length) | 0];
}

function renderInfo() {
  clearInterval(readTimer);
  const box = $('#boost-info');
  const left = leftOf('infoLast');
  if (left) { box.innerHTML = waitHTML('📍', left); return; }
  const it = pick(DATA.infos, 'infoSeen');
  const sec = cfg().infoReadSec ?? 6;
  box.innerHTML = `<article class="tip-card info"><span class="tip-cat">${it.icon} La Co'Cotte</span><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></article>
    <button class="big-btn" id="btn-info" disabled>Lecture… ${sec} s</button>`;
  let s = sec;
  const btn = $('#btn-info');
  readTimer = setInterval(() => {
    if (--s > 0) { btn.textContent = `Lecture… ${s} s`; return; }
    clearInterval(readTimer);
    btn.disabled = false;
    btn.textContent = `J'ai lu : production ×${cfg().infoMult ?? 2} pendant ${(cfg().infoSec ?? 120) / 60} min`;
  }, 1000);
  btn.addEventListener('click', () => {
    if (leftOf('infoLast')) return;
    state.boosts.infoLast = Date.now();
    if (!state.boosts.infoSeen.includes(it.id)) state.boosts.infoSeen.push(it.id);
    state.counters.infos++;
    addBuff({ id: 'info', name: 'Le saviez-vous ?', cps: cfg().infoMult ?? 2, sec: cfg().infoSec ?? 120 });
    done(`📍 Merci ! Production ×${cfg().infoMult ?? 2} pendant ${(cfg().infoSec ?? 120) / 60} min.`);
    renderInfo();
  });
}

function renderQuiz() {
  const box = $('#boost-quiz');
  const left = leftOf('quizLast');
  if (left) { box.innerHTML = waitHTML('❓', left); return; }
  const q = pick(DATA.quiz, 'quizSeen');
  box.innerHTML = `<article class="tip-card quiz"><span class="tip-cat">❓ Quiz express</span><h3>${esc(q.q)}</h3>
    <div class="quiz-choices" role="group" aria-label="Réponses">${q.choices.map((c, i) => `<button class="quiz-btn" data-a="${i}">${esc(c)}</button>`).join('')}</div>
    <p class="quiz-explain" id="quiz-explain" aria-live="polite"></p></article>`;
  box.querySelectorAll('.quiz-btn').forEach(b => b.addEventListener('click', () => {
    if (leftOf('quizLast')) return;
    const ok = +b.dataset.a === q.answer;
    box.querySelectorAll('.quiz-btn').forEach((x, i) => { x.disabled = true; if (i === q.answer) x.classList.add('good'); });
    if (!ok) b.classList.add('bad');
    state.boosts.quizLast = Date.now();
    if (!state.boosts.quizSeen.includes(q.id)) state.boosts.quizSeen.push(q.id);
    let msg;
    if (ok) {
      state.boosts.quizOk++;
      addBuff({ id: 'quiz', name: 'Quiz réussi', cps: cfg().quizMult ?? 3, sec: cfg().quizSec ?? 120 });
      msg = `✅ Bonne réponse ! Production ×${cfg().quizMult ?? 3} pendant ${(cfg().quizSec ?? 120) / 60} min.`;
    } else {
      addBuff({ id: 'quiz', name: 'Quiz', cps: cfg().quizWrongMult ?? 1.5, sec: cfg().quizWrongSec ?? 60 });
      msg = `Pas tout à fait… Production ×${cfg().quizWrongMult ?? 1.5} pendant ${(cfg().quizWrongSec ?? 60) / 60} min pour avoir essayé.`;
    }
    $('#quiz-explain').innerHTML = `<b>${ok ? 'Bravo !' : 'La bonne réponse :'}</b> ${esc(q.explain)}`;
    done(msg);
  }));
}

const waitHTML = (icon, left) => `<div class="tip-wait"><span aria-hidden="true">${icon}</span><p>Disponible à nouveau dans <strong>${fmtLeft(left)}</strong>.</p></div>`;

function done(msg) {
  save();
  sfx.unlock();
  toast(msg, 5000);
  emit('refresh');
}

export function renderBoostTile() {
  const ready = boostReady();
  $('#btn-boost').classList.toggle('ready', ready);
  $('#boost-mini').textContent = ready ? 'Boost disponible !' : `Dans ${fmtLeft(Math.min(leftOf('infoLast'), leftOf('quizLast')))}`;
}

export function openBoosts() {
  renderInfo();
  renderQuiz();
  $('#dlg-boost').showModal();
}

export function initBoosts() {
  $('#btn-boost').addEventListener('click', () => { sfx.ui(); openBoosts(); });
  $('#dlg-boost').addEventListener('close', () => clearInterval(readTimer));
  renderBoostTile();
}
