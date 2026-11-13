#!/usr/bin/env python3
"""Génère tous les sprites de Panty Clicker (PNG) à partir des données JSON.

Base : la culotte fleurie rose (contour noir épais, motifs fleurs/cœurs/pois),
déclinée en skins chibi (oreilles, chapeaux, yeux d'anime, effets), bâtiments,
décos de ville, sols, icônes et fonds.

Usage : python3 Tools/gen_sprites.py   (depuis le dossier panty-clicker)
Dépendance : pip install cairosvg
"""
import json, math, os, random
import cairosvg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "Assets", "Resources", "Data")
OUT = os.path.join(ROOT, "Assets", "Resources", "Sprites")
INK = "#2b2233"  # contour (le noir doux de l'image d'origine)


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def save_png(svg, path, w, h=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=path, output_width=w, output_height=h or w)


def svg_doc(inner, vb="0 0 200 200"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{inner}</svg>'


# ---------------------------------------------------------------- formes de base
def heart_path(x, y, s):
    """Cœur centré en (x, y), taille s."""
    return (f"M{x},{y + .3 * s} C{x},{y - .2 * s} {x - .6 * s},{y - .4 * s} {x - .6 * s},{y + .05 * s} "
            f"C{x - .6 * s},{y + .35 * s} {x - .2 * s},{y + .55 * s} {x},{y + .8 * s} "
            f"C{x + .2 * s},{y + .55 * s} {x + .6 * s},{y + .35 * s} {x + .6 * s},{y + .05 * s} "
            f"C{x + .6 * s},{y - .4 * s} {x},{y - .2 * s} {x},{y + .3 * s}Z")


def heart(x, y, s, fill, extra=""):
    return f'<path d="{heart_path(x, y - .25 * s, s)}" fill="{fill}" {extra}/>'


def star_pts(x, y, r, n=5, inner=.45, rot=-90):
    pts = []
    for i in range(n * 2):
        rr = r if i % 2 == 0 else r * inner
        a = math.radians(rot + i * 180 / n)
        pts.append(f"{x + rr * math.cos(a):.1f},{y + rr * math.sin(a):.1f}")
    return " ".join(pts)


def star(x, y, r, fill, extra=""):
    return f'<polygon points="{star_pts(x, y, r)}" fill="{fill}" {extra}/>'


def sparkle(x, y, r, fill="#fff"):
    return f'<polygon points="{star_pts(x, y, r, 4, .28)}" fill="{fill}"/>'


def flower(x, y, r, fill, center=None, petals=5, rot=0):
    out = []
    for i in range(petals):
        a = math.radians(rot + i * 360 / petals)
        out.append(f'<circle cx="{x + r * .62 * math.cos(a):.1f}" cy="{y + r * .62 * math.sin(a):.1f}" r="{r * .5:.1f}" fill="{fill}"/>')
    out.append(f'<circle cx="{x}" cy="{y}" r="{r * .38:.1f}" fill="{center or fill}"/>')
    return "".join(out)


def mix(c1, c2, t):
    """Mélange deux couleurs hexadécimales."""
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(a[i] + (b[i] - a[i]) * t):02x}" for i in range(3))


# ---------------------------------------------------------------- la culotte
BODY = "M30,72 Q100,84 170,72 L182,124 C150,126 121,150 111,177 L89,177 C79,150 50,126 18,124 Z"
BAND = "M33,84 Q100,96 167,84"


def pattern(kind, sk, rnd):
    acc, body = sk["accent"], sk["body"]
    soft = mix(acc, body, .45)
    p = []
    spots = [(rnd.uniform(20, 180), rnd.uniform(70, 175)) for _ in range(22)]
    if kind == "flowers":
        for i, (x, y) in enumerate(spots[:14]):
            if i % 3 == 0:
                p.append(flower(x, y, rnd.uniform(9, 15), acc, rot=rnd.uniform(0, 70)))
            elif i % 3 == 1:
                p.append(heart(x, y, rnd.uniform(7, 10), soft))
            else:
                p.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rnd.uniform(4, 8):.0f}" fill="{soft}"/>')
    elif kind == "dots":
        for y in range(70, 185, 18):
            for x in range(14 + (y // 18 % 2) * 9, 192, 18):
                p.append(f'<circle cx="{x}" cy="{y}" r="4.2" fill="{acc}" opacity=".7"/>')
    elif kind == "stars":
        for x, y in spots[:14]:
            p.append(star(x, y, rnd.uniform(5, 9), acc, 'opacity=".75"'))
    elif kind == "hearts":
        for x, y in spots[:14]:
            p.append(heart(x, y, rnd.uniform(8, 12), acc, 'opacity=".7"'))
    elif kind == "stripes":
        for y in range(76, 185, 14):
            p.append(f'<rect x="0" y="{y}" width="200" height="6" fill="{acc}" opacity=".55"/>')
    elif kind == "clouds":
        for x, y in spots[:7]:
            p.append(f'<g fill="#fff" opacity=".95"><circle cx="{x}" cy="{y}" r="7"/><circle cx="{x + 8}" cy="{y - 3}" r="9"/><circle cx="{x + 17}" cy="{y}" r="7"/><rect x="{x}" y="{y}" width="17" height="7"/></g>')
            p.append(f'<circle cx="{x + 30:.0f}" cy="{y + 12:.0f}" r="3" fill="{acc}" opacity=".6"/>')
    elif kind == "strawberries":
        for x, y in spots[:11]:
            p.append(f'<path d="M{x - 6},{y - 3} Q{x},{y + 14} {x + 6},{y - 3} Q{x},{y - 7} {x - 6},{y - 3}Z" fill="{acc}"/>'
                     f'<path d="M{x - 5},{y - 4} L{x},{y - 9} L{x + 5},{y - 4}Z" fill="#5cbf6a"/>'
                     f'<circle cx="{x - 2}" cy="{y + 1}" r=".9" fill="#fff"/><circle cx="{x + 2}" cy="{y + 3}" r=".9" fill="#fff"/>')
    elif kind == "checker":
        for y in range(70, 185, 14):
            for x in range(0, 200, 28):
                p.append(f'<rect x="{x + (y // 14 % 2) * 14}" y="{y}" width="14" height="14" fill="{acc}" opacity=".35"/>')
    elif kind == "sakura":
        for x, y in spots[:13]:
            p.append(flower(x, y, rnd.uniform(8, 12), soft, center=acc, rot=rnd.uniform(0, 70)))
    elif kind == "paws":
        for x, y in spots[:9]:
            p.append(f'<g fill="{acc}" opacity=".7"><ellipse cx="{x}" cy="{y + 3}" rx="6" ry="5"/>'
                     f'<circle cx="{x - 6}" cy="{y - 4}" r="2.4"/><circle cx="{x - 2}" cy="{y - 7}" r="2.4"/>'
                     f'<circle cx="{x + 2}" cy="{y - 7}" r="2.4"/><circle cx="{x + 6}" cy="{y - 4}" r="2.4"/></g>')
    elif kind == "moons":
        for i, (x, y) in enumerate(spots[:12]):
            if i % 2:
                p.append(f'<path d="M{x},{y - 8} A8,8 0 1,0 {x},{y + 8} A6,6 0 1,1 {x},{y - 8}Z" fill="{acc}" opacity=".7"/>')
            else:
                p.append(sparkle(x, y, 5, acc))
    elif kind == "pixel":
        for x, y in spots[:16]:
            s = 6
            col = rnd.choice([acc, soft, "#ffffff"])
            p.append(f'<rect x="{int(x) // s * s}" y="{int(y) // s * s}" width="{s}" height="{s}" fill="{col}"/>')
            p.append(f'<rect x="{int(x) // s * s + s}" y="{int(y) // s * s}" width="{s}" height="{s}" fill="{col}" opacity=".6"/>')
    elif kind == "lace":
        # festons de dentelle le long des ouvertures de jambes et de la ceinture
        for t in range(0, 11):
            x = 33 + t * 13.4
            y = 84 + 12 * math.sin(math.pi * t / 10) * .9
            p.append(f'<circle cx="{x:.1f}" cy="{y + 4:.1f}" r="6" fill="none" stroke="{acc}" stroke-width="2" opacity=".6"/>')
        for x, y in spots[:8]:
            p.append(flower(x, y, 8, "none", center=acc) .replace('fill="none"', f'fill="none" stroke="{acc}" stroke-width="1.5"'))
    elif kind == "panel":
        p.append(f'<path d="M20,120 L180,120 M100,90 L100,177 M55,95 L55,124 M145,95 L145,124" stroke="{acc}" stroke-width="3" opacity=".5" fill="none"/>')
        for x, y in [(40, 100), (160, 100), (80, 150), (120, 150)]:
            p.append(f'<circle cx="{x}" cy="{y}" r="3" fill="{acc}"/>')
        for i in range(6):
            p.append(f'<rect x="{30 + i * 24}" y="164" width="12" height="8" fill="{acc if i % 2 else INK}" opacity=".5" transform="skewX(-20)"/>')
    elif kind == "bats":
        for x, y in spots[:9]:
            p.append(f'<path d="M{x - 11},{y} Q{x - 7},{y - 6} {x - 3},{y - 2} Q{x},{y - 6} {x + 3},{y - 2} Q{x + 7},{y - 6} {x + 11},{y} Q{x + 6},{y - 1} {x + 4},{y + 3} Q{x},{y} {x - 4},{y + 3} Q{x - 6},{y - 1} {x - 11},{y}Z" fill="{acc}" opacity=".8"/>')
    elif kind == "scales":
        for y in range(72, 185, 11):
            for x in range(0, 205, 16):
                xx = x + (y // 11 % 2) * 8
                p.append(f'<path d="M{xx - 8},{y} A8,8 0 0,0 {xx + 8},{y}" fill="none" stroke="{acc}" stroke-width="2" opacity=".45"/>')
    elif kind == "planets":
        for i, (x, y) in enumerate(spots[:9]):
            if i % 3 == 0:
                p.append(f'<circle cx="{x}" cy="{y}" r="8" fill="{acc}" opacity=".7"/><ellipse cx="{x}" cy="{y}" rx="13" ry="3.5" fill="none" stroke="{soft}" stroke-width="2"/>')
            else:
                p.append(star(x, y, 4, acc, 'opacity=".7"'))
    elif kind == "drops":
        for x, y in spots[:11]:
            p.append(f'<path d="M{x},{y - 8} Q{x + 7},{y + 2} {x},{y + 6} Q{x - 7},{y + 2} {x},{y - 8}Z" fill="{acc}" opacity=".45"/>')
    elif kind == "feathers":
        for x, y in spots[:9]:
            a = rnd.uniform(-40, 40)
            p.append(f'<g transform="rotate({a:.0f} {x:.0f} {y:.0f})"><ellipse cx="{x}" cy="{y}" rx="4" ry="11" fill="{acc}" opacity=".55"/><line x1="{x}" y1="{y - 11}" x2="{x}" y2="{y + 13}" stroke="{acc}" stroke-width="1.2"/></g>')
    elif kind == "galaxy":
        for x, y in spots:
            p.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rnd.uniform(.8, 2):.1f}" fill="#fff"/>')
        for x, y in spots[:5]:
            p.append(sparkle(x, y, rnd.uniform(4, 7), acc))
        p.append(f'<ellipse cx="100" cy="135" rx="70" ry="14" fill="{acc}" opacity=".18" transform="rotate(-15 100 135)"/>')
    elif kind == "rainbow":
        cols = ["#ff8fa3", "#ffc36b", "#fff07a", "#8fe39a", "#7ec8ff", "#b49cff"]
        for i, c in enumerate(cols):
            p.append(f'<rect x="0" y="{86 + i * 15}" width="200" height="15" fill="{c}" opacity=".55"/>')
    elif kind == "snow":
        for x, y in spots[:12]:
            p.append(f'<g stroke="{acc if rnd.random() < .3 else "#9cc8ee"}" stroke-width="1.6" stroke-linecap="round">'
                     + "".join(f'<line x1="{x}" y1="{y}" x2="{x + 6 * math.cos(math.radians(a)):.1f}" y2="{y + 6 * math.sin(math.radians(a)):.1f}"/>' for a in range(0, 360, 60))
                     + "</g>")
    elif kind == "leaves":
        for x, y in spots[:12]:
            col = rnd.choice([acc, "#f2a03d", "#c9302c"])
            p.append(f'<g transform="rotate({rnd.uniform(-30, 30):.0f} {x:.0f} {y:.0f})"><polygon points="{star_pts(x, y, 9, 5, .55)}" fill="{col}" opacity=".8"/>'
                     f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x:.0f}" y2="{y + 12:.0f}" stroke="{col}" stroke-width="2"/></g>')
    elif kind == "waves":
        for y in range(80, 185, 16):
            p.append(f'<path d="M0,{y} q12,-7 25,0 t25,0 t25,0 t25,0 t25,0 t25,0 t25,0 t25,0" fill="none" stroke="{acc}" stroke-width="3" opacity=".55"/>')
    return "".join(p)


def eyes(kind, sk):
    acc = sk["accent"]
    L, R, Y = 80, 120, 113

    def oval(x, ry=8, iris=INK):
        return (f'<ellipse cx="{x}" cy="{Y}" rx="5.6" ry="{ry}" fill="{iris}"/>'
                f'<circle cx="{x + 1.8}" cy="{Y - 3}" r="2.3" fill="#fff"/><circle cx="{x - 1.6}" cy="{Y + 3}" r="1.1" fill="#fff"/>')

    def arc(x, up=True):
        d = f"M{x - 6},{Y + 2} Q{x},{Y - 7} {x + 6},{Y + 2}" if up else f"M{x - 6},{Y - 2} Q{x},{Y + 6} {x + 6},{Y - 2}"
        return f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>'

    if kind == "happy":
        return arc(L) + arc(R)
    if kind == "closed":
        return arc(L, False) + arc(R, False)
    if kind == "sleepy":
        return "".join(f'<path d="M{x - 6},{Y} L{x + 6},{Y}" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>'
                       f'<path d="M{x - 5},{Y + 1} Q{x},{Y + 6} {x + 5},{Y + 1}" fill="{INK}"/>' for x in (L, R))
    if kind == "wink":
        return oval(L) + f'<path d="M{R - 6},{Y - 5} L{R + 5},{Y} L{R - 6},{Y + 5}" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'
    if kind == "cat":
        wh = "".join(f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{INK}" stroke-width="1.6" stroke-linecap="round"/>'
                     for x1, y1, x2, y2 in [(58, 122, 44, 119), (58, 126, 44, 128), (142, 122, 156, 119), (142, 126, 156, 128)])
        return oval(L) + oval(R) + wh
    if kind == "patch":
        return oval(L) + (f'<ellipse cx="{R}" cy="{Y}" rx="9" ry="8" fill="{INK}"/>'
                          f'<path d="M{R - 8},{Y - 6} L70,92 M{R + 8},{Y - 6} L176,96" stroke="{INK}" stroke-width="2"/>')
    if kind == "focus":
        return (oval(L, 6.5) + oval(R, 6.5)
                + f'<path d="M{L - 8},{Y - 12} L{L + 6},{Y - 8} M{R + 8},{Y - 12} L{R - 6},{Y - 8}" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')
    if kind in ("sparkle", "red"):
        iris = "#e0304f" if kind == "red" else acc
        out = ""
        for x in (L, R):
            out += (f'<ellipse cx="{x}" cy="{Y}" rx="7.5" ry="10" fill="{INK}"/>'
                    f'<ellipse cx="{x}" cy="{Y + 2.5}" rx="5.5" ry="6.5" fill="{iris}"/>'
                    f'<circle cx="{x + 2.5}" cy="{Y - 4}" r="3" fill="#fff"/><circle cx="{x - 2.5}" cy="{Y + 4.5}" r="1.5" fill="#fff"/>'
                    + sparkle(x - 3, Y - 4, 2.4))
        return out
    if kind == "visor":
        return (f'<rect x="64" y="{Y - 7}" width="72" height="14" rx="7" fill="{INK}"/>'
                f'<rect x="70" y="{Y - 3}" width="60" height="6" rx="3" fill="#6ff3ff"/><rect x="74" y="{Y - 2}" width="14" height="2" fill="#fff"/>')
    if kind == "star":
        return star(L, Y, 8.5, "#ffcf3a", f'stroke="{INK}" stroke-width="2"') + star(R, Y, 8.5, "#ffcf3a", f'stroke="{INK}" stroke-width="2"')
    if kind == "heart":
        return heart(L, Y, 15, "#ff3b77", f'stroke="{INK}" stroke-width="1.5"') + heart(R, Y, 15, "#ff3b77", f'stroke="{INK}" stroke-width="1.5"')
    if kind == "x":
        return "".join(f'<path d="M{x - 6},{Y - 6} L{x + 6},{Y + 6} M{x + 6},{Y - 6} L{x - 6},{Y + 6}" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>' for x in (L, R))
    return oval(L) + oval(R)


def mouth(sk):
    m = '<path d="M95,124 Q97.5,128 100,124 Q102.5,128 105,124" fill="none" stroke="#2b2233" stroke-width="2.4" stroke-linecap="round"/>'
    if sk.get("acc") in ("vampire", "devil"):
        m += '<path d="M96,125 L97.5,129 L99,125.5 M101,125.5 L102.5,129 L104,125" fill="#fff" stroke="#2b2233" stroke-width="1"/>'
    return m


# Accessoires : (derrière la culotte, devant la culotte)
def accessory(kind, sk):
    acc, body = sk["accent"], sk["body"]
    st = f'stroke="{INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"'
    back = front = ""
    if kind == "bow":
        front = (f'<path d="M100,84 L80,72 Q74,84 80,96 Z M100,84 L120,72 Q126,84 120,96 Z" fill="{acc}" {st}/>'
                 f'<circle cx="100" cy="84" r="6" fill="{acc}" {st}/>')
    elif kind in ("cat", "fox"):
        col = acc if kind == "fox" else body
        inner = "#fff" if kind == "fox" else acc
        h = 30 if kind == "fox" else 22
        for x, d in ((48, -1), (152, 1)):
            back += f'<path d="M{x - 18},{78} L{x + d * 6},{78 - h - 12} L{x + 18},{78} Z" fill="{col}" {st}/>'
            back += f'<path d="M{x - 9},{76} L{x + d * 5},{78 - h} L{x + 9},{76} Z" fill="{inner}"/>'
        if kind == "fox":
            back += f'<path d="M170,140 Q205,120 196,84 Q186,110 168,118 Z" fill="{acc}" {st}/><path d="M196,84 Q193,98 186,104 L196,96Z" fill="#fff"/>'
    elif kind == "bunny":
        for x, r in ((70, -12), (130, 12)):
            back += (f'<g transform="rotate({r} {x} 76)"><ellipse cx="{x}" cy="38" rx="13" ry="38" fill="{body}" {st}/>'
                     f'<ellipse cx="{x}" cy="40" rx="6" ry="28" fill="{acc}" opacity=".7"/></g>')
    elif kind == "headset":
        back = f'<path d="M24,110 Q20,30 100,26 Q180,30 176,110" fill="none" stroke="{INK}" stroke-width="9"/><path d="M24,110 Q20,30 100,26 Q180,30 176,110" fill="none" stroke="{acc}" stroke-width="4"/>'
        front = (f'<rect x="8" y="94" width="22" height="34" rx="9" fill="{acc}" {st}/><rect x="170" y="94" width="22" height="34" rx="9" fill="{acc}" {st}/>'
                 f'<path d="M20,126 Q30,150 70,140" fill="none" stroke="{INK}" stroke-width="3"/><circle cx="72" cy="140" r="5" fill="{INK}"/>')
    elif kind == "sailor":
        front = (f'<path d="M36,86 Q100,98 164,86" fill="none" stroke="{acc}" stroke-width="5"/>'
                 f'<path d="M100,90 L76,78 Q70,92 78,104 Z M100,90 L124,78 Q130,92 122,104 Z" fill="#e8344d" {st}/>'
                 f'<path d="M94,94 L86,118 L96,112 Z M106,94 L114,118 L104,112 Z" fill="#e8344d" {st}/><circle cx="100" cy="90" r="6" fill="#e8344d" {st}/>')
    elif kind == "witch":
        front = (f'<g transform="rotate(-12 100 70)"><ellipse cx="100" cy="74" rx="62" ry="12" fill="{acc}" {st}/>'
                 f'<path d="M66,72 Q86,40 96,4 Q104,0 108,8 Q118,40 134,72 Z" fill="{acc}" {st}/>'
                 f'<rect x="70" y="58" width="60" height="9" fill="#ffd86b"/>{star(118, 30, 6, "#ffd86b")}</g>')
    elif kind == "maid":
        front = (f'<path d="M50,80 Q100,56 150,80 Q140,66 128,66 Q122,52 110,60 Q100,46 90,60 Q78,52 72,66 Q60,66 50,80 Z" fill="#fff" {st}/>'
                 f'<path d="M64,76 Q100,62 136,76" fill="none" stroke="{acc}" stroke-width="3"/>'
                 f'<path d="M150,82 L176,70 L172,92 Z" fill="{acc}" {st}/>')
    elif kind == "chef":
        front = (f'<rect x="64" y="56" width="72" height="22" rx="4" fill="#fff" {st}/>'
                 f'<path d="M64,58 Q46,40 66,26 Q74,6 100,14 Q126,6 134,26 Q154,40 136,58 Z" fill="#fff" {st}/>'
                 f'{heart(100, 66, 10, sk["accent"])}')
    elif kind == "pirate":
        front = (f'<path d="M30,76 Q100,92 170,76 Q160,40 130,44 Q100,20 70,44 Q40,40 30,76 Z" fill="{acc}" {st}/>'
                 f'<path d="M50,70 Q100,82 150,70" fill="none" stroke="#ffd86b" stroke-width="3"/>{heart(100, 54, 13, "#fff")}')
    elif kind == "ninja":
        front = (f'<path d="M26,82 Q100,98 174,82 L176,96 Q100,112 24,96 Z" fill="{acc}" {st}/>'
                 f'<rect x="84" y="88" width="32" height="16" rx="3" fill="#cfd6e0" {st}/>{heart(100, 96, 8, "#8a93a6")}'
                 f'<path d="M174,90 Q196,96 198,116 M172,94 Q190,108 186,128" fill="none" stroke="{acc}" stroke-width="7" stroke-linecap="round"/>')
    elif kind == "tiara":
        front = (f'<path d="M66,80 L72,56 L84,70 L100,48 L116,70 L128,56 L134,80 Q100,72 66,80 Z" fill="#ffd86b" {st}/>'
                 f'<circle cx="100" cy="66" r="6" fill="{acc}"/>{sparkle(100, 46, 8)}'
                 f'<path d="M150,140 L176,40" stroke="{INK}" stroke-width="7" stroke-linecap="round"/><path d="M150,140 L176,40" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
                 f'{star(177, 36, 14, "#ffd86b", st)}{heart(177, 36, 8, acc)}')
    elif kind == "mecha":
        back = (f'<path d="M100,78 L58,22 L72,24 L100,62 L128,24 L142,22 Z" fill="#ffd23a" {st}/>'
                f'<rect x="6" y="84" width="28" height="44" rx="6" fill="{acc}" {st}/><rect x="166" y="84" width="28" height="44" rx="6" fill="{acc}" {st}/>')
        front = f'<rect x="88" y="66" width="24" height="16" rx="4" fill="{acc}" {st}/><circle cx="100" cy="74" r="4" fill="#6ff3ff"/>'
    elif kind == "vampire":
        back = f'<path d="M12,124 Q0,60 40,40 Q36,70 60,72 L140,72 Q164,70 160,40 Q200,60 188,124 Z" fill="#e0306a" {st}/><path d="M24,116 Q16,72 44,52 Q44,76 66,80 L134,80 Q156,76 156,52 Q184,72 176,116 Z" fill="#2a1030"/>'
    elif kind == "idol":
        front = (f'<path d="M34,90 Q30,50 100,44" fill="none" stroke="{INK}" stroke-width="4"/><path d="M34,92 Q50,124 80,128" fill="none" stroke="{INK}" stroke-width="3"/>'
                 f'<circle cx="82" cy="128" r="5" fill="{INK}"/><rect x="24" y="82" width="18" height="24" rx="7" fill="{acc}" {st}/>'
                 f'{star(150, 70, 16, "#ffd86b", st)}{sparkle(176, 50, 7)}{sparkle(130, 44, 5)}')
    elif kind == "samurai":
        back = f'<path d="M100,72 Q60,64 46,20 Q74,48 100,50 Q126,48 154,20 Q140,64 100,72 Z" fill="#ffd23a" {st}/>'
        front = f'<path d="M40,82 Q100,60 160,82 L150,90 Q100,74 50,90 Z" fill="{acc}" {st}/><circle cx="100" cy="72" r="7" fill="#ffd23a" {st}/>'
    elif kind == "dragon":
        back = (f'<path d="M64,78 Q50,40 72,26 Q66,52 82,74 Z" fill="#fff4cf" {st}/><path d="M136,78 Q150,40 128,26 Q134,52 118,74 Z" fill="#fff4cf" {st}/>'
                f'<path d="M20,110 Q-6,80 8,58 Q20,78 34,76 Q30,64 40,56 Q44,80 34,96 Z" fill="{acc}" {st}/>'
                f'<path d="M180,110 Q206,80 192,58 Q180,78 166,76 Q170,64 160,56 Q156,80 166,96 Z" fill="{acc}" {st}/>')
    elif kind == "astro":
        back = f'<line x1="100" y1="22" x2="100" y2="4" stroke="{INK}" stroke-width="4"/><circle cx="100" cy="6" r="6" fill="#ff5f8f" {st}/>'
        front = (f'<circle cx="100" cy="112" r="92" fill="#bfe6ff" opacity=".22" stroke="{INK}" stroke-width="4"/>'
                 f'<path d="M40,70 Q60,36 100,30" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".8"/>')
    elif kind == "angel":
        back = (f'<path d="M24,110 Q-10,96 4,62 Q14,80 24,74 Q12,58 26,46 Q36,70 46,84 Z" fill="#fff" {st}/>'
                f'<path d="M176,110 Q210,96 196,62 Q186,80 176,74 Q188,58 174,46 Q164,70 154,84 Z" fill="#fff" {st}/>')
        front = f'<ellipse cx="100" cy="40" rx="38" ry="10" fill="none" stroke="{INK}" stroke-width="9"/><ellipse cx="100" cy="40" rx="38" ry="10" fill="none" stroke="#ffd86b" stroke-width="5"/>'
    elif kind == "devil":
        back = (f'<path d="M60,80 Q40,58 50,30 Q60,56 80,72 Z" fill="{acc}" {st}/><path d="M140,80 Q160,58 150,30 Q140,56 120,72 Z" fill="{acc}" {st}/>'
                f'<path d="M168,150 Q200,150 194,112" fill="none" stroke="{INK}" stroke-width="8" stroke-linecap="round"/><path d="M168,150 Q200,150 194,112" fill="none" stroke="{acc}" stroke-width="4" stroke-linecap="round"/>'
                f'{heart(194, 104, 16, acc, st)}')
    elif kind == "crown":
        front = (f'<path d="M58,82 L52,38 L76,58 L100,30 L124,58 L148,38 L142,82 Q100,72 58,82 Z" fill="#ffd23a" {st}/>'
                 f'<circle cx="100" cy="62" r="7" fill="#ff4f9a" stroke="{INK}" stroke-width="2"/><circle cx="74" cy="70" r="4" fill="#4aa3ff"/><circle cx="126" cy="70" r="4" fill="#4aa3ff"/>'
                 f'{sparkle(52, 36, 6)}{sparkle(148, 36, 6)}')
    elif kind == "unicorn":
        back = (f'<path d="M44,80 L42,52 L64,70 Z M156,80 L158,52 L136,70 Z" fill="{body}" {st}/>'
                f'<path d="M120,80 Q170,70 186,110 Q190,140 172,160 Q178,120 150,100 Z" fill="#ffb3e0" {st}/><path d="M150,96 Q176,104 180,140" fill="none" stroke="#b49cff" stroke-width="5"/>')
        front = (f'<path d="M88,76 L100,14 L112,76 Z" fill="#ffe08a" {st}/>'
                 f'<path d="M92,62 L108,56 M94,46 L106,40 M96,30 L104,26" stroke="#f0a800" stroke-width="3"/>')
    elif kind == "santa":
        front = (f'<path d="M40,80 Q90,10 150,50 Q170,62 172,84 Z" fill="#e0304f" {st}/>'
                 f'<path d="M36,86 Q100,64 164,86 L162,74 Q100,54 38,74 Z" fill="#fff" {st}/><circle cx="172" cy="88" r="11" fill="#fff" {st}/>')
    elif kind == "pumpkin":
        front = (f'<path d="M96,80 Q92,60 104,50 L110,54 Q102,64 106,80 Z" fill="#5a8a3a" {st}/>'
                 f'<path d="M106,60 Q130,40 146,58 Q128,66 106,60 Z" fill="#7cc35a" {st}/>')
    elif kind == "heartclip":
        front = heart(150, 82, 26, sk["accent"], st) + sparkle(168, 62, 6)
    elif kind == "sunglasses":
        front = (f'<path d="M62,104 L138,104" stroke="{INK}" stroke-width="4"/>'
                 f'<path d="M64,104 L96,104 L94,118 Q80,126 68,118 Z M104,104 L136,104 L132,118 Q120,126 106,118 Z" fill="{INK}"/>'
                 f'<path d="M72,108 L80,108 M112,108 L120,108" stroke="#ff9ad5" stroke-width="3" stroke-linecap="round"/>'
                 f'{flower(156, 82, 18, "#ff7fae", center="#ffd86b")}')
    return back, front


def fx_layers(kind, sk, rnd, uid):
    """Effets : (fond, devant)."""
    back = front = ""
    if kind == "glow":
        back = (f'<defs><radialGradient id="g{uid}"><stop offset="0" stop-color="#fff6b0" stop-opacity=".95"/>'
                f'<stop offset="1" stop-color="#fff6b0" stop-opacity="0"/></radialGradient></defs><circle cx="100" cy="110" r="100" fill="url(#g{uid})"/>')
        front = "".join(sparkle(rnd.uniform(10, 190), rnd.uniform(20, 190), rnd.uniform(4, 8), "#ffe680") for _ in range(6))
    elif kind == "sparkle":
        front = "".join(sparkle(rnd.uniform(6, 194), rnd.uniform(30, 194), rnd.uniform(4, 8), rnd.choice(["#fff", "#ffe680", sk["accent"]])) for _ in range(7))
    elif kind == "galaxy":
        back = (f'<defs><radialGradient id="g{uid}"><stop offset="0" stop-color="#9b6bff" stop-opacity=".6"/>'
                f'<stop offset="1" stop-color="#9b6bff" stop-opacity="0"/></radialGradient></defs><circle cx="100" cy="110" r="100" fill="url(#g{uid})"/>')
        front = "".join(sparkle(rnd.uniform(6, 194), rnd.uniform(10, 194), rnd.uniform(3, 7), "#fff") for _ in range(8))
    elif kind == "rainbow":
        cols = ["#ff8fa3", "#ffc36b", "#fff07a", "#8fe39a", "#7ec8ff", "#b49cff"]
        back = "".join(f'<path d="M{6 + i * 7},150 A{94 - i * 7},{94 - i * 7} 0 0,1 {194 - i * 7},150" fill="none" stroke="{c}" stroke-width="7" opacity=".8"/>' for i, c in enumerate(cols))
        front = "".join(sparkle(rnd.uniform(6, 194), rnd.uniform(20, 194), rnd.uniform(4, 8)) for _ in range(6))
    elif kind == "glossy":
        front = '<path d="M44,88 Q60,80 76,86" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".85"/><circle cx="160" cy="100" r="4" fill="#fff" opacity=".9"/>'
    elif kind == "glitch":
        back = f'<path d="{BODY}" transform="translate(-7 2)" fill="none" stroke="#00e5ff" stroke-width="5" opacity=".8"/><path d="{BODY}" transform="translate(7 -2)" fill="none" stroke="#ff00aa" stroke-width="5" opacity=".8"/>'
        front = "".join(f'<rect x="{rnd.uniform(10, 160):.0f}" y="{rnd.uniform(70, 170):.0f}" width="{rnd.uniform(15, 40):.0f}" height="4" fill="{rnd.choice(["#00e5ff", "#ff00aa", "#fff"])}" opacity=".85"/>' for _ in range(6))
    return back, front


def panty_svg(sk, uid="p", face=True):
    """Corps de la culotte (sans balise <svg>), viewBox 200x200."""
    rnd = random.Random(sk["id"])
    fill = sk["body"]
    defs = f'<clipPath id="c{uid}"><path d="{BODY}"/></clipPath>'
    if sk.get("body2"):
        defs += (f'<linearGradient id="b{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{sk["body"]}"/>'
                 f'<stop offset="1" stop-color="{sk["body2"]}"/></linearGradient>')
        fill = f"url(#b{uid})"
    fxb, fxf = fx_layers(sk.get("fx", ""), sk, rnd, uid)
    accb, accf = accessory(sk.get("acc", "none"), sk)
    shade = mix(sk["body"], INK, .12)
    body = (f'<path d="{BODY}" fill="{fill}"/>'
            f'<g clip-path="url(#c{uid})">{pattern(sk.get("pattern", ""), sk, rnd)}'
            f'<path d="M18,124 C50,126 79,150 89,177 L111,177 C121,150 150,126 182,124 L190,190 L10,190Z" fill="{shade}" opacity=".25"/></g>'
            f'<path d="{BAND}" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>'
            f'<path d="{BODY}" fill="none" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>')
    f = ""
    if face:
        f = (f'<g transform="translate(100 120) scale(1.22) translate(-100 -120)"><ellipse cx="66" cy="126" rx="8" ry="4.5" fill="#ff7fa8" opacity=".55"/>'
             f'<ellipse cx="134" cy="126" rx="8" ry="4.5" fill="#ff7fa8" opacity=".55"/>'
             + eyes(sk.get("eyes", "normal"), sk) + mouth(sk) + "</g>")
    return f"<defs>{defs}</defs>{fxb}{accb}{body}{f}{accf}{fxf}"


# ---------------------------------------------------------------- bâtiments
def building_svg(b, skins):
    roof, wall, shape = b["roof"], b["wall"], b["shape"]
    st = f'stroke="{INK}" stroke-width="4" stroke-linejoin="round"'
    dark = mix(roof, INK, .25)
    sign = skins.get(b["sign"], skins["classique"])
    g = ['<ellipse cx="100" cy="186" rx="80" ry="10" fill="#000" opacity=".12"/>']

    def door(x=100, y=186, w=26, h=34, col=dark):
        return f'<path d="M{x - w / 2},{y} L{x - w / 2},{y - h + w / 2} A{w / 2},{w / 2} 0 0,1 {x + w / 2},{y - h + w / 2} L{x + w / 2},{y} Z" fill="{col}" {st}/>'

    def window(x, y, r=11):
        return f'<circle cx="{x}" cy="{y}" r="{r}" fill="#cdeeff" {st}/><path d="M{x - r},{y} L{x + r},{y} M{x},{y - r} L{x},{y + r}" stroke="{INK}" stroke-width="2"/>'

    def emblem(x, y, s):
        return f'<g transform="translate({x - 100 * s} {y - 112 * s}) scale({s})">{panty_svg(sign, uid="e" + b["id"])}</g>'

    if shape == "house":
        g += [f'<rect x="38" y="96" width="124" height="90" rx="6" fill="{wall}" {st}/>',
              f'<path d="M24,104 L100,40 L176,104 Z" fill="{roof}" {st}/>', door(), window(64, 132), window(136, 132),
              f'<rect x="130" y="40" width="16" height="30" fill="{dark}" {st}/>', emblem(100, 80, .22)]
    elif shape in ("shop", "cafe", "laundry"):
        g += [f'<rect x="30" y="80" width="140" height="106" rx="6" fill="{wall}" {st}/>',
              f'<rect x="24" y="58" width="152" height="28" rx="8" fill="{roof}" {st}/>']
        for i in range(7):
            g.append(f'<path d="M{30 + i * 20},104 Q{40 + i * 20},116 {50 + i * 20},104 L{50 + i * 20},90 L{30 + i * 20},90 Z" fill="{roof if i % 2 else "#fff"}" {st}/>')
        if shape == "laundry":
            g += [f'<rect x="42" y="124" width="44" height="54" rx="6" fill="#fff" {st}/><circle cx="64" cy="152" r="15" fill="#bfe6ff" {st}/>',
                  f'<circle cx="60" cy="148" r="4" fill="#fff"/>', door(132, 186, 30, 52)]
            g += [f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" stroke="#9cc8ee" stroke-width="2"/>' for x, y, r in ((150, 40, 10), (170, 26, 7), (134, 24, 6))]
        elif shape == "cafe":
            g += [door(140, 186, 28, 52), f'<rect x="40" y="124" width="70" height="40" rx="6" fill="#cdeeff" {st}/>',
                  f'<path d="M60,58 L52,40 L68,50 Z M88,58 L96,40 L80,50 Z" fill="{roof}" {st}/>',
                  f'<rect x="40" y="168" width="22" height="16" rx="3" fill="#fff" {st}/><path d="M62,172 q8,0 0,8" fill="none" stroke="{INK}" stroke-width="3"/>']
        else:
            g += [door(140, 186, 28, 52), f'<rect x="40" y="124" width="70" height="44" rx="6" fill="#cdeeff" {st}/>']
        g.append(emblem(75, 146 if shape != "laundry" else 40, .2))
    elif shape == "booth":
        g += [f'<rect x="50" y="62" width="100" height="124" rx="14" fill="{wall}" {st}/>',
              f'<rect x="40" y="44" width="120" height="30" rx="12" fill="{roof}" {st}/>',
              f'<rect x="64" y="90" width="72" height="54" rx="8" fill="#fff0fa" {st}/>', emblem(100, 118, .22),
              f'<rect x="64" y="152" width="72" height="34" fill="{roof}" opacity=".6" {st}/>']
        g += [star(x, y, 6, "#ffd86b") for x, y in ((58, 60), (100, 56), (142, 60))]
    elif shape == "arcade":
        g += [f'<rect x="30" y="70" width="140" height="116" rx="6" fill="{wall}" {st}/>',
              f'<rect x="24" y="42" width="152" height="36" rx="8" fill="{roof}" {st}/>',
              f'<text x="100" y="68" font-family="monospace" font-weight="bold" font-size="22" text-anchor="middle" fill="#fff">ARCADE</text>']
        for x in (52, 100, 148):
            g += [f'<rect x="{x - 18}" y="100" width="36" height="70" rx="5" fill="{roof}" {st}/>',
                  f'<rect x="{x - 12}" y="108" width="24" height="20" fill="#6ff3ff"/><circle cx="{x}" cy="146" r="4" fill="#ff4f9a"/>']
        g.append(emblem(100, 88, .1))
    elif shape == "stage":
        g += [f'<path d="M20,186 L20,120 L180,120 L180,186 Z" fill="{wall}" {st}/>',
              f'<path d="M14,124 L14,50 Q100,24 186,50 L186,124 Z" fill="{roof}" {st}/>',
              f'<path d="M30,124 L30,66 Q100,48 170,66 L170,124 Z" fill="#2b2240"/>', emblem(100, 102, .3)]
        g += [f'<path d="M{x},50 L{x + d},124" stroke="#fff6a0" stroke-width="8" opacity=".5"/>' for x, d in ((40, 30), (160, -30))]
        g += [heart(x, 150, 14, "#ff4f9a") for x in (60, 100, 140)]
    elif shape == "train":
        g += [f'<rect x="20" y="96" width="70" height="72" rx="10" fill="{roof}" {st}/>',
              f'<rect x="96" y="80" width="86" height="88" rx="12" fill="{wall}" {st}/>',
              f'<rect x="108" y="92" width="62" height="30" rx="6" fill="#cdeeff" {st}/>',
              f'<rect x="40" y="70" width="22" height="30" fill="{dark}" {st}/>']
        g += [f'<circle cx="{x}" cy="172" r="13" fill="{dark}" {st}/><circle cx="{x}" cy="172" r="4" fill="#fff"/>' for x in (42, 72, 118, 160)]
        g += [f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" stroke="#ddd" stroke-width="2"/>' for x, y, r in ((52, 56, 10), (66, 40, 8), (82, 28, 6))]
        g.append(emblem(140, 146, .16))
    elif shape in ("castle", "tower"):
        if shape == "castle":
            g += [f'<rect x="44" y="92" width="112" height="94" fill="{wall}" {st}/>',
                  f'<rect x="20" y="70" width="40" height="116" fill="{wall}" {st}/><rect x="140" y="70" width="40" height="116" fill="{wall}" {st}/>',
                  f'<path d="M14,74 L40,24 L66,74 Z M134,74 L160,24 L186,74 Z" fill="{roof}" {st}/>',
                  f'<path d="M72,96 L100,46 L128,96 Z" fill="{roof}" {st}/>', door(100, 186, 34, 50),
                  window(40, 110, 9), window(160, 110, 9), emblem(100, 132, .16)]
            g += [f'<path d="M40,24 L40,10 L54,15 L40,20" fill="#ff4f9a" stroke="{INK}" stroke-width="2"/>']
        else:
            g += [f'<rect x="64" y="64" width="72" height="122" rx="8" fill="{wall}" {st}/>',
                  f'<path d="M52,70 L100,6 L148,70 Z" fill="{roof}" {st}/>', door(100, 186, 28, 40),
                  window(100, 96, 13), emblem(100, 140, .16), star(100, 6, 10, "#ffd86b", st)]
    elif shape == "temple":
        g += [f'<rect x="44" y="110" width="112" height="76" fill="{wall}" {st}/>',
              f'<path d="M14,116 Q100,92 186,116 L160,90 L40,90 Z" fill="{roof}" {st}/>',
              f'<rect x="60" y="66" width="80" height="26" fill="{wall}" {st}/>',
              f'<path d="M34,70 Q100,46 166,70 L146,48 L54,48 Z" fill="{roof}" {st}/>', door(100, 186, 30, 44, "#b3263b"),
              emblem(100, 80, .1)]
        g += [flower(x, y, 12, "#ffb3cf", center="#ff6f9f") for x, y in ((24, 160), (176, 156), (40, 140))]
    elif shape == "tent":
        g += [f'<path d="M20,186 L100,40 L180,186 Z" fill="{wall}" {st}/>']
        g += [f'<path d="M100,40 L{40 + i * 30},186 L{55 + i * 30},186 Z" fill="{roof}"/>' for i in range(5)]
        g += [f'<path d="M20,186 L100,40 L180,186 Z" fill="none" {st}/>', f'<path d="M84,186 L100,130 L116,186 Z" fill="{INK}"/>',
              f'<path d="M100,40 L100,18 L120,26 L100,32" fill="#ffd86b" stroke="{INK}" stroke-width="2"/>']
        g += [f'<ellipse cx="{x}" cy="100" rx="9" ry="12" fill="#ff5a5a" {st}/>' for x in (30, 170)]
        g.append(emblem(100, 100, .16))
    elif shape == "dome":
        g += [f'<rect x="30" y="126" width="140" height="60" rx="8" fill="{wall}" {st}/>',
              f'<path d="M36,128 A64,64 0 0,1 164,128 Z" fill="#cdeeff" opacity=".9" {st}/>',
              f'<path d="M60,100 Q80,76 110,72" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>',
              f'<path d="M150,70 L176,30" stroke="{INK}" stroke-width="5"/><circle cx="178" cy="26" r="8" fill="{roof}" {st}/>',
              emblem(100, 108, .22), door(100, 186, 26, 34)]
        g += [f'<path d="M46,56 A16,16 0 1,0 46,24 A12,12 0 1,1 46,56Z" fill="#ffe680" stroke="{INK}" stroke-width="3"/>']
    elif shape == "mecha":
        g += [f'<rect x="58" y="132" width="30" height="54" rx="6" fill="{roof}" {st}/><rect x="112" y="132" width="30" height="54" rx="6" fill="{roof}" {st}/>',
              f'<rect x="44" y="64" width="112" height="76" rx="16" fill="{wall}" {st}/>',
              f'<rect x="14" y="70" width="30" height="58" rx="10" fill="{roof}" {st}/><rect x="156" y="70" width="30" height="58" rx="10" fill="{roof}" {st}/>',
              f'<rect x="72" y="24" width="56" height="44" rx="12" fill="{wall}" {st}/>',
              f'<rect x="78" y="38" width="44" height="12" rx="6" fill="#6ff3ff" {st}/>',
              f'<path d="M100,26 L80,6 L88,6 L100,18 L112,6 L120,6 Z" fill="#ffd23a" {st}/>', emblem(100, 102, .2)]
    elif shape == "star":
        g += [f'<circle cx="100" cy="100" r="90" fill="{wall}" {st}/>']
        rnd = random.Random(b["id"])
        g += [f'<circle cx="{rnd.uniform(20, 180):.0f}" cy="{rnd.uniform(20, 180):.0f}" r="{rnd.uniform(1, 2.5):.1f}" fill="#fff"/>' for _ in range(40)]
        g += [star(x, y, 9, roof, st) for x, y in ((60, 58), (140, 58), (40, 110), (160, 110), (100, 168))]
        g += [f'<path d="M60,58 L40,110 L100,168 L160,110 L140,58" fill="none" stroke="{roof}" stroke-width="2" stroke-dasharray="4 4"/>',
              emblem(100, 104, .45)]
    return "".join(g)


# ---------------------------------------------------------------- décos de ville
def deco_svg(d, skins):
    st = f'stroke="{INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"'
    i = d["id"]
    g = ['<ellipse cx="100" cy="184" rx="60" ry="9" fill="#000" opacity=".12"/>']
    if i == "fleurs":
        g += [f'<ellipse cx="100" cy="170" rx="70" ry="22" fill="#7fd08a" {st}/>']
        g += [flower(x, y, 16, c, center="#ffd86b") for (x, y), c in zip(((60, 160), (100, 150), (140, 162), (80, 176), (122, 178)),
              ("#ff8fb8", "#b49cff", "#7ec8ff", "#ffb36b", "#ff8fb8"))]
    elif i == "banc":
        g += [f'<rect x="40" y="140" width="10" height="44" fill="#9c6b48" {st}/><rect x="150" y="140" width="10" height="44" fill="#9c6b48" {st}/>',
              f'<rect x="30" y="134" width="140" height="16" rx="6" fill="#ff9ec4" {st}/>',
              f'<path d="{heart_path(100, 96, 60)}" fill="#ff9ec4" {st}/>']
    elif i == "corde":
        g += [f'<path d="M24,186 L24,60 M176,186 L176,60" {st}/>', '<path d="M24,66 Q100,96 176,66" fill="none" stroke="#2b2233" stroke-width="3"/>']
        for k, sid in enumerate(("classique", "menthe", "lavande")):
            x = 52 + k * 48
            y = 82 + (6 if k == 1 else 0)
            g.append(f'<g transform="translate({x - 18} {y - 14}) scale(.18)">{panty_svg(skins[sid], uid="cl" + sid, face=False)}</g>')
            g.append(f'<rect x="{x - 3}" y="{y - 8}" width="6" height="10" fill="#ffd86b" stroke="{INK}" stroke-width="1.5"/>')
    elif i == "sakura":
        g += [f'<path d="M92,186 L96,120 Q80,100 70,96 M96,130 Q110,110 128,104" fill="none" stroke="#7a4a32" stroke-width="12" stroke-linecap="round"/>',
              f'<circle cx="100" cy="76" r="54" fill="#ffc6da" {st}/><circle cx="56" cy="104" r="30" fill="#ffd3e2" {st}/><circle cx="146" cy="100" r="32" fill="#ffd3e2" {st}/>']
        rnd = random.Random(3)
        g += [flower(rnd.uniform(40, 160), rnd.uniform(40, 120), 8, "#ff8fb8", center="#fff") for _ in range(9)]
    elif i == "lampadaire":
        g += [f'<rect x="94" y="60" width="12" height="126" fill="#5a6bd8" {st}/>', star(100, 46, 30, "#ffe680", st),
              '<circle cx="100" cy="50" r="46" fill="#fff6a0" opacity=".25"/>']
    elif i == "champignon":
        g += [f'<rect x="70" y="110" width="60" height="76" rx="12" fill="#fff4e6" {st}/>',
              f'<path d="M24,118 Q24,40 100,36 Q176,40 176,118 Z" fill="#ff5f7a" {st}/>',
              '<circle cx="70" cy="76" r="12" fill="#fff"/><circle cx="124" cy="62" r="9" fill="#fff"/><circle cx="148" cy="96" r="8" fill="#fff"/>',
              f'<path d="M88,186 L88,160 A12,12 0 0,1 112,160 L112,186 Z" fill="#9c6b48" {st}/>']
    elif i == "capsules":
        g += [f'<rect x="56" y="110" width="88" height="76" rx="8" fill="#ff6fa0" {st}/>',
              f'<circle cx="100" cy="76" r="50" fill="#e6f6ff" opacity=".9" {st}/>']
        rnd = random.Random(7)
        g += [f'<circle cx="{rnd.uniform(70, 130):.0f}" cy="{rnd.uniform(60, 106):.0f}" r="11" fill="{c}" stroke="{INK}" stroke-width="2"/>' for c in ("#ffd86b", "#7ec8ff", "#b49cff", "#8fe39a", "#ff8fa3")]
        g += [f'<circle cx="100" cy="146" r="14" fill="#fff" {st}/><rect x="90" y="164" width="20" height="14" fill="#2b2233"/>']
    elif i == "fontaine":
        g += [f'<ellipse cx="100" cy="168" rx="80" ry="20" fill="#bfe6ff" {st}/>', f'<rect x="88" y="100" width="24" height="70" fill="#fff" {st}/>',
              f'<path d="{heart_path(100, 52, 70)}" fill="#ff9ec4" {st}/>',
              '<path d="M70,108 Q50,130 44,160 M130,108 Q150,130 156,160" fill="none" stroke="#7ec8ff" stroke-width="6" stroke-linecap="round"/>']
    elif i == "lanterne":
        g += ['<path d="M10,40 Q100,80 190,40" fill="none" stroke="#2b2233" stroke-width="3"/>', f'<path d="M30,186 L30,40 M170,186 L170,40" {st}/>']
        g += [f'<ellipse cx="{x}" cy="{y}" rx="16" ry="20" fill="{c}" {st}/><rect x="{x - 8}" y="{y - 24}" width="16" height="6" fill="#2b2233"/>'
              for x, y, c in ((56, 70, "#ff5a5a"), (100, 80, "#ffb36b"), (144, 70, "#ff5a5a"))]
    elif i == "chat":
        g += [f'<rect x="56" y="150" width="88" height="34" rx="6" fill="#ff5a5a" {st}/>',
              f'<ellipse cx="100" cy="116" rx="44" ry="40" fill="#fff" {st}/>',
              f'<path d="M64,92 L66,56 L90,82 Z M136,92 L134,56 L110,82 Z" fill="#fff" {st}/>',
              f'<path d="M144,110 L160,60 L170,68 L156,116 Z" fill="#fff" {st}/>',
              '<path d="M80,112 q6,-6 12,0 M108,112 q6,-6 12,0" fill="none" stroke="#2b2233" stroke-width="3" stroke-linecap="round"/>',
              f'<circle cx="100" cy="140" r="10" fill="#ffd23a" {st}/>', '<ellipse cx="74" cy="124" rx="6" ry="3.5" fill="#ff7fa8" opacity=".6"/><ellipse cx="126" cy="124" rx="6" ry="3.5" fill="#ff7fa8" opacity=".6"/>']
    elif i == "arcenciel":
        cols = ["#ff8fa3", "#ffc36b", "#fff07a", "#8fe39a", "#7ec8ff", "#b49cff"]
        g += [f'<path d="M{20 + k * 10},170 A{80 - k * 10},{80 - k * 10} 0 0,1 {180 - k * 10},170" fill="none" stroke="{c}" stroke-width="10"/>' for k, c in enumerate(cols)]
        g += [f'<g fill="#fff" {st}><circle cx="{x}" cy="170" r="16"/><circle cx="{x + 16}" cy="164" r="18"/><circle cx="{x + 32}" cy="172" r="14"/></g>' for x in (4, 150)]
    elif i == "portique":
        g += [f'<rect x="44" y="70" width="16" height="116" fill="#e0445e" {st}/><rect x="140" y="70" width="16" height="116" fill="#e0445e" {st}/>',
              f'<path d="M16,56 Q100,70 184,56 L180,40 Q100,54 20,40 Z" fill="#e0445e" {st}/>',
              f'<rect x="30" y="76" width="140" height="12" fill="#e0445e" {st}/>', f'<rect x="88" y="56" width="24" height="22" fill="#2b2233"/>']
    elif i == "statue":
        g += [f'<rect x="50" y="146" width="100" height="40" rx="4" fill="#d9d2e6" {st}/>',
              f'<g transform="translate(20 0) scale(.8)">{panty_svg(skins["doree"], uid="statue")}</g>']
    elif i == "planete":
        g += [f'<circle cx="100" cy="96" r="56" fill="#b49cff" {st}/>', '<circle cx="80" cy="80" r="12" fill="#9b7be0"/><circle cx="120" cy="112" r="8" fill="#9b7be0"/>',
              f'<ellipse cx="100" cy="100" rx="90" ry="22" fill="none" stroke="#ffd86b" stroke-width="8" transform="rotate(-14 100 100)"/>',
              sparkle(30, 40, 10), sparkle(170, 150, 8)]
    return "".join(g)


GROUND = {"herbe": ("#a8e6a1", "#8fd88a"), "pave": ("#f3e3ef", "#e2cfe0"), "sable": ("#fff0c4", "#f5dea0"),
          "eau": ("#bff0e0", "#9fe3d0"), "nuage": ("#ffffff", "#e8f0ff"), "etoile": ("#2a1b5e", "#3a2a7e")}


def ground_svg(gid):
    a, b = GROUND[gid]
    rnd = random.Random(gid)
    g = [f'<rect width="200" height="200" fill="{a}"/>']
    if gid == "pave":
        g += [f'<rect x="{x * 50 + (y % 2) * 25 - 25}" y="{y * 50}" width="46" height="46" rx="10" fill="{b}"/>' for x in range(5) for y in range(4)]
    elif gid == "etoile":
        g += [f'<circle cx="{rnd.uniform(0, 200):.0f}" cy="{rnd.uniform(0, 200):.0f}" r="{rnd.uniform(1, 3):.1f}" fill="#fff"/>' for _ in range(30)]
    elif gid == "eau":
        g += [f'<path d="M{x},{y} q10,-6 20,0 t20,0" fill="none" stroke="#fff" stroke-width="4" opacity=".7"/>' for x, y in [(rnd.uniform(0, 150), rnd.uniform(10, 190)) for _ in range(8)]]
    else:
        g += [f'<circle cx="{rnd.uniform(0, 200):.0f}" cy="{rnd.uniform(0, 200):.0f}" r="{rnd.uniform(4, 10):.0f}" fill="{b}"/>' for _ in range(14)]
        if gid == "herbe":
            g += [flower(rnd.uniform(10, 190), rnd.uniform(10, 190), 6, "#fff", center="#ffd86b") for _ in range(3)]
    return "".join(g)


# ---------------------------------------------------------------- icônes
def icon_svg(name):
    st = f'stroke="{INK}" stroke-width="7" stroke-linejoin="round"'
    if name == "rubans":
        return (f'<path d="M100,100 L40,60 Q20,100 40,140 Z M100,100 L160,60 Q180,100 160,140 Z" fill="#ff6fa0" {st}/>'
                f'<path d="M92,108 L70,176 L92,160 L100,182 Z M108,108 L130,176 L108,160 L100,182 Z" fill="#ff6fa0" {st}/>'
                f'<circle cx="100" cy="100" r="18" fill="#ff8fb8" {st}/>')
    if name == "gemmes":
        return (f'<path d="M50,70 L80,36 L120,36 L150,70 L100,170 Z" fill="#b49cff" {st}/>'
                f'<path d="M50,70 L150,70 M80,36 L100,70 L120,36 M100,70 L100,170" fill="none" stroke="#fff" stroke-width="4" opacity=".7"/>{sparkle(150, 40, 18)}')
    if name == "petales":
        return flower(100, 100, 80, "#ffc6da", center="#ff6f9f") + f'<circle cx="100" cy="100" r="78" fill="none" stroke="{INK}" stroke-width="0"/>'
    if name == "coeurs":
        return f'<path d="{heart_path(100, 74, 140)}" fill="#ff4f7a" {st}/><path d="M56,70 Q66,52 84,54" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>'
    if name == "coton":
        return f'<g fill="#fff" {st}><circle cx="70" cy="110" r="38"/><circle cx="130" cy="110" r="38"/><circle cx="100" cy="74" r="40"/></g><circle cx="100" cy="110" r="30" fill="#fff"/>'
    if name == "dentelle":
        return (f'<circle cx="100" cy="100" r="80" fill="#fff" {st}/>' + "".join(f'<circle cx="{100 + 56 * math.cos(math.radians(a)):.0f}" cy="{100 + 56 * math.sin(math.radians(a)):.0f}" r="14" fill="none" stroke="#c9a0dc" stroke-width="5"/>' for a in range(0, 360, 40))
                + flower(100, 100, 34, "#c9a0dc", center="#fff"))
    if name == "soie":
        return (f'<rect x="56" y="30" width="88" height="22" rx="6" fill="#c48a5a" {st}/><rect x="56" y="148" width="88" height="22" rx="6" fill="#c48a5a" {st}/>'
                f'<rect x="66" y="50" width="68" height="100" fill="#9fb4ff" {st}/>' + "".join(f'<path d="M66,{y} L134,{y + 6}" stroke="#fff" stroke-width="3" opacity=".7"/>' for y in range(60, 146, 14)))
    if name == "paillettes":
        return star(100, 100, 70, "#ffe680", st) + sparkle(160, 40, 26, "#ff8fb8") + sparkle(40, 160, 20, "#7ec8ff")
    if name == "trophee":
        return f'<path d="M60,40 L140,40 L132,110 Q100,140 68,110 Z" fill="#ffd23a" {st}/><rect x="84" y="128" width="32" height="30" fill="#ffd23a" {st}/><rect x="60" y="156" width="80" height="20" rx="4" fill="#ff6fa0" {st}/>'
    if name == "horloge":
        return f'<circle cx="100" cy="100" r="76" fill="#fff" {st}/><path d="M100,100 L100,52 M100,100 L136,118" stroke="{INK}" stroke-width="9" stroke-linecap="round"/>'
    if name == "cadeau":
        return (f'<rect x="34" y="80" width="132" height="96" rx="8" fill="#ff6fa0" {st}/><rect x="26" y="60" width="148" height="30" rx="6" fill="#ff8fb8" {st}/>'
                f'<rect x="90" y="60" width="20" height="116" fill="#ffd86b"/><path d="M100,60 Q60,10 56,52 Z M100,60 Q140,10 144,52 Z" fill="#ffd86b" {st}/>')
    if name == "eclair":
        return f'<path d="M116,16 L48,112 L94,112 L80,186 L152,84 L106,84 Z" fill="#ffd23a" {st}/>'
    if name == "capsule":
        return (f'<g transform="rotate(-25 100 100)"><path d="M50,100 L50,80 A50,50 0 0,1 150,80 L150,100 Z" fill="#ff8fb8" {st}/>'
                f'<path d="M50,100 L50,120 A50,50 0 0,0 150,120 L150,100 Z" fill="#e6f6ff" {st}/>'
                f'<rect x="44" y="92" width="112" height="16" rx="8" fill="#fff" {st}/>{heart(100, 60, 30, "#fff")}</g>')
    return ""


# ---------------------------------------------------------------- fonds
ERA_SKY = {1: ("#ffe3f0", "#fff7e8"), 2: ("#e0f4ff", "#ffe8f6"), 3: ("#f0e4ff", "#ffe0ee"), 4: ("#dff7ff", "#fffbe0"), 5: ("#1d1446", "#5b2a9e")}


def background_svg(top, bottom, motif, seed, accent):
    rnd = random.Random(seed)
    g = [f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient></defs>',
         '<rect width="720" height="1280" fill="url(#sky)"/>']
    for _ in range(26):
        x, y, s = rnd.uniform(0, 720), rnd.uniform(0, 1280), rnd.uniform(14, 34)
        op = rnd.uniform(.25, .6)
        if motif == "hearts":
            g.append(heart(x, y, s, accent, f'opacity="{op:.2f}"'))
        elif motif == "stars":
            g.append(star(x, y, s * .6, accent, f'opacity="{op:.2f}"'))
        elif motif == "sakura":
            g.append(f'<g opacity="{op:.2f}">{flower(x, y, s * .7, accent, center="#fff")}</g>')
        elif motif == "bubbles":
            g.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{s * .8:.0f}" fill="none" stroke="{accent}" stroke-width="4" opacity="{op:.2f}"/>')
        elif motif == "pixel":
            g.append(f'<rect x="{int(x) // 24 * 24}" y="{int(y) // 24 * 24}" width="24" height="24" fill="{accent}" opacity="{op:.2f}"/>')
        elif motif == "galaxy":
            g.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{s * .12:.1f}" fill="#fff" opacity="{op + .3:.2f}"/>')
            if rnd.random() < .3:
                g.append(sparkle(x, y, s * .5, "#fff"))
    for _ in range(5):
        x, y = rnd.uniform(-40, 640), rnd.uniform(0, 1100)
        col = "#ffffff" if motif != "galaxy" else "#ffffff"
        op = .75 if motif != "galaxy" else .08
        g.append(f'<g fill="{col}" opacity="{op}"><circle cx="{x}" cy="{y}" r="40"/><circle cx="{x + 50}" cy="{y - 20}" r="52"/><circle cx="{x + 104}" cy="{y}" r="40"/><rect x="{x}" y="{y}" width="104" height="40"/></g>')
    return "".join(g)


DECORS = [
    ("rose", "Rêve Rose", "commune", "#ffd6e8", "#fff4fa", "hearts", "#ff8fb8"),
    ("menthe", "Matin Menthe", "commune", "#d4f7e8", "#f4fffa", "bubbles", "#4fb58c"),
    ("citron", "Limonade", "commune", "#fff4b8", "#fffdf0", "stars", "#f0b820"),
    ("ciel", "Ciel d'Été", "commune", "#cfeaff", "#f4fbff", "bubbles", "#7ec8ff"),
    ("lilas", "Lilas", "commune", "#eadcff", "#fbf7ff", "sakura", "#b49cff"),
    ("peche", "Coucher Pêche", "commune", "#ffd0b5", "#fff1e8", "hearts", "#f08a5b"),
    ("sakura", "Allée Sakura", "rare", "#ffd3e2", "#fff6f9", "sakura", "#ff8fb8"),
    ("arcade", "Arcade 8-bits", "rare", "#3a2a7e", "#ff6fa0", "pixel", "#6ff3ff"),
    ("bonbon", "Pays Bonbon", "rare", "#ffc2e0", "#c2f0ff", "hearts", "#ffffff"),
    ("plage", "Plage Glacée", "rare", "#9fe7ff", "#fff0c4", "bubbles", "#ffffff"),
    ("aurore", "Aurore Polaire", "epique", "#8fe3c8", "#b49cff", "stars", "#ffffff"),
    ("nuit", "Nuit Étoilée", "epique", "#1d1446", "#3a2a7e", "galaxy", "#ffffff"),
    ("idol", "Scène d'Idole", "epique", "#ff3f98", "#ffd86b", "stars", "#ffffff"),
    ("cosmos", "Cosmos Pastel", "legendaire", "#2a1b5e", "#ff8fd0", "galaxy", "#ffffff"),
    ("paradis", "Paradis Arc-en-ciel", "legendaire", "#ff9ad5", "#9fe7ff", "sakura", "#ffffff"),
    ("ev-neige", "Nuit de Neige", "evenement", "#cfe6ff", "#ffffff", "bubbles", "#ffffff"),
    ("ev-glitch", "Écran Bleu Kawaii", "evenement", "#2f6bff", "#00e5ff", "pixel", "#ff00aa"),
]


def main():
    skins_data = load("skins.json")
    skins = {s["id"]: s for s in skins_data["skins"]}
    n = 0
    for s in skins_data["skins"]:
        save_png(svg_doc(panty_svg(s, uid=s["id"])), os.path.join(OUT, "skins", s["id"] + ".png"), 256); n += 1
    for b in load("buildings.json")["buildings"]:
        save_png(svg_doc(building_svg(b, skins)), os.path.join(OUT, "buildings", b["id"] + ".png"), 256); n += 1
    city = load("city.json")
    for d in city["decos"]:
        save_png(svg_doc(deco_svg(d, skins)), os.path.join(OUT, "decos", d["id"] + ".png"), 256); n += 1
    for gnd in city["grounds"]:
        save_png(svg_doc(ground_svg(gnd["id"])), os.path.join(OUT, "grounds", gnd["id"] + ".png"), 128); n += 1
    for name in ("rubans", "gemmes", "petales", "coeurs", "coton", "dentelle", "soie", "paillettes", "trophee", "horloge", "cadeau", "eclair", "capsule"):
        save_png(svg_doc(icon_svg(name)), os.path.join(OUT, "icons", name + ".png"), 128); n += 1
    for era, (top, bottom) in ERA_SKY.items():
        motif = ["hearts", "sakura", "stars", "bubbles", "galaxy"][era - 1]
        save_png(svg_doc(background_svg(top, bottom, motif, era, "#ff9ec4" if era < 5 else "#fff"), "0 0 720 1280"),
                 os.path.join(OUT, "eras", f"era{era}.png"), 540, 960); n += 1
    bgs = []
    for did, name, rarity, top, bottom, motif, accent in DECORS:
        save_png(svg_doc(background_svg(top, bottom, motif, did, accent), "0 0 720 1280"), os.path.join(OUT, "decors", did + ".png"), 360, 640); n += 1
        bgs.append({"id": did, "name": name, "rarity": rarity, **({"gacha": False} if rarity == "evenement" else {})})
    with open(os.path.join(DATA, "backgrounds.json"), "w", encoding="utf-8") as f:
        json.dump({"_doc": "Décors (fond de l'écran de clic), générés par Tools/gen_sprites.py.", "backgrounds": bgs}, f, ensure_ascii=False, indent=1)
    print(n, "sprites générés dans", OUT)


if __name__ == "__main__":
    main()
