// Décor du plan de travail selon l'ère (éléments SVG posés dans les coins)
const K = 'stroke="#000" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';

// Petits éléments réutilisables
const hammer = `<path d="M20 70L52 28" stroke="#8a5a2b" stroke-width="8" stroke-linecap="round"/><path d="M40 16l26 18-8 10-26-18z" fill="#555" ${K}/>`;
const wrench = `<path d="M70 20a12 12 0 1 0 10 18L40 80l-8-8L72 32" fill="#bbb" ${K}/>`;
const toolbox = `<rect x="10" y="40" width="80" height="44" rx="6" fill="#E41E6C" ${K}/><path d="M34 40v-10h32v10" fill="none" ${K}/><path d="M10 56h80" ${K}/><rect x="44" y="52" width="12" height="8" rx="2" fill="#FCD260" ${K}/>`;
const spool = (x, c) => `<g transform="translate(${x} 0)"><rect x="6" y="40" width="30" height="44" rx="4" fill="${c}" ${K}/><rect x="2" y="36" width="38" height="8" rx="3" fill="#555" ${K}/><rect x="2" y="80" width="38" height="8" rx="3" fill="#555" ${K}/></g>`;
const laserSign = `<path d="M50 10l40 70H10z" fill="#FCD260" ${K}/><path d="M50 34v24" stroke="#000" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="68" r="4"/>`;
const vase = `<path d="M30 90h40l-6-40c8-6 8-18 0-24H36c-8 6-8 18 0 24z" fill="#90C060" ${K}/><path d="M34 40h32M33 55h34M31 72h38" stroke="#5f8f3a" stroke-width="2"/>`;
const plant = `<path d="M50 60C30 50 26 30 32 20c12 6 18 22 18 40zM50 60c20-10 24-30 18-40-12 6-18 22-18 40zM50 60V40" fill="#90C060" ${K}/><path d="M28 60h44l-6 30H34z" fill="#F07E36" ${K}/>`;
const dice = `<rect x="14" y="44" width="38" height="38" rx="8" fill="#fff" ${K} transform="rotate(-12 33 63)"/><circle cx="26" cy="58" r="4"/><circle cx="40" cy="70" r="4"/><path d="M62 86c0-10 4-16 10-18a8 8 0 1 1 8 0c6 2 10 8 10 18z" fill="#3C2472" ${K}/>`;
const pin = (x, y, c) => `<path d="M${x} ${y}c-10-12-14-18-14-24a14 14 0 0 1 28 0c0 6-4 12-14 24z" fill="${c}" ${K}/><circle cx="${x}" cy="${y - 24}" r="5" fill="#fff"/>`;
const village = `<path d="M6 90V62l16-14 16 14v28zM44 90V54h14V40l8-12 8 12v14h14v36z" fill="#f5f0e6" ${K}/><path d="M18 90V76h8v14M60 90V72h12v18" fill="#8a5a2b" ${K}/>`;

const satellite = `<rect x="38" y="38" width="24" height="24" rx="4" fill="#ccc" ${K}/><rect x="6" y="42" width="26" height="16" fill="#3C2472" ${K}/><rect x="68" y="42" width="26" height="16" fill="#3C2472" ${K}/><path d="M32 50h6M62 50h6M50 38V24" ${K}/><circle cx="50" cy="20" r="5" fill="#5ef2c5" ${K}/>`;
const antenna = `<path d="M50 90L36 30h28z" fill="none" ${K}/><path d="M40 50h20M44 70h12" ${K}/><circle cx="50" cy="24" r="7" fill="#E41E6C" ${K}/><path d="M66 16q8 8 0 16M74 10q14 14 0 28" stroke="#5ef2c5" stroke-width="3" fill="none" stroke-linecap="round"/>`;
const svg = (cls, body, vb = '0 0 100 100') => `<svg class="dec ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

// Guirlande de fanions sur toute la largeur
const bunting = () => {
  const cols = ['#E41E6C', '#FCD260', '#90C060', '#F07E36', '#3C2472'];
  let flags = '';
  for (let i = 0; i < 16; i++) {
    const x = 10 + i * 25, y = 8 + Math.sin(i / 15 * Math.PI) * 14;
    flags += `<path d="M${x} ${y}l12 0-6 16z" fill="${cols[i % 5]}" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>`;
  }
  return `<svg class="dec dec-top" viewBox="0 0 410 40" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 6Q205 40 410 6" stroke="#000" stroke-width="2" fill="none"/>${flags}</svg>`;
};

export function decorFor(era) {
  switch (era) {
    case 1: return svg('dec-tl', hammer) + svg('dec-tr', wrench) + svg('dec-br', toolbox);
    case 2: return svg('dec-tr', laserSign) + svg('dec-bl', spool(0, '#E41E6C') + spool(44, '#5ac8fa'), '0 0 90 100') + svg('dec-br', vase);
    case 3: return bunting() + svg('dec-bl', plant) + svg('dec-br', dice);
    case 4: return svg('dec-tl', pin(50, 80, '#E41E6C')) + svg('dec-tr', pin(50, 80, '#3C2472')) + svg('dec-bl', village)
      + `<svg class="dec dec-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M8 20C40 40 20 70 50 80S90 60 92 22" stroke="#3C2472" stroke-width="1.2" stroke-dasharray="3 3" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
    case 5: return svg('dec-tr', satellite) + svg('dec-bl', antenna) + svg('dec-tl', pin(50, 80, '#2ab3a6'));
    default: return '';
  }
}
