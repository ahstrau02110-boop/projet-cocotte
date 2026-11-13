// Explication de chaque activité, affichée la première fois qu'on l'ouvre (puis rejouable depuis les options)
import { state } from './state.js';
import { $, toast } from './core.js';
import { save } from './save.js';

const HELP = {
  'btn-games': ['🎮', 'Mini-jeux', ['9 petits jeux : bulles, attrape-tout, recyclerie, memory, alignement, découpe laser, chasse aux bugs, séquence et puzzle.', 'Chaque partie terminée rapporte 10 💎 (jusqu\'à 100 💎 par jour).', 'Chaque étoile donne des Co\'Coins et un matériau 🪵.']],
  'btn-craft': ['🛠️', 'Établi de fabrication', ['Transformez vos matériaux (🪵 bois, 🧵 filament, ⚙️ composants, 🔋 batteries) en bonus de production, en cristaux…', '… ou en Cocottes exclusives, introuvables dans les imprimantes !', 'De nouvelles recettes se débloquent à chaque ère.']],
  'btn-orders': ['📋', 'Tableau des commandes', ['Des habitants du Vermandois commandent des objets à l\'atelier.', 'Livrez-les avec vos matériaux et des Co\'Coins : vous gagnez des cristaux et de la réputation.', 'Chaque niveau de réputation donne +1 % de production. Une nouvelle commande arrive régulièrement.']],
  'btn-stats': ['📊', 'Production', ['Le détail de tous vos bonus : collection, doublons, succès, projets, réputation…', 'Et vos statistiques de joueur.']],
  'btn-gacha': ['🎁', 'Imprimantes mystère', ['Dépensez vos cristaux 💎 pour imprimer des surprises.', '🍲 Cocottes : des skins pour votre Cocotte. 🖼️ Décors : des fonds pour le plan de travail.', 'Chaque nouvel objet augmente un peu votre production. L\'onglet Collection permet de les équiper.']],
  'btn-ach': ['🏆', 'Succès', ['Des badges à débloquer en jouant (clics, bâtiments, mini-jeux, visites à La Co\'Cotte…).', 'Chaque succès donne +1 % de production, pour toujours.']],
  'btn-events': ['🎉', 'Événements', ['Pendant les événements, des objets exclusifs sont à échanger contre des cristaux.', 'Ils ne sortent pas des imprimantes : ne les ratez pas !']],
  'btn-boost': ['⚡', 'Boosts', ['Lisez une info sur La Co\'Cotte ou répondez à une question du quiz.', 'Votre production est multipliée pendant quelques minutes.', 'Les boosts se rechargent toutes les 15 minutes.']],
  'btn-tips': ['💡', 'Astuces numériques', ['Une astuce sur le numérique toutes les heures : lisez-la pour gagner 10 💎.', 'Vous y trouvez aussi « Notre calendrier » : le programme des ateliers de La Co\'Cotte.']],
  'btn-scan': ['📷', 'Scanner', ['Pour récupérer les cristaux offerts par l\'équipe de La Co\'Cotte.', 'Visez le QR de récompense (ou le QR de groupe d\'un atelier) : les cristaux arrivent aussitôt.']],
  'btn-myqr': ['📱', 'Mon QR code', ['Votre carte de joueur, sans compte ni nom.', 'Montrez-la à l\'équipe pendant un atelier pour recevoir des cristaux.', 'Vous pouvez choisir un pseudo pour le classement.']],
  'btn-community': ['🌍', 'Communauté en ligne', ['Défi de la semaine à réussir tous ensemble, équipes (Atelier, FabLab, Tiers-lieu), classements des mini-jeux.', 'Exposez votre Cocotte dans la galerie et offrez 10 💎 par jour à un ami.', 'Pendant les événements : boss collectif et chasse au trésor à La Co\'Cotte !']],
};

let pending = null;

function show(id, el) {
  const [icon, title, lines] = HELP[id];
  $('#help-ico').textContent = icon;
  $('#help-title').textContent = title;
  $('#help-list').innerHTML = lines.map(l => `<li>${l}</li>`).join('');
  pending = el;
  $('#dlg-help').showModal();
  $('#btn-help-go').focus();
}

export function initHelp() {
  // Interception du premier clic sur chaque activité (phase de capture)
  document.addEventListener('click', e => {
    const el = e.target.closest(Object.keys(HELP).map(k => '#' + k).join(','));
    if (!el || state.helpSeen[el.id] || !state.tuto) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    show(el.id, el);
  }, true);
  $('#btn-help-go').addEventListener('click', () => {
    $('#dlg-help').close();
    if (!pending) return;
    state.helpSeen[pending.id] = true;
    save();
    const el = pending; pending = null;
    el.click(); // ouvre l'activité
  });
  $('#btn-help-reset').addEventListener('click', () => {
    state.helpSeen = {};
    save();
    toast('Les explications s\'afficheront de nouveau à l\'ouverture de chaque activité.');
  });
}
