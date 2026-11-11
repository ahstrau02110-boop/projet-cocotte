// Espace équipe → onglet « Contenu » : modifier images, textes, bâtiments, économie… sans toucher au code
import { $, $$, toast, esc } from './core.js';
import { DRAFT_KEY, PREVIEW_KEY, EDITABLE, readDraft } from './content.js';
import { readPdf, parsePlanning } from './pdf-planning.js';

let BASE = {}, ov = {}, view = 'images', config = {}, publishFiles = ['overrides.json'];
const load = async u => (await fetch(u, { cache: 'no-cache' })).json();

// ---------- Brouillon ----------
function persist() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(ov)); }
  catch {
    // Brouillon trop lourd pour l'appareil (gros PDF) : on garde tout sauf le PDF lui-même
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...ov, calendarDoc: ov.calendarDoc && { ...ov.calendarDoc, pdf: '' } })); } catch { /* tant pis */ }
    toast('PDF trop lourd pour l\'aperçu sur cet appareil : il sera quand même publié.');
  }
  const n = Object.keys(ov.manifest || {}).length
    + Object.values(EDITABLE).reduce((a, _, i) => a + Object.keys(ov[Object.keys(EDITABLE)[i]] || {}).length, 0)
    + ['tips', 'infos', 'quiz', 'calendar'].filter(k => Array.isArray(ov[k])).length + (ov.calendarDoc ? 1 : 0)
    + countLeaves(ov.config || {});
  $('#ct-status').textContent = n
    ? `✏️ ${n} modification${n > 1 ? 's' : ''} en brouillon, enregistrée${n > 1 ? 's' : ''} sur cet appareil. Pensez à publier.`
    : 'Aucune modification : le jeu utilise le contenu d\'origine.';
}
const countLeaves = o => Object.values(o).reduce((a, v) => a + (v && typeof v === 'object' && !Array.isArray(v) ? countLeaves(v) : 1), 0);
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.'); let x = o;
  ks.slice(0, -1).forEach(k => (x = x[k] ??= {}));
  if (v === undefined) delete x[ks.at(-1)]; else x[ks.at(-1)] = v;
}

// ---------- Vues ----------
const VIEWS = {
  images: { label: '🖼️ Images', render: renderImages },
  buildings: { label: '🏗️ Bâtiments', render: () => renderItems('buildings', { name: 'Nom', desc: 'Description', baseCost: 'Coût de base', baseCps: 'Production / s' }) },
  eras: { label: '🗺️ Ères', render: () => renderItems('eras', { name: 'Nom', tagline: 'Phrase d\'ambiance', unlockAt: 'Débloquée à (Co\'Coins produits)' }) },
  projects: { label: '📌 Projets', render: () => renderItems('projects', { name: 'Nom', desc: 'Présentation du projet', effectText: 'Effet affiché', cost: 'Coût' }) },
  tips: { label: '💡 Astuces', render: () => renderTexts('tips', { cat: 'Catégorie (avec émoji)', title: 'Titre', text: 'Texte' }) },
  infos: { label: '📍 Le saviez-vous ?', render: () => renderTexts('infos', { icon: 'Émoji', title: 'Titre', text: 'Texte' }) },
  quiz: { label: '❓ Quiz', render: () => renderTexts('quiz', { q: 'Question', choices: 'Réponses', answer: 'Bonne réponse', explain: 'Explication' }) },
  calendar: { label: '📅 Calendrier', render: () => { renderTexts('calendar', { date: 'Date (AAAA-MM-JJ)', time: 'Horaire (ex. 14h-16h)', title: 'Atelier / événement', text: 'Description' }); renderPdfBox(); } },
  economy: { label: '⚖️ Économie', render: renderEconomy },
  publish: { label: '📤 Publier', render: renderPublish },
};

function setView(v) {
  view = v;
  $$('#ct-nav button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === v)));
  VIEWS[v].render();
}

// ----- Images (manifest) -----
const IMG_LABELS = { logo: 'Logo', marmite: 'Cocotte (skin classique)', cocoin: 'Pièce Co\'Coin', cristal: 'Cristal', 'main-clic': 'Main (curseur)', music: 'Musique (lien vers un fichier audio)' };
const imgLabel = k => IMG_LABELS[k] || (k.startsWith('building.') ? 'Bâtiment : ' + (BASE.buildings.find(b => 'building.' + b.id === k)?.name || k) : k);

function renderImages() {
  const keys = Object.keys(BASE.manifest).filter(k => !k.startsWith('_'));
  $('#ct-body').innerHTML = `<p class="muted">Remplacez une image par un lien (adresse d'une image en ligne ou chemin du dépôt, ex. <code>assets/img/ma-photo.png</code>) ou par un fichier de cet appareil (réduit automatiquement). Format carré conseillé.</p>
    <ul class="ct-list">${keys.map(k => {
      const cur = ov.manifest?.[k] ?? BASE.manifest[k];
      const isMusic = k === 'music';
      return `<li class="ct-img${ov.manifest?.[k] !== undefined ? ' changed' : ''}">
        <span class="ct-thumb">${isMusic ? '🎵' : cur ? `<img src="${esc(cur)}" alt="">` : '—'}</span>
        <span class="stack"><b>${esc(imgLabel(k))}</b>
          <input data-img="${k}" value="${esc(cur && cur.startsWith('data:') ? '(fichier importé)' : cur || '')}" placeholder="${isMusic ? 'vide = musique générée par le jeu' : ''}" aria-label="Lien : ${esc(imgLabel(k))}">
          <span class="row">${isMusic ? '' : `<label class="file-btn small-btn">📂 Fichier<input type="file" accept="image/*" data-file="${k}"></label>`}
          <button type="button" class="ghost-btn small-btn" data-reset-img="${k}">↺ D'origine</button></span></span></li>`;
    }).join('')}</ul>`;
}

// Image importée : réduite à 512 px max (PNG/WebP) pour garder un fichier de publication léger
function fileToDataURL(file) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onerror = ko;
    r.onload = () => {
      if (file.type === 'image/svg+xml') return ok(r.result);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 512 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/webp', 0.85));
      };
      img.onerror = ko;
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

// ----- Bâtiments, ères, projets -----
function renderItems(list, labels) {
  $('#ct-body').innerHTML = `<p class="muted">Laissez un champ tel quel pour garder la valeur d'origine. Les coûts et productions sont des nombres (ex. 1500 ou 1.5e6).</p>
    <ul class="ct-list">${BASE[list].map(it => {
      const o = ov[list]?.[it.id] || {};
      return `<li class="ct-item${Object.keys(o).length ? ' changed' : ''}"><div class="ct-item-head"><b>${esc(o.name ?? it.name)}</b>
        <button type="button" class="ghost-btn small-btn" data-reset-item="${list}:${it.id}">↺ D'origine</button></div>
        <div class="ct-grid">${Object.entries(labels).map(([f, l]) => {
          const num = typeof it[f] === 'number', val = o[f] ?? it[f] ?? '';
          const tag = f === 'desc' || f === 'tagline' ? `<textarea rows="2" data-item="${list}:${it.id}:${f}">${esc(val)}</textarea>`
            : `<input ${num ? 'inputmode="decimal"' : ''} data-item="${list}:${it.id}:${f}" data-num="${num ? 1 : ''}" value="${esc(val)}">`;
          return `<label><span>${l}</span>${tag}</label>`;
        }).join('')}</div></li>`;
    }).join('')}</ul>`;
}

// ----- Astuces, infos, quiz (listes complètes) -----
const textList = list => ov[list] ?? BASE[list];
function renderTexts(list, labels) {
  const items = textList(list);
  $('#ct-body').innerHTML = `<div class="row"><button type="button" class="big-btn" data-add="${list}">➕ Ajouter</button>
      ${Array.isArray(ov[list]) ? `<button type="button" class="ghost-btn" data-reset-list="${list}">↺ Revenir à la liste d'origine</button>` : ''}
      <span class="small">${items.length} élément${items.length > 1 ? 's' : ''}</span></div>
    <ul class="ct-list">${items.map((it, i) => `<li class="ct-item"><details${it._new ? ' open' : ''}>
      <summary>${it.date ? esc(it.date) + ' · ' : ''}${esc(it.title || it.q || '(sans titre)')}</summary>
      <div class="ct-grid">${Object.entries(labels).map(([f, l]) => {
        if (f === 'choices') return `<label class="wide"><span>${l} (4)</span>${[0, 1, 2, 3].map(k => `<input data-text="${list}:${i}:choices:${k}" value="${esc(it.choices?.[k] ?? '')}" placeholder="Réponse ${k + 1}">`).join('')}</label>`;
        if (f === 'answer') return `<label><span>${l}</span><select data-text="${list}:${i}:answer">${[0, 1, 2, 3].map(k => `<option value="${k}" ${it.answer === k ? 'selected' : ''}>Réponse ${k + 1}</option>`).join('')}</select></label>`;
        const long = f === 'text' || f === 'explain' || f === 'q';
        if (f === 'date') return `<label><span>${l}</span><input type="date" data-text="${list}:${i}:${f}" value="${esc(it[f] ?? '')}"></label>`;
        return `<label class="${long ? 'wide' : ''}"><span>${l}</span>${long ? `<textarea rows="3" data-text="${list}:${i}:${f}">${esc(it[f] ?? '')}</textarea>` : `<input data-text="${list}:${i}:${f}" value="${esc(it[f] ?? '')}">`}</label>`;
      }).join('')}</div>
      <button type="button" class="danger small-btn" data-del="${list}:${i}">🗑️ Supprimer</button></details></li>`).join('')}</ul>`;
}
function ensureList(list) { if (!Array.isArray(ov[list])) ov[list] = JSON.parse(JSON.stringify(BASE[list])); return ov[list]; }

// ----- Programme du mois (PDF) -----
function renderPdfBox() {
  const d = ov.calendarDoc;
  $('#ct-body').insertAdjacentHTML('afterbegin', `<div class="pdf-box">
    <h3>📄 Programme du mois (PDF)</h3>
    ${d ? `<div class="pdf-current"><img src="${esc(d.images?.[0] || '')}" alt="Aperçu du programme">
      <span class="stack"><b>${esc(d.title)}</b><small>${d.images?.length || 0} page(s) · ${d.pdf ? 'PDF joint' : 'PDF à réimporter avant publication'}</small>
      <button type="button" class="ghost-btn small-btn" data-pdf-remove>🗑️ Retirer le programme</button></span></div>` : '<p class="muted">Aucun programme : importez le PDF du mois, il s\'affichera dans le jeu (onglet 💡 Astuces → Notre calendrier).</p>'}
    <label class="switch"><input type="checkbox" id="pdf-auto" checked> <span>Remplir automatiquement le calendrier avec les ateliers détectés</span></label>
    <label class="file-btn">📂 ${d ? 'Remplacer par un autre PDF' : 'Importer le PDF du planning'}<input type="file" accept="application/pdf,.pdf" data-pdf></label>
    <p id="pdf-msg" class="small" role="status"></p></div>`);
}

async function importPdf(file) {
  const msg = $('#pdf-msg');
  msg.textContent = '⏳ Lecture du PDF…';
  try {
    const { images, lines } = await readPdf(file);
    const plan = parsePlanning(lines);
    const pdf = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); });
    const stamp = plan.month ? `${plan.year}-${String(['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'].indexOf(plan.month) + 1).padStart(2, '0')}` : Date.now().toString(36);
    ov.calendarDoc = { title: plan.month ? `Programme de ${plan.month} ${plan.year}` : 'Programme du mois', images, pdf, stamp };
    let added = 0;
    if ($('#pdf-auto').checked && plan.items.length) {
      // Remplace les ateliers du même mois, garde les autres
      const prefix = stamp + '-';
      const keep = (ov.calendar ?? BASE.calendar).filter(c => !c.date?.startsWith(prefix));
      ov.calendar = [...keep, ...plan.items];
      added = plan.items.length;
    }
    persist();
    VIEWS.calendar.render();
    $('#pdf-msg').textContent = added ? `✅ Programme importé : ${added} atelier${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} au calendrier. Vérifiez-les ci-dessous.`
      : '✅ Programme importé (aucun atelier détecté automatiquement : ajoutez-les à la main si besoin).';
  } catch (err) {
    msg.textContent = '❌ Impossible de lire ce PDF.';
  }
}

const dataUrlToBlob = u => fetch(u).then(r => r.blob());
const downloadBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); };

// ----- Économie -----
const ECO = [
  ['Imprimantes mystère', [['gacha.cost1', 'Prix d\'une impression (💎)'], ['gacha.cost10', 'Prix de 10 impressions (💎)'], ['gacha.pityLegendary', 'Légendaire garanti tous les… tirages']]],
  ['Cristaux', [['rewards.welcomeCrystals', 'Cadeau de bienvenue'], ['rewards.eraCrystals', 'Par nouvelle ère'], ['rewards.qrDefault', 'QR de l\'équipe : montant proposé'], ['rewards.qrMax', 'QR de l\'équipe : maximum'], ['rewards.voucherDays', 'QR joueur : validité (jours)'],
    ['minigames.dailyCrystalCap', 'Mini-jeux : plafond par jour'], ['missions.allBonus', 'Missions : bonus des 3 missions'], ['minigames.crystalsPerGame', 'Mini-jeux : cristaux par partie'], ['daily.rewards', 'Bonus du jour (7 valeurs séparées par des virgules)']]],
  ['Astuces et boosts', [['tips.intervalMin', 'Astuces : une toutes les… minutes'], ['tips.crystals', 'Astuces : cristaux gagnés'], ['tips.readSec', 'Astuces : temps de lecture (s)'],
    ['boosts.cooldownMin', 'Boosts : recharge (minutes)'], ['boosts.infoMult', 'Le saviez-vous : multiplicateur'], ['boosts.quizMult', 'Quiz réussi : multiplicateur']]],
  ['Cocotte dorée et saisons', [['golden.minSec', 'Cocotte dorée : apparition min (s)'], ['golden.maxSec', 'Cocotte dorée : apparition max (s)'], ['golden.lifeSec', 'Cocotte dorée : durée à l\'écran (s)'], ['prestige.seedPct', 'Graine de saison : % de production']]],
];
function renderEconomy() {
  $('#ct-body').innerHTML = `<p class="muted">Réglages de l'économie du jeu. Valeur vide = valeur d'origine.</p>` + ECO.map(([t, fields]) => `<h3>${t}</h3>
    <div class="ct-grid">${fields.map(([p, l]) => {
      const base = getPath(BASE.config, p), cur = getPath(ov.config || {}, p) ?? base;
      return `<label class="${getPath(ov.config || {}, p) !== undefined ? 'changed' : ''}"><span>${l}</span><input data-eco="${p}" value="${Array.isArray(cur) ? cur.join(', ') : cur ?? ''}" placeholder="${Array.isArray(base) ? base.join(', ') : base ?? ''}"></label>`;
    }).join('')}</div>`).join('');
}

// ----- Publication -----
function renderPublish() {
  const upload = config.repoUploadUrl;
  $('#ct-body').innerHTML = `<h3>Publier pour tous les joueurs</h3>
    <ol class="steps big">
      <li><b>Vérifiez</b> avec « 👁️ Aperçu dans le jeu » (seul cet appareil voit les modifications).</li>
      <li>Cliquez <b>« 📤 Publier »</b> : ${publishFiles.length > 1 ? `${publishFiles.length} fichiers sont téléchargés (<code>${publishFiles.join('</code>, <code>')}</code>). Si le navigateur demande l'autorisation de télécharger plusieurs fichiers, acceptez.` : 'le fichier <code>overrides.json</code> est téléchargé (plus le PDF du programme et ses images s\'il y en a un).'}</li>
      <li>Déposez-le sur GitHub, dans <code>cocotte-clicker/data/</code> : ${upload ? `<a href="${esc(upload)}" target="_blank" rel="noopener">ouvrir la page de dépôt</a>, ` : ''}glissez <b>tous</b> les fichiers téléchargés, puis <b>« Commit changes »</b>. <code>overrides.json</code> remplace l'ancien.</li>
      <li>1 à 2 minutes plus tard, tous les joueurs ont le nouveau contenu (appli installée : à la prochaine ouverture).</li>
    </ol>
    <p class="muted">Pour revenir au contenu d'origine pour tout le monde : publiez un fichier vide (« ↺ Tout annuler » puis « 📤 Publier »).</p>`;
}

// ---------- Événements ----------
function bind() {
  const body = $('#ct-body');
  body.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.pdf !== undefined && t.files?.[0]) { importPdf(t.files[0]); t.value = ''; return; }
    if (t.dataset.img) {
      const k = t.dataset.img, v = t.value.trim();
      if (v === '(fichier importé)') return;
      ov.manifest ??= {};
      if (!v || v === BASE.manifest[k]) delete ov.manifest[k]; else ov.manifest[k] = v;
      persist(); renderImages();
    } else if (t.dataset.file) {
      const f = t.files[0]; if (!f) return;
      try { (ov.manifest ??= {})[t.dataset.file] = await fileToDataURL(f); persist(); renderImages(); toast('Image importée.'); }
      catch { toast('Image illisible.'); }
    } else if (t.dataset.item) {
      const [list, id, f] = t.dataset.item.split(':');
      const base = BASE[list].find(x => String(x.id) === id)[f];
      let v = t.value.trim();
      if (t.dataset.num) { v = Number(v.replace(',', '.')); if (!isFinite(v) || v < 0) { toast('Nombre invalide.'); t.value = base; return; } }
      ov[list] ??= {};
      const o = (ov[list][id] ??= {});
      if (v === '' || v === base) delete o[f]; else o[f] = v;
      if (!Object.keys(o).length) delete ov[list][id];
      persist();
    } else if (t.dataset.text) {
      const [list, i, f, k] = t.dataset.text.split(':');
      const arr = ensureList(list), it = arr[+i];
      if (f === 'choices') { it.choices ??= ['', '', '', '']; it.choices[+k] = t.value.trim(); }
      else if (f === 'answer') it.answer = +t.value;
      else it[f] = t.value.trim();
      persist();
    } else if (t.dataset.eco) {
      const p = t.dataset.eco, base = getPath(BASE.config, p);
      let v = t.value.trim();
      ov.config ??= {};
      if (!v) setPath(ov.config, p, undefined);
      else if (Array.isArray(base)) {
        const arr = v.split(/[,;\s]+/).map(Number).filter(n => isFinite(n) && n >= 0);
        if (arr.length !== base.length) { toast(`Il faut ${base.length} nombres.`); return; }
        setPath(ov.config, p, arr);
      } else {
        v = Number(v.replace(',', '.'));
        if (!isFinite(v) || v < 0) { toast('Nombre invalide.'); return; }
        if (v === base) setPath(ov.config, p, undefined); else setPath(ov.config, p, v);
      }
      persist(); renderEconomy();
    }
  });
  body.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pdfRemove !== undefined) { if (confirm('Retirer le programme du mois ?')) { ov.calendarDoc = null; persist(); VIEWS.calendar.render(); } return; }
    if (b.dataset.resetImg) { delete ov.manifest?.[b.dataset.resetImg]; persist(); renderImages(); }
    if (b.dataset.resetItem) { const [l, id] = b.dataset.resetItem.split(':'); delete ov[l]?.[id]; persist(); VIEWS[l].render(); }
    if (b.dataset.add) {
      const l = b.dataset.add, arr = ensureList(l);
      const id = 'perso-' + Date.now().toString(36);
      arr.unshift(l === 'calendar' ? { id, date: new Date().toLocaleDateString('sv-SE'), time: '', title: '', text: '', _new: 1 } : l === 'quiz' ? { id, q: '', choices: ['', '', '', ''], answer: 0, explain: '', _new: 1 } : l === 'infos' ? { id, icon: '💡', title: '', text: '', _new: 1 } : { id, cat: '💡 Astuce', title: '', text: '', _new: 1 });
      persist(); VIEWS[l].render();
      arr.forEach(x => delete x._new);
    }
    if (b.dataset.del) {
      const [l, i] = b.dataset.del.split(':');
      if (!confirm('Supprimer cet élément ?')) return;
      ensureList(l).splice(+i, 1); persist(); VIEWS[l].render();
    }
    if (b.dataset.resetList) { delete ov[b.dataset.resetList]; persist(); VIEWS[b.dataset.resetList].render(); }
  });

  $('#ct-preview').addEventListener('click', () => {
    persist();
    localStorage.setItem(PREVIEW_KEY, '1');
    open('./', '_blank');
  });
  $('#ct-export').addEventListener('click', () => {
    // Vérifie les textes avant publication
    if (Array.isArray(ov.calendar) && ov.calendar.some(x => !/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') || !x.title)) return toast('Calendrier : chaque atelier doit avoir une date (AAAA-MM-JJ) et un titre.');
    for (const l of ['tips', 'infos']) if (Array.isArray(ov[l]) && ov[l].some(x => !x.title || !x.text)) return toast(`Un élément de « ${VIEWS[l].label} » n'a pas de titre ou de texte.`);
    if (Array.isArray(ov.quiz) && ov.quiz.some(q => !q.q || q.choices.some(c => !c))) return toast('Une question du quiz est incomplète (question ou réponses vides).');
    const out = JSON.parse(JSON.stringify({ ...ov, _doc: 'Contenu modifié depuis l\'espace équipe Co\'Clicker', _published: new Date().toISOString() }));
    const extra = [];
    if (out.calendarDoc) {
      const d = out.calendarDoc, st = d.stamp || Date.now().toString(36);
      if (d.pdf?.startsWith('data:')) { extra.push([d.pdf, `planning-${st}.pdf`]); d.pdf = `data/planning-${st}.pdf`; }
      else if (!d.pdf && ov.calendarDoc.pdf === '') return toast('Réimportez le PDF du programme avant de publier.');
      d.images = d.images.map((im, i) => { if (!im.startsWith('data:')) return im; extra.push([im, `planning-${st}-${i + 1}.webp`]); return `data/planning-${st}-${i + 1}.webp`; });
    }
    downloadBlob(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), 'overrides.json');
    for (const [u, name] of extra) dataUrlToBlob(u).then(b => downloadBlob(b, name));
    publishFiles = ['overrides.json', ...extra.map(x => x[1])];
    setView('publish');
    toast(`📤 ${publishFiles.length} fichier${publishFiles.length > 1 ? 's' : ''} téléchargé${publishFiles.length > 1 ? 's' : ''} : déposez-le${publishFiles.length > 1 ? 's' : ''} sur GitHub (voir étapes).`, 7000);
  });
  $('#ct-import').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { ov = JSON.parse(await f.text()); delete ov._doc; delete ov._published; persist(); setView(view); toast('Contenu importé.'); }
    catch { toast('Fichier invalide.'); }
  });
  $('#ct-reset').addEventListener('click', () => {
    if (!confirm('Annuler TOUTES les modifications du brouillon ?')) return;
    ov = {}; persist(); setView(view);
  });
}

export async function initContent(cfg) {
  config = cfg;
  const [buildings, eras, projects, tips, infos, quiz, manifest, published, calendar] = await Promise.all([
    load('data/buildings.json'), load('data/eras.json'), load('data/projects.json'), load('data/tips.json'),
    load('data/infos.json'), load('data/quiz.json'), load('assets/manifest.json'), load('data/overrides.json').catch(() => ({})), load('data/calendar.json').catch(() => ({ calendar: [] })),
  ]);
  BASE = { buildings, eras, projects: projects.projects, tips: tips.tips, infos: infos.infos, quiz: quiz.questions, calendar: calendar.calendar || [], manifest, config: JSON.parse(JSON.stringify(cfg)) };
  // Le brouillon reprend la version publiée tant qu'aucune modification locale n'existe
  ov = readDraft() || (({ _doc, _published, ...rest }) => rest)(published || {});
  $('#ct-nav').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button role="tab" type="button" data-v="${k}">${v.label}</button>`).join('');
  $('#ct-nav').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setView(b.dataset.v); });
  bind();
  persist();
  setView('images');
}
