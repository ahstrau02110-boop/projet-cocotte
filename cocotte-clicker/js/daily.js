// Bonus de connexion quotidienne et série de jours (streak)
import { DATA, state, addCrystals, hasTalent } from './state.js';
import { $, toast, emit, today } from './core.js';
import { save } from './save.js';
import { sfx } from './audio.js';
import { addBuff } from './golden.js';
import { addMats, randomMats, matsText } from './materials.js';

const cfg = () => DATA.config.daily || {};
const rewards = () => cfg().rewards || [3, 4, 5, 6, 8, 10, 15];

// Écart en jours entre deux dates AAAA-MM-JJ
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);

// À appeler au démarrage (et après le tutoriel) : affiche le bonus s'il n'a pas encore été pris aujourd'hui
export function checkDaily() {
  const d = state.daily, t = today();
  if (!state.tuto || d.last === t) return;
  const gap = d.last ? dayDiff(d.last, t) : 99;
  const streak = gap === 1 ? d.streak + 1 : 1;     // série continue si hier, sinon elle repart à 1
  const lost = d.last && gap > 1 && d.streak > 1;
  const idx = (streak - 1) % 7;                     // cycle de 7 jours
  const gain = rewards()[idx] + (hasTalent('jour') ? 10 : 0);

  $('#daily-days').innerHTML = rewards().map((r, i) =>
    `<li class="day${i < idx ? ' past' : ''}${i === idx ? ' now' : ''}"><span>Jour ${i + 1}</span><b>${r} 💎</b>${i === 6 ? '<small>+ boost</small>' : ''}</li>`).join('');
  $('#daily-txt').innerHTML = (lost ? `Votre série de ${d.streak} jours s'est arrêtée… on repart ! ` : '')
    + `Série en cours : <strong>${streak} jour${streak > 1 ? 's' : ''}</strong>. Revenez demain pour continuer !`;
  $('#btn-daily').textContent = `Récupérer ${gain} 💎`;
  $('#btn-daily').onclick = () => {
    d.last = t;
    d.streak = streak;
    d.best = Math.max(d.best, streak);
    addCrystals(gain);
    const mats = randomMats((DATA.config.materials?.daily ?? 1) + Math.min(3, streak - 1));
    addMats(mats);
    let extra = ' · ' + matsText(mats);
    if (idx === 6) {
      addBuff({ id: 'daily', name: 'Semaine complète', cps: cfg().day7BoostMult ?? 2, sec: cfg().day7BoostSec ?? 300 });
      extra = ` + production ×${cfg().day7BoostMult ?? 2} pendant ${(cfg().day7BoostSec ?? 300) / 60} min`;
    }
    save();
    sfx.unlock();
    toast(`📅 Bonus du jour : +${gain} 💎${extra}`, 5000);
    $('#dlg-daily').close();
    emit('refresh');
  };
  $('#dlg-daily').showModal();
}

export function initDaily() {
  setTimeout(checkDaily, 1500);
  // Partie laissée ouverte après minuit
  setInterval(() => { if (!$('#dlg-daily').open && !document.querySelector('dialog[open]')) checkDaily(); }, 60000);
}
