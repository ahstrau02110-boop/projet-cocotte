// Service worker : jeu jouable hors connexion et installable (PWA)
// Incrémenter VERSION à chaque mise en ligne pour que les joueurs récupèrent la nouvelle version.
const VERSION = 'coclicker-v13';
const CORE = [
  './',
  'admin.html',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-512.png',
  'assets/img/b-ateliernum.svg',
  'assets/img/b-benevole.svg',
  'assets/img/b-bricolcafe.svg',
  'assets/img/b-brodeuse.svg',
  'assets/img/b-etabli.svg',
  'assets/img/b-evenements.svg',
  'assets/img/b-festival.svg',
  'assets/img/b-graveuse.svg',
  'assets/img/b-imprimante3d.svg',
  'assets/img/b-partenaires.svg',
  'assets/img/b-pc.svg',
  'assets/img/b-rayonnement.svg',
  'assets/img/b-reseau.svg',
  'assets/img/b-tournee.svg',
  'assets/img/cocoin.svg',
  'assets/img/cristal.svg',
  'assets/img/main-clic.svg',
  'assets/img/marmite.svg',
  'assets/logo/logo.jpg',
  'assets/manifest.json',
  'css/style.css',
  'data/achievements.json',
  'data/backgrounds.json',
  'data/buildings.json',
  'data/calendar.json',
  'data/config.json',
  'data/eras.json',
  'data/events.json',
  'data/infos.json',
  'data/overrides.json',
  'data/projects.json',
  'data/quiz.json',
  'data/skins.json',
  'data/talents.json',
  'data/tips.json',
  'data/upgrades.json',
  'index.html',
  'js/admin-content.js',
  'js/admin.js',
  'js/audio.js',
  'js/backgrounds.js',
  'js/boosts.js',
  'js/community.js',
  'js/content.js',
  'js/core.js',
  'js/daily.js',
  'js/decor.js',
  'js/events.js',
  'js/format.js',
  'js/fx.js',
  'js/gacha.js',
  'js/games/bugs.js',
  'js/games/hub.js',
  'js/games/match3.js',
  'js/games/memory.js',
  'js/games/puzzle.js',
  'js/games/simon.js',
  'js/golden.js',
  'js/main.js',
  'js/pdf-planning.js',
  'js/player.js',
  'js/progress.js',
  'js/qr.js',
  'js/save.js',
  'js/scanner.js',
  'js/season.js',
  'js/skins.js',
  'js/state.js',
  'js/tips.js',
  'js/tutorial.js',
  'manifest.webmanifest',
  'js/vendor/qrcode.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Pages et données : réseau d'abord (contenu à jour), cache si hors ligne
  if (req.mode === 'navigate' || url.pathname.endsWith('.json')) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./'))));
    return;
  }
  // Reste (scripts, images, polices) : cache d'abord, mise à jour en arrière-plan
  e.respondWith(caches.match(req).then(cached => {
    const net = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
