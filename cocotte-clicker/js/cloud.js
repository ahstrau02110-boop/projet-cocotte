// Sauvegarde en ligne automatique : la partie suit le joueur sur tous ses appareils liés
// (même code joueur + jeton, partagés par le QR « Changer d'appareil » ou par le code de secours).
//  - envoi toutes les minutes quand le jeu est affiché, et quand on le quitte ;
//  - à l'ouverture / au retour sur le jeu : reprise de la version du serveur si elle est plus récente ;
//  - conflit (deux appareils ont joué chacun de leur côté) : le serveur garde la partie la plus avancée.
import { state } from './state.js';
import { $, toast } from './core.js';
import { save, exportSave, importSave } from './save.js';
import { rpc, netEnabled, sync } from './community.js';

const PUSH_EVERY = 60000;
const FLAG = 'coclicker-cloud-msg';
// pulled : la version du serveur a été vérifiée depuis l'ouverture / le retour sur le jeu (obligatoire avant d'envoyer)
let busy = false, pulled = false, failures = 0, lastError = '';

const me = () => ({ p_id: state.playerId, p_token: state.net.token });
const progress = () => state.prestige.lifetime;
const active = () => netEnabled() && state.cloud.on;

// Remplace la partie de cet appareil par celle du serveur, puis recharge le jeu
function adopt(data, rev, msg, extra) {
  importSave(data);
  if (extra) extra();
  state.cloud.rev = rev;
  state.cloud.last = Date.now();
  save();
  sessionStorage.setItem(FLAG, msg);
  location.replace(location.pathname + location.search);
}

function fail(err) {
  failures++;
  lastError = err;
  // Jamais synchronisé : le joueur n'est pas encore inscrit au serveur → inscription
  if (err === 'auth' && !state.net.lastSync) sync();
  renderStatus();
}

// Récupère la version du serveur si elle est plus récente
export async function pull() {
  if (!active() || busy || document.querySelector('dialog[open]')) return;
  busy = true;
  try {
    const r = await rpc('cloud_get', { ...me(), p_rev: state.cloud.rev });
    if (!r?.ok) return fail(r?.error || 'ko');
    failures = 0; lastError = '';
    if (r.newer) return adopt(r.data, r.rev, '☁️ Partie synchronisée avec votre autre appareil.');
    pulled = true;
  } catch { fail('net'); } finally { busy = false; }
}

// Envoie la partie
export async function push(force = false) {
  if (!active() || busy || !pulled) return;
  if (!force && (document.hidden || Date.now() - state.cloud.last < PUSH_EVERY - 2000)) return;
  busy = true;
  try {
    const r = await rpc('cloud_put', { ...me(), p_data: exportSave(), p_progress: progress(), p_base_rev: state.cloud.rev });
    if (r?.ok) {
      state.cloud.rev = r.rev; state.cloud.last = Date.now(); save();
      failures = 0; lastError = '';
    } else if (r?.error === 'newer') {
      // Un autre appareil est plus avancé : on reprend sa partie (la nôtre est gardée 7 jours sur le serveur)
      if (!document.querySelector('dialog[open]')) adopt(r.data, r.rev, '☁️ Votre autre appareil était plus avancé : sa partie a été reprise.');
    } else fail(r?.error || 'ko');
  } catch { fail('net'); } finally { busy = false; renderStatus(); }
}

// ---------- Code de secours ----------
async function newRecovery() {
  if (state.cloud.recovery && !confirm('Créer un nouveau code de secours ?\nL\'ancien code ne fonctionnera plus.')) return;
  try {
    if (pulled) await push(true);
    const r = await rpc('cloud_new_recovery', me());
    if (!r?.ok) throw new Error(r?.error);
    state.cloud.recovery = true; save();
    const c = r.code;
    $('#cloud-code').textContent = `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
    $('#cloud-code-box').hidden = false;
    renderStatus();
  } catch { toast('Impossible de créer le code de secours : vérifiez la connexion Internet.'); }
}

async function recover() {
  const code = $('#cloud-rec-input').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 12) return toast('Le code de secours fait 12 caractères (ex. ABCD-EFGH-JK23).');
  if (!netEnabled()) return toast('Récupération indisponible : pas de connexion au serveur.');
  if (!confirm('Récupérer la partie liée à ce code de secours ?\n\nLa partie actuelle de CET appareil sera remplacée, et les autres appareils de ce joueur devront être reliés de nouveau.')) return;
  try {
    const r = await rpc('cloud_recover', { p_code: code });
    if (!r?.ok) return toast(r?.error === 'nosave' ? 'Aucune sauvegarde en ligne pour ce code.' : 'Code de secours inconnu.', 6000);
    adopt(r.data, r.rev, '✅ Partie récupérée grâce au code de secours !', () => {
      state.playerId = r.id;
      state.net.token = r.token; // nouveau jeton : les anciens appareils sont déconnectés
      state.cloud.on = true;
      state.cloud.recovery = true;
    });
  } catch { toast('Récupération impossible : vérifiez la connexion Internet.'); }
}

// ---------- Options ----------
export function renderStatus() {
  const el = $('#cloud-status'); if (!el) return;
  $('#cloud-on').checked = state.cloud.on;
  let txt;
  if (!netEnabled()) txt = '⚠️ Indisponible : pas de serveur configuré.';
  else if (!state.cloud.on) txt = '⏸️ Désactivée : la partie reste sur cet appareil uniquement.';
  else if (lastError === 'auth' && state.net.lastSync && failures > 1) txt = '⚠️ Cet appareil n\'est plus relié : la partie a été récupérée ailleurs avec le code de secours.';
  else if (lastError === 'net') txt = '📡 Hors connexion : la partie sera envoyée dès le retour d\'Internet.';
  else if (state.cloud.last) txt = `✅ Sauvegardée en ligne le ${new Date(state.cloud.last).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.`;
  else txt = '⏳ Première sauvegarde en ligne dans un instant…';
  el.textContent = txt;
  $('#cloud-rec-txt').textContent = state.cloud.recovery
    ? 'Vous avez déjà un code de secours. En créer un nouveau annule l\'ancien.'
    : 'Notez ce code : il permet de retrouver votre partie si vous perdez cet appareil.';
}

export function initCloud() {
  $('#cloud-on').addEventListener('change', e => { state.cloud.on = e.target.checked; save(); renderStatus(); pulled = false; });
  $('#btn-cloud-code').addEventListener('click', newRecovery);
  $('#btn-cloud-recover').addEventListener('click', recover);
  $('#cloud-rec-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); recover(); } });
  $('#btn-options')?.addEventListener('click', () => { $('#cloud-code-box').hidden = true; renderStatus(); });
  const msg = sessionStorage.getItem(FLAG);
  if (msg) { sessionStorage.removeItem(FLAG); setTimeout(() => toast(msg, 6000), 900); }
  renderStatus();
  if (!netEnabled()) return;
  // Laisse le temps à la synchro communautaire d'inscrire le joueur, puis récupère / envoie
  // (si une fenêtre est ouverte, la vérification est retentée toutes les 15 s)
  const tick = async () => { if (!pulled) { await pull(); if (pulled) push(true); } else push(); };
  setTimeout(tick, 5000);
  setInterval(tick, 15000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) push(true); else { pulled = false; tick(); } });
}
