// Détail de la production : d'où viennent tous les bonus
import { DATA, state, totalCps, clickValue, collectionBonus, dupBonus, skinDupes, bgDupes, achievementBonus, seedBonus,
  communityPct, teamPct, eventPct, upgradesGlobal, projectEffects, projMilestonePct, repPct, repLevel, activeBuffs, buffMult } from './state.js';
import { $ } from './core.js';
import { fmt } from './format.js';
import { sfx } from './audio.js';
import { KINDS } from './materials.js';

const pct = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR') + ' %';
const mul = m => '×' + (Math.round(m * 100) / 100).toLocaleString('fr-FR');

export function openStats() {
  const projG = projectEffects('global').reduce((m, e) => m * e.mult, 1);
  const rows = [
    ['🍲', 'Collection (skins et décors différents)', '+' + pct(collectionBonus() - dupBonus())],
    ['🔁', `Doublons (${skinDupes()} Cocotte${skinDupes() > 1 ? 's' : ''}, ${bgDupes()} décor${bgDupes() > 1 ? 's' : ''})`, '+' + pct(dupBonus())],
    ['🏆', `Succès (${Object.keys(state.achievements).length})`, '+' + pct(achievementBonus())],
    ['🌱', 'Graines de saison', '+' + pct(seedBonus())],
    ['🌌', `Méga-Prestige (niveau ${state.mega?.level || 0})`, '+' + pct((state.mega?.level || 0) * (DATA.config.mega?.bonusPct ?? 25))],
    ['📌', `Paliers de projets (${Object.keys(state.projects).length} réalisés)`, '+' + pct(projMilestonePct())],
    ['🤝', `Réputation (niveau ${repLevel()})`, '+' + pct(repPct())],
    ['🌍', 'Objectifs collectifs', '+' + pct(communityPct())],
    ['🛡️', 'Équipe gagnante du mois', '+' + pct(teamPct())],
    ['🎉', 'Événements en cours', '+' + pct(eventPct())],
    ['⭐', 'Améliorations « toute la production »', mul(upgradesGlobal())],
    ['📌', 'Projets « production + »', mul(projG)],
    ['🌟', `Bonus temporaires (${activeBuffs().length})`, mul(buffMult('cps'))],
  ];
  $('#stats-top').innerHTML = `<div><b>${fmt(totalCps(), 1)}</b><small>Co'Coins / seconde</small></div>
    <div><b>${fmt(clickValue())}</b><small>par clic</small></div>
    <div><b>${fmt(state.prestige.lifetime)}</b><small>produits au total</small></div>
    <div><b>${fmt(state.crystals)}</b><small>cristaux</small></div>`;
  $('#stats-rows').innerHTML = rows.map(([i, l, v]) => `<li><span aria-hidden="true">${i}</span><span>${l}</span><b>${v}</b></li>`).join('');
  $('#stats-more').innerHTML = [
    ['👆', 'Clics', fmt(state.totalClicks)], ['🎮', 'Mini-jeux terminés', fmt(state.mini.plays)], ['🌟', 'Cocottes dorées', fmt(state.golden)],
    ['🛠️', 'Objets fabriqués', fmt(state.counters.crafted)], ['📋', 'Commandes livrées', fmt(state.counters.orders)],
    ['🎯', 'Missions réussies', fmt(state.counters.missions + state.counters.weekly)],
    ['📦', 'Matériaux récoltés au total', fmt(state.counters.matsGot)],
    ...KINDS().map(k => [k.icon, `${k.name} en stock`, fmt(state.mats[k.id])]),
  ].map(([i, l, v]) => `<li><span aria-hidden="true">${i}</span><span>${l}</span><b>${v}</b></li>`).join('');
  $('#dlg-stats').showModal();
}

export function initStats() {
  $('#btn-stats').addEventListener('click', () => { sfx.ui(); openStats(); });
}
