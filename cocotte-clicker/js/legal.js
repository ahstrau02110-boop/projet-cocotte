// Mentions légales et données personnelles (⚙️ Options). Coordonnées dans data/config.json → legal.
import { DATA } from './state.js';
import { $, esc } from './core.js';
import { sfx } from './audio.js';

// Ligne affichée seulement si la valeur est renseignée
const line = (label, v, html = false) => (v ? `<li><b>${label} :</b> ${html ? v : esc(v)}</li>` : '');

function render() {
  const L = DATA.config.legal || {};
  const mail = L.email ? `<a href="mailto:${esc(L.email)}">${esc(L.email)}</a>` : '';
  const contact = mail || `en vous adressant à ${esc(L.editor || 'Val')} sur place, à ${esc(L.venue || "La Co'Cotte")}`;
  const date = L.updated ? new Date(L.updated + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  $('#legal-body').innerHTML = `
    <h3>Éditeur du jeu</h3>
    <p>Co'Clicker est un jeu réalisé et publié <b>à titre personnel, bénévole et non professionnel</b> par ${esc(L.editor || 'Val')}, animateur à La Co'Cotte (espace de partage et de création de Bohain-en-Vermandois). Ce n'est pas un service édité par La Co'Cotte.</p>
    <ul>
      ${line('Responsable de la publication', L.editor)}
      ${line('Contact', mail, true)}
    </ul>
    <p>Le jeu est gratuit, sans publicité ni achat. Conformément à l'article 6-III-2 de la loi n° 2004-575 du 21 juin 2004 (LCEN), l'éditeur non professionnel a communiqué ses coordonnées à l'hébergeur.</p>

    <h3>Hébergement</h3>
    <ul>
      <li><b>Site du jeu :</b> GitHub Pages, GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</li>
      <li><b>Fonctions en ligne</b> (classements, sauvegarde en ligne, Ligue classée, Co'Survivor, duels d'échecs) : Supabase, Inc. (supabase.com).</li>
      <li><b>Polices d'écriture :</b> Google Fonts (Google LLC), qui reçoit l'adresse IP de l'appareil lors du chargement.</li>
    </ul>

    <h3>Données personnelles</h3>
    <p>Aucun compte, aucune adresse e-mail, aucun nom réel n'est demandé. Le jeu n'utilise ni cookie publicitaire ni outil de mesure d'audience.</p>
    <ul>
      <li><b>Sur votre appareil</b> (stockage local du navigateur) : votre partie et vos réglages. Ils restent sur l'appareil ; « Effacer la partie » dans les Options les supprime.</li>
      <li><b>En ligne</b>, seulement pour les fonctions en ligne : un code joueur tiré au hasard, le pseudo que vous choisissez (facultatif), vos scores et statistiques de jeu, votre équipe, votre Cocotte partagée dans la galerie, vos parties d'échecs en ligne (coups et résultats, effacées après 30 jours), le titre choisi, votre dessin de l'Atelier pixel si vous le proposez à la galerie (affiché seulement après validation par l'éditeur), et une copie de votre sauvegarde si la sauvegarde en ligne est activée. La clé secrète de l'appareil et le code de secours ne sont conservés que sous forme d'empreinte illisible.</li>
      <li><b>Anti-triche :</b> les anomalies de jeu détectées sont enregistrées et effacées au bout de 90 jours.</li>
      <li><b>Caméra :</b> utilisée uniquement pour scanner les QR codes, sur votre appareil ; aucune image n'est envoyée.</li>
    </ul>
    <p>Ces données servent uniquement au fonctionnement du jeu (base légale : intérêt légitime de l'éditeur à proposer le jeu). Le responsable de ces données est l'éditeur du jeu. Elles ne sont ni vendues ni cédées. Vous pouvez à tout moment ne pas mettre de pseudo, vous retirer des classements, désactiver la sauvegarde en ligne (Options), ou demander l'accès, la rectification ou la suppression de vos données en donnant votre code joueur : ${contact}. En cas de difficulté, vous pouvez saisir la CNIL (cnil.fr).</p>

    <h3>Propriété intellectuelle</h3>
    <p>Le code, les textes, les illustrations et les Cocottes du jeu sont la propriété de leur auteur, ${esc(L.editor || 'Val')}. Le nom et le logo de La Co'Cotte, ainsi que les logos des partenaires, appartiennent à leurs détenteurs respectifs. Toute reproduction hors du cadre privé nécessite une autorisation.</p>
    ${date ? `<p class="muted small">Mise à jour : ${date}.</p>` : ''}`;
}

export function initLegal() {
  $('#btn-legal').addEventListener('click', () => { sfx.ui(); render(); $('#dlg-legal').showModal(); });
}
