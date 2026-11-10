// Outils partagés entre modules : sélecteur, notifications, bus d'événements
import { DATA } from './state.js';

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const asset = key => DATA.manifest[key] || '';

// Bus : 'refresh' (rafraîchir l'interface), 'skin' (skin équipé changé)
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => bus.addEventListener(name, e => fn(e.detail));

export function toast(msg, ms = 4500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Date locale AAAA-MM-JJ (limites quotidiennes)
export const today = () => new Date().toLocaleDateString('sv-SE');
