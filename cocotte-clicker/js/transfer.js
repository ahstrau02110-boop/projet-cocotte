// Changer d'appareil : la partie est déposée sur le serveur sous un code court (10 min, usage unique),
// le nouvel appareil la récupère en scannant le QR code ou en tapant le code.
import { DATA, state } from './state.js';
import { $, toast } from './core.js';
import { save, exportSave, importSave } from './save.js';
import { baseUrl, qrSVG } from './qr.js';
import { rpc, netEnabled } from './community.js';
import { markUnrecognized } from './cloud.js';

const fmtCode = c => c.slice(0, 4) + '-' + c.slice(4);
let timer = null;

function resetSend() {
  clearInterval(timer);
  $('#tr-send-box').hidden = true;
  $('#btn-tr-send').hidden = false;
}

export function openTransfer() {
  resetSend();
  $('#tr-code').value = '';
  $('#tr-offline').hidden = netEnabled();
  $('#dlg-transfer').showModal();
}

// Ancien appareil : dépose la partie et affiche le QR
async function send() {
  const btn = $('#btn-tr-send');
  btn.disabled = true;
  try {
    save();
    const r = await rpc('create_transfer', { p_id: state.playerId, p_token: state.net.token, p_data: exportSave() });
    if (r?.error === 'auth') {
      // Appareil non reconnu : on ouvre directement la réparation dans les Options
      markUnrecognized();
      $('#dlg-transfer').close();
      $('#dlg-options').showModal();
      $('#cloud-repair').scrollIntoView({ block: 'center' });
      return;
    }
    if (!r?.ok) throw new Error(r?.error || 'ko');
    const link = `${baseUrl(DATA.config)}#transfer=${r.code}`;
    $('#tr-qr').innerHTML = qrSVG(link, 'QR code de transfert de la partie');
    $('#tr-show-code').textContent = fmtCode(r.code);
    $('#tr-send-box').hidden = false;
    btn.hidden = true;
    // Compte à rebours jusqu'à l'expiration
    const end = Date.now() + 10 * 60000;
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      $('#tr-timer').textContent = s ? `Valable encore ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : 'Code expiré : créez-en un nouveau.';
      if (!s) { clearInterval(timer); $('#tr-qr').innerHTML = ''; $('#btn-tr-send').hidden = false; }
    };
    clearInterval(timer); tick(); timer = setInterval(tick, 1000);
  } catch (e) {
    toast(e.message === 'auth' ? 'Transfert refusé : cette partie n\'est pas reconnue par le serveur.' : 'Transfert impossible : vérifiez la connexion Internet.');
  } finally { btn.disabled = false; }
}

// Nouvel appareil : récupère la partie (après confirmation, car le code ne sert qu'une fois)
export async function takeTransfer(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) { toast('Le code de transfert fait 8 caractères (ex. ABCD-EF23).'); return; }
  if (!netEnabled()) { toast('Transfert indisponible : pas de connexion au serveur.'); return; }
  if (!confirm('Récupérer la partie transférée ?\n\nLa partie actuelle de CET appareil sera remplacée.')) return;
  try {
    const r = await rpc('take_transfer', { p_code: code });
    if (!r?.ok) { toast('Code inconnu, déjà utilisé ou expiré (10 min). Créez-en un nouveau sur l\'autre appareil.', 7000); return; }
    importSave(r.data);
    save();
    sessionStorage.setItem('coclicker-transfer-ok', '1');
    location.replace(location.pathname + location.search); // recharge sans le #transfer
  } catch { toast('Transfert impossible : vérifiez la connexion Internet.'); }
}

export function initTransfer() {
  $('#btn-transfer').addEventListener('click', () => { $('#dlg-options')?.close(); openTransfer(); });
  $('#btn-transfer2')?.addEventListener('click', () => { $('#dlg-qr').close(); openTransfer(); });
  $('#btn-tr-send').addEventListener('click', send);
  $('#btn-tr-take').addEventListener('click', () => takeTransfer($('#tr-code').value));
  $('#tr-code').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); takeTransfer($('#tr-code').value); } });
  $('#dlg-transfer').addEventListener('close', () => clearInterval(timer));
  if (sessionStorage.getItem('coclicker-transfer-ok')) {
    sessionStorage.removeItem('coclicker-transfer-ok');
    setTimeout(() => toast('✅ Partie récupérée ! Bon jeu sur ce nouvel appareil.', 6000), 800);
  }
}
