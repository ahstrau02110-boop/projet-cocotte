// Effets visuels : fumée en particules (canvas) + « +N » flottants 
const COLORS = ['#FCD260', '#E41E6C', '#90C060', '#F07E36', '#3C2472'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas, ctx, parts = [], dpr = 1, effect = 'fumee';

// Effet de clic équipé (data/effects.json)
export const setEffect = id => { effect = id || 'fumee'; };
const STYLE = {
  etincelles: { kind: 'spark', colors: ['#FFD54F', '#FF9800', '#FFF3B0'] },
  confettis: { kind: 'rect', colors: COLORS },
  notes: { kind: 'glyph', glyphs: ['♪', '♫', '♬'], colors: ['#7a4bd0', '#3C2472', '#E41E6C'] },
  pixels: { kind: 'pixel', colors: ['#2f9be0', '#90C060', '#E41E6C', '#FCD260', '#7a4bd0'] },
  copeaux: { kind: 'chip', colors: ['#c58b4c', '#a0703c', '#e0b07a'] },
  bulles: { kind: 'bubble', colors: ['#7fd8ff', '#b3ecff', '#ffffff'] },
  coeurs: { kind: 'glyph', glyphs: ['❤', '♥'], colors: ['#E41E6C', '#ff6fa6', '#ff9ecb'] },
  etoiles: { kind: 'glyph', glyphs: ['★', '✦'], colors: ['#FCD260', '#fff3a0', '#f5b400'] },
  flocons: { kind: 'glyph', glyphs: ['❄', '❅', '❆'], colors: ['#d8f3ff', '#9fd8ff', '#ffffff'] },
};
const pick = a => a[(Math.random() * a.length) | 0];

export function initFx(c) {
  canvas = c; ctx = c.getContext('2d');
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  };
  resize();
  addEventListener('resize', resize);
}

// Bouffées de fumée depuis le couvercle (coordonnées relatives au canvas, en px CSS)
export function puff(count = 8, colorful = true) {
  if (!canvas) return;
  if (reduced) count = Math.min(count, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const st = colorful && STYLE[effect];
  if (st) {
    // Effet de clic équipé : particules qui jaillissent du couvercle
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * 1.6, sp = 140 + Math.random() * 180;
      parts.push({ kind: st.kind, x: w / 2 + (Math.random() - .5) * w * .15, y: h * .32, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: st.kind === 'bubble' || st.kind === 'glyph' ? -30 : 420, r: st.kind === 'bubble' ? 5 + Math.random() * 7 : 4 + Math.random() * 4,
        rot: Math.random() * 6, vr: (Math.random() - .5) * 10, life: 1, decay: .8 + Math.random() * .5, color: pick(st.colors), ch: st.glyphs ? pick(st.glyphs) : '' });
    }
    return;
  }
  for (let i = 0; i < count; i++) {
    parts.push({
      x: w / 2 + (Math.random() - .5) * w * .18,
      y: h * .32,
      vx: (Math.random() - .5) * 60,
      vy: -60 - Math.random() * 90,
      r: 8 + Math.random() * 12,
      grow: 14 + Math.random() * 10,
      life: 1, decay: .7 + Math.random() * .5,
      color: colorful ? COLORS[(Math.random() * COLORS.length) | 0] : '#ffffff',
    });
  }
}

export function stepFx(dt) {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter(p => (p.life -= p.decay * dt) > 0);
  for (const p of parts) {
    if (p.kind) { drawStyled(p, dt); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.grow * dt; p.vx *= .98;
    ctx.globalAlpha = p.life * .75;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * dpr, p.y * dpr, p.r * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawStyled(p, dt) {
  p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.rot += p.vr * dt;
  if (p.kind === 'glyph' || p.kind === 'bubble') p.x += Math.sin(p.life * 12) * 0.6;
  const x = p.x * dpr, y = p.y * dpr, r = p.r * dpr;
  ctx.globalAlpha = Math.min(1, p.life * 1.4);
  ctx.fillStyle = ctx.strokeStyle = p.color;
  switch (p.kind) {
    case 'spark': ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * .04 * dpr, y - p.vy * .04 * dpr); ctx.stroke(); break;
    case 'rect': case 'chip':
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
      p.kind === 'rect' ? ctx.fillRect(-r * .6, -r, r * 1.2, r * 2) : (ctx.beginPath(), ctx.ellipse(0, 0, r * 1.3, r * .45, 0, 0, Math.PI * 2), ctx.fill());
      ctx.restore(); break;
    case 'pixel': ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2)); break;
    case 'bubble': ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); break;
    case 'glyph': ctx.font = `${Math.round((14 + p.r * 2) * dpr)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(p.ch, x, y); break;
  }
}

export function floatText(container, x, y, text) {
  const el = document.createElement('span');
  el.className = 'float';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.addEventListener('animationend', () => el.remove());
  container.appendChild(el);
}

