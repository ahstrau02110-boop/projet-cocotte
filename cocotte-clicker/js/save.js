// Sauvegarde locale, export / import, gains hors-ligne
import { state, replaceState, freshState, CONFIG, totalCps, earn, hasTalent, projectEffects } from './state.js';
import { sign, report } from './integrity.js';

const KEY = 'cocotte-clicker-save';
const PREFIX = 'COCOTTE1:';
const SIG = 'cocotte-clicker-sig'; // empreinte de la sauvegarde (repère une modification à la main)

// Session en pause (jeu ouvert ailleurs) : plus aucune écriture
let blocked = false;
export const blockSaves = () => { blocked = true; };

export function save() {
  if (blocked) return false;
  state.lastSave = Date.now();
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(KEY, json);
    localStorage.setItem(SIG, sign(json));
    return true;
  } catch { return false; } // navigation privée / quota
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
  s.gacha = { pulls: int(g.pulls), sinceLegend: int(g.sinceLegend), bgPulls: int(g.bgPulls), bgSinceLegend: int(g.bgSinceLegend), petPulls: int(g.petPulls), petSinceLegend: int(g.petSinceLegend) };
  for (const [k, v] of Object.entries(obj(raw.bgs))) if (int(v) > 0) s.bgs[k] = int(v);
  if (typeof raw.bg === 'string' && (raw.bg === 'auto' || s.bgs[raw.bg])) s.bg = raw.bg;
  if (Array.isArray(raw.claimed)) s.claimed = raw.claimed.filter(x => typeof x === 'string').slice(-300);
  const m = obj(raw.mini);
  s.mini = { day: typeof m.day === 'string' ? m.day : '', crystalsToday: int(m.crystalsToday), plays: int(m.plays),
    stars: int(m.stars), perfect: int(m.perfect), puzzles: int(m.puzzles), best: {}, by: {} };
  for (const [k, v] of Object.entries(obj(m.by))) s.mini.by[k] = int(v);
  // Matériaux, commandes, missions de la semaine, succès secrets
  const ma = obj(raw.mats);
  for (const k of Object.keys(s.mats)) s.mats[k] = int(ma[k]);
  s.matsTick = Math.min(num(raw.matsTick, Date.now()) || Date.now(), Date.now());
  const od = obj(raw.orders);
  s.orders = { rep: int(od.rep), next: num(od.next), list: (Array.isArray(od.list) ? od.list : []).filter(o => o && typeof o.id === 'string').slice(0, 5)
    .map(o => ({ id: o.id, who: String(o.who || ''), what: String(o.what || ''), icon: String(o.icon || '📦'), need: Object.fromEntries(Object.entries(obj(o.need)).filter(([k]) => k in s.mats).map(([k, v]) => [k, int(v)])),
      coins: num(o.coins), crystals: int(o.crystals), rep: int(o.rep, 1), bonus: typeof o.bonus === 'string' && o.bonus in s.mats ? o.bonus : '', until: num(o.until) })) };
  const wk = obj(raw.weekly);
  if (typeof wk.week === 'string' && Array.isArray(wk.list)) s.weekly = { week: wk.week, bonus: !!wk.bonus,
    list: wk.list.filter(m => m && typeof m.id === 'string').slice(0, 3).map(m => ({ id: m.id, lvl: int(m.lvl), n: Math.max(1, int(m.n, 1)), reward: int(m.reward), start: num(m.start), claimed: !!m.claimed })) };
  for (const [k, v] of Object.entries(obj(raw.flags))) if (v) s.flags[k] = 1;
  s.mega = { level: Math.min(int(obj(raw.mega).level), 99) };
  // Compagnons, effets, titre, Aventure, Avent, Atelier pixel
  const idOk = k => /^[a-z0-9-]{2,20}$/.test(k);
  for (const [k, v] of Object.entries(obj(raw.pets))) if (idOk(k) && int(v) > 0) s.pets[k] = Math.min(int(v), 9999);
  s.pets.poussin = s.pets.poussin || 1;
  s.pet = raw.pet === null ? null : typeof raw.pet === 'string' && s.pets[raw.pet] ? raw.pet : 'poussin';
  for (const [k, v] of Object.entries(obj(raw.petLv))) if (idOk(k) && s.pets[k]) s.petLv[k] = { lv: Math.max(1, Math.min(int(obj(v).lv, 1), 500)), xp: 0 };
  for (const [k, v] of Object.entries(obj(raw.fxOwned))) if (idOk(k) && v) s.fxOwned[k] = 1;
  s.fx = typeof raw.fx === 'string' && s.fxOwned[raw.fx] ? raw.fx : 'fumee';
  s.title = typeof raw.title === 'string' && idOk(raw.title) ? raw.title : '';
  const ad = obj(raw.adv);
  s.adv = { team: (Array.isArray(ad.team) ? ad.team : ['poussin']).filter(k => typeof k === 'string' && s.pets[k]).slice(0, 3), stage: Math.max(1, int(ad.stage, 1)), best: int(ad.best),
    auto: ad.auto !== false, frag: int(ad.frag), last: Math.min(num(ad.last), Date.now()), wins: int(ad.wins), day: typeof ad.day === 'string' ? ad.day : '', cToday: int(ad.cToday), mToday: int(ad.mToday), farm: int(ad.farm) };
  if (!s.adv.team.length) s.adv.team = ['poussin'];
  s.adv.stage = Math.min(s.adv.stage, s.adv.best + 1);
  const av = obj(raw.advent);
  s.advent = { year: int(av.year), opened: [...new Set((Array.isArray(av.opened) ? av.opened : []).filter(d => Number.isInteger(d) && d >= 1 && d <= 24))] };
  const px = obj(raw.pixel);
  s.pixel = { art: typeof px.art === 'string' && /^[0-9a-f.]{256}$/.test(px.art) ? px.art : '', status: ['', 'pending', 'ok', 'no'].includes(px.status) ? px.status : '', sent: num(px.sent) };
  if (raw.skins?.perso && s.pixel.art) s.skins.perso = 1;
  if (raw.skin === 'perso' && s.pixel.art) s.skin = 'perso';
  // Échecs : bilans contre l'IA, partie en cours (coups rejoués et vérifiés à l'ouverture), progression du tuto
  const ch = obj(raw.chess), le = obj(ch.learn), cur = obj(ch.cur);
  s.chess = { ai: {}, cur: null, online: ch.online ? 1 : 0, level: [1, 2, 3].includes(ch.level) ? ch.level : 2, color: ['w', 'b', 'r'].includes(ch.color) ? ch.color : 'r',
    learn: { lessons: (Array.isArray(le.lessons) ? le.lessons : []).filter(x => typeof x === 'string').slice(0, 50), puzzles: (Array.isArray(le.puzzles) ? le.puzzles : []).filter(Number.isInteger).slice(0, 100) } };
  for (const k of ['1', '2', '3']) { const a = obj(obj(ch.ai)[k]); if (Object.keys(a).length) s.chess.ai[k] = { w: int(a.w), l: int(a.l), d: int(a.d) }; }
  if (['ai', 'local'].includes(cur.mode) && Array.isArray(cur.moves)) s.chess.cur = { mode: cur.mode, level: [1, 2, 3].includes(cur.level) ? cur.level : 2,
    me: cur.me === 'b' ? 'b' : 'w', moves: cur.moves.filter(u => typeof u === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)).slice(0, 1200) };
  if (typeof ch.bestElo === 'number') s.chess.bestElo = int(ch.bestElo);
  const sv = obj(raw.surv);
  s.surv = { bolts: int(sv.bolts), up: {}, best: Math.min(int(sv.best), 900), bestKills: int(sv.bestKills), runs: int(sv.runs), wins: int(sv.wins),
    kills: int(sv.kills), day: typeof sv.day === 'string' ? sv.day : '', cToday: int(sv.cToday),
    heat: Math.min(int(sv.heat), 5), heatMax: Math.min(int(sv.heatMax), 5), bestHeat: Math.min(int(sv.bestHeat), 5),
    tools: [...new Set(['laser', ...(Array.isArray(sv.tools) ? sv.tools.filter(t => typeof t === 'string' && /^[a-z]{2,10}$/.test(t)) : [])])].slice(0, 8),
    tool: typeof sv.tool === 'string' ? sv.tool : 'laser' };
  for (const [k, v] of Object.entries(obj(sv.up))) if (/^[a-z]{2,8}$/.test(k)) s.surv.up[k] = Math.min(int(v), 5);
  s.achMilestones = Array.isArray(raw.achMilestones) ? raw.achMilestones.filter(x => typeof x === 'number').slice(0, 20) : [];
  for (const k of Object.keys(obj(raw.upgrades))) s.upgrades[k] = true;
  for (const k of Object.keys(obj(raw.projects))) s.projects[k] = true;
  if (Array.isArray(raw.buffs)) s.buffs = raw.buffs.filter(b => b && typeof b.until === 'number' && b.until > Date.now())
    .map(b => ({ id: String(b.id), name: String(b.name || ''), cps: num(b.cps, 1) || 1, click: num(b.click, 1) || 1, until: b.until }));
  s.golden = int(raw.golden);
  const bo = obj(raw.boosts), arr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
  s.boosts = { infoLast: Math.min(num(bo.infoLast), Date.now()), quizLast: Math.min(num(bo.quizLast), Date.now()),
    infoSeen: arr(bo.infoSeen), quizSeen: arr(bo.quizSeen), quizOk: int(bo.quizOk) };
  const co = obj(raw.counters);
  for (const k of Object.keys(s.counters)) s.counters[k] = int(co[k]);
  const mi = obj(raw.missions);
  if (typeof mi.day === 'string' && Array.isArray(mi.list)) s.missions = { day: mi.day, bonus: !!mi.bonus,
    list: mi.list.filter(m => m && typeof m.id === 'string').slice(0, 3).map(m => ({ id: m.id, lvl: int(m.lvl), n: Math.max(1, int(m.n, 1)), reward: int(m.reward), start: num(m.start), claimed: !!m.claimed })) };
  for (const k of Object.keys(obj(raw.helpSeen))) s.helpSeen[k] = true;
  const on = obj(raw.online), arrN = v => (Array.isArray(v) ? v.filter(x => typeof x === 'number').slice(-50) : []);
  s.online = { claimedWeeks: Array.isArray(on.claimedWeeks) ? on.claimedWeeks.filter(x => typeof x === 'string').slice(-20) : [],
    team: typeof on.team === 'string' ? on.team : null, teamWinner: typeof on.teamWinner === 'string' ? on.teamWinner : null,
    bossClaimed: arrN(on.bossClaimed), huntBonus: arrN(on.huntBonus), giftDay: typeof on.giftDay === 'string' ? on.giftDay : '',
    hiddenAnnounce: int(on.hiddenAnnounce) };
  const ne = obj(raw.net);
  s.net = { token: typeof ne.token === 'string' && ne.token.length >= 16 ? ne.token : '', listed: ne.listed !== false,
    total: num(ne.total), players: int(ne.players), lastSync: num(ne.lastSync), tamper: typeof ne.tamper === 'string' ? ne.tamper.slice(0, 300) : '', resetGen: int(ne.resetGen) };
  const cl = obj(raw.cloud);
  s.cloud = { on: cl.on !== false, rev: int(cl.rev), last: num(cl.last), recovery: !!cl.recovery };
  const da = obj(raw.daily);
  s.daily = { last: typeof da.last === 'string' ? da.last : '', streak: int(da.streak), best: int(da.best) };
  const tp = obj(raw.tips);
  s.tips = { last: Math.min(num(tp.last), Date.now()), read: Array.isArray(tp.read) ? tp.read.filter(x => typeof x === 'string') : [],
    pending: typeof tp.pending === 'string' ? tp.pending : null };
  s.tuto = !!raw.tuto || raw.v === 1 || int(raw.totalClicks) > 50; // anciens joueurs : pas de tutoriel imposé
  const pr = obj(raw.prestige);
  s.prestige = { seasons: int(pr.seasons), seeds: int(pr.seeds), lifetime: Math.max(num(pr.lifetime), s.totalEarned), spent: int(pr.spent), talents: {} };
  for (const k of Object.keys(obj(pr.talents))) s.prestige.talents[k] = true;
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
  s.settings.dark = !!st.dark;
  return s;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    replaceState(sanitize(JSON.parse(raw)));
    const sig = localStorage.getItem(SIG);
    if (sig && sig !== sign(raw)) report('Sauvegarde modifiée dans le navigateur');
    return true;
  } catch { return false; }
}

export function exportSave() {
  save();
  const json = JSON.stringify(state);
  return PREFIX + btoa(unescape(encodeURIComponent(json))) + '~' + sign(json);
}

export function importSave(code) {
  code = code.trim();
  if (!code.startsWith(PREFIX)) throw new Error('Code invalide');
  const [b64, sig] = code.slice(PREFIX.length).split('~');
  const json = decodeURIComponent(escape(atob(b64)));
  replaceState(sanitize(JSON.parse(json)));
  if (sig && sig !== sign(json)) report('Code de sauvegarde modifié avant import');
  save();
}

export function hardReset() {
  replaceState(freshState());
  save();
}

// Gains pendant l'absence : CPS × durée (plafonnée) × efficacité. Retourne { gain, seconds }
export function applyOffline(seconds) {
  const capped = Math.min(seconds, (hasTalent('nuit2') ? 16 : CONFIG.offlineMaxHours) * 3600);
  const rate = (hasTalent('nuit') ? 0.75 : CONFIG.offlineRate) + projectEffects('offline').reduce((a, e) => a + e.add, 0);
  const gain = totalCps() * capped * Math.min(1, rate);
  if (gain > 0) earn(gain);
  return { gain, seconds: capped };
}
