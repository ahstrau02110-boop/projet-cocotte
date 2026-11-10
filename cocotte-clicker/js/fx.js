// Effets visuels : fumée en particules (canvas) + « +N » flottants 
const COLORS = ['#FCD260', '#E41E6C', '#90C060', '#F07E36', '#3C2472'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas, ctx, parts = [], dpr = 1;

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
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.grow * dt; p.vx *= .98;
    ctx.globalAlpha = p.life * .75;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * dpr, p.y * dpr, p.r * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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

