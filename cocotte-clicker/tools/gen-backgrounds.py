# Génère data/backgrounds.json : 100 décors de plan de travail (motif × palette × effet)
# Usage : python3 tools/gen-backgrounds.py   (depuis le dossier cocotte-clicker)
import json, random
random.seed(2026)  # résultat reproductible

PAL = [  # nom, fond, accent, 3e, 4e
    ('menthe', '#e6f5dc', '#90c060', '#5f8f3a', '#ffffff'), ('framboise', '#ffe3ee', '#e41e6c', '#a8124d', '#ffffff'),
    ('lavande', '#efe6ff', '#b48cff', '#7b3fe4', '#ffffff'), ('océan', '#dff1ff', '#3d8fd6', '#2a6aa3', '#ffffff'),
    ('citron', '#fff6cc', '#fcd260', '#d9a400', '#ffffff'), ('ardoise', '#e4e7eb', '#6b7480', '#4a525c', '#ffffff'),
    ('corail', '#ffe6df', '#ff8a73', '#d9614b', '#ffffff'), ('sapin', '#dcefe4', '#2f7d5b', '#1f5a40', '#ffffff'),
    ('caramel', '#f7e7d2', '#c98a4b', '#8a5a2b', '#ffffff'), ('orange', '#ffeadb', '#f07e36', '#c4561b', '#ffffff'),
    ('nuit', '#1b1035', '#3c2472', '#7b3fe4', '#fcd260'), ('kraft', '#e8d5b5', '#a8743f', '#6b4520', '#fffaf0'),
    ('pistache', '#eef7d6', '#b5d96b', '#7ea83a', '#ffffff'), ('cerise', '#3a0d1e', '#e41e6c', '#ff7aa8', '#fcd260'),
    ('glacier', '#eefbff', '#9fe3f5', '#5ac8fa', '#ffffff'), ('sable', '#f6eedd', '#e0c9a0', '#bfa16b', '#ffffff'),
    ('aubergine', '#2a1458', '#5c3a9e', '#b48cff', '#fcd260'), ('pêche', '#fff0e6', '#ffb38a', '#ff8a73', '#ffffff'),
    ('turquoise', '#ddfaf3', '#5ef2c5', '#1fa98a', '#ffffff'), ('charbon', '#22252b', '#3a3f48', '#90c060', '#fcd260'),
]
SIMPLE = [('grid', 'Quadrillé'), ('dots', 'Pois'), ('pegboard', 'Panneau perforé'), ('stripes', 'Rayures'), ('diagonal', 'Biais'),
          ('checker', 'Damier'), ('waves', 'Vagues'), ('rings', 'Ondes'), ('tiles', 'Carreaux'), ('bricks', 'Briques')]
FANCY = [('plaid', 'Tartan'), ('zigzag', 'Zigzag'), ('blueprint', 'Plan technique'), ('confetti', 'Confettis'),
         ('stars', 'Ciel étoilé'), ('circuit', 'Circuit'), ('gradient', 'Dégradé')]
SCROLLABLE = {'grid', 'dots', 'pegboard', 'stripes', 'diagonal', 'checker', 'blueprint', 'stars'}

out, used = [], set()
def add(pat, pname, pal, rarity, fx=None, name=None):
    name = name or f"{pname} {pal[0]}"
    if name in used: return False
    used.add(name)
    out.append({'id': 'bg%03d' % (len(out) + 1), 'name': name[0].upper() + name[1:], 'rarity': rarity,
                'pattern': pat, 'colors': list(pal[1:]), **({'fx': fx} if fx else {})})
    return True

# 50 communes : motifs simples
combos = [(p, pal) for p in SIMPLE for pal in PAL]
random.shuffle(combos)
for (pat, pname), pal in combos:
    if sum(o['rarity'] == 'commune' for o in out) >= 50: break
    add(pat, pname, pal, 'commune')
# 30 rares : motifs élaborés
combos = [(p, pal) for p in FANCY for pal in PAL]
random.shuffle(combos)
for (pat, pname), pal in combos:
    if sum(o['rarity'] == 'rare' for o in out) >= 30: break
    add(pat, pname, pal, 'rare')
# 14 épiques : motifs animés (défilement ou pulsation) et soleils
epics = [(p, n) for p, n in SIMPLE + FANCY if p in SCROLLABLE]
k = 0
while sum(o['rarity'] == 'epique' for o in out) < 10:
    (pat, pname), pal = epics[k % len(epics)], PAL[(k * 7 + 3) % len(PAL)]
    add(pat, f"{pname} animé", pal, 'epique', 'scroll', name=f"{pname} {pal[0]} animé")
    k += 1
for pal in random.sample(PAL, 4):
    add('sunburst', 'Soleil', pal, 'epique', 'pulse', name=f"Soleil {pal[0]}")
# 6 légendaires : effets spéciaux
LEG = [('aurora', 'Aurore boréale', ('', '#0f1a3a', '#5ef2c5', '#7b3fe4', '#e41e6c'), 'hue'),
       ('sunburst', 'Explosion arc-en-ciel', ('', '#e41e6c', '#fcd260', '#90c060', '#3d8fd6'), 'hue'),
       ('stars', 'Galaxie', ('', '#120830', '#ffffff', '#fcd260', '#b48cff'), 'scroll'),
       ('aurora', 'Lave cosmique', ('', '#2a0a00', '#ff7a1a', '#e41e6c', '#fcd260'), 'pulse'),
       ('gradient', 'Holographique', ('', '#ff9ad5', '#9ad5ff', '#b8ff9a', '#ffe79a'), 'hue'),
       ('circuit', 'Matrice dorée', ('', '#1a1300', '#fcd260', '#e0a800', '#ffffff'), 'scroll')]
for pat, n, pal, fx in LEG:
    add(pat, n, pal, 'legendaire', fx, name=n)

assert len(out) == 100, len(out)
json.dump({'_doc': "100 décors du plan de travail (Imprimante à décors). Générés par tools/gen-backgrounds.py ; modifiables à la main. pattern : grid, dots, pegboard, stripes, diagonal, checker, waves, rings, tiles, bricks, plaid, zigzag, blueprint, confetti, stars, circuit, gradient, sunburst, aurora. colors : 4 couleurs #rrggbb. fx : scroll, pulse, hue.",
           'backgrounds': out}, open('data/backgrounds.json', 'w'), ensure_ascii=False, indent=1)
print({r: sum(o['rarity'] == r for o in out) for r in ['commune', 'rare', 'epique', 'legendaire']})
