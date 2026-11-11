// Surcharges de contenu (palier 6) : modifications faites dans l'espace équipe, sans toucher au code
// - data/overrides.json : version publiée, appliquée pour tous les joueurs
// - brouillon local (localStorage) : aperçu sur l'appareil de l'équipe avant publication
export const DRAFT_KEY = 'coclicker-admin-draft';
export const PREVIEW_KEY = 'coclicker-admin-preview';

// Champs modifiables par type de liste (les autres restent ceux du code)
export const EDITABLE = {
  buildings: ['name', 'desc', 'baseCost', 'baseCps'],
  eras: ['name', 'tagline', 'unlockAt'],
  projects: ['name', 'desc', 'effectText', 'cost'],
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (isObj(v) && isObj(target[k])) deepMerge(target[k], v);
    else target[k] = v;
  }
  return target;
}

// Applique une surcharge sur les données chargées (DATA du jeu)
export function applyOverrides(DATA, ov) {
  if (!isObj(ov)) return;
  if (isObj(ov.manifest)) Object.assign(DATA.manifest, ov.manifest);
  for (const [list, fields] of Object.entries(EDITABLE)) {
    for (const [id, patch] of Object.entries(ov[list] || {})) {
      const item = (DATA[list] || []).find(x => String(x.id) === String(id));
      if (!item) continue;
      for (const f of fields) if (patch[f] !== undefined && patch[f] !== '') item[f] = patch[f];
    }
  }
  // Listes de textes : remplacées entièrement si fournies
  for (const list of ['tips', 'infos', 'quiz']) if (Array.isArray(ov[list]) && ov[list].length) DATA[list] = ov[list];
  // Calendrier : peut être vidé volontairement
  if (Array.isArray(ov.calendar)) DATA.calendar = ov.calendar;
  if (ov.calendarDoc !== undefined) DATA.calendarDoc = ov.calendarDoc; // programme du mois (PDF + images), null = retiré
  if (isObj(ov.config)) deepMerge(DATA.config, ov.config);
}

export const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch { return null; } };
export const previewOn = () => localStorage.getItem(PREVIEW_KEY) === '1';
