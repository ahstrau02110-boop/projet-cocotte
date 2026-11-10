// Génération des skins de la Cocotte en SVG à partir de data/skins.json
import { DATA } from './state.js';
import { asset } from './core.js';

const BODY = 'M46 100h168v52c0 34-26 54-58 54h-52c-32 0-58-20-58-54z';
const LID = 'M50 92c6-40 44-58 80-58s74 18 80 58z';

export const skinById = id => DATA.skins.find(s => s.id === id) || DATA.skins[0];
export const rarityOf = id => DATA.rarities.find(r => r.id === id) || DATA.rarities[0];

// ---------- Motifs appliqués sur le corps (découpés par clipPath) ----------
function pattern(p, c) {
  switch (p) {
    case 'stripes':
      return Array.from({ length: 12 }, (_, i) => `<path d="M${20 + i * 20} 100l-60 110" stroke="#fff" stroke-opacity=".08" stroke-width="9"/>`).join('');
    case 'wood':
      return [108, 122, 138, 156, 176, 194].map((y, i) =>
        `<path d="M40 ${y}c40 ${i % 2 ? -8 : 8} 80 ${i % 2 ? 10 : -10} 180 0" stroke="${c.shade}" stroke-width="3" fill="none" opacity=".7"/>`).join('')
        + '<ellipse cx="190" cy="130" rx="9" ry="5" fill="none" stroke="#7a4a1c" stroke-width="2.5" opacity=".6"/>';
    case 'pixel': {
      let out = '';
      for (let y = 100; y < 210; y += 14) for (let x = 40; x < 222; x += 14)
        if ((x / 14 + y / 14) % 2 < 1) out += `<rect x="${x}" y="${y}" width="14" height="14" fill="#fff" opacity=".13"/>`;
      return out;
    }
    case 'circuit':
      return `<g stroke="#5ef2c5" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9">
        <path d="M54 112h30v20h24M206 116h-28v26h-22M60 186h40v-14M200 182h-36v-18M130 196v-14"/></g>
        <g fill="#5ef2c5"><circle cx="108" cy="132" r="4"/><circle cx="156" cy="142" r="4"/><circle cx="100" cy="172" r="4"/><circle cx="164" cy="164" r="4"/><circle cx="130" cy="182" r="4"/></g>`;
    case 'dots':
      return [[70,124],[110,118],[150,124],[190,120],[90,150],[170,150],[60,176],[130,190],[200,172],[100,184]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#fff" opacity=".55"/>`).join('');
    case 'checker': {
      let out = '';
      for (let y = 100; y < 210; y += 22) for (let x = 40; x < 222; x += 22)
        if (((x - 40) / 22 + (y - 100) / 22) % 2 === 0) out += `<rect x="${x}" y="${y}" width="22" height="22" fill="#000" opacity=".22"/>`;
      return out;
    }
    case 'hazard':
      return `<g>${Array.from({ length: 14 }, (_, i) => `<path d="M${10 + i * 20} 172l-24 36h12l24-36z" fill="#000"/>`).join('')}</g><rect x="40" y="168" width="180" height="4" fill="#000"/>`;
    case 'hearts':
      return [[72,124],[150,118],[196,150],[100,186],[176,190],[60,166]]
        .map(([x, y]) => `<path d="M${x} ${y + 8}c-8-5-10-8-10-11a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 3-2 6-10 11z" fill="#fff" opacity=".7"/>`).join('');
    case 'lava':
      return `<path d="M40 150c30-20 50 20 80 0s50-20 100 0v60H40z" fill="#ff4d1a" opacity=".85"/>
        <path d="M40 176c30-14 60 14 90 0s60-14 90 0v40H40z" fill="#ffd23f" opacity=".8"/>
        <circle cx="90" cy="130" r="6" fill="#ffd23f"/><circle cx="180" cy="126" r="4" fill="#ffd23f"/>`;
    case 'sparkles':
      return [[70,120,9],[190,128,7],[120,186,8],[80,182,5],[200,180,6],[150,112,5]]
        .map(([x, y, r]) => `<path d="M${x} ${y - r}l${r * .3} ${r * .7} ${r * .7} ${r * .3}-${r * .7} ${r * .3}-${r * .3} ${r * .7}-${r * .3}-${r * .7}-${r * .7}-${r * .3} ${r * .7}-${r * .3}z" fill="#fff"/>`).join('');
    case 'flames':
      return `<path d="M40 210c0-30 20-30 20-50 10 14 14 24 24 10 6 16 16 22 26 4 10 18 20 18 30 0 8 16 20 22 28 6 10 14 22 18 32 30v0z" fill="#ffd23f" opacity=".85"/>`;
    case 'galaxy':
      return `<ellipse cx="150" cy="150" rx="70" ry="30" fill="#7b3fe4" opacity=".45" transform="rotate(-20 150 150)"/>
        <ellipse cx="110" cy="170" rx="50" ry="18" fill="#E41E6C" opacity=".35" transform="rotate(15 110 170)"/>`
        + [[70, 118], [196, 120], [82, 190], [186, 186], [150, 112], [62, 150], [204, 158], [120, 196]]
          .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.8 : 3}" fill="#fff"/>`).join('');
    default: return '';
  }
}

// ---------- Accessoires ----------
function accessory(a) {
  switch (a) {
    case 'none': return '';
    case 'helmet':
      return `<path d="M44 92c0-44 38-64 86-64s86 20 86 64z" fill="#FCD260" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
        <path d="M130 30v58M100 34l6 54M160 34l-6 54" stroke="#000" stroke-width="4" opacity=".5"/>
        <rect x="34" y="84" width="192" height="14" rx="7" fill="#FCD260" stroke="#000" stroke-width="5"/>`;
    case 'cap':
      return `<path d="M58 84c0-36 30-52 72-52s72 16 72 52z" fill="#E41E6C" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
        <path d="M58 84h-30c-8 0-8-12 0-12h34z" fill="#a8124d" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="130" cy="34" r="6" fill="#a8124d" stroke="#000" stroke-width="3"/>
        <text x="130" y="70" font-family="Arial Black,Arial" font-weight="900" font-size="22" text-anchor="middle" fill="#fff">C'</text>`;
    case 'santa':
      return `<path d="M54 86c4-40 40-58 80-56 30 2 50 14 64 40l18-14c8-6 18 2 12 10-6 10-22 14-28 20z" fill="#E41E6C" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="236" cy="62" r="13" fill="#fff" stroke="#000" stroke-width="4"/>
        <rect x="42" y="76" width="176" height="20" rx="10" fill="#fff" stroke="#000" stroke-width="4"/>`;
    case 'party':
      return `<path d="M100 84l30-74 30 74z" fill="#5ac8fa" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
        <path d="M112 56h36M104 74h52" stroke="#E41E6C" stroke-width="6"/><circle cx="130" cy="10" r="9" fill="#FCD260" stroke="#000" stroke-width="3"/>`;
    case 'nightcap':
      return `<path d="M52 88c0-40 34-58 78-58 30 0 52 10 64 30l30 40-14 8-30-34c-4 6-6 10-8 14z" fill="#3C2472" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="222" cy="100" r="11" fill="#FCD260" stroke="#000" stroke-width="4"/>
        <rect x="44" y="78" width="160" height="18" rx="9" fill="#d9c8ff" stroke="#000" stroke-width="4"/>`;
    case 'flame':
      return `<path d="M130 4c10 18 34 26 30 52-2 16-14 28-30 28s-28-12-30-28c-2-14 8-20 10-34 6 8 10 12 14 8 4-8 0-16 6-26z" fill="#ff7a1a" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
        <path d="M130 40c6 10 14 16 12 28-2 8-6 12-12 12s-10-4-12-12c0-8 6-12 12-28z" fill="#ffd23f"/>`;
    case 'headset':
      return `<path d="M44 96C44 22 216 22 216 96" stroke="#000" stroke-width="12" fill="none" stroke-linecap="round"/>
        <path d="M44 96C44 22 216 22 216 96" stroke="#5ef2c5" stroke-width="5" fill="none" stroke-linecap="round"/>
        <rect x="26" y="74" width="30" height="42" rx="10" fill="#222" stroke="#000" stroke-width="4"/>
        <rect x="204" y="74" width="30" height="42" rx="10" fill="#222" stroke="#000" stroke-width="4"/>
        <path d="M42 112c4 30 30 46 60 46" stroke="#222" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="104" cy="158" r="6" fill="#5ef2c5" stroke="#000" stroke-width="3"/>`;
    case 'bow':
      return `<path d="M130 40l-30-18c-8-4-14 2-12 10l4 18c2 8 10 10 16 6zM130 40l30-18c8-4 14 2 12 10l-4 18c-2 8-10 10-16 6z" fill="#E41E6C" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="130" cy="42" r="9" fill="#ff7aa8" stroke="#000" stroke-width="4"/>`;
    case 'sunglasses':
      return `<path d="M60 136h140" stroke="#000" stroke-width="6"/>
        <rect x="78" y="128" width="46" height="30" rx="12" fill="#111" stroke="#000" stroke-width="4"/>
        <rect x="136" y="128" width="46" height="30" rx="12" fill="#111" stroke="#000" stroke-width="4"/>
        <path d="M86 136l12-4M144 136l12-4" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
    case 'bandana':
      return `<path d="M44 90c10-50 52-62 86-62s76 12 86 62z" fill="#3d8fd6" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
        <g fill="#fff">${[[80,70],[110,52],[150,52],[180,70],[130,74]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4"/>`).join('')}</g>
        <path d="M214 84l22-6-6 18 12 8-24 2z" fill="#3d8fd6" stroke="#000" stroke-width="4" stroke-linejoin="round"/>`;
    case 'headphones':
      return `<path d="M44 92C44 20 216 20 216 92" stroke="#000" stroke-width="12" fill="none" stroke-linecap="round"/>
        <path d="M44 92C44 20 216 20 216 92" stroke="#E41E6C" stroke-width="6" fill="none" stroke-linecap="round"/>
        <rect x="30" y="70" width="26" height="40" rx="12" fill="#E41E6C" stroke="#000" stroke-width="4"/>
        <rect x="204" y="70" width="26" height="40" rx="12" fill="#E41E6C" stroke="#000" stroke-width="4"/>`;
    case 'antenna':
      return `<g stroke="#000" stroke-width="4" stroke-linecap="round"><path d="M96 50l-14-34M164 50l14-34"/></g>
        <circle cx="82" cy="14" r="9" fill="#E41E6C" stroke="#000" stroke-width="4"/>
        <circle cx="178" cy="14" r="9" fill="#5ef2c5" stroke="#000" stroke-width="4"/>`;
    case 'crown':
      return `<path d="M96 40l-6-30 22 16 18-22 18 22 22-16-6 30z" fill="#FCD260" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="130" cy="26" r="5" fill="#E41E6C" stroke="#000" stroke-width="2"/>
        <circle cx="106" cy="32" r="3.5" fill="#5ac8fa"/><circle cx="154" cy="32" r="3.5" fill="#90C060"/>`;
    case 'beanie':
      return `<path d="M50 90c2-46 40-64 80-64s78 18 80 64z" fill="#E41E6C" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
        <g stroke="#a8124d" stroke-width="4">${[80, 105, 130, 155, 180].map(x => `<path d="M${x} 40v44"/>`).join('')}</g>
        <rect x="46" y="76" width="168" height="18" rx="9" fill="#FFF4D6" stroke="#000" stroke-width="4"/>
        <circle cx="130" cy="20" r="14" fill="#FFF4D6" stroke="#000" stroke-width="4"/>`;
    case 'vr':
      return `<path d="M36 146c0-10 6-14 14-14" stroke="#000" stroke-width="8" fill="none"/>
        <path d="M224 146c0-10-6-14-14-14" stroke="#000" stroke-width="8" fill="none"/>
        <rect x="58" y="122" width="144" height="46" rx="18" fill="#222" stroke="#000" stroke-width="5"/>
        <rect x="68" y="130" width="124" height="30" rx="12" fill="#5ac8fa"/>
        <path d="M80 140h40" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>
        <path d="M120 176q10 10 20 0" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    default: // lunettes de protection
      return `<path d="M56 78c24-18 124-18 148 0" stroke="#3C2472" stroke-width="10" fill="none" stroke-linecap="round"/>
        <g stroke="#000" stroke-width="4"><rect x="92" y="52" width="34" height="26" rx="11" fill="#bfe6f2"/>
        <rect x="134" y="52" width="34" height="26" rx="11" fill="#bfe6f2"/><path d="M126 64h8" stroke-width="5"/></g>
        <path d="M100 60l8-4M142 60l8-4" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
  }
}

// ---------- Yeux ----------
function eyes(e) {
  switch (e) {
    case 'none': return '';
    case 'led':
      return `<rect x="88" y="138" width="28" height="12" rx="6" fill="#5ef2c5" stroke="#000" stroke-width="3"/>
        <rect x="144" y="138" width="28" height="12" rx="6" fill="#5ef2c5" stroke="#000" stroke-width="3"/>`;
    case 'pixel':
      return `<rect x="92" y="134" width="20" height="22" fill="#000"/><rect x="148" y="134" width="20" height="22" fill="#000"/>
        <rect x="102" y="136" width="7" height="7" fill="#fff"/><rect x="158" y="136" width="7" height="7" fill="#fff"/>`;
    case 'sleepy':
      return `<path d="M90 148q12 8 24 0M146 148q12 8 24 0" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round"/>
        <text x="196" y="122" font-family="Arial Black,Arial" font-size="20" font-weight="900" fill="#3C2472">z</text>`;
    case 'wink':
      return `<ellipse cx="102" cy="146" rx="12" ry="15" fill="#000"/><circle cx="106" cy="140" r="4.5" fill="#fff"/>
        <path d="M146 148q12-10 24 0" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    case 'heart': {
      const h = (x, y) => `<path d="M${x} ${y + 12}c-12-8-16-13-16-18a8 8 0 0 1 16-3 8 8 0 0 1 16 3c0 5-4 10-16 18z" fill="#E41E6C" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`;
      return h(102, 136) + h(158, 136);
    }
    case 'happy':
      return `<path d="M90 150q12-16 24 0M146 150q12-16 24 0" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    case 'star': {
      const star = (cx, cy) => {
        let d = '';
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 6 : 15, a = Math.PI / 5 * i - Math.PI / 2;
          d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
        }
        return `<path d="${d}z" fill="#FCD260" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`;
      };
      return star(102, 146) + star(158, 146);
    }
    default:
      return `<ellipse cx="102" cy="146" rx="12" ry="15" fill="#000"/><ellipse cx="158" cy="146" rx="12" ry="15" fill="#000"/>
        <circle cx="106" cy="140" r="4.5" fill="#fff"/><circle cx="98" cy="152" r="2" fill="#fff"/>
        <circle cx="162" cy="140" r="4.5" fill="#fff"/><circle cx="154" cy="152" r="2" fill="#fff"/>`;
  }
}

// SVG complet d'un skin
export function skinSVG(s) {
  const c = { body: '#F07E36', shade: '#c4561b', rim: '#FFF4D6', blush: '#E41E6C', ...(s.colors || {}) };
  const grad = s.gradient
    ? `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${s.gradient.map((col, i) =>
        `<stop offset="${i / (s.gradient.length - 1)}" stop-color="${col}"/>`).join('')}</linearGradient>` : '';
  const fill = s.gradient ? 'url(#g)' : c.body;
  const acc = s.accessory || 'goggles';
  const lidHidden = acc === 'beanie';
  const knob = ['crown', 'beanie', 'helmet', 'cap', 'santa', 'party', 'nightcap', 'flame', 'bandana'].includes(acc) ? '' :
    `<polygon points="146,24 138,38 122,38 114,24 122,10 138,10" fill="#d4d4d4" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
     <circle cx="130" cy="24" r="5.5" fill="#777" stroke="#000" stroke-width="2"/>`;
  const mouth = acc === 'vr' ? '' :
    `<path d="M120 160q10 14 20 0z" fill="#000" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
     <path d="M125 166q5 4 10 0" stroke="${c.blush}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const blush = acc === 'vr' ? '' :
    `<ellipse cx="80" cy="166" rx="11" ry="6" fill="${c.blush}" opacity=".9"/><ellipse cx="180" cy="166" rx="11" ry="6" fill="${c.blush}" opacity=".9"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 230">
  <defs>${grad}<clipPath id="cb"><path d="${BODY}"/></clipPath></defs>
  <ellipse cx="130" cy="216" rx="96" ry="10" fill="#000" opacity=".18"/>
  <g stroke="#000" stroke-width="5" stroke-linejoin="round">
    <rect x="12" y="112" width="48" height="28" rx="14" fill="#3a3a3a"/><rect x="200" y="112" width="48" height="28" rx="14" fill="#3a3a3a"/>
  </g>
  <circle cx="30" cy="126" r="4.5" fill="#cfcfcf"/><circle cx="230" cy="126" r="4.5" fill="#cfcfcf"/>
  <path d="${BODY}" fill="${fill}"/>
  <g clip-path="url(#cb)">${pattern(s.pattern, c)}
    <path d="M60 178c12 18 30 24 44 24h52c14 0 32-6 44-24" stroke="${c.shade}" stroke-width="8" fill="none" stroke-linecap="round"/>
  </g>
  <path d="${BODY}" fill="none" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
  <path d="M62 116v30c0 10 3 18 8 24" stroke="#fff" stroke-opacity=".5" stroke-width="7" fill="none" stroke-linecap="round"/>
  <rect x="36" y="90" width="188" height="20" rx="10" fill="${c.rim}" stroke="#000" stroke-width="5"/>
  ${lidHidden ? '' : `<path d="${LID}" fill="${fill}" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
  <path d="M72 70c10-14 26-21 40-23" stroke="#fff" stroke-opacity=".5" stroke-width="6" fill="none" stroke-linecap="round"/>`}
  ${accessory(acc)}${knob}
  ${eyes(s.eyes)}${blush}${mouth}
</svg>`;
}

// URL d'image d'un skin (fichier dédié, asset du manifest pour le skin par défaut, sinon SVG généré)
const cache = new Map();
export function skinImage(id) {
  const s = skinById(id);
  if (s.img) return s.img;
  if (s.default && asset('marmite')) return asset('marmite');
  if (!cache.has(s.id)) cache.set(s.id, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(skinSVG(s)));
  return cache.get(s.id);
}
