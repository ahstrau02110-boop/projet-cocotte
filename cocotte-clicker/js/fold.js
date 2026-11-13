// Sections repliables (boutique, activités, missions) : un bouton ▾ sur le titre, choix mémorisé sur l'appareil
const KEY = 'coclicker-folded';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

export function initFold() {
  const folded = load();
  for (const h of document.querySelectorAll('[data-fold]')) {
    const id = h.dataset.fold;
    const targets = () => h.dataset.foldTargets.split(',').map(s => document.querySelector(s.trim())).filter(Boolean);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fold-btn';
    h.appendChild(btn);
    const apply = () => {
      const f = !!folded[id];
      targets().forEach(t => t.classList.toggle('folded', f));
      btn.textContent = f ? '▸ Afficher' : '▾ Réduire';
      btn.setAttribute('aria-expanded', String(!f));
      btn.setAttribute('aria-label', `${f ? 'Afficher' : 'Réduire'} : ${h.firstChild.textContent.trim()}`);
      h.classList.toggle('is-folded', f);
    };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      folded[id] = !folded[id];
      localStorage.setItem(KEY, JSON.stringify(folded));
      apply();
    });
    apply();
  }
}
