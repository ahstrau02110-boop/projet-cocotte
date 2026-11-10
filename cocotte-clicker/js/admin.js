// Espace équipe : connexion, clé de signature, QR de récompense, historique
import { $, $$, toast, esc } from './core.js';
import { ALGO, SIGN, b64u, baseUrl, qrSVG, qrDataURL, voucherBody } from './qr.js';

const KEY_STORE = 'cocotte-admin-key';
const LOG_STORE = 'cocotte-admin-log';
const ID_RE = /^[A-Z0-9]{6,12}$/;
let config = {}, player = { id: '', name: '' }, lastLink = '';

// ---------- Outils ----------
async function sha256hex(txt) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const loadKey = () => { try { return JSON.parse(localStorage.getItem(KEY_STORE)); } catch { return null; } };
const loadLog = () => { try { return JSON.parse(localStorage.getItem(LOG_STORE)) || []; } catch { return []; } };
const download = (name, href) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
const sameKey = (a, b) => a && b && a.x === b.x && a.y === b.y;

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
  $('#pid').focus();
}

// ---------- Clé de signature ----------
function renderKey() {
  const k = loadKey(), pub = config.adminPublicKey;
  const warn = $('#key-warning');
  $('#pub-box').hidden = !k;
  if (k) $('#pub-json').value = JSON.stringify(k.publicJwk);
  if (!k) {
    $('#key-status').innerHTML = '❌ Aucune clé sur cet appareil.';
    warn.hidden = false;
    warn.innerHTML = '<strong>Première utilisation ?</strong> Créez une clé (ou importez la sauvegarde de clé de l\'équipe) dans « Clé de signature » plus bas.';
  } else if (!pub) {
    $('#key-status').innerHTML = '⚠️ Clé présente, mais la clé publique n\'est pas encore dans <code>data/config.json</code>.';
    warn.hidden = false;
    warn.innerHTML = '<strong>Dernière étape :</strong> copiez la clé publique (en bas de page) dans <code>data/config.json</code> puis publiez le jeu. Sans cela, les joueurs ne pourront pas encaisser les QR.';
  } else if (!sameKey(k.publicJwk, pub)) {
    $('#key-status').innerHTML = '⚠️ La clé de cet appareil ne correspond pas à celle du jeu publié.';
    warn.hidden = false;
    warn.innerHTML = '<strong>Clé différente :</strong> importez la sauvegarde de clé de l\'équipe, ou mettez à jour <code>data/config.json</code> avec la clé publique de cet appareil.';
  } else {
    $('#key-status').innerHTML = `✅ Clé active (créée le ${new Date(k.created).toLocaleDateString('fr-FR')}), identique à celle du jeu publié.`;
    warn.hidden = true;
  }
}

async function newKey() {
  if (loadKey() && !confirm('Remplacer la clé existante ? Les QR déjà créés resteront valables seulement si le jeu garde l\'ancienne clé publique.')) return;
  const pair = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']);
  const k = {
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    created: Date.now(),
  };
  // On ne garde que les champs utiles de la clé publique
  k.publicJwk = { kty: k.publicJwk.kty, crv: k.publicJwk.crv, x: k.publicJwk.x, y: k.publicJwk.y };
  localStorage.setItem(KEY_STORE, JSON.stringify(k));
  saveKeyFile();
  renderKey();
  toast('Clé créée. Gardez précieusement le fichier de sauvegarde téléchargé.');
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
    await crypto.subtle.importKey('jwk', k.privateJwk, ALGO, false, ['sign']); // validation
    localStorage.setItem(KEY_STORE, JSON.stringify(k));
    renderKey();
    toast('Clé importée.');
  } catch { toast('Fichier de clé invalide.'); }
}

// ---------- Joueur ----------
function setPlayer(id, name = '') {
  id = (id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  player = { id, name: name.slice(0, 20) };
  $('#pid').value = id;
  $('#pname').textContent = id && ID_RE.test(id) ? `Joueur ${id}${name ? ' · « ' + name + ' »' : ''}` : '';
  $('#voucher').hidden = true;
}

// Admin ouvert par le QR du joueur (appareil photo) : admin.html#p=ID&n=pseudo
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('p')) { setPlayer(h.get('p'), h.get('n') || ''); history.replaceState(null, '', location.pathname); }
}

// Lecture d'un QR scanné : lien joueur ou code brut
function parseScan(txt) {
  try {
    const u = new URL(txt);
    const h = new URLSearchParams(u.hash.slice(1));
    if (h.get('p')) return { id: h.get('p'), name: h.get('n') || '' };
  } catch { /* pas une URL */ }
  const id = txt.trim().toUpperCase();
  return ID_RE.test(id) ? { id, name: '' } : null;
}

// ---------- Caméra (BarcodeDetector, sinon jsQR) ----------
let stream = null, scanning = false;
async function loadJsQR() {
  if (window.jsQR) return;
  await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'js/vendor/jsQR.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}
async function startScan() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch { toast('Caméra inaccessible. Saisissez le code joueur à la main.'); return; }
  const video = $('#video');
  video.srcObject = stream;
  await video.play();
  $('#scanner').hidden = false;
  scanning = true;
  const detector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  if (!detector) await loadJsQR();
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const loop = async () => {
    if (!scanning) return;
    let txt = null;
    if (video.readyState >= 2) {
      if (detector) {
        const codes = await detector.detect(video).catch(() => []);
        txt = codes[0]?.rawValue || null;
      } else {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        txt = window.jsQR(img.data, img.width, img.height)?.data || null;
      }
    }
    const res = txt && parseScan(txt);
    if (res) { stopScan(); setPlayer(res.id, res.name); toast(`Joueur ${res.id} scanné.`); $('#amount').focus(); return; }
    requestAnimationFrame(loop);
  };
  loop();
}
function stopScan() {
  scanning = false;
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  $('#scanner').hidden = true;
}

// ---------- Création du bon ----------
async function grant() {
  $('#grant-err').textContent = '';
  const id = $('#pid').value.trim().toUpperCase();
  if (id !== player.id) setPlayer(id, '');
  const amount = Math.floor(+$('#amount').value);
  const max = config.rewards?.qrMax ?? 1000;
  const k = loadKey();
  if (!ID_RE.test(id)) return ($('#grant-err').textContent = 'Code joueur invalide (6 à 12 lettres/chiffres).');
  if (!(amount > 0 && amount <= max)) return ($('#grant-err').textContent = `Montant entre 1 et ${max}.`);
  if (!k) return ($('#grant-err').textContent = 'Aucune clé de signature sur cet appareil (voir plus bas).');

  const nonce = b64u(crypto.getRandomValues(new Uint8Array(6)));
  const body = voucherBody(id, amount, nonce, Date.now());
  const key = await crypto.subtle.importKey('jwk', k.privateJwk, ALGO, false, ['sign']);
  const sig = b64u(await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(body)));
  lastLink = `${baseUrl(config)}#claim=${body}.${sig}`;

  $('#voucher-qr').innerHTML = qrSVG(lastLink, 'QR de récompense');
  $('#voucher-txt').innerHTML = `<strong>${amount} 💎</strong> pour le joueur <strong>${esc(id)}</strong>${player.name ? ' (« ' + esc(player.name) + ' »)' : ''}.<br>À scanner avec l'appareil photo du téléphone où il joue. Valable ${config.rewards?.voucherDays ?? 7} jours, une seule fois.`;
  $('#voucher').hidden = false;
  $('#voucher').scrollIntoView({ behavior: 'smooth', block: 'center' });

  const log = loadLog();
  log.unshift({ date: Date.now(), id, name: player.name, amount, note: $('#note').value.trim() });
  localStorage.setItem(LOG_STORE, JSON.stringify(log.slice(0, 2000)));
  renderLog();
}

// ---------- Historique ----------
function renderLog() {
  const log = loadLog();
  $('#log').innerHTML = log.length
    ? log.slice(0, 100).map(l => `<tr><td>${new Date(l.date).toLocaleString('fr-FR')}</td><td class="mono">${esc(l.id)}</td><td>${esc(l.name || '')}</td><td>${l.amount}</td><td>${esc(l.note || '')}</td></tr>`).join('')
    : '<tr><td colspan="5" class="muted">Aucune remise pour l\'instant.</td></tr>';
}
function exportCSV() {
  const rows = [['date', 'joueur', 'pseudo', 'cristaux', 'occasion'],
    ...loadLog().map(l => [new Date(l.date).toISOString(), l.id, l.name || '', l.amount, l.note || ''])];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  download('remises-cristaux.csv', URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })));
}

// ---------- QR du jeu ----------
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
  $('#btn-key-new').addEventListener('click', newKey);
  $('#btn-key-save').addEventListener('click', saveKeyFile);
  $('#key-file').addEventListener('change', importKey);
  $('#btn-pub-copy').addEventListener('click', () => navigator.clipboard.writeText($('#pub-json').value).then(() => toast('Clé publique copiée.')));
  $('#pid').addEventListener('change', e => setPlayer(e.target.value));
  $('#btn-scan').addEventListener('click', startScan);
  $('#btn-scan-stop').addEventListener('click', stopScan);
  $$('[data-amt]').forEach(b => b.addEventListener('click', () => { $('#amount').value = b.dataset.amt; }));
  $('#amount').value = config.rewards?.qrDefault ?? 100;
  $('#btn-grant').addEventListener('click', grant);
  $('#btn-copy-link').addEventListener('click', () => navigator.clipboard.writeText(lastLink).then(() => toast('Lien copié : vous pouvez l\'envoyer au joueur.')));
  $('#btn-next').addEventListener('click', () => { setPlayer(''); $('#note').value = $('#note').value; $('#pid').focus(); });
  $('#btn-csv').addEventListener('click', exportCSV);
  $('#btn-game-qr').addEventListener('click', () => download('qr-jeu-cocotte.gif', qrDataURL(baseUrl(config), 12)));
  addEventListener('hashchange', () => { if (!$('#app').hidden) readHash(); });

  if (sessionStorage.getItem('cocotte-admin-ok')) showApp();
}

boot();

// Application installable / hors ligne
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
