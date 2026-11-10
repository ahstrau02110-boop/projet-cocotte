// Sauvegarde locale, export / import, gains hors-ligne
import { state, replaceState, freshState, CONFIG, totalCps, earn } from './state.js';

const KEY = 'cocotte-clicker-save';
const PREFIX = 'COCOTTE1:';

export function save() {
  state.lastSave = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; } // navigation privée / quota
}

// Fusionne une sauvegarde avec un état neuf (tolère les anciennes versions) et valide chaque champ
function sanitize(raw) {
  const s = freshState();
  if (!raw || typeof raw !== 'object') return s;
  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);
  const int = (v, d = 0) => Math.floor(num(v, d));
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  s.coins = num(raw.coins);
  s.totalEarned = Math.max(num(raw.totalEarned), s.coins);
  s.totalClicks = int(raw.totalClicks);
  s.handEarned = num(raw.handEarned);
  s.startedAt = num(raw.startedAt, Date.now());
  s.lastSave = num(raw.lastSave, Date.now());
  for (const [k, v] of Object.entries(obj(raw.buildings))) s.buildings[k] = int(v);

  s.crystals = int(raw.crystals);
  s.welcomed = !!raw.welcomed || raw.v === 1; // anciennes parties : pas de bonus de bienvenue rétroactif
  if (typeof raw.playerId === 'string' && /^[A-Z0-9]{6,12}$/.test(raw.playerId)) s.playerId = raw.playerId;
  if (typeof raw.pseudo === 'string') s.pseudo = raw.pseudo.slice(0, 20);
  for (const [k, v] of Object.entries(obj(raw.skins))) if (int(v) > 0) s.skins[k] = int(v);
  if (typeof raw.skin === 'string' && s.skins[raw.skin]) s.skin = raw.skin;
  const g = obj(raw.gacha);
  s.gacha = { pulls: int(g.pulls), sinceLegend: int(g.sinceLegend), bgPulls: int(g.bgPulls), bgSinceLegend: int(g.bgSinceLegend) };
  for (const [k, v] of Object.entries(obj(raw.bgs))) if (int(v) > 0) s.bgs[k] = int(v);
  if (typeof raw.bg === 'string' && (raw.bg === 'auto' || s.bgs[raw.bg])) s.bg = raw.bg;
  if (Array.isArray(raw.claimed)) s.claimed = raw.claimed.filter(x => typeof x === 'string').slice(-300);
  const m = obj(raw.mini);
  s.mini = { day: typeof m.day === 'string' ? m.day : '', crystalsToday: int(m.crystalsToday), plays: int(m.plays),
    stars: int(m.stars), perfect: int(m.perfect), puzzles: int(m.puzzles), best: {} };
  for (const k of Object.keys(obj(raw.upgrades))) s.upgrades[k] = true;
  for (const k of Object.keys(obj(raw.projects))) s.projects[k] = true;
  if (Array.isArray(raw.buffs)) s.buffs = raw.buffs.filter(b => b && typeof b.until === 'number' && b.until > Date.now())
    .map(b => ({ id: String(b.id), name: String(b.name || ''), cps: num(b.cps, 1) || 1, click: num(b.click, 1) || 1, until: b.until }));
  s.golden = int(raw.golden);
  const bo = obj(raw.boosts), arr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
  s.boosts = { infoLast: Math.min(num(bo.infoLast), Date.now()), quizLast: Math.min(num(bo.quizLast), Date.now()),
    infoSeen: arr(bo.infoSeen), quizSeen: arr(bo.quizSeen), quizOk: int(bo.quizOk) };
  const da = obj(raw.daily);
  s.daily = { last: typeof da.last === 'string' ? da.last : '', streak: int(da.streak), best: int(da.best) };
  const tp = obj(raw.tips);
  s.tips = { last: Math.min(num(tp.last), Date.now()), read: Array.isArray(tp.read) ? tp.read.filter(x => typeof x === 'string') : [],
    pending: typeof tp.pending === 'string' ? tp.pending : null };
  s.tuto = !!raw.tuto || raw.v === 1 || int(raw.totalClicks) > 50; // anciens joueurs : pas de tutoriel imposé
  const pr = obj(raw.prestige);
  s.prestige = { seasons: int(pr.seasons), seeds: int(pr.seeds), lifetime: Math.max(num(pr.lifetime), s.totalEarned) };
  for (const [k, v] of Object.entries(obj(raw.achievements))) s.achievements[k] = num(v, Date.now());
  for (const [k, v] of Object.entries(obj(m.best))) s.mini.best[k] = int(v);

  const st = obj(raw.settings);
  const vol = v => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null);
  s.settings.sound = !!st.sound;
  s.settings.music = !!st.music;
  s.settings.sfxVol = vol(st.sfxVol) ?? s.settings.sfxVol;
  s.settings.musicVol = vol(st.musicVol) ?? s.settings.musicVol;
  if ([1, 10, 100].includes(st.buyQty)) s.settings.buyQty = st.buyQty;
  if (['classique', 'atelier'].includes(st.track)) s.settings.track = st.track;
  return s;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    replaceState(sanitize(JSON.parse(raw)));
    return true;
  } catch { return false; }
}

export function exportSave() {
  save();
  return PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

export function importSave(code) {
  code = code.trim();
  if (!code.startsWith(PREFIX)) throw new Error('Code invalide');
  const json = decodeURIComponent(escape(atob(code.slice(PREFIX.length))));
  replaceState(sanitize(JSON.parse(json)));
  save();
}

export function hardReset() {
  replaceState(freshState());
  save();
}

// Gains pendant l'absence : CPS × durée (plafonnée) × efficacité. Retourne { gain, seconds }
export function applyOffline(seconds) {
  const capped = Math.min(seconds, CONFIG.offlineMaxHours * 3600);
  const gain = totalCps() * capped * CONFIG.offlineRate;
  if (gain > 0) earn(gain);
  return { gain, seconds: capped };
}
