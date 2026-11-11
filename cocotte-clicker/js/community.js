// Mode communautaire (Supabase) : compteur collectif, objectifs communs, classement par pseudo
// Le jeu reste 100 % jouable en solo si le serveur n'est pas configuré ou inaccessible.
import { DATA, state, totalCps, buffMult } from './state.js';
import { $, emit, esc, toast } from './core.js';
import { fmt } from './format.js';
import { save } from './save.js';
import { b64u } from './qr.js';

const C = () => DATA.config.community || {};
export const netEnabled = () => !!(C().url && C().anonKey);
let online = null, board = [], myRank = null, busy = false;

async function rpc(name, body = {}) {
  const r = await fetch(`${C().url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    // Nouvelles clés Supabase (sb_publishable_…) : en-tête apikey seul ; anciennes clés « anon » (JWT) : aussi en Bearer
    headers: { apikey: C().anonKey, 'Content-Type': 'application/json',
      ...(C().anonKey.startsWith('eyJ') ? { Authorization: `Bearer ${C().anonKey}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
  });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

// Bonus de production débloqué par les objectifs collectifs atteints (valeur mise en cache pour le hors-ligne)
export const communityBonus = () => (C().goals || []).filter(g => state.net.total >= g.at).reduce((a, g) => a + g.pct, 0);

export async function sync(full = false) {
  if (!netEnabled() || busy) return;
  busy = true;
  try {
    const before = communityBonus();
    await rpc('submit_score', {
      p_id: state.playerId, p_token: state.net.token, p_pseudo: state.pseudo, p_listed: state.net.listed,
      p_lifetime: state.prestige.lifetime, p_cps: totalCps() / buffMult('cps'),
      p_seasons: state.prestige.seasons, p_achievements: Object.keys(state.achievements).length,
    }).catch(() => null); // limite de fréquence : sans gravité
    const st = await rpc('community_stats');
    state.net.total = +st.total || 0;
    state.net.players = +st.players || 0;
    state.net.lastSync = Date.now();
    if (full) {
      board = await rpc('leaderboard', { p_limit: 20 });
      myRank = (await rpc('my_rank', { p_id: state.playerId }))?.rank ?? null;
    }
    online = true;
    if (communityBonus() > before) toast(`🌍 Objectif collectif atteint ! Production +${communityBonus() - before} % pour tout le monde.`, 6000);
    save();
    emit('refresh');
  } catch {
    online = false;
  } finally {
    busy = false;
  }
}

// Carte « Communauté » sous la carte des ères
export function renderCommunityCard() {
  const el = $('#btn-community');
  if (!netEnabled()) { el.hidden = true; return; }
  el.hidden = false;
  const next = (C().goals || []).find(g => state.net.total < g.at);
  $('#community-mini').innerHTML = `<b>${fmt(state.net.total)}</b> Co'Coins produits ensemble`
    + (communityBonus() ? ` · bonus <b>+${communityBonus()} %</b>` : '')
    + (next ? `<br><small>Prochain objectif : ${esc(next.name)} (${fmt(next.at)})</small>` : '');
}

function renderDialog() {
  const box = $('#community-body');
  if (!netEnabled()) {
    box.innerHTML = `<p class="tip-wait">🌍 Le mode communautaire n'est pas encore activé sur ce jeu. Vous pouvez jouer normalement en solo !</p>`;
    return;
  }
  const goals = C().goals || [];
  box.innerHTML = `
    ${online === false ? '<p class="err">Serveur injoignable : affichage des dernières valeurs connues.</p>' : ''}
    <div class="com-total"><span>🌍</span><div><b>${fmt(state.net.total)}</b> Co'Coins produits par <b>${fmt(state.net.players)}</b> joueur${state.net.players > 1 ? 's' : ''}</div></div>
    <h3>Objectifs collectifs</h3>
    <ul class="com-goals">${goals.map(g => {
      const ok = state.net.total >= g.at, pct = Math.min(100, state.net.total / g.at * 100);
      return `<li class="${ok ? 'ok' : ''}"><span>${ok ? '✅' : '🎯'} <b>${esc(g.name)}</b> : ${fmt(g.at)} · production +${g.pct} % pour tous</span>
        <span class="bar" role="progressbar" aria-valuenow="${Math.floor(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></span></li>`;
    }).join('')}</ul>
    <h3>Classement ${myRank ? `<small>· vous êtes ${myRank}<sup>e</sup></small>` : ''}</h3>
    <ol class="com-board">${board.length ? board.map(r => `<li${r.pseudo === state.pseudo && state.pseudo ? ' class="me"' : ''}><span>${r.rank}</span><b>${esc(r.pseudo)}</b><span>${fmt(r.lifetime)}</span></li>`).join('') : '<li class="muted">Classement indisponible pour le moment.</li>'}</ol>
    <label class="switch"><input type="checkbox" id="com-listed" ${state.net.listed ? 'checked' : ''}> <span>Apparaître dans le classement</span></label>
    <label for="com-pseudo">Pseudo affiché (facultatif, sans nom de famille)</label>
    <input id="com-pseudo" maxlength="20" value="${esc(state.pseudo)}" placeholder="Anonyme" autocomplete="off">`;
  $('#com-listed').addEventListener('change', e => { state.net.listed = e.target.checked; save(); sync(true).then(renderDialog); });
  $('#com-pseudo').addEventListener('change', e => {
    state.pseudo = e.target.value.replace(/[^\p{L}\p{N} _'-]/gu, '').trim().slice(0, 20);
    save(); sync(true).then(renderDialog);
  });
}

export async function openCommunity() {
  renderDialog();
  $('#dlg-community').showModal();
  if (netEnabled()) { await sync(true); renderDialog(); }
}

export function initCommunity() {
  if (!state.net.token) { state.net.token = b64u(crypto.getRandomValues(new Uint8Array(24))); save(); }
  $('#btn-community').addEventListener('click', openCommunity);
  if (!netEnabled()) return;
  setTimeout(() => sync(), 3000);
  setInterval(() => !document.hidden && sync(), (C().syncSec ?? 120) * 1000);
  document.addEventListener('visibilitychange', () => document.hidden && sync());
}
