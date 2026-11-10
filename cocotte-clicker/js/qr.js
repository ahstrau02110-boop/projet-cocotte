// QR codes et bons de cristaux signés
// - Joueur : son QR personnel pointe vers admin.html#p=<ID> (scanné par l'équipe)
// - Équipe : admin.html signe un bon (clé privée ECDSA) affiché en QR vers index.html#claim=<bon>
// - Jeu : vérifie la signature avec la clé publique de data/config.json, une seule fois par bon
import qrcode from './vendor/qrcode.js';

// --- Encodage base64url ---
export const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
export const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

// URL de base du jeu (dossier contenant index.html)
export function baseUrl(config) {
  if (config?.gameUrl) return config.gameUrl.replace(/\/?$/, '/');
  return location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
}

// QR en SVG (redimensionnable)
export function qrSVG(text, label = 'QR code') {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true, alt: label });
}
// QR en image PNG/GIF (téléchargement, impression)
export function qrDataURL(text, cell = 10) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createDataURL(cell, 4);
}

// Bon : "<joueur>.<montant>.<nonce>.<horodatage base36>.<signature>"
export function voucherBody(playerId, amount, nonce, ts) {
  return `${playerId}.${amount}.${nonce}.${ts.toString(36)}`;
}

export async function verifyVoucher(token, publicJwk) {
  const parts = token.trim().split('.');
  if (parts.length !== 5) throw new Error('format');
  const [p, a, n, t, sig] = parts;
  const key = await crypto.subtle.importKey('jwk', publicJwk, ALGO, false, ['verify']);
  const ok = await crypto.subtle.verify(SIGN, key, unb64u(sig), new TextEncoder().encode(`${p}.${a}.${n}.${t}`));
  if (!ok) throw new Error('signature');
  return { playerId: p, amount: parseInt(a, 10), nonce: n, ts: parseInt(t, 36) };
}
