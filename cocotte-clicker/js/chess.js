// Onglet Échecs : contre la Cocotte (IA), à deux sur le même appareil, ou en duel en ligne par QR code.
// Duel en ligne : le serveur (supabase/chess.sql) garde les coups et l'ordre de jeu ; chaque jeu vérifie
// la légalité de chaque coup reçu avec le moteur (js/chess-engine.js).
import { DATA, state } from './state.js';
import { $, $$, toast, esc, on } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { rpc, netEnabled, sync } from './community.js';
import { baseUrl, qrSVG } from './qr.js';
import { startScanner } from './scanner.js';
import * as E from './chess-engine.js';
import { LESSONS, PUZZLES } from './chess-lessons.js';

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VS = '︎'; // force l'affichage « texte » (pas d'émoji) des pièces
const LEVELS = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };
const REASONS = { mate: 'Échec et mat', stalemate: 'Pat', 50: 'Règle des 50 coups', material: 'Matériel insuffisant', repetition: 'Triple répétition',
  resign: 'Abandon', agreement: 'Nulle acceptée', illegal: 'Coup illégal reçu', timeout: 'Adversaire absent depuis 3 jours' };
const me = () => ({ p_id: state.playerId, p_token: state.net.token });
// Rangs du ladder selon l'Elo
const TIERS = [[1600, '💎', 'Diamant'], [1450, '💠', 'Platine'], [1300, '🥇', 'Or'], [1150, '🥈', 'Argent'], [1000, '🥉', 'Bronze'], [0, '🪵', 'Bois']];
export const tier = elo => TIERS.find(([min]) => elo >= min);
const tierTxt = elo => { const [, i, n] = tier(elo); return `${i} ${n}`; };
const titleOf = id => (id && DATA.titles.find(t => t.id === id)?.label) || '';
const duelUrl = code => baseUrl(DATA.config) + '#duel=' + code;

let G = null, pollT = 0, stopScan = null, retried = false, mineT = 0;

async function call(name, body = {}) {
  if (!state.net.token) await sync(true);
  const r = await rpc(name, { ...me(), ...body });
  if (r?.error === 'auth' && !retried) { retried = true; await sync(true); return rpc(name, { ...me(), ...body }); }
  return r;
}

// ---------- Partie ----------
function newGame(mode, opts = {}) {
  G = { mode, level: opts.level || 2, me: opts.me || null, s: E.fromFEN(), moves: [], sans: [], sel: null, over: null, flip: opts.me === 'b',
    code: opts.code || null, white: opts.white || '', black: opts.black || '', drawOffer: null, thinking: false };
}
function replay(list) {
  for (const u of list) {
    const m = E.fromUci(G.s, u);
    if (!m) return u; // coup illégal
    G.sans.push(E.san(G.s, m)); G.s = E.make(G.s, m); G.moves.push(u);
  }
  return null;
}
const myTurn = () => !G.over && !G.thinking && (G.mode === 'local' || (G.mode === 'learn' ? !G.solved && G.s.turn === G.me : G.s.turn === G.me));

function persist() {
  if (G.mode === 'online') return;
  state.chess.cur = G.over ? null : { mode: G.mode, level: G.level, me: G.me, moves: [...G.moves] };
  save();
}

// ---------- Tuto et entraînement ----------
function startLearn(kind, i) {
  const list = kind === 'lesson' ? LESSONS : PUZZLES, item = list[i];
  if (!item) return show('home');
  newGame('learn');
  G.kind = kind; G.idx = i; G.s = E.fromFEN(item.fen); G.me = G.s.turn; G.flip = G.me === 'b'; G.solved = false;
  G.feedback = '';
  show('game');
}
const goalOk = (s, m, goal) => {
  const n = E.make(s, m, false);
  return goal === 'any' ? true : goal === 'check' ? E.inCheck(n) : goal === 'mate' ? E.outcome(n)?.reason === 'mate'
    : goal === 'castle' ? !!m.castle : goal === 'promo' ? !!m.promo : goal === 'ep' ? !!m.ep : [].concat(goal).includes(E.uci(m));
};
function learnMove(m) {
  const item = (G.kind === 'lesson' ? LESSONS : PUZZLES)[G.idx], goal = G.kind === 'lesson' ? item.goal : 'mate';
  const before = G.s;
  G.sans.push(E.san(G.s, m)); G.s = E.make(G.s, m); G.moves.push(E.uci(m)); G.sel = null; G.hint = null;
  if (goalOk(before, m, goal)) {
    G.solved = true; sfx.unlock();
    const L = state.chess.learn;
    if (G.kind === 'lesson') { if (!L.lessons.includes(item.id)) L.lessons.push(item.id); }
    else if (!L.puzzles.includes(G.idx)) L.puzzles.push(G.idx);
    if (L.lessons.length >= LESSONS.length) state.flags.echecsTuto = 1;
    save();
    G.feedback = `<b class="ok">✅ Bravo !</b> ${G.kind === 'puzzle' ? 'Échec et mat !' : ''}`;
  } else {
    sfx.deny();
    G.feedback = `<b class="ko">❌ Pas tout à fait.</b> ${item.hint}`;
    setTimeout(() => { if (G?.mode === 'learn' && !G.solved) { G.s = before; G.moves.pop(); G.sans.pop(); render(); } }, 1100);
  }
  render();
}
function renderLesson() {
  const box = $('#ch-lesson');
  box.hidden = G.mode !== 'learn';
  if (G.mode !== 'learn') return;
  const lesson = G.kind === 'lesson', list = lesson ? LESSONS : PUZZLES, item = list[G.idx];
  const side = G.me === 'w' ? 'Les Blancs' : 'Les Noirs';
  box.innerHTML = `<h3>${lesson ? `${item.icon} Leçon ${G.idx + 1}/${LESSONS.length} : ${item.title}` : `🎯 Problème ${G.idx + 1}/${PUZZLES.length}`}</h3>
    <p>${lesson ? item.text : `${side} jouent et font <b>échec et mat en 1 coup</b>.`}</p>
    <p class="ch-feedback" role="status">${G.feedback || ''}</p>
    <div class="ch-lesson-btns">
      ${G.solved ? '' : '<button type="button" data-l="hint">💡 Indice</button>'}
      <button type="button" data-l="retry">↺ Recommencer</button>
      ${G.idx + 1 < list.length ? `<button type="button" class="primary" data-l="next">${G.solved ? 'Suivant ➜' : 'Passer ➜'}</button>` : `<button type="button" class="primary" data-l="home">🏁 Terminer</button>`}
    </div>`;
}

function play(m, fromOpponent = false) {
  if (!G || !m) return;
  if (G.mode === 'learn') return learnMove(m);
  if (G.over) return;
  const u = E.uci(m);
  G.sans.push(E.san(G.s, m));
  G.s = E.make(G.s, m); G.moves.push(u); G.sel = null; G.hint = null;
  m.cap ? sfx.pop() : sfx.click();
  const o = E.outcome(G.s);
  if (o) finish(o.result, o.reason);
  render();
  persist();
  if (G.mode === 'online' && !fromOpponent) sendMove(u);
  if (G.mode === 'ai' && !G.over && G.s.turn !== G.me) aiTurn();
}

function aiTurn() {
  G.thinking = true; render();
  const g = G;
  setTimeout(() => {
    if (G !== g || G.mode !== 'ai') return; // partie quittée ou remplacée entre-temps
    if (G.over || G.s.turn === G.me) { G.thinking = false; return render(); }
    const m = E.bestMove(G.s, G.level);
    G.thinking = false;
    if (m) play(m); else render();
  }, 350);
}

function finish(result, reason, fromServer = false) {
  if (G.over) return;
  G.over = { result, reason };
  if (G.mode === 'ai') {
    const st = state.chess.ai[G.level] || (state.chess.ai[G.level] = { w: 0, l: 0, d: 0 });
    if (result === 'd') st.d++; else if (result === G.me) st.w++; else st.l++;
    if (result === G.me) { sfx.unlock(); state.flags.echecs = 1; }
  }
  if (G.mode === 'online' && !fromServer) {
    if (['mate', 'stalemate', '50', 'material', 'repetition'].includes(reason)) {
      // Si c'est mon coup qui termine la partie : d'abord enregistrer le coup (sendMove), ensuite la fin
      const end = { p_code: G.code, p_action: 'over', p_result: result, p_reason: reason };
      if (G.s.turn !== G.me) G.pendingEnd = end; else call('chess_end', end).catch(() => {});
    }
    if (reason === 'illegal') call('chess_end', { p_code: G.code, p_action: 'illegal' }).catch(() => {});
  }
  if (G.mode === 'online') result === G.me ? sfx.unlock() : result !== 'd' && sfx.deny();
  persist();
}

// ---------- Dessin ----------
const glyph = p => `<span class="pc ${E.colorOf(p) === 'w' ? 'pw' : 'pb'}">${GLYPH[p.toLowerCase()]}${VS}</span>`;
function captured(color) {
  // Pièces de « color » prises par l'adversaire
  const full = { p: 8, n: 2, b: 2, r: 2, q: 1 }, have = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const p of G.s.b) if (p && E.colorOf(p) === color && have[p.toLowerCase()] !== undefined) have[p.toLowerCase()]++;
  return ['q', 'r', 'b', 'n', 'p'].map(t => Array(Math.max(0, full[t] - have[t])).fill(color === 'w' ? t.toUpperCase() : t).map(glyph).join('')).join('');
}
function playerBar(color) {
  const name = G.mode === 'learn' ? (color === G.me ? 'Vous' : 'Adversaire') : G.mode === 'ai' ? (color === G.me ? 'Vous' : `🍲 La Cocotte (${LEVELS[G.level]})`)
    : G.mode === 'local' ? (color === 'w' ? 'Blancs' : 'Noirs')
    : (color === G.me ? 'Vous' : esc((color === 'w' ? G.white : G.black) || 'En attente…'))
      + ((color === 'w' ? G.eloW : G.eloB) ? ` <small class="ch-elo">${tier(color === 'w' ? G.eloW : G.eloB)[1]} ${color === 'w' ? G.eloW : G.eloB}</small>` : '');
  const turn = !G.over && G.s.turn === color;
  return `<span class="ch-dot ${color}"></span><b>${name}</b>${turn ? '<i class="ch-turn">au trait</i>' : ''}<span class="ch-caps">${G.mode === 'learn' ? '' : captured(color === 'w' ? 'b' : 'w')}</span>`;
}
function render() {
  if (!G) return;
  const flip = G.flip, last = G.moves.length ? [E.sqIdx(G.moves.at(-1).slice(0, 2)), E.sqIdx(G.moves.at(-1).slice(2, 4))] : [];
  const targets = G.sel !== null ? E.legal(G.s).filter(m => m.from === G.sel) : [];
  const check = E.inCheck(G.s) ? E.kingSq(G.s.b, G.s.turn) : -1;
  let html = '';
  for (let k = 0; k < 64; k++) {
    const sq = flip ? 63 - k : k, p = G.s.b[sq], r = sq >> 3, f = sq & 7;
    const t = targets.find(m => m.to === sq);
    const cls = ['ch-sq', (r + f) % 2 ? 'dk' : 'lt', sq === G.sel && 'sel', G.hint?.includes(sq) && 'hint', last.includes(sq) && 'last', sq === check && 'chk', t && (t.cap ? 'cap' : 'tgt')].filter(Boolean).join(' ');
    const coordF = (flip ? r === 0 : r === 7) ? `<small class="cf">${'abcdefgh'[f]}</small>` : '';
    const coordR = (flip ? f === 7 : f === 0) ? `<small class="cr">${8 - r}</small>` : '';
    html += `<button type="button" class="${cls}" data-sq="${sq}" aria-label="${E.sqName(sq)}${p ? ' ' + p : ''}">${p ? glyph(p) : ''}${coordF}${coordR}</button>`;
  }
  $('#ch-board').innerHTML = html;
  const bottom = flip ? 'b' : 'w';
  $('#ch-bottom').innerHTML = playerBar(bottom);
  $('#ch-top').innerHTML = playerBar(bottom === 'w' ? 'b' : 'w');
  // Statut
  let st;
  if (G.mode === 'learn') st = G.solved ? '✅ Réussi !' : `${G.s.turn === 'w' ? 'Aux Blancs' : 'Aux Noirs'} de jouer${E.inCheck(G.s) ? ' · ⚠️ Échec !' : ''}`;
  else if (G.over) {
    const win = G.over.result === 'd' ? 'Partie nulle' : (G.over.result === 'w' ? 'Les Blancs gagnent' : 'Les Noirs gagnent');
    const you = G.mode !== 'local' && G.over.result !== 'd' ? (G.over.result === G.me ? ' : vous avez gagné ! 🎉' : ' : vous avez perdu.') : '';
    st = `🏁 ${REASONS[G.over.reason] || 'Fin'} · ${win}${you}`;
    if (G.mode === 'online' && G.over) st += G.rated && G.delta != null ? `<br>🏆 Ladder : ${G.delta >= 0 ? '+' : ''}${G.delta} Elo` : G.rated === false ? '<br><small>Partie non classée (trop courte ou limite de 3 parties par jour contre ce joueur).</small>' : '';
  } else if (G.thinking) st = '🍲 La Cocotte réfléchit…';
  else if (G.mode === 'online' && G.s.turn !== G.me) st = `⏳ Au tour de ${esc((G.me === 'w' ? G.black : G.white) || 'votre adversaire')}…`;
  else st = `${G.mode === 'local' ? (G.s.turn === 'w' ? 'Aux Blancs' : 'Aux Noirs') : 'À vous'} de jouer${E.inCheck(G.s) ? ' · ⚠️ Échec !' : ''}`;
  $('#ch-status').innerHTML = st;
  // Proposition de nulle reçue
  const offer = G.mode === 'online' && !G.over && G.drawOffer && G.drawOffer !== G.me;
  $('#ch-banner').hidden = !offer;
  if (offer) $('#ch-banner').innerHTML = `🤝 Votre adversaire propose la nulle. <button type="button" class="primary" data-act="draw-accept">Accepter</button> <button type="button" data-act="draw-decline">Refuser</button>`;
  renderLesson();
  // Boutons
  const learn = G.mode === 'learn';
  $('#ch-hint').hidden = learn || G.mode === 'online' || !!G.over;
  $('#ch-undo').hidden = learn || G.mode === 'online' || !!G.over;
  $('#ch-draw').hidden = G.mode !== 'online' || !!G.over;
  $('#ch-draw').disabled = G.drawOffer === G.me;
  $('#ch-resign').hidden = learn || !!G.over || G.mode === 'local';
  $('#ch-again').hidden = learn || !G.over || G.mode === 'online';
  $('#ch-turnboard').hidden = false;
  // Coups joués
  const li = [];
  for (let i = 0; i < G.sans.length; i += 2) li.push(`<li><b>${i / 2 + 1}.</b> ${G.sans[i]} ${G.sans[i + 1] || ''}</li>`);
  $('#ch-moves').innerHTML = li.join('');
  $('#ch-moves').scrollTop = 1e6;
}

// ---------- Clic sur l'échiquier ----------
function onSquare(sq) {
  if (!G || !myTurn()) return;
  const p = G.s.b[sq];
  if (G.sel !== null) {
    const ms = E.legal(G.s).filter(m => m.from === G.sel && m.to === sq);
    if (ms.length === 1) return play(ms[0]);
    if (ms.length > 1) return askPromo(ms);
  }
  G.sel = p && E.colorOf(p) === G.s.turn && G.sel !== sq ? sq : null;
  if (G.sel !== null && !E.legal(G.s).some(m => m.from === sq)) sfx.deny?.();
  render();
}
function askPromo(ms) {
  const box = $('#ch-promo'), w = G.s.turn === 'w';
  box.innerHTML = `<p>Promotion : choisissez une pièce</p><div>${['q', 'r', 'b', 'n'].map(t => `<button type="button" data-promo="${t}">${glyph(w ? t.toUpperCase() : t)}</button>`).join('')}</div>`;
  box.hidden = false;
  box.onclick = e => {
    const b = e.target.closest('[data-promo]');
    if (!b) { if (e.target === box) { box.hidden = true; G.sel = null; render(); } return; }
    box.hidden = true; play(ms.find(m => m.promo === b.dataset.promo));
  };
}

// ---------- En ligne ----------
async function sendMove(u) {
  const ply = G.moves.length - 1, code = G.code;
  G.sending = true;
  const r = await call('chess_move', { p_code: code, p_ply: ply, p_move: u }).catch(() => null);
  if (!G || G.code !== code) return;
  G.sending = false;
  if (!r?.ok) { toast('⚠️ Coup non enregistré : resynchronisation…'); if (r?.state) applyServer(r.state, true); else poll(); }
  else {
    applyServer(r);
    if (G.pendingEnd) { const end = G.pendingEnd; G.pendingEnd = null; call('chess_end', end).then(applyServer).catch(() => {}); }
  }
}
function applyServer(st, rebuild = false) {
  if (!G || !st?.ok) return;
  G.white = st.white || ''; G.black = st.black || ''; G.drawOffer = st.draw_offer;
  G.eloW = st.elo_white; G.eloB = st.elo_black; G.rated = st.rated; G.delta = G.me === 'w' ? st.d_white : st.d_black;
  if (rebuild || st.moves.length < G.moves.length || st.moves.slice(0, G.moves.length).join() !== G.moves.join()) {
    const over = G.over; G.s = E.fromFEN(); G.moves = []; G.sans = []; G.over = null;
    const bad = replay(st.moves); if (bad) G.over = over;
  } else if (st.moves.length > G.moves.length) {
    for (const u of st.moves.slice(G.moves.length)) {
      const m = E.fromUci(G.s, u);
      if (!m) { finish(G.me, 'illegal'); break; }
      play(m, true);
      if (navigator.vibrate) navigator.vibrate(60);
    }
  }
  if (st.status === 'end' && !G.over) finish(st.result, st.reason, true);
  else if (st.status === 'end' && G.over && G.over.reason !== st.reason) G.over = { result: st.result, reason: st.reason };
  render();
}
async function poll() {
  if (!G || G.mode !== 'online' || !$('#dlg-chess').open) return;
  if (G.sending || G.polling) return;
  G.polling = true;
  const code = G.code;
  const st = await rpc('chess_state', { p_id: state.playerId, p_code: code }).catch(() => null);
  if (G) G.polling = false;
  if (!G || G.code !== code || !st?.ok || G.sending) return;
  if (!$('#ch-wait').hidden) {
    if (st.status !== 'wait') { G.white = st.white; G.black = st.black; show('game'); toast(`⚔️ ${esc(G.me === 'w' ? st.black : st.white)} a rejoint la partie !`); sfx.unlock(); }
    return;
  }
  applyServer(st);
}

async function createDuel() {
  if (!netEnabled()) return toast('Le duel en ligne a besoin d\'Internet.');
  const r = await call('chess_create', { p_color: state.chess.color || 'r' }).catch(() => null);
  if (!r?.ok) return toast(r?.error === 'banned' ? '⛔ Compte exclu des fonctions en ligne.' : '⚠️ Serveur injoignable.');
  newGame('online', { me: r.me, code: r.code, white: r.white, black: r.black });
  state.chess.online = 1; save();
  $('#ch-wait-qr').innerHTML = qrSVG(duelUrl(r.code), 'QR code du défi d\'échecs');
  $('#ch-wait-code').textContent = r.code;
  $('#ch-wait-col').textContent = r.me === 'w' ? '⚪ Vous jouez les Blancs.' : '⚫ Vous jouez les Noirs.';
  $('#ch-share').hidden = !navigator.share;
  show('wait');
}
export async function joinDuel(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (code.length !== 6) return toast('Code de défi invalide (6 caractères).');
  if (!netEnabled()) return toast('Le duel en ligne a besoin d\'Internet.');
  if (!$('#dlg-chess').open) open();
  const r = await call('chess_join', { p_code: code }).catch(() => null);
  if (!r?.ok) {
    const msg = { code: 'Défi introuvable (expiré ou annulé).', full: 'Ce défi a déjà été accepté par quelqu\'un d\'autre.', banned: '⛔ Compte exclu des fonctions en ligne.' };
    return toast(msg[r?.error] || '⚠️ Serveur injoignable.');
  }
  if (!r.me) return toast('Vous ne faites pas partie de cette partie.');
  newGame('online', { me: r.me, code: r.code, white: r.white, black: r.black });
  state.chess.online = 1; save();
  if (r.status === 'wait') { $('#ch-wait-qr').innerHTML = qrSVG(duelUrl(r.code)); $('#ch-wait-code').textContent = r.code; show('wait'); return; }
  show('game');
  applyServer(r, true);
}

async function renderMine() {
  const ul = $('#ch-mine');
  if (!netEnabled()) { ul.innerHTML = '<li class="muted">Hors ligne.</li>'; return; }
  if (!state.chess.online) { ul.innerHTML = '<li class="muted">Aucune partie pour l\'instant.</li>'; $('#ch-stats').textContent = ''; renderLadder(); return; }
  const r = await call('chess_mine').catch(() => null);
  if (!r?.ok) { ul.innerHTML = '<li class="muted">Serveur injoignable.</li>'; return; }
  const s = r.stats; $('#ch-stats').textContent = s ? `· ${s.wins} V / ${s.draws} N / ${s.losses} D` : '';
  renderLadder();
  ul.innerHTML = r.games.length ? r.games.map(g => {
    const mine = g.status === 'play' && (g.plies % 2 === 0) === (g.me === 'w');
    const txt = g.status === 'wait' ? 'En attente d\'un adversaire' : g.status === 'end'
      ? (g.result === 'd' ? 'Nulle' : g.result === g.me ? '🏆 Gagnée' : 'Perdue') + ` (${REASONS[g.reason] || ''})`
      : g.draw_offer && g.draw_offer !== g.me ? '🤝 Nulle proposée' : mine ? '👉 À vous de jouer' : 'Au tour de l\'adversaire';
    return `<li><button type="button" class="ch-game-btn${mine ? ' hot' : ''}" data-code="${g.code}"><b>${esc(g.opponent || '—')}</b><small>${txt} · ${g.code}</small></button></li>`;
  }).join('') : '<li class="muted">Aucune partie récente.</li>';
}

// Ladder : classement Elo des duels en ligne
async function renderLadder() {
  const ol = $('#ch-ladder');
  if (!netEnabled()) { ol.innerHTML = '<li class="muted">Hors ligne.</li>'; return; }
  const r = await rpc('chess_ladder', { p_id: state.playerId, p_limit: 20 }).catch(() => null);
  if (!r) { ol.innerHTML = '<li class="muted">Serveur injoignable.</li>'; return; }
  if (r.me && r.me.best_elo > (state.chess.bestElo || 0)) { state.chess.bestElo = r.me.best_elo; save(); }
  $('#ch-me-elo').innerHTML = r.me
    ? `<div class="ch-tier"><span class="ch-tier-ico">${tier(r.me.elo)[1]}</span><span><b>${tierTxt(r.me.elo).slice(2).trim()} · ${r.me.elo} Elo</b><small>${r.me.rank}ᵉ / ${r.players} · record ${r.me.best_elo} · ${r.me.rated} partie${r.me.rated > 1 ? 's' : ''} classée${r.me.rated > 1 ? 's' : ''}</small></span></div>`
    : '<p class="muted small">Jouez un duel en ligne pour entrer dans le ladder (départ : 🥈 Argent, 1200 Elo).</p>';
  ol.innerHTML = r.top.length ? r.top.map(x => `<li${x.me ? ' class="me"' : ''}><span>${x.rank}</span><span>${tier(x.elo)[1]} ${esc(x.pseudo)} <small class="muted">${x.wins}V ${x.draws}N ${x.losses}D</small>${titleOf(x.title) ? `<small class="player-title">« ${esc(titleOf(x.title))} »</small>` : ''}</span><b>${x.elo}</b></li>`).join('')
    : '<li class="muted">Personne n\'est encore classé : lancez le premier duel !</li>';
}

// Petit rappel sur la tuile : une partie en ligne attend votre coup
async function checkTile() {
  if (!netEnabled() || !state.chess.online || !state.net.token) return;
  const r = await rpc('chess_mine', me()).catch(() => null);
  if (!r?.ok) return;
  const n = r.games.filter(g => g.status === 'play' && ((g.plies % 2 === 0) === (g.me === 'w') || (g.draw_offer && g.draw_offer !== g.me))).length;
  $('#btn-chess').classList.toggle('ready', n > 0);
  $('#chess-mini').textContent = n ? `👉 À vous de jouer (${n})` : 'IA, à deux ou en duel';
}

// ---------- Écrans ----------
function show(v) {
  for (const id of ['home', 'wait', 'game']) $(`#ch-${id}`).hidden = id !== v;
  $('#dlg-chess').classList.toggle('in-game', v === 'game');
  clearInterval(pollT);
  if (v !== 'home') { stopScan?.(); stopScan = null; $('#ch-video').hidden = true; }
  if (v === 'game' || v === 'wait') { render(); if (G.mode === 'online') pollT = setInterval(poll, 2000); }
  if (v === 'home') renderHome();
}
function chips(el, list, cur) { el.innerHTML = list.map(([v, l]) => `<button type="button" class="sv-chip${String(v) === String(cur) ? ' on' : ''}" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join(''); }
function renderHome() {
  const C = state.chess;
  chips($('#ch-level'), [[1, '🙂 Facile'], [2, '🤔 Moyen'], [3, '😈 Difficile']], C.level);
  chips($('#ch-color'), [['w', '⚪ Blancs'], ['b', '⚫ Noirs'], ['r', '🎲 Au hasard']], C.color);
  const L = C.learn;
  $('#ch-learn-stats').textContent = `Leçons : ${L.lessons.length}/${LESSONS.length} · Problèmes résolus : ${L.puzzles.length}/${PUZZLES.length}`;
  const a = C.ai[C.level] || { w: 0, l: 0, d: 0 };
  $('#ch-ai-stats').textContent = `Contre la Cocotte (${LEVELS[C.level]}) : ${a.w} victoire${a.w > 1 ? 's' : ''}, ${a.d} nulle${a.d > 1 ? 's' : ''}, ${a.l} défaite${a.l > 1 ? 's' : ''}.`;
  const cur = C.cur;
  $('#ch-resume').innerHTML = cur ? `<button type="button" class="big-btn ch-resume" id="ch-resume-btn">▶️ Reprendre la partie ${cur.mode === 'ai' ? `contre la Cocotte (${LEVELS[cur.level]})` : 'à deux'} · coup ${Math.floor(cur.moves.length / 2) + 1}</button>` : '';
  renderMine();
}
function open() {
  $('#dlg-chess').showModal();
  if (G && !G.over && G.mode === 'online') show('game');
  else show('home');
}
function startLocal(mode) {
  const C = state.chess;
  const col = C.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : C.color;
  newGame(mode, mode === 'ai' ? { level: C.level, me: col } : {});
  show('game'); persist();
  if (mode === 'ai' && col === 'b') aiTurn();
}
function resume() {
  const cur = state.chess.cur; if (!cur) return;
  newGame(cur.mode, { level: cur.level, me: cur.me });
  if (replay(cur.moves)) { state.chess.cur = null; save(); toast('Partie illisible : nouvelle partie.'); return show('home'); }
  show('game');
  if (G.mode === 'ai' && !G.over && G.s.turn !== G.me) aiTurn();
}

export function initChess() {
  const dlg = $('#dlg-chess');
  $('#btn-chess').addEventListener('click', () => { sfx.ui(); open(); });
  $('#ch-board').addEventListener('click', e => { const b = e.target.closest('[data-sq]'); if (b) onSquare(+b.dataset.sq); });
  $('#ch-level').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { state.chess.level = +b.dataset.v; save(); renderHome(); } });
  $('#ch-color').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { state.chess.color = b.dataset.v; save(); renderHome(); } });
  $('#ch-ai').addEventListener('click', () => { sfx.ui(); startLocal('ai'); });
  $('#ch-tuto').addEventListener('click', () => { sfx.ui(); const L = state.chess.learn; startLearn('lesson', Math.max(0, LESSONS.findIndex(l => !L.lessons.includes(l.id)))); });
  $('#ch-train').addEventListener('click', () => { sfx.ui(); const L = state.chess.learn, i = PUZZLES.findIndex((_, k) => !L.puzzles.includes(k)); startLearn('puzzle', i < 0 ? 0 : i); });
  $('#ch-lesson').addEventListener('click', e => {
    const a = e.target.closest('[data-l]')?.dataset.l; if (!a || !G) return;
    const list = G.kind === 'lesson' ? LESSONS : PUZZLES;
    if (a === 'hint') { G.feedback = '💡 ' + list[G.idx].hint; render(); }
    else if (a === 'retry') startLearn(G.kind, G.idx);
    else if (a === 'next') startLearn(G.kind, G.idx + 1);
    else show('home');
  });
  $('#ch-hint').addEventListener('click', () => {
    if (!G || !myTurn()) return;
    const m = E.bestMove(G.s, 3);
    if (m) { G.hint = [m.from, m.to]; G.sel = null; render(); toast(`💡 Essayez ${E.san(G.s, m)}`, 2500); }
  });
  $('#ch-local').addEventListener('click', () => { sfx.ui(); state.chess.color = state.chess.color || 'r'; newGame('local'); show('game'); persist(); });
  $('#ch-resume').addEventListener('click', e => { if (e.target.closest('#ch-resume-btn')) resume(); });
  $('#ch-create').addEventListener('click', () => { sfx.ui(); createDuel(); });
  $('#ch-join').addEventListener('click', () => joinDuel($('#ch-code').value));
  $('#ch-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinDuel(e.target.value); });
  $('#ch-mine').addEventListener('click', e => { const b = e.target.closest('[data-code]'); if (b) joinDuel(b.dataset.code); });
  $('#ch-scan').addEventListener('click', async () => {
    if (stopScan) { stopScan(); stopScan = null; $('#ch-video').hidden = true; return; }
    $('#ch-video').hidden = false;
    try {
      stopScan = await startScanner($('#ch-video'), txt => {
        const m = txt.match(/#duel=([A-Z0-9]{6})/i) || txt.trim().match(/^([A-Z0-9]{6})$/i);
        if (!m) { toast('Ce QR n\'est pas un défi d\'échecs.'); return false; }
        stopScan?.(); stopScan = null; $('#ch-video').hidden = true;
        joinDuel(m[1]); return true;
      });
    } catch { $('#ch-video').hidden = true; toast('Caméra inaccessible : tapez le code du défi.'); }
  });
  $('#ch-cancel').addEventListener('click', async () => { if (G?.code) await call('chess_end', { p_code: G.code, p_action: 'cancel' }).catch(() => {}); G = null; show('home'); });
  $('#ch-share').addEventListener('click', () => navigator.share?.({ title: 'Défi d\'échecs', text: `Je te défie aux échecs sur Co'Clicker ! Code : ${G?.code}`, url: duelUrl(G?.code) }).catch(() => {}));
  $('#ch-home-btn').addEventListener('click', () => show('home'));
  $('#ch-again').addEventListener('click', () => (G.mode === 'ai' ? startLocal('ai') : (newGame('local'), show('game'), persist())));
  $('#ch-turnboard').addEventListener('click', () => { G.flip = !G.flip; render(); });
  $('#ch-undo').addEventListener('click', () => {
    if (!G || G.over || G.thinking) return;
    const back = G.mode === 'ai' ? (G.s.turn === G.me ? 2 : 1) : 1;
    const keep = G.moves.slice(0, Math.max(0, G.moves.length - back));
    const { mode, level, me: col, flip } = G; newGame(mode, { level, me: col }); G.flip = flip; replay(keep); render(); persist();
    if (G.mode === 'ai' && G.s.turn !== G.me) aiTurn();
  });
  $('#ch-resign').addEventListener('click', async () => {
    if (!G || G.over || !confirm('Abandonner la partie ?')) return;
    if (G.mode === 'online') { const r = await call('chess_end', { p_code: G.code, p_action: 'resign' }).catch(() => null); if (r?.ok) applyServer(r); }
    else { finish(G.me === 'w' ? 'b' : 'w', 'resign'); render(); }
  });
  $('#ch-draw').addEventListener('click', async () => { const r = await call('chess_end', { p_code: G.code, p_action: 'draw-offer' }).catch(() => null); if (r?.ok) { applyServer(r); toast('🤝 Nulle proposée.'); } });
  $('#ch-banner').addEventListener('click', async e => {
    const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
    const r = await call('chess_end', { p_code: G.code, p_action: a }).catch(() => null); if (r?.ok) applyServer(r);
  });
  dlg.addEventListener('close', () => { clearInterval(pollT); stopScan?.(); stopScan = null; $('#ch-promo').hidden = true; checkTile(); });
  // Défi reçu par lien (#duel=CODE) ou par le Scanner du jeu
  on('duel', code => joinDuel(code));
  checkTile();
  mineT = setInterval(checkTile, 90000);
}

// Pour les tests
export const _chess = { get G() { return G; }, play: u => { const m = E.fromUci(G.s, u); if (m) play(m); return !!m; }, applyServer, poll };
