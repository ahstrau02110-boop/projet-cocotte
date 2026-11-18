// Moteur d'échecs : coups légaux (roque, prise en passant, promotion), échec, mat, pat, nulles,
// notation algébrique française (R D T F C) et une petite IA (alpha-bêta).
// Plateau : tableau de 64 cases, index 0 = a8 … 63 = h1. Pièces : 'PNBRQK' blanches, 'pnbrqk' noires, '' vide.

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
export const sqName = i => FILES[i & 7] + (8 - (i >> 3));
export const sqIdx = s => (8 - +s[1]) * 8 + FILES.indexOf(s[0]);
export const colorOf = p => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
const other = c => (c === 'w' ? 'b' : 'w');

const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const inb = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;

export function fromFEN(fen = START) {
  const [pos, turn, cast, ep, half, full] = fen.split(' ');
  const b = Array(64).fill('');
  let i = 0;
  for (const ch of pos) { if (ch === '/') continue; if (/\d/.test(ch)) i += +ch; else b[i++] = ch; }
  return { b, turn, castle: cast === '-' ? '' : cast, ep: ep === '-' ? -1 : sqIdx(ep), half: +half || 0, full: +full || 1, hist: [] };
}

// Clé de position (répétitions)
const key = s => s.b.map(p => p || '.').join('') + s.turn + s.castle + s.ep;

// La case sq est-elle attaquée par la couleur « by » ?
export function attacked(b, sq, by) {
  const r = sq >> 3, f = sq & 7;
  const at = (rr, ff) => (inb(rr, ff) ? b[rr * 8 + ff] : null);
  const pr = by === 'w' ? r + 1 : r - 1, P = by === 'w' ? 'P' : 'p';
  if (at(pr, f - 1) === P || at(pr, f + 1) === P) return true;
  const Nn = by === 'w' ? 'N' : 'n', K = by === 'w' ? 'K' : 'k';
  for (const [dr, df] of KN) if (at(r + dr, f + df) === Nn) return true;
  for (const [dr, df] of KG) if (at(r + dr, f + df) === K) return true;
  const slide = (dirs, set) => {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (inb(rr, ff)) { const p = b[rr * 8 + ff]; if (p) { if (set.includes(p)) return true; break; } rr += dr; ff += df; }
    }
    return false;
  };
  return slide(DIAG, by === 'w' ? 'BQ' : 'bq') || slide(ORTH, by === 'w' ? 'RQ' : 'rq');
}
export const kingSq = (b, c) => b.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = s => attacked(s.b, kingSq(s.b, s.turn), other(s.turn));

// Coups pseudo-légaux (sans vérifier que le roi reste hors d'échec)
function pseudo(s) {
  const { b, turn } = s, opp = other(turn), moves = [];
  const add = (from, to, x) => moves.push({ from, to, piece: b[from], cap: b[to] || '', ...x });
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p || colorOf(p) !== turn) continue;
    const r = sq >> 3, f = sq & 7, t = p.toLowerCase();
    if (t === 'p') {
      const dir = turn === 'w' ? -1 : 1, start = turn === 'w' ? 6 : 1, last = turn === 'w' ? 0 : 7;
      const push = (to, x) => { if ((to >> 3) === last) for (const pr of 'qrbn') add(sq, to, { ...x, promo: pr }); else add(sq, to, x); };
      const one = sq + dir * 8;
      if (inb(r + dir, f) && !b[one]) { push(one); if (r === start && !b[one + dir * 8]) add(sq, one + dir * 8, { dbl: true }); }
      for (const df of [-1, 1]) {
        if (!inb(r + dir, f + df)) continue;
        const to = (r + dir) * 8 + f + df;
        if (b[to] && colorOf(b[to]) === opp) push(to);
        else if (to === s.ep) add(sq, to, { ep: true, cap: turn === 'w' ? 'p' : 'P' });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, df] of t === 'n' ? KN : KG) {
        const rr = r + dr, ff = f + df;
        if (!inb(rr, ff)) continue;
        const to = rr * 8 + ff;
        if (!b[to] || colorOf(b[to]) === opp) add(sq, to);
      }
      if (t === 'k') {
        const home = turn === 'w' ? 60 : 4, R = turn === 'w' ? 'R' : 'r', [ks, qs] = turn === 'w' ? ['K', 'Q'] : ['k', 'q'];
        if (sq === home && !attacked(b, home, opp)) {
          if (s.castle.includes(ks) && !b[home + 1] && !b[home + 2] && b[home + 3] === R && !attacked(b, home + 1, opp) && !attacked(b, home + 2, opp)) add(sq, home + 2, { castle: 'k' });
          if (s.castle.includes(qs) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === R && !attacked(b, home - 1, opp) && !attacked(b, home - 2, opp)) add(sq, home - 2, { castle: 'q' });
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : [...DIAG, ...ORTH];
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (inb(rr, ff)) {
          const to = rr * 8 + ff;
          if (b[to]) { if (colorOf(b[to]) === opp) add(sq, to); break; }
          add(sq, to);
          rr += dr; ff += df;
        }
      }
    }
  }
  return moves;
}

const ROOK_HOMES = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };
// Joue un coup et renvoie la nouvelle position (track : garder l'historique pour les répétitions)
export function make(s, m, track = true) {
  const b = s.b.slice(), turn = s.turn;
  b[m.to] = m.promo ? (turn === 'w' ? m.promo.toUpperCase() : m.promo) : b[m.from];
  b[m.from] = '';
  if (m.ep) b[m.to + (turn === 'w' ? 8 : -8)] = '';
  if (m.castle) {
    const row = turn === 'w' ? 56 : 0;
    if (m.castle === 'k') { b[row + 5] = b[row + 7]; b[row + 7] = ''; } else { b[row + 3] = b[row]; b[row] = ''; }
  }
  let castle = s.castle;
  if (castle) {
    for (const sq of [m.from, m.to]) {
      if (sq === 60) castle = castle.replace(/[KQ]/g, '');
      else if (sq === 4) castle = castle.replace(/[kq]/g, '');
      else if (ROOK_HOMES[sq]) castle = castle.replace(ROOK_HOMES[sq], '');
    }
  }
  return {
    b, turn: other(turn), castle, ep: m.dbl ? (m.from + m.to) / 2 : -1,
    half: m.piece.toLowerCase() === 'p' || m.cap ? 0 : s.half + 1, full: s.full + (turn === 'b' ? 1 : 0),
    hist: track ? [...s.hist, key(s)] : s.hist,
  };
}

export function legal(s) {
  return pseudo(s).filter(m => { const n = make(s, m, false); return !attacked(n.b, kingSq(n.b, s.turn), n.turn); });
}

// Matériel insuffisant pour mater (roi seul, roi + fou ou cavalier, fous de même couleur)
function insufficient(b) {
  const rest = [];
  for (let i = 0; i < 64; i++) if (b[i] && b[i].toLowerCase() !== 'k') rest.push([b[i].toLowerCase(), i]);
  if (!rest.length) return true;
  if (rest.length === 1 && 'nb'.includes(rest[0][0])) return true;
  if (rest.every(([p]) => p === 'b')) { const sc = rest.map(([, i]) => ((i >> 3) + (i & 7)) & 1); return sc.every(c => c === sc[0]); }
  return false;
}

// État de la partie : null (en cours) ou { result: 'w' | 'b' | 'd', reason }
export function outcome(s) {
  if (!legal(s).length) return inCheck(s) ? { result: other(s.turn), reason: 'mate' } : { result: 'd', reason: 'stalemate' };
  if (s.half >= 100) return { result: 'd', reason: '50' };
  if (insufficient(s.b)) return { result: 'd', reason: 'material' };
  const k = key(s);
  if (s.hist.filter(h => h === k).length >= 2) return { result: 'd', reason: 'repetition' };
  return null;
}

// ---------- Notations ----------
export const uci = m => sqName(m.from) + sqName(m.to) + (m.promo || '');
export function fromUci(s, u) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u || '')) return null;
  const from = sqIdx(u.slice(0, 2)), to = sqIdx(u.slice(2, 4)), promo = u[4] || undefined;
  return legal(s).find(m => m.from === from && m.to === to && (m.promo || undefined) === promo) || null;
}
const FR = { n: 'C', b: 'F', r: 'T', q: 'D', k: 'R' };
// Notation algébrique française (ex. Cf3, exd5, O-O, e8=D+)
export function san(s, m, moves = legal(s)) {
  let out;
  if (m.castle) out = m.castle === 'k' ? 'O-O' : 'O-O-O';
  else {
    const t = m.piece.toLowerCase();
    if (t === 'p') out = (m.cap ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + FR[m.promo] : '');
    else {
      const twins = moves.filter(o => o.from !== m.from && o.piece === m.piece && o.to === m.to);
      let dis = '';
      if (twins.length) {
        if (!twins.some(o => (o.from & 7) === (m.from & 7))) dis = FILES[m.from & 7];
        else if (!twins.some(o => (o.from >> 3) === (m.from >> 3))) dis = String(8 - (m.from >> 3));
        else dis = sqName(m.from);
      }
      out = FR[t] + dis + (m.cap ? 'x' : '') + sqName(m.to);
    }
  }
  const n = make(s, m, false);
  if (inCheck(n)) out += legal(n).length ? '+' : '#';
  return out;
}

// Compte des positions (test du moteur)
export function perft(s, d) {
  if (!d) return 1;
  let n = 0;
  for (const m of legal(s)) n += d === 1 ? 1 : perft(make(s, m, false), d - 1);
  return n;
}

// ---------- IA « la Cocotte » ----------
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Bonus de placement (vue des blancs, index 0 = a8)
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
// Évaluation du point de vue du joueur au trait
function evaluate(s) {
  let sc = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.b[i]; if (!p) continue;
    const t = p.toLowerCase();
    if (p === t) sc -= VAL[t] + PST[t][(7 - (i >> 3)) * 8 + (i & 7)];
    else sc += VAL[t] + PST[t][i];
  }
  return s.turn === 'w' ? sc : -sc;
}
const order = ms => ms.sort((a, c) => (c.cap ? VAL[c.cap.toLowerCase()] * 10 - VAL[c.piece.toLowerCase()] : 0) + (c.promo ? 800 : 0) - ((a.cap ? VAL[a.cap.toLowerCase()] * 10 - VAL[a.piece.toLowerCase()] : 0) + (a.promo ? 800 : 0)));

function quiesce(s, alpha, beta, d) {
  const stand = evaluate(s);
  if (stand >= beta || d <= 0) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of order(legal(s).filter(x => x.cap || x.promo))) {
    const v = -quiesce(make(s, m, false), -beta, -alpha, d - 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
function search(s, depth, alpha, beta, ply) {
  const ms = legal(s);
  if (!ms.length) return inCheck(s) ? -100000 + ply : 0;
  if (depth === 0) return quiesce(s, alpha, beta, 4);
  for (const m of order(ms)) {
    const v = -search(make(s, m, false), depth - 1, -beta, -alpha, ply + 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
// Meilleur coup pour le joueur au trait. level : 1 facile, 2 moyen, 3 difficile
export function bestMove(s, level = 2) {
  const ms = order(legal(s));
  if (!ms.length) return null;
  const depth = level >= 3 ? 3 : level === 2 ? 2 : 1, noise = level === 1 ? 120 : level === 2 ? 15 : 0;
  let best = null, bv = -Infinity;
  for (const m of ms) {
    let v = -search(make(s, m, false), depth - 1, -Infinity, Infinity, 1) + (noise ? (Math.random() - 0.5) * noise : 0);
    // Évite de rejouer une position déjà vue (nulle par répétition) quand on est devant
    if (s.hist.includes(key(make(s, m, false))) && v > 0) v -= 50;
    if (v > bv) { bv = v; best = m; }
  }
  return best;
}
