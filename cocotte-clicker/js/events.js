// Onglet Événements : événements en cours / à venir, boutique d'objets exclusifs contre des cristaux
import { DATA, state, addCrystals, activeEvents } from './state.js';
import { $, toast, emit, esc } from './core.js';
import { skinById, skinImage, rarityOf } from './skins.js';
import { bgById, bgThumb } from './backgrounds.js';
import { save } from './save.js';
import { sfx } from './audio.js';

const today = () => new Date().toLocaleDateString('sv-SE');
const fmtDate = d => new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
const owned = o => (o.kind === 'skin' ? state.skins[o.id] : state.bgs[o.id]);
const itemOf = o => (o.kind === 'skin' ? skinById(o.id) : bgById(o.id));

function daysLeft(e) {
  if (!e.end) return '';
  const n = Math.round((new Date(e.end + 'T23:59') - Date.now()) / 86400000);
  return n <= 0 ? 'Dernier jour !' : `Encore ${n} jour${n > 1 ? 's' : ''}`;
}

function offerHTML(e, o, live) {
  const it = itemOf(o);
  if (!it) return '';
  const has = owned(o), can = live && !has && state.crystals >= o.price;
  const visual = o.kind === 'skin' ? `<img src="${skinImage(it.id)}" alt="" class="${it.fx ? 'ev-fx-' + it.fx : ''}">` : bgThumb(it);
  return `<li class="skin-card r-evenement ev-offer" style="--rc:${rarityOf('evenement').color}">
    ${visual}<span class="rar">${o.kind === 'skin' ? 'Skin' : 'Décor'} d'événement</span>
    <b>${esc(it.name)}</b>${it.desc ? `<small>${esc(it.desc)}</small>` : ''}
    ${has ? `<button class="equip-btn" data-ev-equip="${o.kind}:${o.id}">Équiper</button>`
      : `<button class="big-btn ev-buy" data-ev-buy="${e.id}:${o.kind}:${o.id}" ${live ? '' : 'disabled'} ${can ? '' : 'aria-disabled="true"'}>${live ? `${o.price} 💎` : 'Bientôt'}</button>`}
  </li>`;
}

function render() {
  const t = today();
  const live = activeEvents();
  const soon = DATA.events.filter(e => e.start && e.start > t).sort((a, b) => a.start.localeCompare(b.start));
  $('#events-body').innerHTML = (live.length ? live.map(e => `
      <section class="ev-card live">
        <div class="ev-head"><span class="ev-ico" aria-hidden="true">${e.icon}</span>
          <span><span class="ev-tag">En cours${e.end ? ' · ' + daysLeft(e) : ''}</span><h3>${esc(e.name)}</h3></span></div>
        <p>${esc(e.desc)}</p>
        ${e.bonusPct ? `<p class="ev-bonus">⚡ Production +${e.bonusPct} % pendant l'événement</p>` : ''}
        <ul class="ev-offers">${e.offers.map(o => offerHTML(e, o, true)).join('')}</ul>
      </section>`).join('') : '<p class="tip-wait">Aucun événement en cours. Revenez bientôt !</p>')
    + (soon.length ? `<h3 class="ev-soon-title">Bientôt</h3>` + soon.map(e => `
      <section class="ev-card soon">
        <div class="ev-head"><span class="ev-ico" aria-hidden="true">${e.icon}</span>
          <span><span class="ev-tag">À partir du ${fmtDate(e.start)}</span><h3>${esc(e.name)}</h3></span></div>
        <p>${esc(e.desc)}</p>
        <ul class="ev-offers">${e.offers.map(o => offerHTML(e, o, false)).join('')}</ul>
      </section>`).join('') : '');
}

function buy(evId, kind, id) {
  const e = activeEvents().find(x => x.id === evId);
  const o = e?.offers.find(x => x.kind === kind && x.id === id);
  if (!o || owned(o)) return;
  if (state.crystals < o.price) {
    sfx.deny();
    toast(`Il vous manque ${o.price - state.crystals} 💎. Mini-jeux, astuces, bonus du jour… ou ateliers à La Co'Cotte !`);
    return;
  }
  addCrystals(-o.price);
  if (kind === 'skin') state.skins[id] = 1; else state.bgs[id] = 1;
  save();
  sfx.unlock();
  toast(`🎉 ${itemOf(o).name} obtenu${kind === 'skin' ? 'e' : ''} !`);
  emit('refresh');
  render();
}

function equip(kind, id) {
  if (kind === 'skin') state.skin = id; else state.bg = id;
  save();
  sfx.buy();
  emit('skin');
  toast(`${itemOf({ kind, id }).name} équipé${kind === 'skin' ? 'e' : ''} !`);
}

export function renderEventTile() {
  const n = activeEvents().length;
  $('#ev-mini').textContent = n ? `${n} en cours` : 'Bientôt';
  $('#btn-events').classList.toggle('ready', activeEvents().some(e => e.offers.some(o => !owned(o))));
}

export function initEvents() {
  $('#btn-events').addEventListener('click', () => { sfx.ui(); render(); $('#dlg-events').showModal(); });
  $('#events-body').addEventListener('click', e => {
    const b = e.target.closest('[data-ev-buy]'); if (b) buy(...b.dataset.evBuy.split(':'));
    const q = e.target.closest('[data-ev-equip]'); if (q) equip(...q.dataset.evEquip.split(':'));
  });
}

// ---------- Notre calendrier (onglet Astuces) ----------
export function renderCalendar() {
  const t = today();
  const items = (DATA.calendar || []).filter(c => c.date >= t).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  $('#calendar').innerHTML = items.length
    ? `<ul class="cal-list">${items.slice(0, 12).map(c => `<li>
        <span class="cal-date"><b>${new Date(c.date + 'T12:00').getDate()}</b>${new Date(c.date + 'T12:00').toLocaleDateString('fr-FR', { month: 'short' })}</span>
        <span><b>${esc(c.title)}</b>${c.time ? ` · ${esc(c.time)}` : ''}${c.text ? `<br><small>${esc(c.text)}</small>` : ''}</span></li>`).join('')}</ul>`
    : `<div class="cal-soon"><span aria-hidden="true">🗓️</span><p><b>Bientôt ici :</b> le planning des ateliers de La Co'Cotte. En attendant, retrouvez le programme du mois à l'accueil et sur nos réseaux.</p></div>`;
}
