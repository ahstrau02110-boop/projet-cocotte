// Application : installation (Android, iPhone, ordinateur) et alerte « nouvelle version »
const $ = s => document.querySelector(s);
const ua = navigator.userAgent;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let installEvt = null;

// Navigateur utilisé, pour donner la bonne marche à suivre
function browser() {
  if (/FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|MicroMessenger|; wv\)|GSA\//.test(ua)) return 'inapp';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox/.test(ua) && /Android/.test(ua)) return 'firefox';
  if (/Android/.test(ua)) return 'chrome-android';
  return 'desktop';
}

const STEPS = {
  inapp: ['Cette page est ouverte dans une autre application (lecteur de QR code, réseau social…) : l\'installation y est impossible.',
    'Touchez le menu ⋮ (ou « … ») puis « Ouvrir dans Chrome » / « Ouvrir dans le navigateur ».', 'Puis suivez les étapes d\'installation.'],
  ios: ['Ouvrez la page dans Safari.', 'Touchez le bouton Partager (carré avec une flèche).', 'Choisissez « Sur l\'écran d\'accueil », puis « Ajouter ».'],
  samsung: ['Touchez le menu ≡ en bas à droite.', 'Choisissez « Ajouter la page à » puis « Écran d\'accueil » (ou l\'icône 📲 dans la barre d\'adresse).'],
  firefox: ['Touchez le menu ⋮.', 'Choisissez « Installer » (ou « Ajouter à l\'écran d\'accueil »).'],
  'chrome-android': ['Touchez le menu ⋮ en haut à droite de Chrome.', 'Choisissez « Installer l\'application » (ou « Ajouter à l\'écran d\'accueil » puis « Installer »).', 'L\'icône Co\'Clicker apparaît sur l\'écran d\'accueil.'],
  desktop: ['Dans Chrome ou Edge, cliquez sur l\'icône d\'installation (écran avec une flèche) à droite de la barre d\'adresse.', 'Ou menu ⋮ → « Installer Co\'Clicker ».'],
};

function renderInstall() {
  const box = $('#install-box'); if (!box) return;
  if (standalone) {
    $('#install-txt').textContent = '✅ Co\'Clicker est déjà installé sur cet appareil.';
    $('#btn-install').hidden = true; $('#install-steps').innerHTML = '';
    return;
  }
  $('#btn-install').hidden = !installEvt;
  $('#install-steps').innerHTML = (installEvt ? ['Ou bien :'] : []).concat(STEPS[browser()]).map(t => `<li>${t}</li>`).join('');
}

async function install() {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => {});
  installEvt = null;
  $('#install-banner').hidden = true;
  renderInstall();
}

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvt = e;
  renderInstall();
  // Bandeau discret, une fois par jour au plus
  const last = +localStorage.getItem('coclicker-install-later') || 0;
  if (Date.now() - last > 86400000) $('#install-banner').hidden = false;
});
addEventListener('appinstalled', () => { $('#install-banner').hidden = true; installEvt = null; });

addEventListener('DOMContentLoaded', () => {
  renderInstall();
  $('#btn-install')?.addEventListener('click', install);
  $('#btn-install-banner')?.addEventListener('click', install);
  $('#btn-install-later')?.addEventListener('click', () => { localStorage.setItem('coclicker-install-later', Date.now()); $('#install-banner').hidden = true; });
  $('#btn-update')?.addEventListener('click', () => location.reload());
});
if (document.readyState !== 'loading') renderInstall();

// ---------- Rafraîchissement automatique toutes les 5 min ----------
// Recharge la page (sauvegarde faite par beforeunload) pour récupérer la dernière version,
// mais jamais pendant une partie : on attend qu'aucune fenêtre ne soit ouverte et 10 s sans action.
const AUTO_RELOAD = 5 * 60000, IDLE = 10000;
const bootAt = Date.now();
let lastAct = Date.now();
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true });
setInterval(() => {
  if (Date.now() - bootAt < AUTO_RELOAD || Date.now() - lastAct < IDLE) return;
  if (document.querySelector('dialog[open]') || document.hidden) return;
  location.reload();
}, 5000);

// ---------- Service worker + nouvelle version ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', async () => {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register('sw.js');
      // Le nouveau service worker prend la main : on propose de rafraîchir
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) $('#update-banner').hidden = false;
      });
      // Vérifie les mises à jour au retour sur l'appli et toutes les 5 min
      const check = () => reg?.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      setInterval(check, 5 * 60000);
    } catch { /* hors ligne */ }
  });
}
