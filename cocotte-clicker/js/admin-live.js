// Espace équipe → onglet « En direct » : annonce, boss collectif, chasse au trésor, galerie (serveur Supabase)
import { $, toast, esc } from './core.js';
import { qrSVG, baseUrl } from './qr.js';
import { fmt } from './format.js';

const KEY = 'coclicker-server-key';
let config = {};
const serverKey = () => localStorage.getItem(KEY) || '';

async function rpc(name, body = {}) {
  const c = config.community || {};
  if (!c.url || !c.anonKey) throw new Error('offline');
  const r = await fetch(`${c.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: c.anonKey, 'Content-Type': 'application/json', ...(c.anonKey.startsWith('eyJ') ? { Authorization: `Bearer ${c.anonKey}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
const admin = (name, body = {}) => rpc(name, { p_key: serverKey(), ...body });
const okOr = (r, msg) => { if (r?.ok) { toast(msg); return true; } toast(r?.error === 'key' ? 'Clé serveur refusée : vérifiez-la.' : 'Action impossible.'); return false; };

async function renderStatus() {
  const box = $('#live-key-status');
  if (!serverKey()) { box.textContent = '❌ Aucune clé serveur sur cet appareil.'; return false; }
  try { const ok = await rpc('admin_check', { p_key: serverKey() }); box.textContent = ok ? '✅ Clé serveur valide.' : '❌ Clé serveur refusée.'; return ok; }
  catch { box.textContent = '⚠️ Serveur injoignable (ou script supabase/online.sql pas encore installé).'; return false; }
}

async function renderLive() {
  try {
    const l = await rpc('get_live');
    $('#live-now').innerHTML = `<li>📣 Annonce : ${l.announcement ? `<b>${esc(l.announcement.text)}</b>` : 'aucune'}</li>
      <li>👾 Boss : ${l.boss ? `<b>${esc(l.boss.name)}</b> · ${l.boss.defeated ? 'vaincu ✅' : `${l.boss.hp} / ${l.boss.hp_max} PV`} · ${l.boss.players} joueur(s)` : 'aucun'}</li>
      <li>🗺️ Chasse : ${l.hunt ? `<b>${esc(l.hunt.name)}</b> · ${l.hunt.total} balises · jusqu'au ${new Date(l.hunt.until).toLocaleString('fr-FR')}` : 'aucune'}</li>`;
  } catch { $('#live-now').innerHTML = '<li>Serveur injoignable.</li>'; }
}

// Planche de QR à imprimer pour la chasse au trésor
function printHunt(name, spots) {
  const url = baseUrl(config);
  $('#hunt-print').innerHTML = `<h3>${esc(name)}</h3><p class="muted no-print">Imprimez cette planche, découpez chaque balise et cachez-la dans La Co'Cotte. L'indice s'affiche quand on scanne la balise : il doit mener à la suivante.</p>
    <div class="hunt-sheet">${spots.map(s => `<div class="hunt-tag">
      <b>Balise ${s.num}</b><div class="hunt-qr">${qrSVG(url + '#hunt=' + s.code, 'Balise ' + s.num)}</div>
      <small>Scannez avec Co'Clicker (📷 Scanner)</small><em class="no-print">Indice affiché : ${esc(s.clue)}${s.finds !== undefined ? ` · trouvée ${s.finds} fois` : ''}</em></div>`).join('')}</div>
    <div class="row no-print"><button type="button" id="btn-hunt-print" class="big-btn">🖨️ Imprimer les balises</button></div>`;
  $('#btn-hunt-print').addEventListener('click', () => { document.body.classList.add('print-hunt'); print(); document.body.classList.remove('print-hunt'); });
}

// Joueurs signalés par l'anti-triche
const fmtN = n => fmt(n);
const REASONS = { production: 'Co\'Coins impossibles', vitesse: 'Production/s impossible', succes: 'Succès en trop', saisons: 'Saisons en trop',
  clics: 'Clics trop rapides', minijeux: 'Mini-jeux trop rapides', sauvegarde: 'Sauvegarde modifiée', debut: 'Démarrage suspect', remise: '🔄 Remise à zéro', 'auto-exclu': '⛔ Exclu automatiquement' };
// Carte d'un joueur (suspects et recherche)
const card = p => `<li class="suspect${p.banned ? ' banned' : ''}">
  <div class="suspect-head"><b>${esc(p.pseudo)}</b> <code>${esc(p.id)}</code>
    ${p.banned ? '<span class="tag-ban">Exclu</span>' : p.flags ? `<span class="tag-flag">🚩 ${p.flags}</span>` : ''}
    <small>${fmtN(p.lifetime)} Co'Coins · ${fmtN(p.cps)}/s · ${fmtN(p.tot_clicks)} clics · ${p.tot_games} mini-jeux · inscrit le ${new Date(p.created_at).toLocaleDateString('fr-FR')}${p.reset_gen ? ` · remis à zéro ${p.reset_gen} fois` : ''}</small></div>
  ${p.events ? `<ul class="suspect-ev">${p.events.map(e => `<li><b>${esc(REASONS[e.reason] || e.reason)}</b> · ${new Date(e.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}<br><small>${esc(e.detail)}</small></li>`).join('')}</ul>` : ''}
  <div class="row">
    ${p.banned ? `<button type="button" class="ghost-btn" data-unban="${p.id}">↩️ Réintégrer</button>` : `<button type="button" class="danger" data-ban="${p.id}">⛔ Exclure</button>`}
    <button type="button" class="danger" data-reset="${p.id}" data-name="${esc(p.pseudo)}">🔄 Remettre à zéro</button>
    ${p.flags ? `<button type="button" class="ghost-btn" data-clear="${p.id}">🧹 Effacer les signalements</button>` : ''}
  </div></li>`;

async function renderSuspects() {
  const ul = $('#live-suspects');
  if (!serverKey()) { ul.innerHTML = '<li class="muted">Enregistrez la clé serveur pour voir cette liste.</li>'; return; }
  try {
    const r = await admin('admin_suspects');
    if (!r?.ok) { ul.innerHTML = `<li class="muted">${r?.error === 'key' ? 'Clé serveur refusée.' : 'Indisponible (script supabase/anticheat.sql installé ?).'}</li>`; return; }
    ul.innerHTML = r.players.length ? r.players.map(card).join('') : '<li class="muted">Aucun joueur signalé. 👍</li>';
  } catch { ul.innerHTML = '<li class="muted">Serveur injoignable.</li>'; }
}

async function renderFind() {
  const ul = $('#live-find'), q = $('#find-q').value.trim();
  if (!q) { ul.innerHTML = ''; return; }
  try {
    const r = await admin('admin_find', { p_query: q });
    if (!r?.ok) { ul.innerHTML = `<li class="muted">${r?.error === 'key' ? 'Clé serveur refusée.' : 'Indisponible (script supabase/reset.sql installé ?).'}</li>`; return; }
    ul.innerHTML = r.players.length ? r.players.map(card).join('') : '<li class="muted">Aucun joueur trouvé.</li>';
  } catch { ul.innerHTML = '<li class="muted">Recherche impossible (script supabase/reset.sql installé ?).</li>'; }
}

async function renderGallery() {
  try {
    const g = await rpc('gallery_list', { p_limit: 60 });
    $('#live-gallery').innerHTML = g.length ? g.map(x => `<li><b>${esc(x.pseudo)}</b> · ${esc(x.skin)} · ❤️ ${x.likes}
      <button type="button" class="danger small-btn" data-gal-del="${x.owner}">Retirer</button></li>`).join('') : '<li class="muted">Galerie vide.</li>';
  } catch { $('#live-gallery').innerHTML = '<li class="muted">Indisponible.</li>'; }
}

export function initLive(cfg) {
  config = cfg;
  $('#live-key').value = serverKey();
  $('#btn-live-key').addEventListener('click', async () => {
    localStorage.setItem(KEY, $('#live-key').value.trim());
    if (await renderStatus()) { toast('✅ Clé serveur enregistrée sur cet appareil.'); renderLive(); renderGallery(); renderSuspects(); }
  });
  $('#btn-announce').addEventListener('click', async () => {
    const r = await admin('admin_announce', { p_text: $('#ann-text').value, p_hours: +$('#ann-hours').value || 24 }).catch(() => null);
    if (okOr(r, $('#ann-text').value.trim() ? '📣 Annonce publiée pour tous les joueurs.' : 'Annonce retirée.')) renderLive();
  });
  $('#btn-announce-clear').addEventListener('click', async () => {
    const r = await admin('admin_announce', { p_text: '', p_hours: 1 }).catch(() => null);
    if (okOr(r, 'Annonce retirée.')) renderLive();
  });
  $('#btn-boss').addEventListener('click', async () => {
    const r = await admin('admin_start_boss', { p_name: $('#boss-name').value, p_hp: +$('#boss-hp').value || 5000, p_hours: +$('#boss-hours').value || 24, p_reward: +$('#boss-reward').value || 50 }).catch(() => null);
    if (okOr(r, '👾 Boss lancé ! Les joueurs le voient au-dessus du plan de travail.')) renderLive();
  });
  $('#btn-boss-stop').addEventListener('click', async () => {
    const r = await admin('admin_stop_boss').catch(() => null);
    if (okOr(r, 'Boss arrêté.')) renderLive();
  });
  $('#btn-hunt').addEventListener('click', async () => {
    const clues = $('#hunt-clues').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!clues.length) return toast('Écrivez au moins un indice (une ligne par balise).');
    const r = await admin('admin_create_hunt', { p_name: $('#hunt-name').value, p_hours: +$('#hunt-hours').value || 24,
      p_reward: +$('#hunt-reward').value || 10, p_bonus: +$('#hunt-bonus').value || 50, p_clues: clues }).catch(() => null);
    if (okOr(r, `🗺️ Chasse créée : ${clues.length} balise(s) à imprimer.`)) { printHunt($('#hunt-name').value || 'Chasse au trésor', r.spots); renderLive(); }
  });
  $('#btn-hunt-show').addEventListener('click', async () => {
    const r = await admin('admin_hunt_spots').catch(() => null);
    if (!r) return toast('Aucune chasse en cours (ou clé refusée).');
    printHunt(r.name, r.spots);
  });
  $('#btn-hunt-stop').addEventListener('click', async () => {
    const r = await admin('admin_stop_hunt').catch(() => null);
    if (okOr(r, 'Chasse terminée.')) renderLive();
  });
  $('#live-gallery').addEventListener('click', async e => {
    const b = e.target.closest('[data-gal-del]'); if (!b || !confirm('Retirer cette Cocotte de la galerie ?')) return;
    const r = await admin('admin_gallery_remove', { p_owner: b.dataset.galDel }).catch(() => null);
    if (okOr(r, 'Retirée de la galerie.')) renderGallery();
  });
  $('#btn-suspects').addEventListener('click', renderSuspects);
  // Actions sur un joueur (liste des suspects et résultats de recherche)
  const onPlayer = async e => {
    const ban = e.target.closest('[data-ban]'), unban = e.target.closest('[data-unban]'), clear = e.target.closest('[data-clear]'), reset = e.target.closest('[data-reset]');
    let done = false;
    if (ban && confirm(`Exclure le joueur ${ban.dataset.ban} des classements, du compteur collectif, de la galerie et des équipes ?`)) {
      done = okOr(await admin('admin_ban', { p_id: ban.dataset.ban, p_ban: true }).catch(() => null), 'Joueur exclu.');
    }
    if (unban) done = okOr(await admin('admin_ban', { p_id: unban.dataset.unban, p_ban: false }).catch(() => null), 'Joueur réintégré (il doit réactiver le classement dans le jeu).');
    if (clear && confirm('Effacer les signalements de ce joueur (faux positif) ?')) {
      done = okOr(await admin('admin_clear_flags', { p_id: clear.dataset.clear }).catch(() => null), 'Signalements effacés.');
    }
    if (reset && confirm(`Remettre à zéro la partie de « ${reset.dataset.name} » (${reset.dataset.reset}) ?\n\nSes Co'Coins, bâtiments, cristaux, collection, succès et scores seront effacés, en ligne et sur tous ses appareils. C'est définitif.`)
      && prompt('Pour confirmer, tapez RESET') === 'RESET') {
      done = okOr(await admin('admin_reset', { p_id: reset.dataset.reset }).catch(() => null), '🔄 Compte remis à zéro. Ses appareils effaceront la partie à leur prochaine connexion.');
    }
    if (done) { renderSuspects(); renderFind(); }
  };
  $('#live-suspects').addEventListener('click', onPlayer);
  $('#live-find').addEventListener('click', onPlayer);
  $('#btn-find').addEventListener('click', renderFind);
  $('#find-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); renderFind(); } });
  renderStatus(); renderLive(); renderGallery(); renderSuspects();
}
