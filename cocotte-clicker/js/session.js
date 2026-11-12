// Une seule session de jeu active à la fois.
//  - Même navigateur : les onglets se signalent via BroadcastChannel ; le dernier ouvert prend la main.
//  - Autres appareils : géré par le serveur (cloud.js, erreur « taken »).
// La session en pause n'enregistre plus rien et propose de reprendre (= recharger la page, qui reprend la main).
import { blockSaves, save } from './save.js';

// Identifiant de session serveur : garde la même valeur au rechargement de l'onglet
export const sid = sessionStorage.getItem('coclicker-sid') || (() => {
  const s = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem('coclicker-sid', s);
  return s;
})();
const tab = Math.random().toString(36).slice(2); // identifiant propre à ce chargement (onglet dupliqué compris)
let paused = false, booted = false;
export const setBooted = () => { booted = true; };

export const isPaused = () => paused;

export function pause(reason) {
  if (paused) return;
  if (booted) save(); // dernière sauvegarde de cette session (jamais un état pas encore chargé)…
  paused = true;
  blockSaves();     // …puis plus aucune écriture
  document.body.classList.add('session-paused');
  const box = document.getElementById('session-lock');
  if (!box) return;
  document.getElementById('session-lock-txt').textContent = reason === 'tab'
    ? 'Co\'Clicker est ouvert dans un autre onglet de ce navigateur. Pour ne pas mélanger les sauvegardes, cette page est en pause.'
    : 'Votre partie est ouverte sur un autre appareil. Pour ne pas mélanger les sauvegardes, cette page est en pause.';
  box.hidden = false;
  document.getElementById('btn-session-here').focus();
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  document.dispatchEvent(new Event('session-paused'));
}

// Au démarrage, avant de lire la sauvegarde : prévient les autres onglets (qui enregistrent puis se mettent en pause)
export function claimLocal() {
  document.getElementById('btn-session-here')?.addEventListener('click', () => location.reload());
  if (!('BroadcastChannel' in window)) return Promise.resolve();
  const ch = new BroadcastChannel('coclicker-session');
  ch.onmessage = e => { if (e.data?.t === 'hello' && e.data.tab !== tab && !paused) pause('tab'); };
  ch.postMessage({ t: 'hello', tab });
  return new Promise(r => setTimeout(r, 200)); // laisse l'autre onglet enregistrer
}
