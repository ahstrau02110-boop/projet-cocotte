// Missions du jour (3 petits objectifs quotidiens) et missions de la semaine (3 gros objectifs, chaque lundi)
import { DATA, state, addCrystals, skinDupes, bgDupes } from './state.js';
import { $, $$, toast, emit, esc, today } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { addMats, randomMats, matsText } from './materials.js';

// Compteurs suivis (différence entre maintenant et le début de la période)
function counters() {
  const c = state.counters;
  const out = {
    clicks: state.totalClicks, plays: state.mini.plays, stars: state.mini.stars, golden: state.golden,
    quizOk: state.boosts.quizOk, pulls: state.gacha.pulls + state.gacha.bgPulls, bgPulls: state.gacha.bgPulls,
    bought: c.bought, upgBought: c.upgBought, tips: c.tips, infos: c.infos, missions: c.missions,
    matsGot: c.matsGot, batGot: c.batGot, crafted: c.crafted, orders: c.orders, equips: c.equips, records: c.records,
    perfect: state.mini.perfect, dupes: skinDupes() + bgDupes(), rep: state.orders.rep,
  };
  for (const [g, n] of Object.entries(state.mini.by)) out['play_' + g] = n;
  return out;
}

// Semaine ISO « AAAA-Snn » (lundi → dimanche)
function weekId() {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const y = d.getFullYear(), w1 = new Date(y, 0, 4);
  return `${y}-S${String(1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
}

const plural = (txt, n) => txt.replace(/\(s\)/g, n > 1 ? 's' : '').replace(/\(x\)/g, n > 1 ? 'x' : '').replace('{n}', n.toLocaleString('fr-FR'));

// Les deux types de missions partagent la même logique
const SETS = {
  day: { pool: () => DATA.missions.missions || [], st: () => state.missions, set: v => { state.missions = v; }, key: () => today(), keyName: 'day',
    bonus: () => DATA.config.missions?.allBonus ?? DATA.missions.allBonus, mats: () => DATA.config.materials?.mission ?? 2, label: 'du jour', next: 'demain' },
  week: { pool: () => DATA.missions.weekly || [], st: () => state.weekly, set: v => { state.weekly = v; }, key: weekId, keyName: 'week',
    bonus: () => DATA.config.weekly?.allBonus ?? 100, mats: () => DATA.config.materials?.weeklyMission ?? 6, label: 'de la semaine', next: 'lundi' },
};
let tab = 'day';

function roll(S) {
  const snap = counters();
  const pool = [...S.pool()].sort(() => Math.random() - 0.5).slice(0, 3);
  S.set({ [S.keyName]: S.key(), list: pool.map((m, lvl) => ({ id: m.id, lvl, n: m.n[lvl], reward: m.reward[lvl], start: snap[m.stat] ?? 0, claimed: false })), bonus: false });
  save();
}

const def = (S, id) => S.pool().find(m => m.id === id);
const progress = (S, m) => Math.min(m.n, Math.max(0, (counters()[def(S, m.id)?.stat] ?? 0) - m.start));

let sig = '';
const notified = new Set();

function ensure(S) {
  const st = S.st();
  if (!S.pool().length) return false;
  if (st[S.keyName] !== S.key() || !st.list.length || !st.list.every(m => def(S, m.id))) roll(S);
  return true;
}

export function renderMissions() {
  if (!ensure(SETS.day)) return;
  ensure(SETS.week);
  // Notifications pour les deux types
  for (const k of ['day', 'week']) {
    const S = SETS[k], st = S.st();
    st.list.forEach(m => {
      const key = k + st[S.keyName] + m.id;
      if (progress(S, m) >= m.n && !m.claimed && !notified.has(key)) {
        notified.add(key);
        if (state.tuto) toast(`🎯 Mission ${S.label} accomplie : récupérez vos ${m.reward} 💎 !`, 4000);
      }
    });
  }
  const S = SETS[tab], st = S.st();
  const prog = st.list.map(m => progress(S, m));
  const s = tab + st[S.keyName] + prog.join() + st.list.map(m => +m.claimed).join() + +st.bonus
    + SETS.week.st().list.map(m => +(progress(SETS.week, m) >= m.n && !m.claimed)).join() + SETS.day.st().list.map(m => +(progress(SETS.day, m) >= m.n && !m.claimed)).join();
  if (s === sig) return;
  sig = s;
  const done = st.list.filter((m, i) => prog[i] >= m.n).length;
  const allClaimed = st.list.every(m => m.claimed);
  $('#missions-count').textContent = `${st.list.filter(m => m.claimed).length}/3`;
  // Pastille sur l'onglet de l'autre type quand une récompense attend
  for (const k of ['day', 'week']) {
    const T = SETS[k];
    $(`[data-mtab="${k}"]`).classList.toggle('ready', T.st().list.some(m => !m.claimed && progress(T, m) >= m.n) || (T.st().list.every(m => m.claimed) && !T.st().bonus));
  }
  $('#missions-list').innerHTML = st.list.map((m, i) => {
    const d = def(S, m.id), ok = prog[i] >= m.n;
    return `<li class="mission${m.claimed ? ' claimed' : ok ? ' ready' : ''}">
      <span class="mi-ico" aria-hidden="true">${d.icon}</span>
      <span class="mi-txt"><b>${esc(plural(d.text, m.n))}</b>
        <span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m.n}" aria-valuenow="${prog[i]}"><span style="width:${prog[i] / m.n * 100}%"></span></span>
        <small>${prog[i].toLocaleString('fr-FR')}/${m.n.toLocaleString('fr-FR')}</small></span>
      ${m.claimed ? '<span class="mi-done">✔</span>'
        : `<button type="button" class="mi-btn" data-mission="${i}" ${ok ? '' : 'disabled'}>${ok ? 'Récupérer' : ''} ${m.reward} 💎</button>`}
    </li>`;
  }).join('') + `<li class="mission bonus${st.bonus ? ' claimed' : allClaimed ? ' ready' : ''}">
      <span class="mi-ico" aria-hidden="true">🏆</span>
      <span class="mi-txt"><b>Bonus : les 3 missions ${S.label}</b><small>${done}/3 accomplies</small></span>
      ${st.bonus ? '<span class="mi-done">✔</span>' : `<button type="button" class="mi-btn" data-mission="bonus" ${allClaimed ? '' : 'disabled'}>${S.bonus()} 💎</button>`}
    </li>`;
}

function claim(key) {
  const S = SETS[tab], st = S.st();
  if (key === 'bonus') {
    if (st.bonus || !st.list.every(m => m.claimed)) return;
    st.bonus = true;
    addCrystals(S.bonus());
    toast(`🏆 Toutes les missions ${S.label} : +${S.bonus()} 💎 ! Nouvelles missions ${S.next}.`, 5000);
  } else {
    const m = st.list[+key];
    if (!m || m.claimed || progress(S, m) < m.n) return;
    m.claimed = true;
    if (tab === 'day') state.counters.missions++; else state.counters.weekly++;
    addCrystals(m.reward);
    const got = randomMats(S.mats());
    addMats(got);
    toast(`🎯 +${m.reward} 💎 · ${matsText(got)}`, 3500);
  }
  sfx.unlock();
  save();
  sig = '';
  emit('refresh');
}

function setTab(t) {
  tab = t;
  $$('[data-mtab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mtab === t)));
  sig = '';
  renderMissions();
}

export function initMissions() {
  $('#missions-list').addEventListener('click', e => {
    const b = e.target.closest('[data-mission]');
    if (b) claim(b.dataset.mission);
  });
  $$('[data-mtab]').forEach(b => b.addEventListener('click', () => { sfx.ui(); setTab(b.dataset.mtab); }));
  renderMissions();
}
