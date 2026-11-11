// Missions du jour : 3 petits objectifs quotidiens qui rapportent des cristaux
import { DATA, state, addCrystals } from './state.js';
import { $, toast, emit, esc, today } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';

// Compteurs suivis (différence entre maintenant et le début de la journée)
function counters() {
  const c = state.counters;
  return {
    clicks: state.totalClicks, plays: state.mini.plays, stars: state.mini.stars, golden: state.golden,
    quizOk: state.boosts.quizOk, pulls: state.gacha.pulls + state.gacha.bgPulls,
    bought: c.bought, upgBought: c.upgBought, tips: c.tips, infos: c.infos,
  };
}

const plural = (txt, n) => txt.replace(/\(s\)/g, n > 1 ? 's' : '').replace(/\(x\)/g, n > 1 ? 'x' : '').replace('{n}', n);

// Tirage des missions du jour : une facile, une moyenne, une difficile, toutes différentes
function roll() {
  const pool = [...DATA.missions.missions].sort(() => Math.random() - 0.5).slice(0, 3);
  const snap = counters();
  state.missions = {
    day: today(),
    list: pool.map((m, lvl) => ({ id: m.id, lvl, n: m.n[lvl], reward: m.reward[lvl], start: snap[m.stat] ?? 0, claimed: false })),
    bonus: false,
  };
  save();
}

const def = id => DATA.missions.missions.find(m => m.id === id);
const progress = m => Math.min(m.n, Math.max(0, (counters()[def(m.id)?.stat] ?? 0) - m.start));

let sig = '', notified = new Set();

export function renderMissions() {
  if (!DATA.missions?.missions?.length) return;
  if (state.missions.day !== today() || !state.missions.list.every(m => def(m.id))) roll();
  const ms = state.missions;
  const prog = ms.list.map(progress);
  const s = ms.day + prog.join() + ms.list.map(m => +m.claimed).join() + +ms.bonus;
  if (s === sig) return;
  sig = s;
  const done = ms.list.filter((m, i) => prog[i] >= m.n).length;
  ms.list.forEach((m, i) => {
    if (prog[i] >= m.n && !m.claimed && !notified.has(ms.day + m.id)) {
      notified.add(ms.day + m.id);
      if (state.tuto) toast(`🎯 Mission accomplie : récupérez vos ${m.reward} 💎 !`, 4000);
    }
  });
  const allClaimed = ms.list.every(m => m.claimed);
  $('#missions-count').textContent = `${ms.list.filter(m => m.claimed).length}/3`;
  $('#missions-list').innerHTML = ms.list.map((m, i) => {
    const d = def(m.id), ok = prog[i] >= m.n;
    return `<li class="mission${m.claimed ? ' claimed' : ok ? ' ready' : ''}">
      <span class="mi-ico" aria-hidden="true">${d.icon}</span>
      <span class="mi-txt"><b>${esc(plural(d.text, m.n))}</b>
        <span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m.n}" aria-valuenow="${prog[i]}"><span style="width:${prog[i] / m.n * 100}%"></span></span>
        <small>${prog[i]}/${m.n}</small></span>
      ${m.claimed ? '<span class="mi-done">✔</span>'
        : `<button type="button" class="mi-btn" data-mission="${i}" ${ok ? '' : 'disabled'}>${ok ? 'Récupérer' : ''} ${m.reward} 💎</button>`}
    </li>`;
  }).join('') + `<li class="mission bonus${ms.bonus ? ' claimed' : allClaimed ? ' ready' : ''}">
      <span class="mi-ico" aria-hidden="true">🏆</span>
      <span class="mi-txt"><b>Bonus : les 3 missions du jour</b><small>${done}/3 accomplies</small></span>
      ${ms.bonus ? '<span class="mi-done">✔</span>' : `<button type="button" class="mi-btn" data-mission="bonus" ${allClaimed ? '' : 'disabled'}>${(DATA.config.missions?.allBonus ?? DATA.missions.allBonus)} 💎</button>`}
    </li>`;
}

function claim(key) {
  const ms = state.missions;
  if (key === 'bonus') {
    if (ms.bonus || !ms.list.every(m => m.claimed)) return;
    ms.bonus = true;
    addCrystals((DATA.config.missions?.allBonus ?? DATA.missions.allBonus));
    toast(`🏆 Toutes les missions du jour : +${(DATA.config.missions?.allBonus ?? DATA.missions.allBonus)} 💎 ! Nouvelles missions demain.`, 5000);
  } else {
    const m = ms.list[+key];
    if (!m || m.claimed || progress(m) < m.n) return;
    m.claimed = true;
    state.counters.missions++;
    addCrystals(m.reward);
    toast(`🎯 +${m.reward} 💎`, 3000);
  }
  sfx.unlock();
  save();
  sig = '';
  emit('refresh');
}

export function initMissions() {
  $('#missions-list').addEventListener('click', e => {
    const b = e.target.closest('[data-mission]');
    if (b) claim(b.dataset.mission);
  });
  renderMissions();
}
