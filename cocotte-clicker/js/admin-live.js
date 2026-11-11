// Espace équipe → onglet « En direct » : annonce, boss collectif, chasse au trésor, galerie (serveur Supabase)
import { $, toast, esc } from './core.js';
import { qrSVG, baseUrl } from './qr.js';

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
    if (await renderStatus()) { toast('✅ Clé serveur enregistrée sur cet appareil.'); renderLive(); renderGallery(); }
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
  renderStatus(); renderLive(); renderGallery();
}
