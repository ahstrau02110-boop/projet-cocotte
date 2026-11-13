# Panty Clicker

Clicker idle kawaii sous Unity : une culotte chibi à tapoter, une ville pastel à bâtir, des dizaines de Pantsu à collectionner.
Mécaniques reprises de Co'Clicker (dossier `cocotte-clicker/`), sans tout ce qui concernait le tiers-lieu.

## Ouvrir et lancer

1. Unity Hub → *Add project from disk* → dossier `panty-clicker/` (Unity 6, 6000.x).
2. À la première ouverture, le projet se prépare tout seul : scène `Assets/Scenes/Main.unity`, Build Settings, orientation portrait, import des sprites (menu *Panty Clicker → Préparer le projet* pour relancer).
3. **Play**. Tout est construit en code au démarrage (`GameRunner`), aucun objet à placer dans la scène.

Vue de jeu conseillée : 1080 x 1920 (portrait). Sauvegarde : `Application.persistentDataPath/panty-save.json` (+ `.bak`), auto toutes les 10 s.

## Contenu

| Système | Détail |
|---|---|
| Clic | Pantsu équipée, combos de particules, tissus trouvés au hasard |
| Bâtiments | 18 sur 5 ères (Chambre Cosy → Galaxie Mignonne), coût x1,15 |
| Améliorations | 126 paliers par bâtiment + 19 uniques (clic, % de production, collabs) |
| Succès | 196 générés, +0,4 % de production chacun, paliers en Gemmes |
| Pantsu dorée | Apparition aléatoire, 9 bonus (Frénésie, Jackpot, Inspiration…) |
| Capsules | Skins et décors, garantie Légendaire à 60, x10 = 1 Rare garantie, doublons remboursés |
| Atelier couture | 4 tissus → 10 recettes (bonus, Gemmes, skins exclusifs) |
| Commandes | Habitant·es qui demandent des tissus → Gemmes, Cœurs, réputation |
| Grand Lavage | Prestige → Pétales (+1,5 %/Pétale) et 13 talents |
| Renaissance Arc-en-ciel | Méga-prestige : +25 % permanent et skin exclusif |
| Connexion | Série sur 7 jours, Bouclier de série |
| Missions | 3 par jour + 3 par semaine, bonus si toutes faites |
| Mini-jeux | Paires de Pantsu, Attrape-Pantsu, Pop les bulles |
| Ville (city builder idle) | Grille 5x5 → 10x10, poser ses bâtiments (+2 %/niveau à leur production), 14 décos à aura (bonus aux voisins), 6 sols, niveaux 1 à 10, nom de ville. Le Bonheur donne de la production et remplit le Coffre à Cœurs (plafonné : il faut revenir le vider). Après un Grand Lavage, les bâtiments posés « dorment » jusqu'à être rachetés |
| Boutique | Boutique du jour (6 articles, renouvelés à minuit), articles permanents, packs de Gemmes, abonnement Lune |

### FOMO

- Bandeau défilant en haut de l'écran avec tous les comptes à rebours.
- Pack de bienvenue -80 % pendant 72 h après la première partie, une seule fois.
- Vente flash -50 % : 30 min toutes les 4 h.
- Bannière vedette des capsules : un skin Épique/Légendaire mis en avant, change tous les 3 jours.
- Happy Hours 12 h-13 h et 19 h-20 h : production x2.
- Événements datés (Saint-Valentin, été, Halloween, Érables, Black Friday, Noël, Erreur 404 le 4 du mois, week-end capsules) avec skins en édition limitée.
- Cadeau gratuit toutes les 8 h, série de connexion qui se casse, Coffre de la Ville qui déborde, missions qui expirent.

Tous les réglages sont dans `Assets/Resources/Data/*.json` (`config.json` → bloc `fomo`).

## Achats réels

`SimulatedStore` accepte les achats dans l'éditeur et les builds de développement, les refuse en release.
Avant publication : installer **In-App Purchasing** (`com.unity.purchasing`), écrire une classe qui implémente `PantyClicker.Core.IStore` (identifiants = `id` des packs de `shop.json`) et l'assigner dans `GameRunner` (`G.Store = ...`).

## Graphismes

Tous les sprites (skins, bâtiments, décos, sols, icônes, fonds) sont générés depuis l'image de base par `Tools/gen_sprites.py` à partir des JSON :

```bash
pip install cairosvg
python3 Tools/gen_sprites.py
```

Ajouter un skin = une ligne dans `skins.json` (couleurs, motif, yeux, accessoire, effet), puis relancer le script.
Police : Fredoka (SIL OFL, `Assets/Resources/Fonts/OFL.txt`).

## Tests du moteur

Le moteur (`Assets/Scripts/Core`) est en C# pur, testable sans Unity :

```bash
cd Tests/CoreTests
dotnet run
```

## Structure

```
Assets/Scripts/Core/   Règles du jeu (sans Unity) : économie, capsules, ville, boutique/FOMO, progression
Assets/Scripts/Game/   GameRunner (démarrage, boucle, sauvegarde), sprites, sons synthétisés, animations
Assets/Scripts/UI/     Interface uGUI construite en code : pages Clic, Ville, Capsules, Boutique, Quêtes, Plus, mini-jeux
Assets/Editor/         Préparation automatique du projet, import des sprites
Assets/Resources/      Data (JSON), Sprites (PNG générés), Fonts
Tools/                 Générateur de sprites
Tests/CoreTests/       Tests .NET du moteur
```
