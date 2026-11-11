// Lecture du planning mensuel (PDF) dans l'espace équipe : images des pages + détection des ateliers
// PDF.js n'est chargé qu'ici, à la demande (le jeu public ne le télécharge jamais).

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const ABBR = { JAN: 0, JANV: 0, FEV: 1, FÉV: 1, FEVR: 1, FÉVR: 1, MAR: 2, MARS: 2, AVR: 3, MAI: 4, JUIN: 5, JUI: 5, JUIL: 6, AOU: 7, AOÛ: 7, AOUT: 7, AOÛT: 7, SEP: 8, SEPT: 8, OCT: 9, NOV: 10, DEC: 11, DÉC: 11 };
const DAYS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

async function pdfjs() {
  const lib = await import('./vendor/pdfjs/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return lib;
}

// Rend chaque page (4 max) en image WebP et récupère le texte ligne par ligne
export async function readPdf(file, width = 1240) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const images = [], lines = [];
  for (let n = 1; n <= Math.min(doc.numPages, 4); n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    images.push(canvas.toDataURL('image/webp', 0.82));
    const tc = await page.getTextContent();
    let cur = '';
    for (const it of tc.items) {
      cur += it.str;
      if (it.hasEOL) { if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim()); cur = ''; }
    }
    if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim());
  }
  return { images, lines, pages: doc.numPages };
}

const pad = n => String(n).padStart(2, '0');
// Clé de tri : date + heure de début sur 2 chiffres (« 9h00 » avant « 14h00 »)
export const sortKey = x => x.date + pad(parseInt(x.time) || 0) + (x.time || '').replace(/^\d+/, '');
const TIME = /^(\d{1,2})\s*h\s*(\d{2})?\s*[-–à]\s*(\d{1,2})\s*h\s*(\d{2})?$/i;

// Repère « 03 NOV », « MAR 17 », « MER 18 », « LUN 16 · 23 »… et renvoie les jours (le mois vient de l'en-tête)
function parseDate(line, month) {
  const up = line.toUpperCase().replace(/\./g, '');
  let m = up.match(/^(\d{1,2})\s+([A-ZÉÛ]{3,5})$/);
  if (m && ABBR[m[2]] !== undefined) return { days: [+m[1]], month: ABBR[m[2]] };
  m = up.match(/^([A-Z]{3})\s+(\d{1,2}(?:\s*[·,&et]+\s*\d{1,2})*)$/);
  if (m && DAYS.includes(m[1])) return { days: m[2].split(/[^\d]+/).filter(Boolean).map(Number), month };
  return null;
}

// Détecte les ateliers : ligne date, ligne horaire, titre, description
export function parsePlanning(lines) {
  const text = lines.join(' ').toLowerCase();
  const month = MONTHS.findIndex(mo => new RegExp(`\\b${mo}\\b`).test(text));
  const now = new Date();
  // Année : celle en cours, ou la suivante si le mois est déjà loin derrière (planning de janvier fait en décembre)
  const year = month >= 0 && month < now.getMonth() - 6 ? now.getFullYear() + 1 : now.getFullYear();
  const out = [];
  // Rendez-vous récurrents : « Titre » puis « Mercredis 4, 18 & 25 · 14h00 - 16h30 » puis description
  const REC = /^(lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?)\s+([\d\s,&et]+?)\s*[·•-]\s*(.+)$/i;
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i].match(REC);
    if (!r || month < 0 || !TIME.test(r[3].trim())) continue;
    const t = r[3].trim().match(TIME);
    const time = `${+t[1]}h${t[2] || '00'} - ${+t[3]}h${t[4] || '00'}`;
    const desc = lines[i + 1] && !REC.test(lines[i + 1]) && !/^[A-Z' ·&]{8,}$/.test(lines[i + 1]) ? lines[i + 1] : '';
    for (const day of r[2].split(/[^\d]+/).filter(Boolean).map(Number))
      if (day >= 1 && day <= 31) out.push({ id: `pdf-${month + 1}-${day}-${out.length}`, date: `${year}-${pad(month + 1)}-${pad(day)}`, time, title: lines[i - 1], text: desc });
  }
  for (let i = 0; i < lines.length - 2; i++) {
    const d = parseDate(lines[i], month);
    if (!d || d.month < 0 || !TIME.test(lines[i + 1])) continue;
    const t = lines[i + 1].match(TIME);
    const time = `${+t[1]}h${t[2] || '00'} - ${+t[3]}h${t[4] || '00'}`;
    const title = lines[i + 2];
    const desc = lines[i + 3] && !parseDate(lines[i + 3], month) && !TIME.test(lines[i + 3]) && !/^[A-Z' ·&]{8,}$/.test(lines[i + 3]) ? lines[i + 3] : '';
    for (const day of d.days) {
      if (day < 1 || day > 31) continue;
      out.push({ id: `pdf-${d.month + 1}-${day}-${out.length}`, date: `${year}-${pad(d.month + 1)}-${pad(day)}`, time, title, text: desc });
    }
    i += desc ? 3 : 2;
  }
  // Doublons (même date, même titre) retirés, tri chronologique
  const seen = new Set();
  const items = out.filter(x => { const k = x.date + x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return { month: month >= 0 ? MONTHS[month] : '', year, items: items.sort((a, b) => sortKey(a).localeCompare(sortKey(b))) };
}
