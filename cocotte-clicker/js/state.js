// État du jeu + règles de calcul (sans DOM)
export const CONFIG = {
  costGrowth: 1.15,          // croissance exponentielle du coût
  offlineMaxHours: 8,        // plafond des gains hors-ligne
  offlineRate: 0.5,          // efficacité hors-ligne (50 %)
  autosaveSec: 10,
};

// Données chargées au démarrage (data/*.json, assets/manifest.json)
export const DATA = { buildings: [], eras: [], manifest: {}, config: {}, skins: [], rarities: [], upgradeList: [], achList: [], projects: [] };

// Identifiant joueur anonyme (8 caractères, sans caractères ambigus)
export function newPlayerId() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  return [...r].map(x => abc[x % abc.length]).join('');
}

export function freshState() {
  return {
    v: 2,
    coins: 0,
    totalEarned: 0,   // total produit dans cette partie (sert aux ères)
    totalClicks: 0,
    handEarned: 0,
    buildings: {},    // { id: nombre possédé }
    crystals: 0,
    welcomed: false,
    playerId: newPlayerId(),
    pseudo: '',
    skins: { classique: 1 },          // { id: nombre obtenu }
    skin: 'classique',                 // skin équipé
    gacha: { pulls: 0, sinceLegend: 0 },
    claimed: [],                       // bons QR déjà encaissés (anti-rejeu)
    mini: { day: '', crystalsToday: 0, plays: 0, stars: 0, perfect: 0, best: {} },
    upgrades: {},                      // { id: true } améliorations achetées
    achievements: {},                  // { id: horodatage } succès obtenus
    projects: {},                      // { id: true } projets de La Co'Cotte réalisés (remis à zéro par saison)
    buffs: [],                         // bonus temporaires { id, name, cps, click, until }
    golden: 0,                         // Cocottes dorées attrapées
    prestige: { seasons: 0, seeds: 0, lifetime: 0 }, // Nouvelles saisons
    startedAt: Date.now(),
    lastSave: Date.now(),
    settings: { sound: false, music: false, sfxVol: 0.7, musicVol: 0.5, buyQty: 1, track: 'classique' },
  };
}

export let state = freshState();
export function replaceState(s) { state = s; }

export const owned = id => state.buildings[id] || 0;

// Coût de `qty` unités : somme géométrique base·r^n·(r^qty − 1)/(r − 1)
export function costOf(b, qty = 1) {
  const r = CONFIG.costGrowth, n = owned(b.id);
  return Math.ceil(b.baseCost * Math.pow(r, n) * (Math.pow(r, qty) - 1) / (r - 1));
}

// ---------- Multiplicateurs ----------
const bought = type => DATA.upgradeList.filter(u => u.type === type && state.upgrades[u.id]);

// Effets des projets réalisés
export const projectEffects = type => DATA.projects.filter(p => state.projects[p.id]).flatMap(p => p.effects).filter(e => e.type === type);

// Bonus temporaires actifs (Cocotte dorée, boosts)
export const activeBuffs = () => state.buffs.filter(b => b.until > Date.now());
export const buffMult = kind => activeBuffs().reduce((m, b) => m * (b[kind] || 1), 1);

// Graines de saison (prestige)
export const seedBonus = () => state.prestige.seeds * (DATA.config.prestige?.seedPct ?? 2);

// Améliorations propres à un bâtiment (×2 par palier) + projets
export function buildingMult(id) {
  return bought('building').filter(u => u.building === id).reduce((m, u) => m * u.mult, 1)
    * projectEffects('building').filter(e => e.target === id).reduce((m, e) => m * e.mult, 1);
}
export const upgradesGlobal = () => bought('global').reduce((m, u) => m * u.mult, 1);
export const achievementBonus = () => Object.keys(state.achievements).length * (DATA.config.achievements?.prodBonusPct ?? 1);

export function buildingCps(b) { return b.baseCps * buildingMult(b.id) * globalMult(); }

// Bonus de collection : +X % de production par skin différent obtenu (hors skin de départ)
export function collectionBonus() {
  const pct = DATA.config.gacha?.collectionBonusPct ?? 1;
  return (Object.keys(state.skins).length - 1) * pct;
}
export function globalMult() {
  return (1 + collectionBonus() / 100) * (1 + achievementBonus() / 100) * (1 + seedBonus() / 100) * upgradesGlobal()
    * projectEffects('global').reduce((m, e) => m * e.mult, 1);
}

export function totalCps() {
  return DATA.buildings.reduce((s, b) => s + owned(b.id) * buildingCps(b), 0) * buffMult('cps');
}

// Valeur d'un clic : base × améliorations de clic + % de la production
export function clickValue() {
  const mult = bought('click').reduce((m, u) => m * u.mult, 1);
  const pct = bought('clickCps').reduce((p, u) => p + u.pct, 0);
  return (mult + totalCps() * pct / 100) * buffMult('click');
}

export function earn(n) {
  state.coins += n;
  state.totalEarned += n;
  state.prestige.lifetime += n;
}

export function addCrystals(n) { state.crystals = Math.max(0, Math.floor(state.crystals + n)); }

export function buy(b, qty) {
  const c = costOf(b, qty);
  if (state.coins < c) return false;
  state.coins -= c;
  state.buildings[b.id] = owned(b.id) + qty;
  return true;
}

export function currentEra() {
  let era = DATA.eras[0];
  for (const e of DATA.eras) if (state.totalEarned >= e.unlockAt) era = e;
  return era;
}
