// Co'Survivor : jeu à part (genre « survivor »). La Cocotte défend le FabLab contre des vagues de pannes.
// Le joueur ne fait que se déplacer ; les armes tirent toutes seules. 15 minutes pour gagner.
// Progression propre (Boulons 🔩 et améliorations permanentes) dans state.surv : n'influence pas le clicker.
// Classement en ligne : le serveur ouvre et ferme chaque partie avec son horloge (supabase/survivor.sql).
import { state, addCrystals } from './state.js';
import { $, toast, esc, today } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { skinImage } from './skins.js';
import { rpc, netEnabled, sync } from './community.js';

const WIN = 900;            // secondes pour gagner
const MAX_FOES = 380;
const CRYST_DAY = 25;       // cristaux max par jour gagnés dans Co'Survivor
const me = () => ({ p_id: state.playerId, p_token: state.net.token });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------- Contenu ----------
// Armes : valeurs par niveau (1 à 5)
const WEAPONS = {
  laser:   { icon: '🔴', name: 'Graveuse laser', desc: 'Tire sur la panne la plus proche.',
             cd: [0.6, 0.55, 0.5, 0.45, 0.4], dmg: [10, 13, 16, 20, 25], n: [1, 2, 2, 3, 4], pierce: [1, 2, 2, 3, 4] },
  buses:   { icon: '🟠', name: 'Buses 3D', desc: 'Des buses brûlantes tournent autour de vous.',
             n: [1, 2, 3, 3, 4], dmg: [8, 10, 12, 15, 18], r: [70, 75, 80, 85, 95] },
  soudure: { icon: '🔥', name: 'Fer à souder', desc: 'Brûle tout ce qui s\'approche.',
             r: [55, 65, 75, 85, 100], dmg: [4, 5, 6, 8, 10] },
  tourelle:{ icon: '🖨️', name: 'Imprimante-tourelle', desc: 'Pose une tourelle qui tire toute seule.',
             cd: [6, 5.5, 5, 4.5, 4], fire: [0.6, 0.5, 0.5, 0.4, 0.35], dmg: [8, 10, 12, 14, 16], max: [1, 1, 2, 2, 3] },
  wifi:    { icon: '📶', name: 'Onde Wi-Fi', desc: 'Une onde repousse et blesse les pannes autour.',
             cd: [3, 2.8, 2.5, 2.2, 2], r: [140, 160, 180, 200, 230], dmg: [14, 18, 22, 28, 35] },
  scie:    { icon: '⚙️', name: 'Scie circulaire', desc: 'Lance des lames qui traversent tout.',
             cd: [1.6, 1.5, 1.4, 1.2, 1], n: [1, 1, 2, 2, 3], dmg: [20, 25, 30, 36, 44] },
};
const PASSIVES = {
  pv:     { icon: '❤️', name: 'Coque renforcée', desc: '+20 PV max (et soigne 20 PV).' },
  vit:    { icon: '👟', name: 'Roulettes', desc: '+10 % de vitesse.' },
  aimant: { icon: '🧲', name: 'Aimant', desc: '+35 % de portée de ramassage.' },
  degats: { icon: '🔧', name: 'Outils affûtés', desc: '+10 % de dégâts.' },
  cadence:{ icon: '⏱️', name: 'Overclock', desc: 'Armes 8 % plus rapides.' },
  zone:   { icon: '📐', name: 'Grand format', desc: '+10 % de zone d\'effet.' },
  cafe:   { icon: '☕', name: 'Café du Bricol\'Café', desc: 'Récupère 0,5 PV par seconde.' },
};
// Évolutions : outil au niveau 5 + bonus associé, puis ouvrir un coffre (boss ou panne d'élite)
const EVOS = {
  laser:   { need: 'cadence', icon: '💥', name: 'Laser CO₂', desc: '+2 rayons qui traversent tout, dégâts ×1,5.' },
  buses:   { need: 'zone', icon: '🌞', name: 'Tête multi-buses', desc: '8 grosses buses, dégâts ×1,6.' },
  soudure: { need: 'pv', icon: '🌋', name: 'Poste à souder', desc: 'Zone ×1,4, dégâts ×2, soigne en brûlant.' },
  tourelle:{ need: 'degats', icon: '🏭', name: 'Ferme d\'impression', desc: '5 tourelles qui tirent deux fois plus vite.' },
  wifi:    { need: 'aimant', icon: '🛰️', name: 'Fibre optique', desc: 'Onde toutes les 1,2 s, dégâts ×1,8, attire les gemmes.' },
  scie:    { need: 'vit', icon: '🌪️', name: 'Scie à ruban', desc: '6 lames qui durent plus longtemps, dégâts ×1,6.' },
};
// Surchauffe : difficulté 0 à 5, débloquée en gagnant au niveau précédent
const HEAT_MAX = 5;
const heatOf = h => ({ hp: 1 + 0.3 * h, sp: 1 + 0.05 * h, spawn: 1 + 0.15 * h, dmg: 1 + 0.1 * h, bolts: 1 + 0.25 * h });
const TOOL_COST = 150; // débloquer un outil de départ
// Améliorations permanentes (Boulons)
const META = [
  { id: 'pv', icon: '❤️', name: 'Blindage', desc: '+10 PV max', max: 5, base: 30 },
  { id: 'dmg', icon: '🔧', name: 'Caisse à outils', desc: '+6 % de dégâts', max: 5, base: 40 },
  { id: 'spd', icon: '👟', name: 'Baskets', desc: '+4 % de vitesse', max: 5, base: 30 },
  { id: 'mag', icon: '🧲', name: 'Gros aimant', desc: '+15 % de portée de ramassage', max: 5, base: 25 },
  { id: 'xp', icon: '📚', name: 'Tutos vidéo', desc: '+8 % d\'expérience', max: 5, base: 40 },
  { id: 'bolt', icon: '🔩', name: 'Récup', desc: '+10 % de Boulons', max: 5, base: 50 },
  { id: 'reroll', icon: '🎲', name: 'Relance', desc: '+1 relance des choix par partie', max: 3, base: 60 },
  { id: 'revive', icon: '🪄', name: 'Seconde chance', desc: 'Repartir une fois à 50 % de PV', max: 1, base: 250 },
];
const metaCost = m => Math.round(m.base * Math.pow((state.surv.up[m.id] || 0) + 1, 1.6) / 5) * 5;
const meta = id => state.surv.up[id] || 0;

// Pannes : apparaissent à partir de « from » secondes
const FOES = [
  { e: '🐛', hp: 8, sp: 62, dmg: 6, xp: 1, r: 13, from: 0 },
  { e: '🦠', hp: 14, sp: 72, dmg: 8, xp: 1, r: 13, from: 45 },
  { e: '👾', hp: 18, sp: 118, dmg: 7, xp: 2, r: 13, from: 120 },
  { e: '🔌', hp: 30, sp: 46, dmg: 12, xp: 3, r: 15, from: 180 },
  { e: '📡', hp: 40, sp: 55, dmg: 8, xp: 4, r: 15, from: 240, ai: 'shoot' },   // garde ses distances et tire
  { e: '💾', hp: 50, sp: 58, dmg: 12, xp: 3, r: 15, from: 300 },
  { e: '🔋', hp: 35, sp: 50, dmg: 14, xp: 3, r: 14, from: 360, ai: 'charge' },  // se prépare puis fonce
  { e: '🤖', hp: 110, sp: 52, dmg: 18, xp: 6, r: 18, from: 420 },
  { e: '📦', hp: 90, sp: 48, dmg: 12, xp: 4, r: 16, from: 540, ai: 'split' },   // libère 3 bugs en cassant
];
const BUG = FOES[0];
const BOSSES = [
  { at: 300, e: '🖨️', name: 'Imprimante folle', hp: 2500 },
  { at: 600, e: '🌀', name: 'Le Grand Bug', hp: 7000 },
  { at: 840, e: '☢️', name: 'Méga-Virus', hp: 15000 },
];
const SWARMS = [150, 450, 750]; // encerclements

// ---------- Rendu : cache d'émojis ----------
const sprites = new Map();
function sprite(ch, px) {
  const k = ch + px;
  if (!sprites.has(k)) {
    const c = document.createElement('canvas'), s = Math.ceil(px * 1.25);
    c.width = c.height = s;
    const x = c.getContext('2d');
    x.font = `${px}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(ch, s / 2, s / 2 + px * 0.06);
    sprites.set(k, c);
  }
  return sprites.get(k);
}

// ---------- Partie ----------
let cv, ctx, W = 0, H = 0, Z = 1, run = null, raf = 0, last = 0, keys = new Set(), stick = null, board = null, retried = false;

function stats() {
  const p = id => run.p[id] || 0;
  run.st = {
    dmg: (1 + 0.1 * p('degats')) * (1 + 0.06 * meta('dmg')),
    cd: Math.pow(0.92, p('cadence')),
    area: 1 + 0.1 * p('zone'),
    speed: 165 * (1 + 0.1 * p('vit')) * (1 + 0.04 * meta('spd')),
    magnet: 70 * (1 + 0.35 * p('aimant')) * (1 + 0.15 * meta('mag')),
    xp: 1 + 0.08 * meta('xp'),
    regen: 0.5 * p('cafe'),
  };
  run.maxHp = 100 + 10 * meta('pv') + 20 * p('pv');
}

function newRun() {
  const S = state.surv, heat = clamp(S.heat || 0, 0, Math.min(HEAT_MAX, S.heatMax || 0)), tool = (S.tools || []).includes(S.tool) && WEAPONS[S.tool] ? S.tool : 'laser';
  run = {
    heat, H: heatOf(heat), evo: {}, nextElite: 90, eb: [], dashCd: 0, dashT: 0, dx: 0, dy: 0,
    t: 0, x: 0, y: 0, hp: 0, maxHp: 100, inv: 0, lvl: 1, xp: 0, kills: 0, bossKills: 0,
    w: { [tool]: 1 }, p: {}, wt: {}, foes: [], shots: [], gems: [], rings: [], turrets: [], items: [],
    orbA: 0, auraT: 0, spawnAcc: 0, bossDone: 0, swarmDone: 0, paused: false, over: false,
    rerolls: meta('reroll'), revive: meta('revive') > 0, faceX: 1, faceY: 0, boss: null, runId: null, sndT: 0,
  };
  stats();
  run.hp = run.maxHp;
}
const need = l => Math.floor(4 + l * 2.5 + Math.pow(l, 1.45));

// Grille spatiale (requêtes de proximité rapides)
const CELL = 64;
let grid = new Map();
function buildGrid() {
  grid = new Map();
  for (const e of run.foes) {
    const k = Math.floor(e.x / CELL) * 73856093 ^ Math.floor(e.y / CELL) * 19349663;
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(e);
  }
}
function near(x, y, r, fn) {
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
    const a = grid.get(i * 73856093 ^ j * 19349663); if (!a) continue;
    for (const e of a) if (!e.dead) { const dx = e.x - x, dy = e.y - y, rr = r + e.r; if (dx * dx + dy * dy < rr * rr) fn(e, dx, dy); }
  }
}
function nearest(x, y, max = 1e9) {
  let best = null, bd = max * max;
  for (const e of run.foes) { if (e.dead) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}

function hit(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg * run.st.dmg; e.flash = 0.08;
  if (e.hp <= 0) kill(e);
}
function kill(e) {
  e.dead = true; run.kills++;
  if (e.ai === 'split') for (let i = 0; i < 3; i++) spawn(BUG, null, null, e.x + (i - 1) * 14, e.y + (i % 2) * 10);
  if (e.elite) { run.items.push({ x: e.x, y: e.y, k: 'coffre' }); run.gems.push({ x: e.x, y: e.y, v: e.xp * 5 }); }
  if (e.boss) {
    run.bossKills++; run.boss = null;
    run.gems.push({ x: e.x, y: e.y, v: 60 });
    run.items.push({ x: e.x + 30, y: e.y, k: 'coffre' });
    toast(`💥 ${e.name} vaincu !`, 3000);
    sfx.unlock();
  } else {
    run.gems.push({ x: e.x + (Math.random() - 0.5) * 6, y: e.y + (Math.random() - 0.5) * 6, v: e.xp });
    const r = Math.random();
    if (r < 0.008) run.items.push({ x: e.x, y: e.y, k: 'cafe' });
    else if (r < 0.011) run.items.push({ x: e.x, y: e.y, k: 'aimant' });
    if (run.t - run.sndT > 0.09) { run.sndT = run.t; sfx.pop(); }
  }
  // Limite le nombre de gemmes : les plus vieilles fusionnent
  if (run.gems.length > 450) { const g = run.gems.shift(); run.gems[0].v += g.v; }
}

function spawn(type, ang, dist, px, py) {
  const a = ang ?? Math.random() * Math.PI * 2, d = dist ?? (Math.hypot(W, H) / 2 / Z + 50), Hh = run.H;
  const k = (1 + run.t / 200) * Hh.hp, ks = (1 + run.t / 1500) * Hh.sp; // plus solides et plus rapides avec le temps (et la Surchauffe)
  const e = { ...type, sp: type.sp * ks, dmg: type.dmg * Hh.dmg, x: px ?? run.x + Math.cos(a) * d, y: py ?? run.y + Math.sin(a) * d, hp: type.hp * k, max: type.hp * k, flash: 0, ot: 0, at: Math.random() * 2, cs: 0 };
  // Panne d'élite : très solide, lâche un coffre
  if (px === undefined && run.t >= run.nextElite) { run.nextElite += 60; e.elite = true; e.hp = e.max = e.hp * 8; e.r *= 1.5; e.dmg *= 1.5; e.sp *= 0.9; }
  run.foes.push(e);
}
function spawnBoss(b) {
  const a = Math.random() * Math.PI * 2, d = Math.hypot(W, H) / 2 / Z + 60;
  const e = { e: b.e, name: b.name, boss: true, hp: b.hp * run.H.hp, max: b.hp * run.H.hp, sp: 85, dmg: 25 * run.H.dmg, xp: 0, r: 34, at: 2, st: 5, lvl: run.bossDone, x: run.x + Math.cos(a) * d, y: run.y + Math.sin(a) * d, flash: 0, ot: 0 };
  run.foes.push(e); run.boss = e;
  toast(`⚠️ Boss : ${b.name} !`, 3000);
}

function shootAt(x, y, a, sp = 170, dmg = 10) { run.eb.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 4, dmg: dmg * run.H.dmg }); }

function hurt(dmg) {
  const R = run;
  if (R.inv > 0) return false;
  R.hp -= dmg; R.inv = 0.5; sfx.hit();
  if (R.hp <= 0) {
    if (R.revive) { R.revive = false; R.hp = R.maxHp / 2; R.inv = 2; R.eb = []; R.rings.push({ x: R.x, y: R.y, R: 260, dmg: 60, age: 0, hit: new Set() }); toast('🪄 Seconde chance !', 2500); }
    else { end(false); return true; }
  }
  return false;
}

// Esquive : courte ruée invulnérable
function dash() {
  const R = run;
  if (!R || R.over || R.paused || R.choosing || R.dashCd > 0) return;
  R.dashT = 0.18; R.dashCd = 3.5; R.inv = Math.max(R.inv, 0.3); R.dx = R.faceX; R.dy = R.faceY;
  sfx.flip?.();
}

// Coffre : fait évoluer un outil si possible, sinon 1 à 3 améliorations
function openChest() {
  const R = run;
  const ev = Object.keys(EVOS).find(id => R.w[id] === 5 && R.p[EVOS[id].need] && !R.evo[id]);
  if (ev) { R.evo[ev] = true; sfx.unlock(); toast(`✨ Évolution : ${EVOS[ev].icon} ${EVOS[ev].name} ! ${EVOS[ev].desc}`, 5000); return; }
  const n = 1 + (Math.random() < 0.35) + (Math.random() < 0.12), got = [];
  for (let i = 0; i < n; i++) {
    // Améliore un outil ou un bonus déjà possédé
    const ups = [...Object.keys(R.w).filter(id => R.w[id] < 5).map(id => [R.w, WEAPONS, id]), ...Object.keys(R.p).filter(id => R.p[id] < 5).map(id => [R.p, PASSIVES, id])];
    if (!ups.length) { R.bonusBolts = (R.bonusBolts || 0) + 25; got.push('🔩 +25'); continue; }
    const [obj, def, id] = pick(ups); obj[id]++; if (id === 'pv' && obj === R.p) R.hp += 20; got.push(def[id].icon);
  }
  stats(); sfx.unlock();
  toast(`🎁 Coffre : ${got.join(' ')}`, 3000);
}

// ---------- Mise à jour ----------
function update(dt) {
  const R = run, st = R.st;
  R.t += dt;
  if (R.t >= WIN) return end(true);

  // Déplacement (clavier ou joystick)
  let mx = 0, my = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (stick?.dx || stick?.dy) { mx = stick.dx; my = stick.dy; }
  const ml = Math.hypot(mx, my);
  if (ml > 0) { const s = Math.min(1, ml) / ml; mx *= s; my *= s; R.faceX = mx; R.faceY = my; R.x += mx * st.speed * dt; R.y += my * st.speed * dt; }
  if (R.dashT > 0) { R.dashT -= dt; R.x += R.dx * 700 * dt; R.y += R.dy * 700 * dt; }
  if (R.dashCd > 0) R.dashCd -= dt;

  // Apparitions
  R.spawnAcc += (0.9 + R.t / 60) * R.H.spawn * dt;
  const pool = FOES.filter(f => R.t >= f.from);
  while (R.spawnAcc >= 1) {
    R.spawnAcc--;
    if (R.foes.length < MAX_FOES) spawn(Math.random() < 0.7 ? pick(pool.slice(-4)) : pick(pool)); // surtout les types récents
  }
  if (R.swarmDone < SWARMS.length && R.t >= SWARMS[R.swarmDone]) {
    R.swarmDone++;
    const type = pool[Math.max(0, pool.length - 2)];
    for (let i = 0; i < 40; i++) spawn(type, i / 40 * Math.PI * 2, 380);
    toast('🌀 Encerclement !', 2000);
  }
  if (R.bossDone < BOSSES.length && R.t >= BOSSES[R.bossDone].at) spawnBoss(BOSSES[R.bossDone++]);

  // Pannes : poursuite + séparation + contact
  buildGrid();
  const far = Math.hypot(W, H) / Z + 300;
  for (const e of R.foes) {
    if (e.dead) continue;
    let dx = R.x - e.x, dy = R.y - e.y; const d = Math.hypot(dx, dy) || 1;
    if (d > far && !e.boss) { const a = Math.atan2(R.faceY, R.faceX) + (Math.random() - 0.5); e.x = R.x + Math.cos(a) * far * 0.5; e.y = R.y + Math.sin(a) * far * 0.5; continue; }
    if (e.ai === 'shoot') {
      // Garde ses distances et tire
      const k = d > 240 ? 1 : d < 180 ? -0.6 : 0;
      e.x += dx / d * e.sp * k * dt; e.y += dy / d * e.sp * k * dt;
      if ((e.at -= dt) <= 0 && d < 420) { e.at = 2.6; shootAt(e.x, e.y, Math.atan2(dy, dx)); }
    } else if (e.ai === 'charge') {
      // Prépare (0,6 s, clignote) puis fonce en ligne droite
      if (e.cs > 0) { e.cs -= dt; if (e.cs <= 0) { e.dash = 0.55; } }
      else if (e.dash > 0) { e.dash -= dt; e.x += e.cx * 430 * dt; e.y += e.cy * 430 * dt; if (e.dash <= 0) e.at = 2.5; }
      else { e.x += dx / d * e.sp * dt; e.y += dy / d * e.sp * dt; if ((e.at -= dt) <= 0 && d < 280) { e.cs = 0.6; e.cx = dx / d; e.cy = dy / d; } }
    } else { e.x += dx / d * e.sp * dt; e.y += dy / d * e.sp * dt; }
    if (e.boss) {
      // Boss : salves en cercle et renforts
      if ((e.at -= dt) <= 0) { e.at = 4 - e.lvl * 0.6; const n = 8 + e.lvl * 4, o = Math.random(); for (let i = 0; i < n; i++) shootAt(e.x, e.y, (i + o) / n * Math.PI * 2, 140, 8 + e.lvl * 3); }
      if ((e.st -= dt) <= 0) { e.st = 10; const t = pool[pool.length - 1]; for (let i = 0; i < 3 + e.lvl * 2; i++) spawn(t, null, null, e.x + Math.cos(i) * 50, e.y + Math.sin(i) * 50); }
    }
    near(e.x, e.y, e.r, (o, ox, oy) => { if (o === e) return; const od = Math.hypot(ox, oy) || 1, push = (e.r + o.r - od) * 0.25; e.x -= ox / od * push; e.y -= oy / od * push; });
    if (e.flash > 0) e.flash -= dt;
    if (e.ot > 0) e.ot -= dt;
    if (d < e.r + 16 && R.inv <= 0 && hurt(e.dmg)) return;
  }
  for (const b of R.eb) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (Math.hypot(b.x - R.x, b.y - R.y) < 20 && R.inv <= 0) { b.life = 0; if (hurt(b.dmg)) return; }
  }
  R.eb = R.eb.filter(b => b.life > 0);
  if (R.inv > 0) R.inv -= dt;
  R.hp = Math.min(R.maxHp, R.hp + st.regen * dt);

  weapons(dt);

  // Projectiles
  for (const s of R.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (s.spin !== undefined) s.spin += dt * 14;
    near(s.x, s.y, s.r, e => { if (s.life <= 0 || s.hit.has(e)) return; s.hit.add(e); hit(e, s.dmg); if (--s.pierce <= 0) s.life = 0; });
  }
  R.shots = R.shots.filter(s => s.life > 0);
  for (const g of R.rings) {
    g.age += dt; const r = g.R * Math.min(1, g.age / 0.35);
    near(g.x, g.y, r, (e, dx, dy) => { if (g.hit.has(e)) return; g.hit.add(e); hit(e, g.dmg); if (!e.boss) { const d = Math.hypot(dx, dy) || 1; e.x += dx / d * 30; e.y += dy / d * 30; } });
  }
  R.rings = R.rings.filter(g => g.age < 0.55);

  // Gemmes d'expérience et objets
  const mag = st.magnet;
  for (const g of R.gems) {
    const dx = R.x - g.x, dy = R.y - g.y, d = Math.hypot(dx, dy);
    if (g.pull || d < mag) { g.pull = true; const v = Math.max(300, 900 - d); g.x += dx / (d || 1) * v * dt; g.y += dy / (d || 1) * v * dt; }
    if (d < 20) { g.got = true; gainXp(g.v); }
  }
  R.gems = R.gems.filter(g => !g.got);
  for (const it of R.items) {
    if (Math.hypot(R.x - it.x, R.y - it.y) < (it.k === 'coffre' ? 34 : 26)) {
      it.got = true;
      if (it.k === 'cafe') { R.hp = Math.min(R.maxHp, R.hp + 30); toast('☕ +30 PV', 1500); }
      else if (it.k === 'coffre') openChest();
      else { R.gems.forEach(g => (g.pull = true)); toast('🧲 Tout est attiré !', 1500); }
    }
  }
  R.items = R.items.filter(i => !i.got);
  R.foes = R.foes.filter(e => !e.dead);
}

function weapons(dt) {
  const R = run, st = R.st;
  const timer = (id, cd) => { R.wt[id] = (R.wt[id] ?? 0) - dt; if (R.wt[id] <= 0) { R.wt[id] = cd * st.cd; return true; } return false; };
  for (const [id, l] of Object.entries(R.w)) {
    const W_ = WEAPONS[id], i = l - 1, ev = R.evo[id];
    if (id === 'laser' && timer(id, W_.cd[i])) {
      const tg = nearest(R.x, R.y, 520); if (!tg) { R.wt[id] = 0.1; continue; }
      const n = W_.n[i] + (ev ? 2 : 0);
      for (let k = 0; k < n; k++) {
        const a = Math.atan2(tg.y - R.y, tg.x - R.x) + (k - (n - 1) / 2) * 0.12;
        R.shots.push({ kind: 'laser', evo: ev, x: R.x, y: R.y, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, r: ev ? 9 : 6, dmg: W_.dmg[i] * (ev ? 1.5 : 1), pierce: ev ? 99 : W_.pierce[i], life: 1.1, hit: new Set() });
      }
    } else if (id === 'buses') {
      R.orbA += dt * 3.2;
      const n = ev ? 8 : W_.n[i], rad = W_.r[i] * st.area * (ev ? 1.25 : 1);
      for (let k = 0; k < n; k++) {
        const a = R.orbA + k / n * Math.PI * 2, x = R.x + Math.cos(a) * rad, y = R.y + Math.sin(a) * rad;
        near(x, y, (ev ? 16 : 12) * st.area, e => { if (e.ot > 0) return; e.ot = 0.45; hit(e, W_.dmg[i] * (ev ? 1.6 : 1)); });
      }
    } else if (id === 'soudure') {
      R.auraT -= dt;
      if (R.auraT <= 0) {
        R.auraT = 0.4; let n = 0;
        near(R.x, R.y, W_.r[i] * st.area * (ev ? 1.4 : 1), e => { n++; hit(e, W_.dmg[i] * (ev ? 2 : 1)); });
        if (ev) R.hp = Math.min(R.maxHp, R.hp + Math.min(3, n * 0.15));
      }
    } else if (id === 'tourelle' && timer(id, W_.cd[i])) {
      R.turrets.push({ x: R.x, y: R.y, life: 8, t: 0, fire: W_.fire[i] * (ev ? 0.5 : 1), dmg: W_.dmg[i] });
      while (R.turrets.length > (ev ? 5 : W_.max[i])) R.turrets.shift();
    } else if (id === 'wifi' && timer(id, ev ? 1.2 : W_.cd[i])) {
      const rr = W_.r[i] * st.area;
      R.rings.push({ x: R.x, y: R.y, R: rr, dmg: W_.dmg[i] * (ev ? 1.8 : 1), age: 0, hit: new Set(), wifi: true });
      if (ev) for (const g of R.gems) if (Math.hypot(g.x - R.x, g.y - R.y) < rr * 1.5) g.pull = true;
    } else if (id === 'scie' && timer(id, W_.cd[i])) {
      const n = ev ? 6 : W_.n[i];
      for (let k = 0; k < n; k++) {
        const base = k === 0 ? Math.atan2(R.faceY, R.faceX) : ev ? Math.atan2(R.faceY, R.faceX) + k / n * Math.PI * 2 : Math.random() * Math.PI * 2;
        R.shots.push({ kind: 'scie', x: R.x, y: R.y, vx: Math.cos(base) * 300, vy: Math.sin(base) * 300, r: 16 * st.area * (ev ? 1.2 : 1), dmg: W_.dmg[i] * (ev ? 1.6 : 1), pierce: 1e9, life: ev ? 2.2 : 1.4, hit: new Set(), spin: 0 });
      }
    }
  }
  for (const t of R.turrets) {
    t.life -= dt; t.t -= dt;
    if (t.t <= 0) {
      const tg = nearest(t.x, t.y, 320);
      if (tg) { t.t = t.fire * st.cd; const a = Math.atan2(tg.y - t.y, tg.x - t.x); R.shots.push({ kind: 'balle', x: t.x, y: t.y, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, r: 5, dmg: t.dmg, pierce: 1, life: 0.9, hit: new Set() }); }
    }
  }
  R.turrets = R.turrets.filter(t => t.life > 0);
}

function gainXp(v) {
  run.xp += v * run.st.xp;
  if (run.xp >= need(run.lvl) && !run.choosing) { run.xp -= need(run.lvl); run.lvl++; levelUp(); }
}

// ---------- Montée de niveau : 1 choix parmi 3 ----------
function options() {
  const pool = [], R = run;
  const nw = Object.keys(R.w).length, np = Object.keys(R.p).length;
  for (const id of Object.keys(WEAPONS)) { const l = R.w[id] || 0; if (l ? l < 5 : nw < 4) pool.push({ k: 'w', id }); }
  for (const id of Object.keys(PASSIVES)) { const l = R.p[id] || 0; if (l ? l < 5 : np < 4) pool.push({ k: 'p', id }); }
  pool.sort(() => Math.random() - 0.5);
  const out = pool.slice(0, 3);
  return out.length ? out : [{ k: 'soin' }, { k: 'boulons' }];
}
function optHTML(o, i) {
  if (o.k === 'soin') return `<button class="sv-opt" data-o="${i}"><span>🍰</span><b>Goûter</b><small>Soigne 50 PV.</small></button>`;
  if (o.k === 'boulons') return `<button class="sv-opt" data-o="${i}"><span>🔩</span><b>Sac de boulons</b><small>+25 Boulons en fin de partie.</small></button>`;
  const d = o.k === 'w' ? WEAPONS[o.id] : PASSIVES[o.id], l = (o.k === 'w' ? run.w : run.p)[o.id] || 0;
  const evo = o.k === 'w' ? EVOS[o.id] : Object.entries(EVOS).find(([, v]) => v.need === o.id);
  const hint = o.k === 'w' ? `✨ Évolue avec ${PASSIVES[evo.need].icon} ${PASSIVES[evo.need].name}` : evo ? `✨ Fait évoluer ${WEAPONS[evo[0]].icon} ${WEAPONS[evo[0]].name}` : '';
  return `<button class="sv-opt" data-o="${i}"><span>${d.icon}</span><b>${d.name} ${l ? `<i>niv. ${l + 1}</i>` : '<i class="new">nouveau</i>'}</b><small>${d.desc}${hint ? `<br><em>${hint}</em>` : ''}</small></button>`;
}
function levelUp() {
  run.choosing = true; run.opts = options();
  sfx.unlock();
  showChoice();
}
function showChoice() {
  const ov = $('#sv-overlay');
  ov.innerHTML = `<div class="sv-card"><h3>Niveau ${run.lvl} !</h3><p class="muted">Choisissez une amélioration (touches 1, 2, 3).</p>
    <div class="sv-opts">${run.opts.map(optHTML).join('')}</div>
    ${run.rerolls ? `<button class="ghost-btn" id="sv-reroll">🎲 Relancer (${run.rerolls})</button>` : ''}</div>`;
  ov.hidden = false;
  ov.querySelector('.sv-opt')?.focus();
}
function choose(i) {
  const o = run.opts?.[i]; if (!o) return;
  if (o.k === 'w') run.w[o.id] = (run.w[o.id] || 0) + 1;
  else if (o.k === 'p') { run.p[o.id] = (run.p[o.id] || 0) + 1; if (o.id === 'pv') run.hp += 20; }
  else if (o.k === 'soin') run.hp += 50;
  else run.bonusBolts = (run.bonusBolts || 0) + 25;
  stats(); run.hp = Math.min(run.hp, run.maxHp);
  run.choosing = false; run.opts = null;
  $('#sv-overlay').hidden = true;
  sfx.ui();
  if (run.xp >= need(run.lvl)) { run.xp -= need(run.lvl); run.lvl++; levelUp(); }
}

// ---------- Dessin ----------
function draw() {
  const R = run;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f3e8d2'; ctx.fillRect(0, 0, cv.width, cv.height);
  const dpr = cv.width / W;
  ctx.setTransform(dpr * Z, 0, 0, dpr * Z, 0, 0);
  const vw = W / Z, vh = H / Z, ox = R.x - vw / 2, oy = R.y - vh / 2;
  // Sol de l'atelier : dalles et quadrillage
  const T = 96;
  for (let i = Math.floor(ox / T); i <= Math.floor((ox + vw) / T); i++) for (let j = Math.floor(oy / T); j <= Math.floor((oy + vh) / T); j++) {
    if ((i + j) & 1) { ctx.fillStyle = '#ecdfc4'; ctx.fillRect(i * T - ox, j * T - oy, T, T); }
  }
  ctx.translate(-ox, -oy);

  for (const g of R.gems) {
    ctx.fillStyle = g.v >= 20 ? '#f5b400' : g.v >= 3 ? '#8e5cf0' : '#2f9be0';
    ctx.beginPath(); ctx.moveTo(g.x, g.y - 6); ctx.lineTo(g.x + 5, g.y); ctx.lineTo(g.x, g.y + 6); ctx.lineTo(g.x - 5, g.y); ctx.fill();
  }
  for (const it of R.items) { const big = it.k === 'coffre', img = sprite(big ? '🎁' : it.k === 'cafe' ? '☕' : '🧲', big ? 32 : 22); ctx.drawImage(img, it.x - img.width / 2, it.y - img.height / 2 + (big ? Math.sin(R.t * 5) * 3 : 0)); }
  if (R.w.soudure) {
    ctx.fillStyle = 'rgba(240,126,54,.16)'; ctx.strokeStyle = 'rgba(240,126,54,.5)'; ctx.lineWidth = 2;
    if (R.evo.soudure) { ctx.fillStyle = 'rgba(228,30,30,.18)'; ctx.strokeStyle = 'rgba(228,30,30,.55)'; }
    ctx.beginPath(); ctx.arc(R.x, R.y, WEAPONS.soudure.r[R.w.soudure - 1] * R.st.area * (R.evo.soudure ? 1.4 : 1), 0, 7); ctx.fill(); ctx.stroke();
  }
  for (const g of R.rings) {
    ctx.strokeStyle = g.wifi ? `rgba(47,155,224,${1 - g.age / 0.55})` : `rgba(228,30,108,${1 - g.age / 0.55})`; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.R * Math.min(1, g.age / 0.35), 0, 7); ctx.stroke();
  }
  for (const t of R.turrets) ctx.drawImage(sprite('🖨️', 26), t.x - 16, t.y - 16);
  for (const e of R.foes) {
    const px = e.r * 2, img = sprite(e.e, px);
    if (e.elite) { ctx.strokeStyle = '#f5b400'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, 7); ctx.stroke(); }
    if (e.cs > 0 && Math.floor(e.cs * 12) % 2) { ctx.fillStyle = 'rgba(228,30,30,.45)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, 7); ctx.fill(); }
    ctx.drawImage(img, e.x - img.width / 2, e.y - img.height / 2);
    if (e.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); }
  }
  for (const s of R.shots) {
    if (s.kind === 'laser') { ctx.strokeStyle = s.evo ? '#ff7a00' : '#e41e1e'; ctx.lineWidth = s.evo ? 7 : 4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke(); }
    else if (s.kind === 'balle') { ctx.fillStyle = '#3c2472'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill(); }
    else { const img = sprite('⚙️', s.r * 2); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.spin); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore(); }
  }
  if (R.w.buses) {
    const ev = R.evo.buses, n = ev ? 8 : WEAPONS.buses.n[R.w.buses - 1], rad = WEAPONS.buses.r[R.w.buses - 1] * R.st.area * (ev ? 1.25 : 1);
    ctx.fillStyle = ev ? '#fcd260' : '#f07e36'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    for (let k = 0; k < n; k++) { const a = R.orbA + k / n * Math.PI * 2; ctx.beginPath(); ctx.arc(R.x + Math.cos(a) * rad, R.y + Math.sin(a) * rad, (ev ? 14 : 10) * R.st.area, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  // Tirs des pannes
  ctx.fillStyle = '#e41e6c'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  for (const b of R.eb) { ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill(); ctx.stroke(); }
  if (R.dashT > 0) { ctx.fillStyle = 'rgba(47,155,224,.35)'; ctx.beginPath(); ctx.arc(R.x - R.dx * 18, R.y - R.dy * 18, 20, 0, 7); ctx.fill(); }
  // La Cocotte
  if (!(R.inv > 0 && Math.floor(R.t * 20) % 2)) {
    if (hero.complete && hero.naturalWidth) ctx.drawImage(hero, R.x - 24, R.y - 26, 48, 48);
    else ctx.drawImage(sprite('🐔', 36), R.x - 22, R.y - 22);
  }
  ctx.fillStyle = '#000'; ctx.fillRect(R.x - 22, R.y + 25, 44, 7);
  ctx.fillStyle = R.hp / R.maxHp > 0.3 ? '#3bb54a' : '#e41e1e'; ctx.fillRect(R.x - 21, R.y + 26, 42 * Math.max(0, R.hp / R.maxHp), 5);

  // Interface
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = '#2f9be0'; ctx.fillRect(0, 0, W * Math.min(1, R.xp / need(R.lvl)), 10);
  ctx.font = '700 22px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#141414';
  ctx.fillText(mmss(R.t), W / 2, 38);
  ctx.font = '700 15px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`Niv. ${R.lvl}`, 10, 32); ctx.fillText(`💀 ${R.kills}`, 10, 52); if (R.heat) ctx.fillText(`🔥 ${R.heat}`, 10, 72);
  if (R.boss) {
    const bw = Math.min(320, W - 140);
    ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - bw / 2, 48, bw, 12);
    ctx.fillStyle = '#e41e6c'; ctx.fillRect(W / 2 - bw / 2 + 2, 50, (bw - 4) * Math.max(0, R.boss.hp / R.boss.max), 8);
    ctx.textAlign = 'center'; ctx.fillStyle = '#141414'; ctx.font = '700 13px Fredoka, system-ui, sans-serif'; ctx.fillText(R.boss.name, W / 2, 75);
  }
  ctx.textAlign = 'left'; ctx.font = '13px system-ui, sans-serif';
  let x = 10;
  for (const [id, l] of [...Object.entries(R.w).map(([k, v]) => [R.evo[k] ? EVOS[k].icon : WEAPONS[k].icon, R.evo[k] ? '★' : v]), ...Object.entries(R.p).map(([k, v]) => [PASSIVES[k].icon, v])]) {
    ctx.drawImage(sprite(id, 18), x, H - 34); ctx.fillStyle = '#141414'; ctx.fillText(l, x + 20, H - 14); x += 36;
  }
  const db = $('#sv-dash'); db.classList.toggle('cd', R.dashCd > 0); db.style.setProperty('--cd', Math.max(0, R.dashCd / 3.5));
  if (stick) {
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(stick.x0, stick.y0, 50, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(stick.x0 + stick.dx * 50, stick.y0 + stick.dy * 50, 22, 0, 7); ctx.fill();
  }
}

let hero = new Image();
function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!run || run.over) return;
  if (!run.paused && !run.choosing) update(dt);
  if (run && !run.over) draw();
}

function resize() {
  if (!cv) return;
  W = cv.clientWidth; H = cv.clientHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  Z = clamp(Math.min(W, H) / 620, 0.7, 1.15);
}

// ---------- Début / fin ----------
async function call(name, body = {}) {
  const r = await rpc(name, { ...me(), ...body });
  if (r?.error === 'auth' && !retried) { retried = true; await sync(true); return rpc(name, { ...me(), ...body }); }
  return r;
}

function start() {
  newRun();
  hero = new Image(); hero.src = skinImage(state.skin);
  $('#dlg-surv').classList.add('playing');
  $('#sv-lobby').hidden = true; $('#sv-game').hidden = false; $('#sv-overlay').hidden = true;
  resize();
  last = performance.now();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  cv.focus();
  const r = run;
  if (netEnabled() && state.net.token) call('surv_start').then(x => { if (x?.ok) r.runId = x.run; }).catch(() => {});
}

function pause(on) {
  if (!run || run.over || run.choosing) return;
  run.paused = on ?? !run.paused;
  keys.clear(); stick = null;
  const ov = $('#sv-overlay');
  if (run.paused) {
    ov.innerHTML = `<div class="sv-card"><h3>⏸ Pause</h3><p>${mmss(run.t)} · niveau ${run.lvl} · ${run.kills} pannes réparées</p>
      <button class="big-btn" id="sv-resume">▶️ Reprendre</button> <button class="ghost-btn" id="sv-quit">🏳️ Abandonner</button></div>`;
    ov.hidden = false; $('#sv-resume').focus();
  } else ov.hidden = true;
}

function end(win) {
  const R = run; if (R.over) return;
  R.over = true; cancelAnimationFrame(raf);
  const S = state.surv, t = Math.floor(R.t);
  const bolts = Math.round((R.kills / 8 + t / 10 + (win ? 60 : 0) + R.bossKills * 15 + (R.bonusBolts || 0)) * (1 + 0.1 * meta('bolt')) * R.H.bolts);
  let unlocked = false;
  if (win && R.heat >= (S.heatMax || 0) && R.heat < HEAT_MAX) { S.heatMax = R.heat + 1; unlocked = true; }
  if (S.day !== today()) { S.day = today(); S.cToday = 0; }
  const cr = Math.min(Math.floor(t / 60) + (win ? 10 : 0), Math.max(0, CRYST_DAY - S.cToday));
  S.cToday += cr; S.bolts += bolts; S.runs++; S.kills += R.kills; if (win) S.wins++;
  const rec = R.heat > (S.bestHeat || 0) || (R.heat === (S.bestHeat || 0) && (t > S.best || (t === S.best && R.kills > S.bestKills)));
  if (rec) { S.best = t; S.bestKills = R.kills; S.bestHeat = R.heat; }
  if (cr) addCrystals(cr);
  save();
  win ? sfx.unlock() : sfx.deny();
  const ov = $('#sv-overlay');
  ov.innerHTML = `<div class="sv-card"><h3>${win ? '🏆 Le FabLab est sauvé !' : '💥 La Cocotte est en panne…'}</h3>
    <div class="sv-res"><div><b>${mmss(t)}</b><small>survécu</small></div><div><b>${R.kills}</b><small>pannes réparées</small></div><div><b>${R.lvl}</b><small>niveau</small></div></div>
    ${rec ? '<p class="sv-rec">⭐ Nouveau record personnel !</p>' : ''}
    ${unlocked ? `<p class="sv-rec">🔥 Surchauffe ${R.heat + 1} débloquée !</p>` : ''}
    ${Object.keys(R.evo).length ? `<p>Évolutions : ${Object.keys(R.evo).map(k => EVOS[k].icon + ' ' + EVOS[k].name).join(', ')}</p>` : ''}
    <p>+${bolts} 🔩 Boulons${cr ? ` · +${cr} 💎` : S.cToday >= CRYST_DAY ? ' · cristaux du jour déjà gagnés' : ''}</p>
    <p class="muted small" id="sv-online"></p>
    <button class="big-btn" id="sv-again">🔁 Rejouer</button> <button class="ghost-btn" id="sv-back">⬅️ Atelier des Boulons</button></div>`;
  ov.hidden = false; $('#sv-again').focus();
  if (R.runId) {
    $('#sv-online').textContent = 'Envoi au classement…';
    call('surv_end', { p_run: R.runId, p_time: t, p_kills: R.kills, p_level: R.lvl, p_heat: R.heat })
      .then(x => { const el = $('#sv-online'); if (el) el.textContent = x?.ok ? (x.record ? '🌍 Nouveau record en ligne !' : '🌍 Partie enregistrée au classement.') : ''; board = null; })
      .catch(() => { const el = $('#sv-online'); if (el) el.textContent = ''; });
  }
}

// ---------- Accueil : Boulons, boutique, classement ----------
function renderLobby() {
  const S = state.surv;
  $('#sv-stats').innerHTML = `<div><b>${S.bolts}</b><small>🔩 Boulons</small></div><div><b>${S.best ? (S.bestHeat ? `🔥${S.bestHeat} ` : '') + mmss(S.best) : '—'}</b><small>meilleure survie</small></div>
    <div><b>${S.wins}</b><small>victoires</small></div><div><b>${S.runs}</b><small>parties</small></div>`;
  $('#sv-shop').innerHTML = META.map(m => {
    const l = meta(m.id), maxed = l >= m.max, c = metaCost(m);
    return `<li><button type="button" class="sv-meta${!maxed && S.bolts >= c ? ' can' : ''}" data-meta="${m.id}" ${maxed || S.bolts < c ? 'disabled' : ''}>
      <span class="sv-mi" aria-hidden="true">${m.icon}</span><span><b>${m.name}</b> <small>${l}/${m.max}</small><small class="d">${m.desc}</small></span>
      <span class="sv-mc">${maxed ? '✔' : `${c} 🔩`}</span></button></li>`;
  }).join('');
  // Surchauffe
  const hm = Math.min(HEAT_MAX, S.heatMax || 0); S.heat = clamp(S.heat || 0, 0, hm);
  $('#sv-heat').innerHTML = Array.from({ length: HEAT_MAX + 1 }, (_, h) => `<button type="button" class="sv-chip${h === S.heat ? ' on' : ''}" data-heat="${h}" ${h > hm ? 'disabled' : ''} aria-pressed="${h === S.heat}">${h > hm ? '🔒' : '🔥'} ${h}</button>`).join('');
  const hh = heatOf(S.heat);
  $('#sv-heat-info').textContent = S.heat ? `Pannes +${Math.round((hh.hp - 1) * 100)} % de PV, +${Math.round((hh.sp - 1) * 100)} % de vitesse, +${Math.round((hh.spawn - 1) * 100)} % d'apparitions, +${Math.round((hh.dmg - 1) * 100)} % de dégâts. Boulons +${Math.round((hh.bolts - 1) * 100)} %.`
    : (hm ? 'Choisissez un niveau de Surchauffe : plus dur, mais plus de Boulons et un meilleur classement.' : 'Gagnez une partie (15 min) pour débloquer la Surchauffe 1 : plus dur, plus de Boulons.');
  // Outil de départ
  const tools = S.tools?.length ? S.tools : ['laser'];
  $('#sv-tools').innerHTML = Object.entries(WEAPONS).map(([id, w]) => tools.includes(id)
    ? `<button type="button" class="sv-chip${(S.tool || 'laser') === id ? ' on' : ''}" data-tool="${id}" aria-pressed="${(S.tool || 'laser') === id}">${w.icon} ${w.name}</button>`
    : `<button type="button" class="sv-chip locked" data-unlock="${id}" ${S.bolts < TOOL_COST ? 'disabled' : ''}>🔒 ${w.icon} ${w.name} · ${TOOL_COST} 🔩</button>`).join('');
  $('#sv-evos').innerHTML = Object.entries(EVOS).map(([id, e]) => `<li>${WEAPONS[id].icon} ${WEAPONS[id].name} niv. 5 + ${PASSIVES[e.need].icon} ${PASSIVES[e.need].name} → <b>${e.icon} ${e.name}</b> : ${e.desc}</li>`).join('');
  const crLeft = Math.max(0, CRYST_DAY - (S.day === today() ? S.cToday : 0));
  $('#sv-cryst').textContent = crLeft ? `Encore ${crLeft} 💎 à gagner aujourd'hui (1 💎 par minute survécue, +10 💎 en cas de victoire).` : 'Cristaux du jour déjà gagnés : revenez demain !';
  renderBoard();
}
function renderBoard() {
  const el = $('#sv-board');
  if (!netEnabled()) { el.innerHTML = '<li class="muted">Classement indisponible hors ligne.</li>'; return; }
  if (!board) { el.innerHTML = '<li class="muted">Chargement…</li>'; return; }
  const hs = h => (h ? `🔥${h} ` : '');
  el.innerHTML = board.top?.length ? board.top.map(r => `<li${r.me ? ' class="me"' : ''}><span>${r.rank}</span><span>${esc(r.pseudo)}</span><b>${hs(r.heat)}${mmss(r.time)} · 💀 ${r.kills}</b></li>`).join('')
    + (board.me && !board.top.some(r => r.me) ? `<li class="me"><span>${board.me.rank}</span><span>Vous</span><b>${hs(board.me.heat)}${mmss(board.me.time)}</b></li>` : '')
    : '<li class="muted">Personne n\'a encore joué : à vous l\'honneur !</li>';
}
async function loadBoard() {
  if (!netEnabled()) return;
  try { board = await rpc('surv_board', { p_id: state.playerId, p_limit: 10 }); } catch { board = { top: [] }; }
  renderBoard();
}
function buyMeta(id) {
  const m = META.find(x => x.id === id); if (!m) return;
  const c = metaCost(m);
  if (meta(id) >= m.max || state.surv.bolts < c) { sfx.deny(); return; }
  state.surv.bolts -= c; state.surv.up[id] = meta(id) + 1;
  sfx.buy(); save(); renderLobby();
}

function lobby() {
  run = null; cancelAnimationFrame(raf);
  $('#dlg-surv').classList.remove('playing');
  $('#sv-game').hidden = true; $('#sv-lobby').hidden = false;
  renderLobby();
  if (!board) loadBoard();
}

export function openSurvivor() {
  lobby();
  $('#dlg-surv').showModal();
  loadBoard();
}

export function initSurvivor() {
  cv = $('#sv-canvas'); ctx = cv.getContext('2d');
  const dlg = $('#dlg-surv');
  $('#btn-surv').addEventListener('click', () => { sfx.ui(); openSurvivor(); });
  $('#sv-play').addEventListener('click', () => { sfx.ui(); start(); });
  $('#sv-shop').addEventListener('click', e => { const b = e.target.closest('[data-meta]'); if (b) buyMeta(b.dataset.meta); });
  $('#sv-pause').addEventListener('click', () => pause());
  $('#sv-dash').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dash(); });
  $('#sv-heat').addEventListener('click', e => { const b = e.target.closest('[data-heat]'); if (b) { state.surv.heat = +b.dataset.heat; sfx.ui(); save(); renderLobby(); } });
  $('#sv-tools').addEventListener('click', e => {
    const b = e.target.closest('[data-tool],[data-unlock]'); if (!b) return;
    const S = state.surv;
    if (b.dataset.tool) S.tool = b.dataset.tool;
    else if (S.bolts >= TOOL_COST) { S.bolts -= TOOL_COST; S.tools = [...new Set([...(S.tools || ['laser']), b.dataset.unlock])]; S.tool = b.dataset.unlock; sfx.buy(); }
    save(); renderLobby();
  });
  $('#sv-overlay').addEventListener('click', e => {
    const o = e.target.closest('[data-o]'); if (o) return choose(+o.dataset.o);
    const id = e.target.closest('button')?.id;
    if (id === 'sv-reroll' && run?.rerolls) { run.rerolls--; run.opts = options(); showChoice(); }
    else if (id === 'sv-resume') pause(false);
    else if (id === 'sv-quit') { run.paused = false; end(false); }
    else if (id === 'sv-again') start();
    else if (id === 'sv-back') lobby();
  });
  // Échap : pause au lieu de fermer pendant une partie
  dlg.addEventListener('cancel', e => { if (run && !run.over) { e.preventDefault(); if (!run.choosing) pause(); } });
  dlg.addEventListener('close', () => { if (run && !run.over) { run.paused = false; end(false); } run = null; cancelAnimationFrame(raf); dlg.classList.remove('playing'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && run && !run.over && !run.paused) pause(true); });
  addEventListener('resize', resize);
  addEventListener('keydown', e => {
    if (!run || run.over || !dlg.open) return;
    if (run.choosing && /^Digit[123]$/.test(e.code)) { choose(+e.code.slice(5) - 1); return; }
    if (e.code === 'KeyP') return pause();
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); return dash(); }
    if (/^(Key[WASD]|Arrow)/.test(e.code)) { keys.add(e.code); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  // Joystick tactile : là où le doigt se pose
  cv.addEventListener('pointerdown', e => { if (!run || run.paused || run.choosing) return; cv.setPointerCapture(e.pointerId); const b = cv.getBoundingClientRect(); stick = { id: e.pointerId, x0: e.clientX - b.left, y0: e.clientY - b.top, dx: 0, dy: 0 }; });
  cv.addEventListener('pointermove', e => {
    if (!stick || e.pointerId !== stick.id) return;
    const b = cv.getBoundingClientRect(), dx = e.clientX - b.left - stick.x0, dy = e.clientY - b.top - stick.y0, d = Math.hypot(dx, dy);
    const k = d > 50 ? 50 / d : 1; stick.dx = dx * k / 50; stick.dy = dy * k / 50;
  });
  const up = e => { if (stick && e.pointerId === stick.id) stick = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}

// Pour les tests
export const _surv = { get run() { return run; }, end, choose, update: dt => update(dt), keys, dash, openChest };
