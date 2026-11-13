// Méga-Prestige : on recommence VRAIMENT de zéro (saisons, graines, talents, succès, cristaux…).
// Seuls les skins de Cocotte et les décors sont conservés. En échange : une Cocotte exclusive
// à chaque Méga-Prestige et un bonus de production permanent.
import { DATA, state, freshState, replaceState, currentEra } from './state.js';
import { $, toast } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { skinImage } from './skins.js';

const cfg = () => DATA.config.mega || {};
export const megaPct = () => (state.mega?.level || 0) * (cfg().bonusPct ?? 25);
export const canMega = () => currentEra().id >= (cfg().minEra ?? 5) && state.prestige.seasons >= (cfg().minSeasons ?? 3);
const nextSkin = () => DATA.skins.find(s => s.mega === (state.mega.level || 0) + 1);

export function renderMega() {
  const show = canMega() || state.mega.level > 0;
  $('#mega-box').hidden = !show;
  if (!show) return;
  const lvl = state.mega.level;
  $('#mega-info').innerHTML = (lvl ? `🌌 Méga-Prestige niveau <b>${lvl}</b> · production <b>+${megaPct()} %</b> pour toujours<br>` : '')
    + (canMega() ? '<b>Méga-Prestige disponible !</b>'
      : `Prochain Méga-Prestige : atteindre l'ère ${cfg().minEra ?? 5} après au moins ${cfg().minSeasons ?? 3} Nouvelles saisons (vous en êtes à ${state.prestige.seasons}).`);
  $('#btn-mega').disabled = !canMega();
}

function openMega() {
  if (!canMega()) return;
  const sk = nextSkin(), lvl = state.mega.level + 1;
  $('#mega-skin').innerHTML = sk ? `<img src="${skinImage(sk.id)}" alt=""><b>${sk.name}</b><small>${sk.desc}</small>` : '<b>Toutes les Cocottes de Méga-Prestige sont déjà à vous !</b>';
  $('#mega-gain').textContent = `Méga-Prestige niveau ${lvl} : production +${lvl * (cfg().bonusPct ?? 25)} % pour toujours (au lieu de +${megaPct()} %).`;
  $('#mega-confirm').checked = false;
  $('#btn-mega-ok').disabled = true;
  $('#dlg-mega').showModal();
}

function doMega() {
  if (!canMega() || !$('#mega-confirm').checked) return;
  const sk = nextSkin(), s = state;
  // Conservé : identité, réglages, connexion en ligne, skins, décors, compteurs d'impressions (cohérence anti-triche),
  // bons QR déjà utilisés (anti-rejeu), explications déjà vues, Co'Survivor (jeu à part)
  const keep = {
    playerId: s.playerId, pseudo: s.pseudo, settings: s.settings, tuto: true, welcomed: true,
    net: { ...s.net }, cloud: { ...s.cloud }, online: { ...s.online }, claimed: [...s.claimed], helpSeen: { ...s.helpSeen },
    skins: { ...s.skins }, bgs: { ...s.bgs }, skin: s.skin, bg: s.bg, gacha: { ...s.gacha, sinceLegend: s.gacha.sinceLegend, bgSinceLegend: s.gacha.bgSinceLegend },
    mega: { level: s.mega.level + 1 }, surv: { ...s.surv, up: { ...s.surv.up } }, flags: { matsIntro: 1 }, daily: { ...s.daily },
  };
  const fresh = Object.assign(freshState(), keep);
  fresh.crystals = cfg().startCrystals ?? 50;
  if (sk) { fresh.skins[sk.id] = (fresh.skins[sk.id] || 0) + 1; fresh.skin = sk.id; }
  replaceState(fresh);
  save();
  sfx.unlock();
  sessionStorage.setItem('coclicker-mega-msg', sk ? sk.name : '');
  location.replace(location.pathname + location.search);
}

export function initMega() {
  $('#btn-mega').addEventListener('click', () => { sfx.ui(); openMega(); });
  $('#mega-confirm').addEventListener('change', e => { $('#btn-mega-ok').disabled = !e.target.checked; });
  $('#btn-mega-ok').addEventListener('click', doMega);
  const msg = sessionStorage.getItem('coclicker-mega-msg');
  if (msg !== null) {
    sessionStorage.removeItem('coclicker-mega-msg');
    setTimeout(() => toast(`🌌 Méga-Prestige niveau ${state.mega.level} ! Production +${megaPct()} % pour toujours${msg ? ` et nouvelle Cocotte : ${msg}` : ''}. Tout recommence !`, 9000), 1200);
  }
}
