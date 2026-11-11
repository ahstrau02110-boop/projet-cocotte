// Mode en ligne (Supabase) : compteur collectif, classements, défi de la semaine, équipes, cadeaux,
// galerie, annonces, boss collectif et chasse au trésor.
// Le jeu reste 100 % jouable en solo si le serveur n'est pas configuré ou inaccessible.
import { DATA, state, totalCps, buffMult, addCrystals } from './state.js';
import { $, $$, emit, esc, toast, on } from './core.js';
import { fmt } from './format.js';
import { save } from './save.js';
import { b64u } from './qr.js';
import { sfx } from './audio.js';
import { skinImage, skinById } from './skins.js';
import { bgById, bgCSS } from './backgrounds.js';

const C = () => DATA.config.community || {};
export const netEnabled = () => !!(C().url && C().anonKey);
let online = null, extras = false, board = [], myRank = null, busy = false, tab = 'rank';
let weekly = null, teams = null, live = null, gameBoard = { game: 'bubbles', rows: [] }, gallery = [];
let pendingHits = 0;

export async function rpc(name, body = {}) {
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
const me = () => ({ p_id: state.playerId, p_token: state.net.token });

// Bonus de production débloqué par les objectifs collectifs atteints (valeur mise en cache pour le hors-ligne)
export const communityBonus = () => (C().goals || []).filter(g => state.net.total >= g.at).reduce((a, g) => a + g.pct, 0);

const METRICS = {
  games: ['🎮', 'mini-jeux terminés'], golden: ['🌟', 'Cocottes dorées attrapées'],
  missions: ['🎯', 'missions du jour réussies'], clicks: ['👆', 'clics sur la Cocotte'],
};
const TEAMS = { atelier: ['🔧', 'Atelier', '#90C060'], fablab: ['🖨️', 'FabLab', '#7b3fe4'], tierslieu: ['🎪', 'Tiers-lieu', '#E41E6C'] };
const GAMES = { bubbles: '🫧 Bulles', catcher: '🧺 Attrape-tout', memory: '🃏 Memory', match3: '🧩 Fab\'Match', bugs: '🐞 Bugs', simon: '🎹 Séquence', puzzle: '🖼️ Puzzle' };

// ---------- Synchronisation ----------
export async function sync(full = false) {
  if (!netEnabled() || busy) return;
  busy = true;
  try {
    const before = communityBonus();
    await rpc('submit_score', {
      ...me(), p_pseudo: state.pseudo, p_listed: state.net.listed,
      p_lifetime: state.prestige.lifetime, p_cps: totalCps() / buffMult('cps'),
      p_seasons: state.prestige.seasons, p_achievements: Object.keys(state.achievements).length,
      p_games: state.mini.plays, p_golden: state.golden, p_clicks: state.totalClicks, p_missions: state.counters.missions,
    }).catch(() => null); // limite de fréquence : sans gravité
    const st = await rpc('community_stats');
    state.net.total = +st.total || 0;
    state.net.players = +st.players || 0;
    state.net.lastSync = Date.now();
    online = true;
    // Fonctions en ligne (supabase/online.sql) : facultatives
    try {
      [weekly, teams] = await Promise.all([rpc('weekly_challenge'), rpc('team_standings', { p_id: state.playerId })]);
      extras = true;
      state.online.team = teams.my_team || null;
      state.online.teamWinner = teams.last_winner || null;
      await claimGifts();
    } catch { extras = false; }
    if (full) {
      board = await rpc('leaderboard', { p_limit: 20 });
      myRank = (await rpc('my_rank', { p_id: state.playerId }))?.rank ?? null;
    }
    if (communityBonus() > before) toast(`🌍 Objectif collectif atteint ! Production +${communityBonus() - before} % pour tout le monde.`, 6000);
    save();
    emit('refresh');
  } catch {
    online = false;
  } finally {
    busy = false;
  }
}

async function claimGifts() {
  const gifts = await rpc('claim_gifts', me());
  for (const g of gifts || []) {
    addCrystals(g.amount);
    toast(`🎁 ${g.from} vous a offert ${g.amount} 💎 !`, 6000);
    sfx.unlock();
  }
}

// ---------- En direct : annonce, boss, chasse ----------
async function pollLive() {
  if (!netEnabled() || document.hidden) return;
  try {
    if (pendingHits > 0 && live?.boss && !live.boss.defeated) {
      const n = pendingHits; pendingHits = 0;
      await rpc('hit_boss', { ...me(), p_boss: live.boss.id, p_hits: n }).catch(() => (pendingHits += n));
    }
    live = await rpc('get_live', { p_id: state.playerId });
    renderLive();
  } catch { /* hors ligne */ }
}

function renderLive() {
  // Annonce de l'équipe (masquable)
  const a = live?.announcement, ab = $('#announce');
  if (a && state.online.hiddenAnnounce !== a.id) {
    ab.hidden = false;
    $('#announce-txt').textContent = a.text;
    ab.dataset.id = a.id;
  } else ab.hidden = true;
  // Boss collectif
  const b = live?.boss, bp = $('#boss');
  const active = b && (!b.defeated ? new Date(b.ends_at) > new Date() : true);
  bp.hidden = !active;
  if (active) {
    const pct = Math.max(0, b.hp / b.hp_max * 100);
    const claimed = state.online.bossClaimed.includes(b.id), canClaim = b.defeated && b.my_hits >= 10 && !claimed;
    bp.innerHTML = `<div class="boss-head"><span class="boss-ico" aria-hidden="true">👾</span>
        <span><b>${esc(b.name)}</b><small>${b.defeated ? 'Vaincu par la communauté !' : `Chaque clic sur la Cocotte le frappe · ${fmt(b.players)} joueur${b.players > 1 ? 's' : ''}`}</small></span></div>
      <span class="bar boss-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${b.hp_max}" aria-valuenow="${b.hp}"><span style="width:${pct}%"></span></span>
      <small>${fmt(b.hp)} / ${fmt(b.hp_max)} PV · vos coups : ${fmt(b.my_hits + pendingHits)}</small>
      ${canClaim ? `<button type="button" class="big-btn" id="btn-boss-claim">🏆 Récupérer ${b.reward} 💎</button>`
        : b.defeated && !claimed ? '<small>Frappez au moins 10 fois un boss pour gagner la récompense.</small>' : ''}`;
    $('#btn-boss-claim')?.addEventListener('click', () => {
      state.online.bossClaimed.push(b.id);
      addCrystals(b.reward); save(); sfx.unlock();
      toast(`👾 Boss vaincu : +${b.reward} 💎 !`, 5000);
      emit('refresh'); renderLive();
    });
  }
}

// ---------- Chasse au trésor ----------
export async function huntFind(code) {
  if (!netEnabled()) { toast('Chasse au trésor indisponible hors connexion.'); return; }
  try {
    const r = await rpc('hunt_find', { ...me(), p_code: code });
    if (!r.ok) { toast(r.error === 'closed' ? 'Cette chasse au trésor est terminée.' : 'QR de chasse au trésor inconnu.'); sfx.deny(); return; }
    let msg = `🗺️ ${r.hunt} : balise ${r.num} trouvée (${r.found}/${r.total})`;
    if (r.new) { addCrystals(r.reward); msg += ` · +${r.reward} 💎`; }
    else msg += ' (déjà trouvée)';
    if (r.complete && !state.online.huntBonus.includes(r.hunt_id)) {
      state.online.huntBonus.push(r.hunt_id);
      addCrystals(r.bonus);
      msg += ` · Chasse terminée : +${r.bonus} 💎 bonus !`;
    }
    save(); sfx.unlock(); emit('refresh');
    toast(msg, 7000);
    if (r.clue) setTimeout(() => toast(`🔎 Indice : ${r.clue}`, 9000), 600);
    pollLive();
  } catch { toast('Connexion impossible : réessayez avec du réseau.'); }
}

// ---------- Scores de mini-jeux ----------
on('gameEnd', ({ game, score }) => {
  if (!netEnabled() || !extras || !score) return;
  rpc('submit_game_score', { ...me(), p_game: game, p_score: Math.round(score) }).catch(() => {});
});
// Clics sur la Cocotte = coups au boss
on('potClick', () => { if (live?.boss && !live.boss.defeated) pendingHits++; });

// ---------- Carte « Communauté » ----------
export function renderCommunityCard() {
  const el = $('#btn-community');
  if (!netEnabled()) { el.hidden = true; return; }
  el.hidden = false;
  const next = (C().goals || []).find(g => state.net.total < g.at);
  const w = weekly && METRICS[weekly.metric];
  $('#community-mini').innerHTML = `<b>${fmt(state.net.total)}</b> Co'Coins produits ensemble`
    + (communityBonus() ? ` · bonus <b>+${communityBonus()} %</b>` : '')
    + (w ? `<br><small>Défi de la semaine : ${w[0]} ${fmt(weekly.total)} / ${fmt(weekly.target)} ${w[1]}</small>`
      : next ? `<br><small>Prochain objectif : ${esc(next.name)} (${fmt(next.at)})</small>` : '');
}

// ---------- Fenêtre « En ligne » à onglets ----------
const TABS = [['rank', '🏆 Classement'], ['weekly', '🎯 Défi'], ['teams', '🛡️ Équipes'], ['games', '🎮 Mini-jeux'], ['gallery', '🖼️ Galerie'], ['gifts', '🎁 Cadeaux']];

function renderDialog() {
  const box = $('#community-body');
  if (!netEnabled()) {
    box.innerHTML = `<p class="tip-wait">🌍 Le mode communautaire n'est pas encore activé sur ce jeu. Vous pouvez jouer normalement en solo !</p>`;
    return;
  }
  const tabs = extras ? TABS : TABS.slice(0, 1);
  box.innerHTML = `${online === false ? '<p class="err">Serveur injoignable : affichage des dernières valeurs connues.</p>' : ''}
    <nav class="com-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" type="button" data-ctab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</nav>
    <div id="com-panel"></div>`;
  ({ rank: panelRank, weekly: panelWeekly, teams: panelTeams, games: panelGames, gallery: panelGallery, gifts: panelGifts })[tab]?.();
}

function panelRank() {
  const goals = C().goals || [];
  $('#com-panel').innerHTML = `
    <div class="com-total"><span>🌍</span><div><b>${fmt(state.net.total)}</b> Co'Coins produits par <b>${fmt(state.net.players)}</b> joueur${state.net.players > 1 ? 's' : ''}</div></div>
    <h3>Objectifs collectifs</h3>
    <ul class="com-goals">${goals.map(g => {
      const ok = state.net.total >= g.at, pct = Math.min(100, state.net.total / g.at * 100);
      return `<li class="${ok ? 'ok' : ''}"><span>${ok ? '✅' : '🎯'} <b>${esc(g.name)}</b> : ${fmt(g.at)} · production +${g.pct} % pour tous</span>
        <span class="bar"><span style="width:${pct}%"></span></span></li>`;
    }).join('')}</ul>
    <h3>Classement ${myRank ? `<small>· vous êtes ${myRank}<sup>e</sup></small>` : ''}</h3>
    <ol class="com-board">${board.length ? board.map(r => `<li${r.pseudo === state.pseudo && state.pseudo ? ' class="me"' : ''}><span>${r.rank}</span><b>${esc(r.pseudo)}</b><span>${fmt(r.lifetime)}</span></li>`).join('') : '<li class="muted">Classement indisponible pour le moment.</li>'}</ol>
    <label class="switch"><input type="checkbox" id="com-listed" ${state.net.listed ? 'checked' : ''}> <span>Apparaître dans les classements</span></label>
    <label for="com-pseudo">Pseudo affiché (facultatif, sans nom de famille)</label>
    <input id="com-pseudo" maxlength="20" value="${esc(state.pseudo)}" placeholder="Anonyme" autocomplete="off">`;
  $('#com-listed').addEventListener('change', e => { state.net.listed = e.target.checked; save(); sync(true).then(renderDialog); });
  $('#com-pseudo').addEventListener('change', e => {
    state.pseudo = e.target.value.replace(/[^\p{L}\p{N} _'-]/gu, '').trim().slice(0, 20);
    save(); sync(true).then(renderDialog);
  });
}

function panelWeekly() {
  const w = weekly; if (!w) return;
  const [ico, label] = METRICS[w.metric] || ['🎯', w.metric];
  const pct = Math.min(100, w.total / w.target * 100), reward = C().weeklyReward ?? 150;
  const claimed = state.online.claimedWeeks.includes(w.week);
  const end = new Date(w.ends_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#com-panel').innerHTML = `<div class="weekly">
      <span class="weekly-ico" aria-hidden="true">${ico}</span>
      <h3>Ensemble : ${fmt(w.target)} ${label} cette semaine !</h3>
      <span class="bar weekly-bar"><span style="width:${pct}%"></span></span>
      <p><b>${fmt(w.total)}</b> / ${fmt(w.target)} · jusqu'à ${end}</p>
      <p class="muted">Tout le monde compte ! Si l'objectif est atteint, <b>chaque joueur</b> gagne ${reward} 💎.</p>
      ${w.done ? (claimed ? '<p class="ok-txt">✅ Récompense récupérée. Rendez-vous lundi pour un nouveau défi !</p>'
        : `<button type="button" class="big-btn" id="btn-weekly">🎉 Récupérer ${reward} 💎</button>`) : ''}
    </div>`;
  $('#btn-weekly')?.addEventListener('click', () => {
    state.online.claimedWeeks.push(w.week);
    state.online.claimedWeeks = state.online.claimedWeeks.slice(-20);
    addCrystals(reward); save(); sfx.unlock(); emit('refresh');
    toast(`🎯 Défi de la semaine réussi : +${reward} 💎 !`, 5000);
    panelWeekly();
  });
}

function panelTeams() {
  const t = teams || { teams: [] };
  const pts = Object.fromEntries((t.teams || []).map(x => [x.team, x]));
  const max = Math.max(1, ...Object.values(pts).map(x => +x.points));
  const winner = t.last_winner && TEAMS[t.last_winner];
  $('#com-panel').innerHTML = `<p class="muted">Rejoignez une équipe : vos mini-jeux (10 pts), missions (20 pts) et Cocottes dorées (5 pts) lui rapportent des points. L'équipe gagnante du mois donne <b>+${C().teamBonusPct ?? 10} % de production</b> à ses membres le mois suivant.</p>
    ${winner ? `<p class="team-win">🏆 Gagnante du mois dernier : <b>${winner[0]} ${winner[1]}</b>${state.online.team === t.last_winner ? ' : votre équipe ! Bonus actif.' : ''}</p>` : ''}
    <ul class="teams">${Object.entries(TEAMS).map(([id, [ico, name, col]]) => {
      const p = pts[id] || { points: 0, members: 0 }, mine = state.online.team === id;
      return `<li class="team${mine ? ' mine' : ''}" style="--tc:${col}">
        <span class="team-ico" aria-hidden="true">${ico}</span>
        <span class="team-txt"><b>${name}</b><small>${fmt(p.members)} membre${p.members > 1 ? 's' : ''} · ${fmt(p.points)} pts ce mois</small>
          <span class="bar"><span style="width:${p.points / max * 100}%"></span></span></span>
        ${mine ? '<span class="mi-done">Mon équipe</span>' : `<button type="button" class="mi-btn" data-team="${id}" ${t.locked_until ? 'disabled' : ''}>Rejoindre</button>`}
      </li>`;
    }).join('')}</ul>
    ${t.locked_until ? `<p class="small">Changement d'équipe possible à partir du ${new Date(t.locked_until).toLocaleDateString('fr-FR')}.</p>` : '<p class="small">Une fois choisie, l\'équipe est gardée 30 jours.</p>'}`;
  $$('[data-team]').forEach(b => b.addEventListener('click', async () => {
    const r = await rpc('set_team', { ...me(), p_team: b.dataset.team }).catch(() => null);
    if (!r?.ok) { toast(r?.error === 'locked' ? 'Vous avez déjà changé d\'équipe ce mois-ci.' : 'Impossible pour le moment.'); return; }
    sfx.unlock(); toast(`Bienvenue dans l'équipe ${TEAMS[b.dataset.team][1]} !`);
    teams = await rpc('team_standings', { p_id: state.playerId }).catch(() => teams);
    state.online.team = b.dataset.team; save(); panelTeams();
  }));
}

async function panelGames() {
  $('#com-panel').innerHTML = `<p class="muted">Meilleurs scores de la semaine (remis à zéro chaque lundi). Vos parties sont envoyées automatiquement.</p>
    <div class="com-games">${Object.entries(GAMES).map(([k, l]) => `<button type="button" data-game-b="${k}" aria-pressed="${k === gameBoard.game}">${l}</button>`).join('')}</div>
    <ol class="com-board" id="game-board"><li class="muted">Chargement…</li></ol>`;
  $$('[data-game-b]').forEach(b => b.addEventListener('click', () => { gameBoard.game = b.dataset.gameB; panelGames(); }));
  try { gameBoard.rows = await rpc('game_leaderboard', { p_game: gameBoard.game, p_id: state.playerId }); } catch { gameBoard.rows = []; }
  const ol = $('#game-board'); if (!ol) return;
  ol.innerHTML = gameBoard.rows.length ? gameBoard.rows.map(r => `<li${r.me ? ' class="me"' : ''}><span>${r.rank}</span><b>${esc(r.pseudo)}</b><span>${fmt(r.best)}</span></li>`).join('')
    : '<li class="muted">Personne n\'a encore joué cette semaine : à vous l\'honneur !</li>';
}

const galleryCard = g => {
  const b = g.bg !== 'auto' && bgById(g.bg), sk = skinById(g.skin);
  return `<li class="gal${g.mine ? ' mine' : ''}">
    <span class="gal-pic" style="background:${b ? bgCSS(b) : 'radial-gradient(circle, #7b5a36 3px, transparent 3.6px) 0 0/24px 24px, #d8b384'}"><img src="${skinImage(sk.id)}" alt="${esc(sk.name)}"></span>
    <span class="gal-txt"><b>${esc(g.pseudo)}</b><small>${esc(sk.name)}</small></span>
    <button type="button" class="gal-like${g.liked ? ' on' : ''}" data-like="${g.owner}" ${g.mine ? 'disabled' : ''} aria-label="J'aime">❤️ ${g.likes}</button></li>`;
};

async function panelGallery() {
  $('#com-panel').innerHTML = `<div class="row"><button type="button" class="big-btn" id="btn-share">📸 Exposer ma Cocotte</button>
      <span class="small">Votre skin et votre décor actuels, avec votre pseudo.</span></div>
    <ul class="gallery" id="gallery"><li class="muted">Chargement…</li></ul>`;
  $('#btn-share').addEventListener('click', async () => {
    const r = await rpc('share_gallery', { ...me(), p_skin: state.skin, p_bg: state.bg }).catch(() => null);
    if (!r?.ok) { toast('Partage impossible pour le moment.'); return; }
    sfx.buy(); toast('📸 Votre Cocotte est exposée dans la galerie !'); panelGallery();
  });
  try { gallery = await rpc('gallery_list', { p_id: state.playerId, p_limit: 40 }); } catch { gallery = []; }
  const ul = $('#gallery'); if (!ul) return;
  ul.innerHTML = gallery.length ? gallery.map(galleryCard).join('') : '<li class="muted">La galerie est vide : soyez le premier ou la première à exposer votre Cocotte !</li>';
  ul.addEventListener('click', async e => {
    const b = e.target.closest('[data-like]'); if (!b) return;
    const r = await rpc('like_gallery', { ...me(), p_owner: b.dataset.like }).catch(() => null);
    if (r?.ok) { sfx.ui(); panelGallery(); }
  });
}

function panelGifts() {
  const sentToday = state.online.giftDay === new Date().toLocaleDateString('sv-SE');
  $('#com-panel').innerHTML = `<p>Offrez <b>10 💎</b> à un ami une fois par jour : il les reçoit à sa prochaine connexion. Ça ne vous coûte rien !</p>
    <p class="muted">Demandez-lui son code joueur (tuile 📱 Mon QR code). Le vôtre : <b class="mono">${state.playerId}</b></p>
    <div class="row"><input id="gift-to" class="mono grow" maxlength="12" placeholder="Code joueur de l'ami" autocomplete="off" aria-label="Code joueur de l'ami">
      <button type="button" class="big-btn" id="btn-gift" ${sentToday ? 'disabled' : ''}>🎁 Offrir</button></div>
    ${sentToday ? '<p class="small">Cadeau du jour déjà envoyé : revenez demain !</p>' : ''}`;
  $('#btn-gift')?.addEventListener('click', async () => {
    const to = $('#gift-to').value.trim().toUpperCase();
    const r = await rpc('send_gift', { ...me(), p_to: to }).catch(() => null);
    const err = { self: 'C\'est votre propre code !', unknown: 'Code joueur inconnu (il doit avoir joué en ligne au moins une fois).', daily: 'Vous avez déjà offert un cadeau aujourd\'hui.' };
    if (!r?.ok) { sfx.deny(); toast(err[r?.error] || 'Envoi impossible pour le moment.'); return; }
    state.online.giftDay = new Date().toLocaleDateString('sv-SE'); save();
    sfx.unlock(); toast('🎁 Cadeau envoyé !'); panelGifts();
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
  $('#community-body').addEventListener('click', e => {
    const b = e.target.closest('[data-ctab]');
    if (b) { tab = b.dataset.ctab; renderDialog(); }
  });
  $('#announce-close').addEventListener('click', () => { state.online.hiddenAnnounce = +$('#announce').dataset.id; save(); $('#announce').hidden = true; });
  if (!netEnabled()) return;
  setTimeout(() => sync(), 3000);
  setTimeout(pollLive, 2000);
  setInterval(() => !document.hidden && sync(), (C().syncSec ?? 120) * 1000);
  setInterval(pollLive, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sync(); else pollLive(); });
}
