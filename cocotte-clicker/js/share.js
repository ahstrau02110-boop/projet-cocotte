// Onglet « Partager » : QR code et lien du jeu pour inviter d'autres joueurs
import { DATA } from './state.js';
import { $, toast } from './core.js';
import { baseUrl, qrSVG, qrDataURL } from './qr.js';

const gameUrl = () => baseUrl(DATA.config);
const MSG = "Viens jouer à Co'Clicker, le jeu de La Co'Cotte (Bohain-en-Vermandois) ! Gratuit, sans compte :";

export function openShare() {
  $('#share-qr').innerHTML = qrSVG(gameUrl(), "QR code du jeu Co'Clicker");
  $('#share-url').textContent = gameUrl();
  $('#btn-share-native').hidden = !navigator.share;
  $('#dlg-share').showModal();
}

export function initShare() {
  $('#btn-share').addEventListener('click', openShare);
  $('#btn-share-native').addEventListener('click', () =>
    navigator.share({ title: "Co'Clicker", text: MSG, url: gameUrl() }).catch(() => {}));
  $('#btn-share-copy').addEventListener('click', () =>
    navigator.clipboard.writeText(gameUrl()).then(() => toast('🔗 Lien du jeu copié.'), () => toast('Copie impossible : sélectionnez le lien à la main.')));
  $('#btn-share-dl').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = qrDataURL(gameUrl(), 10);
    a.download = 'qr-coclicker.gif';
    a.click();
  });
}
