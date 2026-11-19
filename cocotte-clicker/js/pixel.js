// Atelier pixel : dessiner sa propre Cocotte en 16 × 16, la porter dans le jeu, la proposer à la galerie.
// La galerie n'affiche que les créations validées par l'équipe (espace équipe → En direct).
// Dessin : 256 caractères, '.' = transparent, '0'…'f' = couleur de la palette.
import { DATA, state } from './state.js';
import { $, toast, esc, emit } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { rpc, netEnabled, sync } from './community.js';

export const PALETTE = ['#000000', '#ffffff', '#e41e6c', '#f07e36', '#fcd260', '#90c060', '#3c2472', '#2f9be0',
  '#8b5a2b', '#9e9e9e', '#ff9ecb', '#c0392b', '#1b5e20', '#7fd8ff', '#5d4037', '#f5e6c8'];
const N = 16;
const me = () => ({ p_id: state.playerId, p_token: state.net.token });
let art = [], color = 0, tool = 'pen', undo = [], drawing = false, gallery = null;

// Silhouette de marmite pour démarrer
function template() {
  const g = Array(N * N).fill('.');
  const set = (x, y, c) => { if (x >= 0 && x < N && y >= 0 && y < N) g[y * N + x] = c; };
  for (let x = 6; x <= 9; x++) set(x, 2, '0');                       // poignée du couvercle
  for (let x = 3; x <= 12; x++) { set(x, 3, '0'); set(x, 5, '0'); }   // couvercle
  for (let x = 4; x <= 11; x++) set(x, 4, '9'); set(3, 4, '0'); set(12, 4, '0');
  for (let y = 6; y <= 13; y++) for (let x = 2; x <= 13; x++) set(x, y, (x === 2 || x === 13 || y === 13) ? '0' : '3'); // corps
  set(2, 13, '.'); set(13, 13, '.'); for (let x = 3; x <= 12; x++) set(x, 14, x === 3 || x === 12 ? '.' : '0'); set(3, 13, '0'); set(12, 13, '0');
  for (const y of [8, 9]) { set(0, y, '0'); set(1, y, '0'); set(14, y, '0'); set(15, y, '0'); } // anses
  set(5, 9, '0'); set(10, 9, '0'); set(5, 8, '1'); set(10, 8, '1');   // yeux
  set(7, 11, '0'); set(8, 11, '0'); set(4, 10, 'a'); set(11, 10, 'a'); // bouche, joues
  return g;
}

export function artToURL(str, scale = 8) {
  const c = document.createElement('canvas'); c.width = c.height = N * scale;
  const x = c.getContext('2d');
  for (let i = 0; i < N * N; i++) {
    const ch = str[i];
    if (!ch || ch === '.') continue;
    x.fillStyle = PALETTE[parseInt(ch, 16)];
    x.fillRect((i % N) * scale, Math.floor(i / N) * scale, scale, scale);
  }
  return c.toDataURL('image/png');
}

// La création devient un skin de Cocotte « perso » (hors imprimantes et hors bonus de collection)
export function registerPerso() {
  if (!state.pixel.art) return;
  const sk = { id: 'perso', name: 'Ma Cocotte pixel', rarity: 'commune', custom: true, img: artToURL(state.pixel.art), desc: 'Dessinée dans l\'Atelier pixel' };
  const i = DATA.skins.findIndex(s => s.id === 'perso');
  if (i >= 0) DATA.skins[i] = sk; else DATA.skins.push(sk);
}

// ---------- Éditeur ----------
function draw() {
  const cv = $('#px-canvas'), x = cv.getContext('2d'), s = cv.width / N;
  x.clearRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < N * N; i++) {
    const px = (i % N) * s, py = Math.floor(i / N) * s;
    if (art[i] === '.') { x.fillStyle = ((i % N) + Math.floor(i / N)) % 2 ? '#e9e4da' : '#f7f3ec'; } else x.fillStyle = PALETTE[parseInt(art[i], 16)];
    x.fillRect(px, py, s, s);
  }
  x.strokeStyle = 'rgba(0,0,0,.08)';
  for (let k = 0; k <= N; k++) { x.beginPath(); x.moveTo(k * s, 0); x.lineTo(k * s, cv.height); x.moveTo(0, k * s); x.lineTo(cv.width, k * s); x.stroke(); }
  $('#px-preview').src = artToURL(art.join(''), 4);
}
function cellAt(e) {
  const cv = $('#px-canvas'), b = cv.getBoundingClientRect();
  const cx = Math.floor((e.clientX - b.left) / b.width * N), cy = Math.floor((e.clientY - b.top) / b.height * N);
  return cx >= 0 && cx < N && cy >= 0 && cy < N ? cy * N + cx : -1;
}
function fill(i, to) {
  const from = art[i];
  if (from === to) return;
  const stack = [i];
  while (stack.length) {
    const k = stack.pop();
    if (art[k] !== from) continue;
    art[k] = to;
    const x = k % N, y = Math.floor(k / N);
    if (x > 0) stack.push(k - 1); if (x < N - 1) stack.push(k + 1); if (y > 0) stack.push(k - N); if (y < N - 1) stack.push(k + N);
  }
}
function paint(i) {
  if (i < 0) return;
  const c = tool === 'eraser' ? '.' : color.toString(16);
  if (tool === 'fill') fill(i, c);
  else if (tool === 'pick') { if (art[i] !== '.') { color = parseInt(art[i], 16); tool = 'pen'; renderTools(); } return; }
  else art[i] = c;
  draw();
}
function pushUndo() { undo.push(art.join('')); if (undo.length > 40) undo.shift(); }
function renderTools() {
  $('#px-palette').innerHTML = PALETTE.map((c, i) => `<button type="button" class="px-col${i === color ? ' on' : ''}" data-col="${i}" style="--c:${c}" aria-label="Couleur ${i + 1}"></button>`).join('');
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
}
function renderStatus() {
  const s = state.pixel.status;
  $('#px-status').textContent = s === 'pending' ? '⏳ Votre création attend la validation de l\'équipe.'
    : s === 'ok' ? '✅ Votre création est dans la galerie ! (titre « Artiste pixel » débloqué)'
    : s === 'no' ? '❌ Votre dernière création n\'a pas été retenue pour la galerie. Vous pouvez en proposer une autre.' : '';
}
async function loadGallery() {
  const ul = $('#px-gallery');
  if (!netEnabled()) { ul.innerHTML = '<li class="muted">Galerie disponible en ligne.</li>'; return; }
  try { gallery = await rpc('pixel_list', { p_limit: 40 }); } catch { gallery = null; }
  ul.innerHTML = gallery?.length ? gallery.map(g => `<li><img src="${artToURL(g.art, 4)}" alt="Création de ${esc(g.pseudo)}"><small>${esc(g.pseudo)}</small></li>`).join('')
    : '<li class="muted">Pas encore de création validée : soyez la première ou le premier !</li>';
  // Statut de ma proposition
  if (state.net.token && state.pixel.status) {
    const r = await rpc('pixel_mine', me()).catch(() => null);
    if (r?.status && r.status !== state.pixel.status) { state.pixel.status = r.status; save(); emit('refresh'); renderStatus(); }
  }
}

export function openPixel() {
  art = (state.pixel.art || template().join('')).split('');
  undo = []; tool = 'pen';
  renderTools(); draw(); renderStatus();
  $('#dlg-pixel').showModal();
  loadGallery();
}

export function initPixel() {
  registerPerso();
  const cv = $('#px-canvas');
  $('#btn-pixel').addEventListener('click', () => { sfx.ui(); openPixel(); });
  cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); pushUndo(); drawing = true; paint(cellAt(e)); });
  cv.addEventListener('pointermove', e => { if (drawing && tool !== 'fill' && tool !== 'pick') paint(cellAt(e)); });
  const stop = () => { drawing = false; };
  cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
  $('#px-palette').addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (b) { color = +b.dataset.col; if (tool === 'eraser' || tool === 'pick') tool = 'pen'; renderTools(); } });
  $('#px-tools').addEventListener('click', e => {
    const b = e.target.closest('[data-tool],[data-act]'); if (!b) return;
    if (b.dataset.tool) { tool = b.dataset.tool; renderTools(); return; }
    const a = b.dataset.act;
    if (a === 'undo' && undo.length) { art = undo.pop().split(''); draw(); }
    if (a === 'clear') { pushUndo(); art = Array(N * N).fill('.'); draw(); }
    if (a === 'template') { pushUndo(); art = template(); draw(); }
  });
  $('#px-save').addEventListener('click', () => {
    if (art.every(c => c === '.')) return toast('Le dessin est vide !');
    state.pixel.art = art.join(''); registerPerso();
    if (state.skin === 'perso') emit('skin');
    save(); sfx.buy(); toast('💾 Création enregistrée.');
  });
  $('#px-wear').addEventListener('click', () => {
    if (art.every(c => c === '.')) return toast('Le dessin est vide !');
    state.pixel.art = art.join(''); registerPerso();
    state.skins.perso = 1; state.skin = 'perso';
    save(); sfx.unlock(); emit('skin'); emit('refresh');
    toast('🍲 Votre Cocotte pixel est équipée ! (retrouvez-la dans la Collection)');
  });
  $('#px-share').addEventListener('click', async () => {
    if (art.filter(c => c !== '.').length < 20) return toast('Dessinez un peu plus avant de proposer votre création (20 pixels au moins).');
    if (!netEnabled()) return toast('La galerie a besoin d\'Internet.');
    if (!state.net.token) await sync(true);
    state.pixel.art = art.join(''); registerPerso();
    const r = await rpc('pixel_submit', { ...me(), p_art: state.pixel.art }).catch(() => null);
    if (r?.ok) { state.pixel.status = 'pending'; state.pixel.sent = Date.now(); save(); renderStatus(); sfx.unlock(); toast('📤 Création envoyée ! L\'équipe de La Co\'Cotte la validera avant de l\'afficher dans la galerie.', 6000); }
    else toast(r?.error === 'rate' ? 'Attendez 10 minutes entre deux propositions.' : r?.error === 'banned' ? '⛔ Compte exclu des fonctions en ligne.' : '⚠️ Envoi impossible pour le moment.');
  });
}
