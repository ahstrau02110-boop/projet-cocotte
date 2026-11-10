// Décors du plan de travail (Imprimante à décors) : rendu CSS à partir de data/backgrounds.json
import { DATA, state } from './state.js';

// Motifs CSS : a = fond, b = accent, c et d = couleurs secondaires (#rrggbb)
const P = {
  grid: (a, b) => `linear-gradient(${b} 2px, transparent 2px) 0 0/40px 40px, linear-gradient(90deg, ${b} 2px, transparent 2px) 0 0/40px 40px, ${a}`,
  dots: (a, b) => `radial-gradient(circle, ${b} 5px, transparent 6px) 0 0/34px 34px, ${a}`,
  pegboard: (a, b) => `radial-gradient(circle, ${b} 3px, transparent 3.6px) 0 0/24px 24px, ${a}`,
  stripes: (a, b) => `repeating-linear-gradient(90deg, ${a} 0 26px, ${b}88 26px 52px)`,
  diagonal: (a, b) => `repeating-linear-gradient(45deg, ${a} 0 18px, ${b}88 18px 36px)`,
  checker: (a, b) => `conic-gradient(${b}77 25%, ${a} 0 50%, ${b}77 0 75%, ${a} 0) 0 0/60px 60px`,
  waves: (a, b) => `repeating-radial-gradient(circle at 0 100%, ${a} 0 18px, ${b}99 18px 22px)`,
  rings: (a, b) => `repeating-radial-gradient(circle at 50% 55%, ${a} 0 20px, ${b}88 20px 26px)`,
  tiles: (a, b) => `linear-gradient(45deg, ${b}66 25%, transparent 25%, transparent 75%, ${b}66 75%) 0 0/44px 44px, linear-gradient(45deg, ${b}66 25%, transparent 25%, transparent 75%, ${b}66 75%) 22px 22px/44px 44px, ${a}`,
  bricks: (a, b) => `linear-gradient(${b} 3px, transparent 3px) 0 0/60px 30px, linear-gradient(90deg, ${b} 3px, transparent 3px) 0 0/60px 60px, linear-gradient(90deg, ${b} 3px, transparent 3px) 30px 30px/60px 60px, ${a}`,
  plaid: (a, b, c) => `repeating-linear-gradient(0deg, ${b}55 0 14px, transparent 14px 40px), repeating-linear-gradient(90deg, ${c}55 0 14px, transparent 14px 40px), ${a}`,
  zigzag: (a, b) => `linear-gradient(135deg, ${b}aa 25%, transparent 25%) -20px 0/40px 40px, linear-gradient(225deg, ${b}aa 25%, transparent 25%) -20px 0/40px 40px, linear-gradient(315deg, ${b}aa 25%, transparent 25%) 0 0/40px 40px, linear-gradient(45deg, ${b}aa 25%, transparent 25%) 0 0/40px 40px, ${a}`,
  blueprint: (a, b) => `linear-gradient(${b}77 2px, transparent 2px) 0 0/100px 100px, linear-gradient(90deg, ${b}77 2px, transparent 2px) 0 0/100px 100px, linear-gradient(${b}33 1px, transparent 1px) 0 0/20px 20px, linear-gradient(90deg, ${b}33 1px, transparent 1px) 0 0/20px 20px, ${a}`,
  confetti: (a, b, c, d) => `radial-gradient(circle at 20% 30%, ${b} 5px, transparent 6px) 0 0/90px 90px, radial-gradient(circle at 70% 60%, ${c} 5px, transparent 6px) 0 0/110px 110px, radial-gradient(circle at 40% 80%, ${d === '#ffffff' ? b : d} 4px, transparent 5px) 0 0/70px 70px, ${a}`,
  stars: (a, b, c, d) => `radial-gradient(circle at 20% 30%, ${b} 1.6px, transparent 2.2px) 0 0/60px 60px, radial-gradient(circle at 70% 70%, ${c} 2.2px, transparent 2.8px) 0 0/90px 90px, radial-gradient(circle at 40% 80%, ${d} 1.2px, transparent 1.8px) 0 0/40px 40px, ${a}`,
  circuit: (a, b) => `linear-gradient(90deg, transparent 48%, ${b}aa 48% 52%, transparent 52%) 0 0/80px 80px, linear-gradient(transparent 48%, ${b}aa 48% 52%, transparent 52%) 40px 0/80px 80px, radial-gradient(circle, ${b} 5px, transparent 6px) 0 0/80px 80px, ${a}`,
  gradient: (a, b, c, d) => `linear-gradient(160deg, ${a}, ${b}, ${c}, ${d})`,
  sunburst: (a, b, c, d) => (d === '#ffffff' || !d)
    ? `repeating-conic-gradient(from 0deg at 50% 45%, ${a} 0 10deg, ${b}99 10deg 20deg)`
    : `repeating-conic-gradient(from 0deg at 50% 45%, ${a} 0 15deg, ${b} 15deg 30deg, ${c} 30deg 45deg, ${d} 45deg 60deg)`,
  aurora: (a, b, c, d) => `radial-gradient(ellipse at 20% 20%, ${b}cc, transparent 55%), radial-gradient(ellipse at 80% 30%, ${c}cc, transparent 55%), radial-gradient(ellipse at 50% 95%, ${d}aa, transparent 60%), ${a}`,
};

export const bgById = id => DATA.backgrounds.find(b => b.id === id);
export const bgCSS = b => (P[b.pattern] || P.grid)(...b.colors);

// Vignette d'un décor (cartes du gacha, collection)
export const bgThumb = (b, extra = '') =>
  `<span class="bg-thumb fx-${b.fx || 'none'} ${extra}" style="background:${bgCSS(b)}" aria-hidden="true"></span>`;

// Applique le décor équipé (ou celui de l'ère si « auto »)
export function applyBackground() {
  const el = document.getElementById('bench-bg');
  if (!el) return;
  const b = state.bg !== 'auto' && bgById(state.bg);
  el.style.background = b ? bgCSS(b) : '';
  el.className = 'bench-bg' + (b ? ' fx-' + (b.fx || 'none') : '');
}
