# Co'Clicker

Jeu incrémental (type « clicker ») aux couleurs de **La Co'Cotte**, espace de partage et de création, 6 rue Marcellin Berthelot, 02110 Bohain-en-Vermandois.
100 % statique (HTML/CSS/JS vanilla, modules ES), sans build, hébergeable gratuitement sur GitHub Pages.

## En ligne

- Jeu : https://ahstrau02110-boop.github.io/projet-cocotte/cocotte-clicker/
- Espace équipe : https://ahstrau02110-boop.github.io/projet-cocotte/cocotte-clicker/admin.html

(dossier `cocotte-clicker/` du dépôt `projet-cocotte`, publié par GitHub Pages depuis la branche `main`).

## Installer l'application

Le jeu est une PWA : installable et jouable hors connexion.
- **Android (Chrome)** : ⚙️ Options → « 📲 Installer l'application », ou menu ⋮ → « Installer l'application ».
- **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».
- **Ordinateur (Chrome/Edge)** : icône d'installation dans la barre d'adresse.

À chaque mise en ligne, incrémenter `VERSION` dans `sw.js` pour que les appareils récupèrent la nouvelle version.

## Lancer en local

Les données sont chargées en `fetch`, il faut donc un petit serveur (ouvrir `index.html` directement ne marche pas) :

```bash
cd cocotte-clicker
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000. Alternative : `npx serve .`

## Déployer sur GitHub Pages

1. Créer un dépôt GitHub et y pousser le contenu du dossier (avec `index.html` à la racine).
2. *Settings → Pages → Build and deployment* : Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
3. Le jeu est en ligne sous `https://<compte>.github.io/<depot>/` après 1 à 2 minutes.

Le fichier `.nojekyll` évite le traitement Jekyll. Tous les chemins sont relatifs : aucune configuration supplémentaire.

## Structure

```
index.html             Version publique (le jeu)
admin.html             Version équipe : remise de cristaux par QR code (non liée, non indexée)
css/style.css          Thème, palette du logo en variables CSS, décor par ère
js/main.js             Démarrage, boucle de jeu, interface
js/state.js            État et règles (coûts, production, ères), CONFIG
js/save.js             localStorage, export/import, gains hors-ligne
js/fx.js               Fumée (canvas), « +N » flottants
js/audio.js            Effets sonores + musique lofi générée (WebAudio)
js/format.js           Abréviations K, M, B…
js/core.js             Outils partagés (notifications, bus d'événements)
js/skins.js            Génération des skins de Cocotte en SVG
js/backgrounds.js      Rendu CSS des décors du plan de travail
js/gacha.js            Imprimante mystère (tirages, collection)
js/games/              Mini-jeux : hub.js, match3.js, memory.js, bugs.js
js/player.js           QR code du joueur, encaissement des bons
js/qr.js               QR codes + vérification des signatures
js/admin.js            Espace équipe
js/admin-content.js    Onglet Contenu (édition sans code)
js/content.js          Application des surcharges (overrides.json + aperçu)
js/progress.js         Améliorations et succès
js/decor.js            Décor du plan de travail par ère
js/golden.js           Cocotte dorée et bonus temporaires
js/season.js           Projets de La Co'Cotte + Nouvelle saison (prestige)
js/tips.js             Astuces numériques (une par heure)
js/boosts.js           Station Boosts (Le saviez-vous ?, quiz)
js/daily.js            Bonus quotidien et série
js/community.js        Mode communautaire (Supabase)
js/events.js           Événements + calendrier
js/pdf-planning.js     Lecture du planning PDF (espace équipe)
js/scanner.js          Lecture de QR par la caméra
supabase/setup.sql     Base communautaire à installer dans Supabase
sw.js                  Service worker (hors connexion)
manifest.webmanifest   Manifeste de l'application
js/vendor/             qrcode.js (MIT), jsQR.js (Apache-2.0)
data/buildings.json    Bâtiments
data/eras.json         Ères et seuils de déblocage
data/skins.json        Skins et taux de rareté
data/backgrounds.json  100 décors du plan de travail
tools/                 Générateur des décors
data/upgrades.json     Améliorations
data/achievements.json Succès
data/projects.json     Projets de La Co'Cotte
data/tips.json         Astuces numériques
data/infos.json        « Le saviez-vous ? » sur La Co'Cotte
data/quiz.json         Questions du quiz express
data/talents.json      Talents de saison (prestige)
data/events.json       Événements et objets exclusifs
data/calendar.json     Notre calendrier (ateliers)
data/overrides.json    Contenu publié depuis l'espace équipe ({} = contenu d'origine)
data/config.json       Code admin, clé publique, récompenses, réglages gacha et mini-jeux
assets/manifest.json   Référence unique de tous les assets (clé → chemin)
assets/img/            Illustrations SVG chibi
assets/logo/           Logo
```

## Ajouter du contenu

**Bâtiment** : ajouter une entrée dans `data/buildings.json`, dans l'ordre de prix :

```json
{ "id": "graveuse", "name": "Graveuse laser", "era": 3, "baseCost": 1400000, "baseCps": 1400,
  "desc": "Grave le bois, le cuir et les souvenirs." }
```

puis déclarer son image dans `assets/manifest.json` : `"building.graveuse": "assets/img/b-graveuse.svg"`.
Coût réel = `baseCost × 1,15^possédés`. Repère : chaque bâtiment ≈ ×11 en coût et ×6 à ×8 en production par rapport au précédent.

**Ère** : `data/eras.json`, `unlockAt` = total de Co'Coins produits. Le décor associé est la classe `body.era-N` dans `css/style.css`.

**Musique** : par défaut, une boucle lofi est générée en direct (aucun fichier, aucun droit d'auteur). Pour utiliser un morceau à la place, renseigner `"music": "assets/audio/mon-morceau.mp3"` dans `assets/manifest.json` (fichier libre de droits ou sous licence compatible).

**Image** : remplacer un fichier, ou changer le chemin dans `assets/manifest.json` (n'importe quel format web, carré conseillé).

## Bâtiments, améliorations, succès

**14 bâtiments** sur 4 ères : Atelier (Bénévole, Établi, Bricol'Café), FabLab (Poste informatique, Imprimante 3D, Graveuse laser, Brodeuse numérique), Tiers-lieu (Atelier numérique, Soirée événement, Tournée itinérante), Territoire (Réseau de partenaires, Rayonnement du Vermandois, Festival Co'Cotte, Réseau des tiers-lieux).

**Améliorations** (`data/upgrades.json`) :
- 7 paliers ×2 générés automatiquement pour chaque bâtiment (à 1, 5, 25, 50, 100, 150, 200 possédés) : 98 améliorations ;
- 20 améliorations uniques : clic ×2, clic + 1 % de la production, production globale +5 à +20 %.

**Succès** (`data/achievements.json`) : 128 succès (clics, production, vitesse, ères, bâtiments, Imprimante mystère, mini-jeux, visites à La Co'Cotte). Chaque succès = **+1 % de production**. Les succès « par bâtiment » sont générés depuis `buildingTemplates`.

## Cocotte dorée, projets, Nouvelle saison

**Cocotte dorée** : apparaît toutes les 2 à 5 min pendant 13 s (réglable : `config.json` → `golden`). Effets : Coup de feu (production ×7, 77 s), Jackpot (+15 % de la réserve, max 15 min de production), Portes ouvertes (production ×3 et clics ×7, 30 s), Coup de main (1 à 3 bâtiments offerts), Inspiration (clics ×77, 13 s), rarement +2 💎.

**Projets de La Co'Cotte** (`data/projects.json`), achats uniques dans la boutique :

| Projet | Ère | Effet |
|---|---|---|
| Créagames | FabLab | Mini-jeux : Co'Coins ×3 · Poste informatique ×2 |
| Antre en Ligne (Numériteam) | Tiers-lieu | Atelier numérique ×3 · Poste informatique ×2 |
| Atelier Musique | Tiers-lieu | Production +10 % · 2ᵉ musique « Atelier Musique » |
| Prison Van Break | Tiers-lieu | Tournée itinérante ×3 · Cocottes dorées +30 % |

Les descriptions (`desc`) sont volontairement courtes : à compléter avec la vraie présentation de chaque projet.

**Nouvelle saison** (prestige, dès l'ère Tiers-lieu) : remet à zéro Co'Coins, bâtiments, améliorations et projets ; conserve cristaux, skins, succès, records. Rapporte des **graines de saison** : total = ⌊∛(Co'Coins produits depuis le début / 1 milliard)⌋, chacune **+2 % de production pour toujours**, et +5 💎 par saison.

## Durée de vie estimée

Simulation (joueur qui achète au mieux, absences comptées à 50 % plafonnées à 8 h) :

| | 2×30 min/jour | 15 min/jour |
|---|---|---|
| Ère Tiers-lieu | ~12 h | ~2 jours |
| Ère Territoire | ~2 jours | ~6 jours |
| 12 bâtiments | ~8 jours | ~19 jours |
| Collection complète (50 skins + 100 décors) | plusieurs années : objectif à très long terme |

La boucle Nouvelle saison relance ensuite la progression sans fin (chaque saison va plus vite et vise plus loin).

## Astuces numériques

Tuile 💡 « Astuces » : une nouvelle astuce sur le numérique toutes les heures (sécurité, smartphone, ordinateur, internet, IA, numérique responsable, culture geek, FabLab). Le bouton « J'ai lu » se débloque après 8 s de lecture et rapporte **+5 💎**. Les astuces lues restent consultables. 41 astuces dans `data/tips.json` (à compléter librement) ; réglages dans `config.json` → `tips` (intervalle, cristaux, temps de lecture). 3 succès associés.

## Boosts et bonus quotidien (palier 4)

**Station Boosts** (tuile ⚡) : deux boosts de production, rechargés toutes les 15 min.
- **📍 Le saviez-vous ?** : une info sur La Co'Cotte (lieu, machines, projets, ateliers…), lisible 6 s → production ×2 pendant 2 min. 14 infos dans `data/infos.json`, **à compléter** (programme du mois, partenaires…).
- **❓ Quiz express** : une question numérique ou sur La Co'Cotte → bonne réponse : ×3 pendant 2 min ; mauvaise : ×1,5 pendant 1 min + explication. 28 questions dans `data/quiz.json`.

**Bonus du jour** : à la première ouverture de la journée, 3 → 4 → 5 → 6 → 8 → 10 → 15 💎 sur 7 jours (+ production ×2 pendant 5 min le 7ᵉ jour), puis le cycle recommence. Un jour manqué remet la série à 1. Réglages : `config.json` → `daily` et `boosts`.

7 succès associés (infos, quiz, séries de 3, 7 et 30 jours).

## Mode communautaire (palier 5)

Compteur collectif, 5 objectifs communs (bonus de production pour tous : +2 %, +3 %, +5 %, +5 %, +10 %) et classement par pseudo. Carte « 🌍 Communauté » sous la carte des ères. **Sans configuration, la carte est masquée et le jeu fonctionne en solo** (idem si le serveur est injoignable : dernières valeurs connues).

Backend choisi : **Supabase** (offre gratuite, base PostgreSQL + API prête à l'emploi, aucune ligne de serveur à écrire).

1. Créer un compte sur supabase.com → *New project* (région Europe, mot de passe au choix).
2. *SQL Editor* → coller tout `supabase/setup.sql` → *Run*.
3. *Project Settings → API* : copier *Project URL* et la clé *anon public*.
4. Les coller dans `data/config.json` → `community.url` et `community.anonKey`, puis publier.

La clé *anon* est publique par nature : la table est fermée (RLS sans accès direct), tout passe par 4 fonctions SQL. Anti-triche côté serveur : jeton secret par appareil, une mise à jour toutes les 30 s maximum, progression plafonnée (30× la production connue sur le temps écoulé), valeurs bornées. Données : code joueur anonyme, pseudo facultatif (20 caractères), scores ; case « Apparaître dans le classement » décochable. Pour retirer un pseudo inapproprié : *Table Editor → players*.

## Talents de saison (prestige)

15 talents permanents achetés avec les graines de saison (bouton « 🌱 Talents de saison » de la carte Nouvelle saison) : départ avec 1 000 Co'Coins, 10 bénévoles offerts, clics ×2, Cocottes dorées plus fréquentes / plus longues, hors-ligne 75 % et 16 h, bâtiments −5 %, améliorations −10 %, projets −25 %, boosts en 10 min, +10 💎 au bonus du jour, +20 💎 de plafond mini-jeux, impression ×10 à 200 💎, graines à +3 %. Les graines dépensées continuent de donner leur bonus. Liste : `data/talents.json`.

## Scanner et QR de groupe

- **Jeu** : tuile « 📷 Scanner » (et bouton dans « Mon QR code ») pour lire le QR de récompense avec la caméra, **indispensable pour l'appli installée**.
- **Espace équipe**, en 4 onglets : 🎁 Un joueur (1. scanner son QR, 2. choisir le montant, 3. créer le QR affiché en plein écran), 👥 Un groupe, 📋 Historique, ⚙️ Réglages (clé, QR du jeu).
- **QR de groupe** : un seul QR pour tout un atelier ; chaque joueur peut l'utiliser une fois, pendant 1 h, 3 h, 24 h ou 3 jours. Bouton « Imprimer ».

## Mode sombre

⚙️ Options → « 🌙 Mode sombre ». Réglage mémorisé, appliqué dès le chargement.

## Modifier le contenu sans coder (palier 6)

Espace équipe → onglet **✏️ Contenu** :
- **🖼️ Images** : remplacer n'importe quel asset du `manifest` (logo, Cocotte classique, pièce, cristal, curseur, bâtiments) par un lien ou un fichier de l'appareil (réduit à 512 px), ou indiquer un fichier audio pour la musique.
- **🏗️ Bâtiments / 🗺️ Ères / 📌 Projets** : noms, descriptions, coûts, productions, seuils, présentation des projets.
- **💡 Astuces / 📍 Le saviez-vous ? / ❓ Quiz** : ajouter, modifier, supprimer.
- **⚖️ Économie** : prix des tirages, cristaux gagnés, bonus du jour, astuces, boosts, Cocotte dorée, graines de saison.

Le brouillon est enregistré sur l'appareil. **👁️ Aperçu** ouvre le jeu avec les modifications (bandeau rose, visible seulement sur cet appareil ; « Quitter l'aperçu » pour revenir).

### Publier pour tous les joueurs

1. **📤 Publier** télécharge `overrides.json` (le jeu vérifie d'abord que les textes sont complets).
2. Sur GitHub, ouvrir `cocotte-clicker/data/` → *Add file* → *Upload files* (lien direct dans l'onglet 📤 Publier), déposer le fichier (il remplace l'ancien) → *Commit changes*.
3. En 1 à 2 minutes, tous les joueurs ont le nouveau contenu (appli installée : à la prochaine ouverture).

Le code et les fichiers `data/*.json` d'origine ne sont jamais modifiés : `overrides.json` ne contient que les différences. Pour tout remettre à l'origine, publier un fichier vide (« ↺ Tout annuler » puis « 📤 Publier »). « 📂 Importer un fichier » reprend un `overrides.json` existant (sauvegarde, autre appareil de l'équipe).

## Événements

Tuile **🎉 Événements** : événements en cours (avec compte à rebours) et à venir, boutique d'objets exclusifs payés en cristaux (absents des imprimantes mystère).

| Événement | Dates | Bonus | Objets |
|---|---|---|---|
| 👾 Erreur 404 : la Cocotte a buggé ! | permanent | — | Cocotte glitchée (404 💎), décor Écran glitché (202 💎) |
| 🎄 L'Avent du FabLab | 1er–31 décembre | production +10 % | Cocotte des neiges (250 💎), décor Nuit de neige (150 💎) |

Ajouter un événement : `data/events.json` (dates `AAAA-MM-JJ`, vides = permanent ; `bonusPct` ; `offers` = skins/décors marqués `"event": true` dans `skins.json` / `backgrounds.json`, rareté `evenement`).

## Notre calendrier

Section **📅 Notre calendrier** dans l'onglet 💡 Astuces, juste sous l'encart sur les ateliers. Vide pour l'instant (message « bientôt »). Pour y mettre le planning : espace équipe → ✏️ Contenu → **📅 Calendrier** (date, horaire, titre, description), puis publier. Seuls les ateliers à venir s'affichent, dans l'ordre.

**Importer directement le PDF du programme du mois** : ✏️ Contenu → 📅 Calendrier → « 📂 Importer le PDF du planning ». L'espace équipe :
- transforme la (les) page(s) en image affichée dans le jeu (« 🔍 Voir le programme », « ⬇️ Télécharger le PDF ») ;
- détecte automatiquement les ateliers (dates « 03 NOV », « MAR 17 », « LUN 16 · 23 », rendez-vous récurrents « Mercredis 4, 18 & 25 · 14h00 - 16h30 ») et remplit le calendrier du mois (à vérifier, modifiable) ;
- à la publication, télécharge 3 fichiers à déposer ensemble sur GitHub (`overrides.json`, `planning-AAAA-MM.pdf`, `planning-AAAA-MM-1.webp`).

Fonctionne avec la mise en page des plannings habituels (programme de novembre 2026 : 23 rendez-vous détectés). Lecture PDF : PDF.js, chargé uniquement dans l'espace équipe.

## Tutoriel

Au premier lancement, un tutoriel en 9 étapes met en lumière chaque zone (Cocotte, réserve, bâtiments, améliorations, ères, activités, cristaux). « Passer » à tout moment ; « Revoir le tutoriel » dans ⚙️ Options.

## Cristaux 💎

Monnaie secondaire, gagnée sans paiement :

| Source | Quantité (réglable dans `data/config.json`) |
|---|---|
| Bienvenue | 50 (une fois) |
| Nouvelle ère | 10 |
| Mini-jeux | 10 par partie terminée, plafond 100/jour (10 parties) |
| Astuce numérique (1/h) | 10 |
| Bonus du jour (7 jours) | 10, 15, 20, 25, 30, 40, 60 |
| Nouvelle saison | 10 |
| Cocotte dorée (rare) | 4 |
| QR code remis par l'équipe | 200 par défaut (1 à 2 000) |
| Doublon à l'Imprimante mystère | 2 / 6 / 16 / 40 selon la rareté |

En jouant seul : environ une impression tous les 2 jours. Une visite à La Co'Cotte (100 💎) = 4 impressions.

## Mini-jeux

- **Fab'Match** : jeu d'alignement 7×7 (engrenages, bobines, écrous…), 20 coups. 4 alignées = pièce laser (vide la ligne/colonne), 5 = Cocotte bonus (vide une couleur). Objectifs : 1 500 / 3 000 / 4 500.
- **Memory des machines** : 6 paires, étoiles selon le nombre d'essais.
- **Chasse aux bugs** : 30 s, toucher les bugs, éviter les dossiers. Objectifs : 200 / 400 / 600.
- **Séquence des machines** : retenir et rejouer une suite de machines qui s'allument (avec sons). Objectifs : 5 / 8 / 11.
- **Puzzle des skins** : reconstituer une de ses Cocottes, posée sur un de ses décors, en échangeant les pièces. 3×3 (4×4 pour les skins Épiques et Légendaires) ; étoiles selon l'écart au nombre minimal d'échanges.

Chaque étoile rapporte aussi 20 s de production en Co'Coins. Tous jouables au clavier. Ajouter un jeu : créer un module dans `js/games/` (même forme que `memory.js`) et l'ajouter au tableau `GAMES` de `hub.js`.

## Imprimantes mystère (skins et décors)

Deux machines dans la même fenêtre : **Imprimante à Cocottes** (50 skins) et **Imprimante à décors** (100 décors du plan de travail, là où l'on clique : 50 Communs, 30 Rares, 14 Épiques animés, 6 Légendaires à effets). Mêmes prix et taux, garantie légendaire séparée pour chaque machine. Collection commune avec filtre Cocottes / Décors ; « Décor de l'ère » rétablit le décor d'origine. Chaque décor obtenu = **+0,5 % de production**.

Les décors sont générés par `tools/gen-backgrounds.py` dans `data/backgrounds.json` (modifiable à la main : motif, 4 couleurs, effet).

### Skins de Cocotte

Tirage ×1 (25 💎) ou ×10 (225 💎, au moins une Rare). 50 skins. Taux : Commune 60 %, Rare 28 %, Épique 10 %, Légendaire 2 %. Légendaire garantie au bout de 60 tirages sans légendaire.
Chaque skin différent obtenu donne **+1 % de production** (bonus de collection). Les skins sont purement gagnés en jouant : aucun achat.

Ajouter un skin dans `data/skins.json` :

```json
{ "id": "lin", "name": "Cocotte en lin", "rarity": "rare",
  "colors": { "body": "#e8dcc4", "shade": "#bfae8c" },
  "pattern": "stripes", "accessory": "headphones", "eyes": "happy", "desc": "Brodée au Bricol'Café." }
```

Options : `pattern` (stripes, wood, pixel, circuit, galaxy, dots, checker, hazard, hearts, lava, sparkles, flames), `accessory` (goggles, headphones, headset, antenna, crown, beanie, vr, helmet, cap, santa, party, nightcap, flame, bow, sunglasses, bandana, none), `eyes` (normal, led, pixel, happy, star, sleepy, wink, heart, none), `fx` (glow, holo), `gradient` (liste de couleurs). Ou `"img": "assets/img/mon-skin.png"` pour une illustration.

## Version publique / version équipe et QR codes

- **Public** (`index.html`) : menu « Mon QR code » → QR personnel + code joueur (8 caractères, anonyme) + pseudo facultatif.
- **Équipe** (`admin.html`, accès par code, non liée depuis le jeu, `noindex`) : donne des cristaux.

Déroulé à l'accueil :
1. Le joueur ouvre « Mon QR code ».
2. L'animateur le scanne : avec l'appareil photo de son téléphone (le lien ouvre directement l'espace équipe pré-rempli) ou avec le bouton 📷 Scanner (webcam du PC).
3. L'animateur choisit le montant (100 par défaut) puis « Créer le QR de récompense ».
4. Le joueur scanne ce QR avec l'appareil photo du téléphone où il joue : les cristaux arrivent. Sinon « Copier le lien » et le joueur le colle dans « J'ai reçu un code ».

Sécurité : chaque bon est **signé** (ECDSA P-256) avec une clé privée qui ne quitte jamais l'appareil de l'équipe. Le jeu vérifie avec la clé publique : impossible de fabriquer ou modifier un bon. Un bon ne vaut que pour un code joueur, une seule fois, 7 jours.

### Mise en service (une seule fois)

La clé publique est déjà dans `data/config.json`. Sur chaque appareil de l'équipe : ouvrir `admin.html` (code d'accès communiqué à l'équipe), puis « Importer une sauvegarde de clé » avec le fichier `cle-admin-cocotte-PRIVEE.json` (transmis à part, **jamais sur GitHub**).

Pour changer de clé : « Créer une nouvelle clé », copier la clé publique affichée dans `data/config.json` → `"adminPublicKey"`, publier, et redistribuer le nouveau fichier privé.

### Changer le code d'accès

Mettre dans `adminCodeSha256` l'empreinte du nouveau code :

```bash
printf 'MonNouveauCode' | sha256sum
```

Le code ne protège que l'interface : la vraie protection est la clé privée.

### Limites (version sans serveur)

Les cristaux sont crédités dans le navigateur qui ouvre le lien : le joueur doit scanner avec le téléphone où il joue. Avec le backend (palier communautaire), la remise se fera en un seul scan.

## Réglages (`js/state.js` → `CONFIG`)

| Clé | Défaut | Rôle |
|---|---|---|
| `costGrowth` | 1.15 | Croissance du coût par unité achetée |
| `offlineMaxHours` | 8 | Plafond des gains hors-ligne |
| `offlineRate` | 0.5 | Efficacité hors-ligne |
| `autosaveSec` | 10 | Fréquence de sauvegarde automatique |

## Sauvegarde

Automatique (toutes les 10 s, à la fermeture et au changement d'onglet) dans le `localStorage` du navigateur.
Menu ⚙️ : export en code texte (copié dans le presse-papiers) ou fichier `.txt`, import, remise à zéro.

## Audio

Tout est coupé par défaut. Boutons « Effets » et « Musique » en haut à droite, volumes séparés dans ⚙️ Options.
Effets : clic (notes pentatoniques accordées avec la musique), achat, achat impossible, nouvelle ère, interface.
Musique : grille Rém9 · Sol13 · Domaj9 · Lam9 à 74 BPM, batterie swing, basse, piano électrique, mélodie aléatoire, craquements de vinyle. Pause automatique quand l'onglet est caché.

## Accessibilité

Police Atkinson Hyperlegible (conçue pour la basse vision), base 18 px, contrastes forts, cibles tactiles ≥ 44 px, tout jouable au clavier (Tab, Entrée/Espace, flèches sur ×1/×10/×100), lien d'évitement, `prefers-reduced-motion` respecté, son et musique coupés par défaut. Mini-jeux jouables au clavier, formes + couleurs distinctes dans Fab'Match (daltonisme).

## Feuille de route

- [x] **Palier 1** : clic + fumée + « +N », 5 bâtiments, 4 ères (Atelier, FabLab, Tiers-lieu, Territoire), sauvegarde/export/import, hors-ligne plafonné, thème FabLab, effets sonores + musique lofi
- [x] **Palier 2** : 72 améliorations, 69 succès avec badges, 12 bâtiments sur 4 ères, décor par ère, économie des cristaux rééquilibrée
- [x] **Mini-jeux, cristaux, Imprimante mystère (18 skins, 4 raretés), QR joueur + espace équipe signé**
- [x] **Palier 3** : Cocotte dorée, 4 projets de La Co'Cotte, prestige « Nouvelle saison », 2ᵉ musique, application installable (PWA)
- [x] **Enrichissement** : tutoriel, 36 skins, 4ᵉ mini-jeu, 14 bâtiments, 118 améliorations, 128 succès, 6 effets de Cocotte dorée
- [x] **Astuces numériques** : une par heure, +5 💎
- [x] **Collection** : 50 skins de Cocotte, Imprimante à décors (100 décors), mini-jeu Puzzle des skins
- [x] **Palier 4** : station Boosts (Le saviez-vous ? + quiz), bonus quotidien et série de jours, mention des ateliers dans les Astuces
- [x] **Palier 5** : compteur communautaire, objectifs collectifs, classement par pseudo (Supabase), 15 talents de saison, scanner intégré, QR de groupe, espace équipe repensé, mode sombre, récompenses en cristaux ×2
- [x] **Événements** (boutique d'objets exclusifs, Cocotte glitchée 404 💎) et section « Notre calendrier »
- [x] **Palier 6** : édition du contenu depuis l'espace équipe (images, bâtiments, ères, projets, astuces, infos, quiz, économie), aperçu, publication par `overrides.json`
