// Tableau des commandes : des habitants du Vermandois commandent des objets à l'atelier.
// On livre avec des matériaux (+ des Co'Coins) → cristaux, réputation (bonus de production) et parfois une batterie.
import { DATA, state, addCrystals, totalCps, currentEra, projectEffects, repLevel, repPct } from './state.js';
import { $, toast, emit, esc } from './core.js';
import { fmt, fmtDuration } from './format.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { hasMats, spendMats, matsHTML, addMats, kind } from './materials.js';

let data = { clients: [], requests: [] };
export const setOrdersData = d => { data = d || data; };
const cfg = () => DATA.config.orders || {};
const rnd = a => a[(Math.random() * a.length) | 0];
const rewardMult = () => projectEffects('orders').reduce((m, e) => m * e.mult, 1);

// Nouvelle commande, proportionnée à l'ère et à la réputation
function makeOrder() {
  const era = currentEra().id, req = rnd(data.requests), lvl = repLevel();
  const size = 3 + era + Math.min(6, Math.floor(lvl / 2)) + ((Math.random() * 3) | 0);
  const need = { [req.main]: Math.ceil(size * 0.6) };
  const others = ['bois', 'filament', 'composants'].filter(k => k !== req.main);
  need[rnd(others)] = (need[rnd(others)] || 0) + Math.max(1, Math.floor(size * 0.4));
  if (era >= 3 && Math.random() < 0.35) need.batteries = (need.batteries || 0) + 1;
  const [hMin, hMax] = cfg().durationH || [3, 8];
  return {
    id: Math.random().toString(36).slice(2, 9), who: rnd(data.clients), what: req.what, icon: req.icon, need,
    coins: Math.round(totalCps() * (60 + Math.random() * 240)),     // une à cinq minutes de production
    crystals: Math.round((10 + size * 3) * rewardMult()),
    rep: 1 + (size >= 9 ? 1 : 0) + (need.batteries ? 1 : 0),
    bonus: Math.random() < 0.3 ? 'batteries' : '',
    until: Date.now() + (hMin + Math.random() * (hMax - hMin)) * 3600e3,
  };
}

// Retire les commandes expirées et en ajoute au fil du temps (rattrapage limité au maximum affiché)
function refresh() {
  const o = state.orders, now = Date.now(), max = cfg().max ?? 3, every = (cfg().everyMin ?? 40) * 60e3;
  const before = o.list.length;
  o.list = o.list.filter(x => x.until > now);
  if (!o.next) o.next = now; // première visite : une commande tout de suite
  while (o.list.length < max && o.next <= now && data.requests.length) {
    o.list.push(makeOrder());
    o.next += every;
  }
  if (o.next <= now) o.next = now + every; // liste pleine : la suivante arrive plus tard
  return o.list.length !== before;
}

function render() {
  const o = state.orders, lvl = repLevel(), per = cfg().repPerLevel ?? 10;
  $('#orders-rep').innerHTML = `<span>🤝 Réputation niveau <b>${lvl}</b> (+${repPct()} % de production)</span>
    <span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${per}" aria-valuenow="${o.rep % per}"><span style="width:${(o.rep % per) / per * 100}%"></span></span>
    <small>${o.rep % per}/${per} points avant le niveau ${lvl + 1}</small>`;
  const wait = Math.max(0, o.next - Date.now());
  $('#orders-list').innerHTML = o.list.length ? o.list.map(x => {
    const can = hasMats(x.need) && state.coins >= x.coins;
    return `<li class="order${can ? ' can' : ''}">
      <span class="order-ico" aria-hidden="true">${x.icon}</span>
      <span class="order-txt"><b>${esc(x.what[0].toUpperCase() + x.what.slice(1))}</b><small>Pour ${esc(x.who)} · encore ${fmtDuration((x.until - Date.now()) / 1000)}</small>
        <span class="craft-cost">${matsHTML(x.need, true)} <span class="mat${state.coins < x.coins ? ' miss' : ''}">${fmt(x.coins)}&nbsp;🪙</span></span>
        <em>Récompense : ${x.crystals} 💎 · +${x.rep} réputation${x.bonus ? ` · +1 ${kind(x.bonus).icon}` : ''}</em></span>
      <button type="button" class="mi-btn" data-order="${x.id}" ${can ? '' : 'disabled'}>Livrer</button>
    </li>`;
  }).join('') : '<li class="muted">Pas de commande pour le moment.</li>';
  $('#orders-next').textContent = o.list.length >= (cfg().max ?? 3) ? 'Livrez une commande pour en recevoir une nouvelle.' : `Prochaine commande dans ${fmtDuration(wait / 1000)}.`;
}

export function openOrders() { refresh(); render(); save(); $('#dlg-orders').showModal(); }

function deliver(id) {
  const o = state.orders, x = o.list.find(y => y.id === id);
  if (!x) return;
  if (state.coins < x.coins || !hasMats(x.need)) { sfx.deny(); toast('Il manque des matériaux ou des Co\'Coins pour cette commande.'); return; }
  spendMats(x.need);
  state.coins -= x.coins;
  addCrystals(x.crystals);
  const lvlBefore = repLevel();
  o.rep += x.rep;
  if (x.bonus) addMats({ [x.bonus]: 1 });
  o.list = o.list.filter(y => y !== x);
  state.counters.orders++;
  if (o.next > Date.now() + 5 * 60e3) o.next = Date.now() + 5 * 60e3; // la suivante arrive vite
  sfx.unlock();
  toast(`📋 Commande livrée à ${x.who} ! +${x.crystals} 💎, +${x.rep} réputation${repLevel() > lvlBefore ? ` · Niveau ${repLevel()} : +${repPct()} % de production !` : ''}`, 6000);
  save();
  render();
  emit('refresh');
}

export function renderOrdersTile() {
  if (refresh()) save();
  const o = state.orders, ready = o.list.filter(x => hasMats(x.need) && state.coins >= x.coins).length;
  $('#btn-orders').classList.toggle('ready', ready > 0);
  $('#orders-mini').textContent = ready ? `${ready} commande${ready > 1 ? 's' : ''} prête${ready > 1 ? 's' : ''} !` : `${o.list.length} commande${o.list.length > 1 ? 's' : ''} en attente`;
}

export function initOrders() {
  $('#btn-orders').addEventListener('click', () => { sfx.ui(); openOrders(); });
  $('#orders-list').addEventListener('click', e => { const b = e.target.closest('[data-order]'); if (b) deliver(b.dataset.order); });
  setInterval(() => { if ($('#dlg-orders').open) render(); }, 1000);
}
