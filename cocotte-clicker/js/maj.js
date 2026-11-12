// Onglet « Maj » : liste des mises à jour (data/changelog.json), avec un point quand il y a du nouveau
import { $, esc } from './core.js';

const SEEN = 'coclicker-maj-seen';
let updates = [];

const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function renderDot() {
  const fresh = updates.length && localStorage.getItem(SEEN) !== updates[0].id;
  $('#btn-maj').classList.toggle('has-new', !!fresh);
}

export function openMaj() {
  const seen = localStorage.getItem(SEEN);
  let old = !seen; // première visite : rien n'est marqué « nouveau »
  $('#maj-list').innerHTML = updates.length ? updates.map(u => {
    if (u.id === seen) old = true;
    return `<li class="maj-item${old ? '' : ' fresh'}">
      <div class="maj-head"><b>${esc(u.title)}</b><small>${fmtDate(u.date)}</small>${old ? '' : '<span class="maj-new">Nouveau</span>'}</div>
      <ul>${u.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></li>`;
  }).join('') : '<li class="muted">Impossible de charger les nouveautés.</li>';
  if (updates.length) localStorage.setItem(SEEN, updates[0].id);
  renderDot();
  $('#dlg-maj').showModal();
}

export async function initMaj() {
  $('#btn-maj').addEventListener('click', openMaj);
  try {
    const r = await fetch('data/changelog.json', { cache: 'no-cache' });
    updates = (await r.json()).updates || [];
  } catch { updates = []; }
  renderDot();
}
