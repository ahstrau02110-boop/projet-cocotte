// Côté joueur : QR personnel, pseudo, encaissement des bons de cristaux
import { DATA, state, addCrystals } from './state.js';
import { $, emit, toast } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { baseUrl, qrSVG, qrDataURL, verifyVoucher } from './qr.js';

// Lien encodé dans le QR du joueur : ouvre l'espace équipe avec son code
function playerLink() {
  const n = state.pseudo ? '&n=' + encodeURIComponent(state.pseudo) : '';
  return `${baseUrl(DATA.config)}admin.html#p=${state.playerId}${n}`;
}

function renderQR() {
  $('#my-qr').innerHTML = qrSVG(playerLink(), 'Mon QR code joueur');
  $('#my-id').textContent = state.playerId;
  $('#pseudo').value = state.pseudo;
}

export function openMyQR() {
  renderQR();
  $('#claim-code').value = '';
  $('#dlg-qr').showModal();
}

// Vérifie et encaisse un bon signé par l'équipe
export async function claim(token) {
  const R = DATA.config.rewards || {};
  const pub = DATA.config.adminPublicKey;
  if (!pub) { toast("Les récompenses par QR code ne sont pas encore activées sur ce jeu."); return; }
  let v;
  try { v = await verifyVoucher(token, pub); }
  catch { sfx.deny(); toast('Code de récompense invalide.'); return; }
  if (v.playerId !== state.playerId) {
    sfx.deny();
    toast(`Ce code est destiné au joueur ${v.playerId}, pas à cette partie (${state.playerId}).`, 7000);
    return;
  }
  if (state.claimed.includes(v.nonce)) { toast('Ce code a déjà été utilisé.'); return; }
  if (Date.now() - v.ts > (R.voucherDays ?? 7) * 86400e3) { toast('Ce code a expiré. Demandez-en un nouveau à l\'équipe.'); return; }
  const amount = Math.min(Math.max(0, v.amount | 0), R.qrMax ?? 1000);
  addCrystals(amount);
  state.claimed.push(v.nonce);
  save();
  emit('refresh');
  sfx.unlock();
  toast(`Merci de votre visite à La Co'Cotte ! +${amount} 💎 cristaux`, 7000);
  if ($('#dlg-qr').open) $('#dlg-qr').close();
}

// Bon arrivé par lien (QR scanné avec l'appareil photo) : index.html#claim=...
function checkHash() {
  const m = location.hash.match(/^#claim=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  claim(decodeURIComponent(m[1]));
}

export function initPlayer() {
  $('#pseudo').addEventListener('change', e => {
    // Pseudo libre, court, sans données personnelles
    state.pseudo = e.target.value.replace(/[^\p{L}\p{N} _'-]/gu, '').trim().slice(0, 20);
    e.target.value = state.pseudo;
    save();
    renderQR();
  });
  $('#btn-claim').addEventListener('click', () => {
    let v = $('#claim-code').value.trim();
    const m = v.match(/#claim=(.+)$/);
    if (m) v = decodeURIComponent(m[1]);
    if (v) claim(v);
  });
  $('#btn-qr-dl').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = qrDataURL(playerLink(), 8);
    a.download = `qr-cocotte-${state.playerId}.gif`;
    a.click();
  });
  addEventListener('hashchange', checkHash);
  checkHash();
}
