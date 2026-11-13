// Ligue classée : une partie de la semaine calculée ENTIÈREMENT par le serveur (supabase/ranked.sql).
// Le jeu n'envoie que des actions (clics, achats) ; Co'Coins et production viennent du serveur.
// Ici, on ne fait qu'afficher et prévoir l'évolution entre deux réponses du serveur.
import { DATA, state, addCrystals } from './state.js';
import { $, $$, asset, toast, esc } from './core.js';
import { fmt, fmtDuration } from './format.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { skinImage } from './skins.js';
import { floatText } from './fx.js';
import { rpc, netEnabled, sync } from './community.js';

const me = () => ({ p_id: state.playerId, p_token: state.net.token });
const MAX_CPS = 15; // clics par seconde acceptés par le serveur
const tiers = n => [10, 25, 50, 100, 150, 200].filter(t => n >= t).length;
const unitCps = (b, n) => b.baseCps * Math.pow(2, tiers(n));
const costOf = (b, n, q) => Math.ceil(b.baseCost * Math.pow(1.15, n) * (Math.pow(1.15, q) - 1) / 0.15);

let srv = null, at = 0, pending = 0, sending = false, qty = 1, board = null, last = null, timers = [], clickTimes = [], retried = false;

// Fin de la semaine : lundi 0 h (heure de Paris ≈ heure locale)
function weekLeft() {
  const d = new Date(), next = new Date(d);
  next.setHours(24, 0, 0, 0);
  while (next.getDay() !== 1) next.setDate(next.getDate() + 1);
  return (next - d) / 1000;
}

// Valeurs prévues (serveur + production depuis la réponse + clics pas encore envoyés)
const coinsNow = () => (srv ? srv.coins + srv.cps * (performance.now() - at) / 1000 + pending * srv.click_value : 0);

function setState(s) { if (s?.ok) { srv = s; at = performance.now(); } }

async function call(name, body = {}) {
  const r = await rpc(name, { ...me(), ...body });
  if (r?.error === 'auth' && !retried) { retried = true; await sync(true); return rpc(name, { ...me(), ...body }); }
  return r;
}

async function refresh() {
  try {
    const [s, b] = await Promise.all([call('ranked_state'), rpc('ranked_board', { p_id: state.playerId, p_limit: 10 })]);
    if (s?.error === 'banned') { $('#rk-status').textContent = '⛔ Votre compte a été exclu des fonctions en ligne par l\'équipe de La Co\'Cotte.'; return; }
    if (!s?.ok) throw new Error(s?.error);
    setState(s); board = b;
    renderAll();
  } catch {
    $('#rk-status').textContent = '⚠️ Serveur injoignable : la Ligue classée a besoin d\'Internet.';
  }
}

// Clics envoyés par paquets, une fois par seconde
async function flush() {
  if (sending || !pending || !srv) return;
  sending = true;
  const n = pending; pending = 0;
  try { const r = await call('ranked_click', { p_n: n }); setState(r); } catch { pending += n; } finally { sending = false; }
}

function onClick(e) {
  if (!srv) return;
  const now = performance.now();
  clickTimes = clickTimes.filter(t => now - t < 1000);
  if (clickTimes.length >= MAX_CPS) { $('#rk-status').textContent = `🖐️ ${MAX_CPS} clics par seconde au maximum dans la Ligue.`; return; }
  clickTimes.push(now);
  pending++;
  sfx.click();
  const box = $('#rk-pot'), r = box.getBoundingClientRect();
  floatText(box, e.detail === 0 ? r.width / 2 : e.clientX - r.left, e.detail === 0 ? r.height / 3 : e.clientY - r.top, '+' + fmt(srv.click_value));
}

async function buy(id) {
  const b = DATA.buildings.find(x => x.id === id), n = +(srv?.buildings?.[id] || 0);
  if (!b || coinsNow() < costOf(b, n, qty)) { sfx.deny(); return; }
  await flush();
  const r = await call('ranked_buy', { p_building: id, p_qty: qty }).catch(() => null);
  if (r?.ok) { setState(r); sfx.buy(); renderShop(); }
  else { setState(r?.state); sfx.deny(); if (r?.error === 'coins') toast('Pas assez de Co\'Coins classés.'); }
}

function renderShop() {
  if (!srv) return;
  const coins = coinsNow(), owned = srv.buildings || {};
  // Bâtiments visibles : ceux possédés + les 2 suivants
  const lastOwned = DATA.buildings.reduce((m, b, i) => (owned[b.id] ? i : m), -1);
  $('#rk-shop').innerHTML = DATA.buildings.slice(0, Math.max(2, lastOwned + 3)).map(b => {
    const n = +(owned[b.id] || 0), c = costOf(b, n, qty), can = coins >= c;
    return `<li><button type="button" class="rk-b${can ? ' can' : ''}" data-rk="${b.id}">
      <img src="${asset('building.' + b.id)}" alt=""><span class="rk-bn"><b>${esc(b.name)}</b><small>${n} possédé${n > 1 ? 's' : ''} · +${fmt(unitCps(b, n || 1), 1)}/s chacun</small></span>
      <span class="rk-cost"><img src="${asset('cocoin')}" alt="">${fmt(c)}</span></button></li>`;
  }).join('');
}

function renderBoard() {
  if (!board) return;
  $('#rk-board').innerHTML = board.top.length ? board.top.map(r => `<li class="${r.me ? 'me' : ''}"><span>${r.rank}</span><b>${esc(r.pseudo)}</b><span>${fmt(r.score)}</span></li>`).join('')
    : '<li class="muted">Personne n\'a encore joué cette semaine : lancez-vous !</li>';
  $('#rk-rank').textContent = board.me ? `${board.me.rank}ᵉ / ${board.players}` : '—';
}

function renderLast() {
  const box = $('#rk-last');
  if (!last?.played) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<span>🏅 Semaine dernière : <b>${last.rank === 1 ? '1ᵉʳ' : last.rank + 'ᵉ'}</b> sur ${last.players}</span>`
    + (last.claimed ? '<span class="muted">Récompense récupérée ✔</span>' : `<button type="button" class="big-btn" id="rk-claim">Récupérer ${last.reward} 💎</button>`);
  $('#rk-claim')?.addEventListener('click', async () => {
    const r = await call('ranked_last', { p_claim: true }).catch(() => null);
    if (r?.claimed_now) { addCrystals(r.reward); save(); sfx.unlock(); toast(`🏅 Ligue classée : ${r.rank}ᵉ la semaine dernière, +${r.reward} 💎 !`, 6000); }
    last = await call('ranked_last').catch(() => last); renderLast();
  });
}

function renderAll() { renderTick(); renderShop(); renderBoard(); renderLast(); }

function renderTick() {
  if (!srv) return;
  $('#rk-coins').textContent = fmt(coinsNow());
  $('#rk-cps').textContent = fmt(srv.cps, 1);
  $('#rk-left').textContent = fmtDuration(weekLeft());
  $('#rk-status').textContent = '';
}

export async function openRanked() {
  if (!netEnabled()) { toast('La Ligue classée a besoin d\'Internet.'); return; }
  $('#rk-pot img').src = skinImage(state.skin);
  $('#dlg-ranked').showModal();
  retried = false;
  await refresh();
  last = await call('ranked_last').catch(() => null);
  renderLast();
  timers.forEach(clearInterval);
  timers = [setInterval(flush, 1000), setInterval(renderTick, 200), setInterval(renderShop, 1000), setInterval(refresh, 15000)];
}

function closeRanked() { timers.forEach(clearInterval); timers = []; flush(); renderCard(); }

// Carte sur l'écran principal
export async function renderCard() {
  const el = $('#btn-ranked');
  if (!netEnabled()) { el.hidden = true; return; }
  el.hidden = false;
  try {
    const b = await rpc('ranked_board', { p_id: state.playerId, p_limit: 1 });
    $('#ranked-mini').innerHTML = (b.me ? `Votre rang : <b>${b.me.rank}ᵉ</b> / ${b.players}` : `${b.players} joueur${b.players > 1 ? 's' : ''} cette semaine`)
      + ` · fin dans ${fmtDuration(weekLeft())}`;
  } catch { $('#ranked-mini').textContent = 'Compétition de la semaine, 100 % vérifiée'; }
}

export function initRanked() {
  $('#btn-ranked').addEventListener('click', () => { sfx.ui(); openRanked(); });
  $('#rk-pot').addEventListener('click', onClick);
  $('#rk-shop').addEventListener('click', e => { const b = e.target.closest('[data-rk]'); if (b) buy(b.dataset.rk); });
  $$('[data-rkqty]').forEach(b => b.addEventListener('click', () => {
    qty = +b.dataset.rkqty;
    $$('[data-rkqty]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    renderShop();
  }));
  $('#dlg-ranked').addEventListener('close', closeRanked);
  if (netEnabled()) { setTimeout(renderCard, 4000); setInterval(renderCard, 120000); }
}
