// Espace équipe : connexion, remise de cristaux (joueur ou groupe), historique, clé de signature
import { $, $$, toast, esc } from './core.js';
import { ALGO, SIGN, b64u, baseUrl, qrSVG, qrDataURL, voucherBody } from './qr.js';
import { startScanner } from './scanner.js';

const KEY_STORE = 'cocotte-admin-key';
const LOG_STORE = 'cocotte-admin-log';
const ID_RE = /^[A-Z0-9]{6,12}$/;
let config = {}, player = null, lastLink = '', stopScan = null;

// ---------- Outils ----------
async function sha256hex(txt) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const loadKey = () => { try { return JSON.parse(localStorage.getItem(KEY_STORE)); } catch { return null; } };
const loadLog = () => { try { return JSON.parse(localStorage.getItem(LOG_STORE)) || []; } catch { return []; } };
const download = (name, href) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
const sameKey = (a, b) => a && b && a.x === b.x && a.y === b.y;
const maxAmount = () => config.rewards?.qrMax ?? 2000;

// ---------- Connexion ----------
async function login(e) {
  e.preventDefault();
  const ok = (await sha256hex($('#code').value)) === config.adminCodeSha256;
  if (!ok) { $('#login-err').textContent = 'Code incorrect.'; return; }
  sessionStorage.setItem('cocotte-admin-ok', '1');
  showApp();
}

function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#btn-logout').hidden = false;
  renderKey();
  renderLog();
  renderGameQR();
  readHash();
}

// ---------- Onglets ----------
function setTab(tab) {
  stopCamera();
  $$('.admin-tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('.tab-panel').forEach(p => (p.hidden = p.dataset.panel !== tab));
}

// ---------- Clé de signature ----------
function renderKey() {
  const k = loadKey(), pub = config.adminPublicKey, warn = $('#key-warning');
  $('#pub-box').hidden = !k;
  if (k) $('#pub-json').value = JSON.stringify(k.publicJwk);
  let msg = '';
  if (!k) {
    $('#key-status').textContent = '❌ Aucune clé sur cet appareil.';
    msg = '<strong>Première utilisation sur cet appareil :</strong> allez dans ⚙️ Réglages → « Importer le fichier de clé » (fichier transmis par le référent).';
  } else if (!pub) {
    $('#key-status').innerHTML = '⚠️ La clé publique n\'est pas encore dans <code>data/config.json</code>.';
    msg = '<strong>Dernière étape :</strong> copiez la clé publique (⚙️ Réglages) dans <code>data/config.json</code>, puis publiez le jeu.';
  } else if (!sameKey(k.publicJwk, pub)) {
    $('#key-status').textContent = '⚠️ La clé de cet appareil ne correspond pas à celle du jeu.';
    msg = '<strong>Clé différente :</strong> importez le fichier de clé de l\'équipe dans ⚙️ Réglages.';
  } else {
    $('#key-status').textContent = `✅ Clé active (créée le ${new Date(k.created).toLocaleDateString('fr-FR')}), identique à celle du jeu.`;
  }
  warn.hidden = !msg;
  warn.innerHTML = msg;
}

async function newKey() {
  if (!confirm('Créer une NOUVELLE clé ? Les QR des autres appareils de l\'équipe ne fonctionneront plus tant que le jeu et ces appareils n\'auront pas été mis à jour.')) return;
  const pair = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const k = { privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), publicJwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, created: Date.now() };
  localStorage.setItem(KEY_STORE, JSON.stringify(k));
  saveKeyFile();
  renderKey();
  toast('Nouvelle clé créée et téléchargée : gardez le fichier en lieu sûr.');
}
function saveKeyFile() {
  const k = loadKey(); if (!k) return;
  download('cle-admin-cocotte-PRIVEE.json', URL.createObjectURL(new Blob([JSON.stringify(k, null, 2)], { type: 'application/json' })));
}
async function importKey(e) {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const k = JSON.parse(await f.text());
    await crypto.subtle.importKey('jwk', k.privateJwk, ALGO, false, ['sign']);
    localStorage.setItem(KEY_STORE, JSON.stringify(k));
    renderKey();
    toast('✅ Clé importée : vous pouvez remettre des cristaux.');
  } catch { toast('Fichier de clé invalide.'); }
}

// ---------- Joueur ----------
function setPlayer(id, name = '') {
  id = (id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  $('#pid-err').textContent = '';
  if (!ID_RE.test(id)) { player = null; $('#pid-err').textContent = id ? 'Code joueur invalide (6 à 12 lettres ou chiffres).' : ''; }
  else player = { id, name: String(name).slice(0, 20) };
  $('#player-chip').hidden = !player;
  $('#player-pick').hidden = !!player;
  if (player) {
    $('#player-chip').innerHTML = `<span>✅ Joueur <b class="mono">${esc(player.id)}</b>${player.name ? ` · « ${esc(player.name)} »` : ''}</span>
      <button type="button" class="ghost-btn" id="btn-change">Changer</button>`;
    $('#btn-change').addEventListener('click', () => { setPlayer(''); });
  }
  $('#btn-grant').disabled = !player;
}

// Admin ouvert depuis le QR du joueur (appareil photo) : admin.html#p=ID&n=pseudo
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('p')) { setTab('player'); setPlayer(h.get('p'), h.get('n') || ''); history.replaceState(null, '', location.pathname); }
}

function parseScan(txt) {
  try {
    const h = new URLSearchParams(new URL(txt).hash.slice(1));
    if (h.get('p')) return { id: h.get('p'), name: h.get('n') || '' };
  } catch { /* pas une URL */ }
  const id = txt.trim().toUpperCase();
  return ID_RE.test(id) ? { id, name: '' } : null;
}

async function startCamera() {
  $('#scanner').hidden = false;
  $('#btn-scan').hidden = true;
  $('#btn-scan-stop').hidden = false;
  try {
    stopScan = await startScanner($('#video'), txt => {
      const r = parseScan(txt);
      if (!r) { toast('Ce QR n\'est pas un QR joueur Co\'Clicker.'); return false; }
      stopCamera();
      setPlayer(r.id, r.name);
      toast(`✅ Joueur ${r.id} scanné.`);
      return true;
    });
  } catch {
    stopCamera();
    toast('Caméra inaccessible : autorisez-la dans le navigateur, ou saisissez le code joueur.');
  }
}
function stopCamera() {
  stopScan?.(); stopScan = null;
  $('#scanner').hidden = true;
  $('#btn-scan').hidden = false;
  $('#btn-scan-stop').hidden = true;
}

// ---------- Montants rapides ----------
function bindPresets() {
  $$('.presets[data-target]').forEach(group => {
    const input = $('#' + group.dataset.target);
    const sync = () => group.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === String(input.value))));
    group.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { input.value = b.dataset.v; sync(); } });
    input.addEventListener('input', sync);
    sync();
  });
  const hours = config.groupVoucher?.choices || [1, 3, 24, 72];
  const g = $('#g-hours');
  g.innerHTML = hours.map(h => `<button role="radio" type="button" data-h="${h}">${h < 24 ? h + ' h' : h / 24 + ' jour' + (h > 24 ? 's' : '')}</button>`).join('');
  const pick = h => g.querySelectorAll('[data-h]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.h === h)));
  g.addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (b) pick(+b.dataset.h); });
  pick(config.groupVoucher?.defaultHours ?? 3);
}
const groupHours = () => +($('#g-hours [aria-checked="true"]')?.dataset.h || 3);

// ---------- Signature d'un bon ----------
async function sign(target, amount) {
  const k = loadKey();
  if (!k) throw new Error('Aucune clé de signature sur cet appareil : ⚙️ Réglages → Importer le fichier de clé.');
  const nonce = b64u(crypto.getRandomValues(new Uint8Array(6)));
  const body = voucherBody(target, amount, nonce, Date.now());
  const key = await crypto.subtle.importKey('jwk', k.privateJwk, ALGO, false, ['sign']);
  const sig = b64u(await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(body)));
  return `${baseUrl(config)}#claim=${body}.${sig}`;
}

function addLog(entry) {
  const log = loadLog();
  log.unshift({ date: Date.now(), ...entry });
  localStorage.setItem(LOG_STORE, JSON.stringify(log.slice(0, 3000)));
  renderLog();
}

function show({ kicker, title, link, txt, print }) {
  lastLink = link;
  $('#show-kicker').textContent = kicker;
  $('#show-title').textContent = title;
  $('#show-qr').innerHTML = qrSVG(link, title);
  $('#show-txt').innerHTML = txt;
  $('#btn-print').hidden = !print;
  $('#show').hidden = false;
  $('#btn-done').focus();
}

async function grantPlayer() {
  $('#grant-err').textContent = '';
  const amount = Math.floor(+$('#amount').value);
  if (!player) return ($('#grant-err').textContent = 'Identifiez d\'abord le joueur (étape 1).');
  if (!(amount > 0 && amount <= maxAmount())) return ($('#grant-err').textContent = `Montant entre 1 et ${maxAmount()}.`);
  try {
    const link = await sign(player.id, amount);
    addLog({ type: 'joueur', id: player.id, name: player.name, amount, note: $('#note').value.trim() });
    show({ kicker: 'Montrez ce QR au joueur', title: `${amount} 💎 pour ${player.name || player.id}`, link,
      txt: `Dans le jeu : bouton <b>📷 Scanner</b>, puis visez ce QR. Valable ${config.rewards?.voucherDays ?? 7} jours, une seule fois, pour ce joueur uniquement.` });
  } catch (e) { $('#grant-err').textContent = e.message; }
}

async function grantGroup() {
  $('#group-err').textContent = '';
  const note = $('#g-note').value.trim(), amount = Math.floor(+$('#g-amount').value), hours = groupHours();
  if (!note) return ($('#group-err').textContent = 'Indiquez le nom de l\'atelier ou de l\'événement.');
  if (!(amount > 0 && amount <= maxAmount())) return ($('#group-err').textContent = `Montant entre 1 et ${maxAmount()}.`);
  try {
    const link = await sign('grp' + hours, amount);
    addLog({ type: 'groupe', id: `groupe ${hours} h`, name: '', amount, note });
    const until = new Date(Date.now() + hours * 3600e3).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    show({ kicker: 'QR de groupe · ' + note, title: `${amount} 💎 pour chaque participant·e`, link, print: true,
      txt: `Dans Co'Clicker : bouton <b>📷 Scanner</b>, puis visez ce QR.<br>Une fois par joueur · valable jusqu'à <b>${until}</b>.` });
  } catch (e) { $('#group-err').textContent = e.message; }
}

// ---------- Historique ----------
function renderLog() {
  const log = loadLog();
  const today = new Date().toDateString();
  const todayLog = log.filter(l => new Date(l.date).toDateString() === today);
  $('#log-summary').textContent = `Aujourd'hui : ${todayLog.length} remise${todayLog.length > 1 ? 's' : ''}, ${todayLog.reduce((a, l) => a + l.amount, 0)} 💎. Total : ${log.length} remise${log.length > 1 ? 's' : ''}.`;
  $('#log').innerHTML = log.length
    ? log.slice(0, 200).map(l => `<tr><td>${new Date(l.date).toLocaleString('fr-FR')}</td><td>${l.type === 'groupe' ? '👥 Groupe' : '🎁 Joueur'}</td><td class="mono">${esc(l.id)}</td><td>${esc(l.name || '')}</td><td>${l.amount}</td><td>${esc(l.note || '')}</td></tr>`).join('')
    : '<tr><td colspan="6" class="muted">Aucune remise pour l\'instant.</td></tr>';
  // Occasions récentes proposées à la saisie
  const notes = [...new Set(log.map(l => l.note).filter(Boolean))].slice(0, 15);
  $('#notes').innerHTML = notes.map(n => `<option value="${esc(n)}">`).join('');
}
function exportCSV() {
  const rows = [['date', 'type', 'joueur', 'pseudo', 'cristaux', 'occasion'],
    ...loadLog().map(l => [new Date(l.date).toISOString(), l.type || 'joueur', l.id, l.name || '', l.amount, l.note || ''])];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  download('remises-cristaux.csv', URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })));
}

function renderGameQR() {
  const url = baseUrl(config);
  $('#game-url').textContent = url;
  $('#game-qr').innerHTML = qrSVG(url, 'QR code du jeu');
}

// ---------- Démarrage ----------
async function boot() {
  try { config = await (await fetch('data/config.json', { cache: 'no-cache' })).json(); }
  catch { toast('Impossible de charger data/config.json'); return; }

  $('#login-form').addEventListener('submit', login);
  $('#btn-logout').addEventListener('click', () => { sessionStorage.removeItem('cocotte-admin-ok'); location.reload(); });
  $$('.admin-tabs [role=tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#btn-key-new').addEventListener('click', newKey);
  $('#btn-key-save').addEventListener('click', saveKeyFile);
  $('#key-file').addEventListener('change', importKey);
  $('#btn-pub-copy').addEventListener('click', () => navigator.clipboard.writeText($('#pub-json').value).then(() => toast('Clé publique copiée.')));
  $('#btn-scan').addEventListener('click', startCamera);
  $('#btn-scan-stop').addEventListener('click', stopCamera);
  $('#btn-pid').addEventListener('click', () => setPlayer($('#pid').value));
  $('#pid').addEventListener('keydown', e => { if (e.key === 'Enter') setPlayer($('#pid').value); });
  $('#amount').value = config.rewards?.qrDefault ?? 200;
  $('#g-amount').value = 100;
  bindPresets();
  $('#btn-grant').addEventListener('click', grantPlayer);
  $('#btn-group').addEventListener('click', grantGroup);
  $('#btn-copy-link').addEventListener('click', () => navigator.clipboard.writeText(lastLink).then(() => toast('Lien copié : vous pouvez l\'envoyer au joueur.')));
  $('#btn-print').addEventListener('click', () => print());
  $('#btn-done').addEventListener('click', () => {
    $('#show').hidden = true;
    if (!$('[data-panel="player"]').hidden) { setPlayer(''); $('#btn-scan').focus(); }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#show').hidden) $('#btn-done').click(); });
  $('#btn-csv').addEventListener('click', exportCSV);
  $('#btn-game-qr').addEventListener('click', () => download('qr-jeu-coclicker.gif', qrDataURL(baseUrl(config), 12)));
  addEventListener('hashchange', () => { if (!$('#app').hidden) readHash(); });
  setPlayer('');

  if (sessionStorage.getItem('cocotte-admin-ok')) showApp();
}

boot();

// Application installable / hors ligne
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
