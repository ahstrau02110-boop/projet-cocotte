// Écran d'accueil : compteur collectif, défi, boss, classement et galerie, rafraîchis toutes les minutes
import { DATA } from './state.js';
import { fmt } from './format.js';
import { esc } from './core.js';
import { qrSVG, baseUrl } from './qr.js';
import { skinImage, skinById } from './skins.js';
import { bgById, bgCSS } from './backgrounds.js';

const $ = s => document.querySelector(s);
const METRICS = { games: 'mini-jeux terminés', golden: 'Cocottes dorées', missions: 'missions réussies', clicks: 'clics' };

async function rpc(name, body = {}) {
  const c = DATA.config.community;
  const r = await fetch(`${c.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, { method: 'POST',
    headers: { apikey: c.anonKey, 'Content-Type': 'application/json', ...(c.anonKey.startsWith('eyJ') ? { Authorization: `Bearer ${c.anonKey}` } : {}) },
    body: JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function refresh() {
  try {
    const [st, live, board, gal] = await Promise.all([rpc('community_stats'), rpc('get_live'), rpc('leaderboard', { p_limit: 8 }), rpc('gallery_list', { p_limit: 12 })]);
    $('#ec-total').textContent = fmt(st.total) + " Co'Coins";
    $('#ec-players').textContent = `produits par ${fmt(st.players)} joueur${st.players > 1 ? 's' : ''}`;
    $('#ec-announce').hidden = !live.announcement;
    if (live.announcement) $('#ec-announce-txt').textContent = live.announcement.text;
    $('#ec-boss-card').hidden = !live.boss;
    if (live.boss) {
      $('#ec-boss').textContent = live.boss.defeated ? `${live.boss.name} : vaincu par ${live.boss.players} joueurs !` : `${live.boss.name} : ${fmt(live.boss.hp)} PV restants`;
      $('#ec-boss-bar').style.width = live.boss.hp / live.boss.hp_max * 100 + '%';
    }
    $('#ec-board').innerHTML = board.map(r => `<li><span>${r.rank}</span><b>${esc(r.pseudo)}</b><span>${fmt(r.lifetime)}</span></li>`).join('');
    $('#ec-gallery').innerHTML = gal.map(g => {
      const b = g.bg !== 'auto' && bgById(g.bg), sk = skinById(g.skin);
      return `<li class="gal"><span class="gal-pic" style="background:${b ? bgCSS(b) : '#d8b384'}"><img src="${skinImage(sk.id)}" alt=""></span>
        <span class="gal-txt"><b>${esc(g.pseudo)}</b><small>❤️ ${g.likes}</small></span></li>`;
    }).join('');
    try {
      const w = await rpc('weekly_challenge');
      $('#ec-weekly').textContent = `${fmt(w.total)} / ${fmt(w.target)} ${METRICS[w.metric] || ''}${w.done ? ' ✅' : ''}`;
      $('#ec-weekly-bar').style.width = Math.min(100, w.total / w.target * 100) + '%';
    } catch { /* fonctions en ligne non installées */ }
  } catch (err) { console.warn(err); $('#ec-players').textContent = 'Connexion au serveur impossible.'; }
}

async function boot() {
  const load = u => fetch(u, { cache: 'no-cache' }).then(r => r.json());
  const [config, manifest, skins, bgs] = await Promise.all([load('data/config.json'), load('assets/manifest.json'), load('data/skins.json'), load('data/backgrounds.json')]);
  Object.assign(DATA, { config, manifest, skins: skins.skins, rarities: skins.rarities, backgrounds: bgs.backgrounds });
  $('#ec-qr').innerHTML = qrSVG(baseUrl(config), 'Jouer à Co\'Clicker') + '<small>Scannez pour jouer !</small>';
  refresh();
  setInterval(refresh, 60000);
}
boot();
