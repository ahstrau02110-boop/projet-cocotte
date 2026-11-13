// Point d'entrée : chargement des données, boucle de jeu, interface
import { DATA, CONFIG, state, owned, costOf, totalCps, clickValue, earn, buy, currentEra, buildingCps, addCrystals } from './state.js';
import { save, load, exportSave, importSave, hardReset, applyOffline } from './save.js';
import { fmt, fmtDuration } from './format.js';
import { initFx, puff, stepFx, floatText } from './fx.js';
import { sfx, music, setSfxVolume, setMusicVolume, setMusicUrl } from './audio.js';

import { $, $$, asset, toast, on, emit } from './core.js';
import { skinById, skinImage } from './skins.js';
import { initGacha, openGacha } from './gacha.js';
import { initGames, openGames } from './games/hub.js';
import { initPlayer, openMyQR } from './player.js';
import { initShare } from './share.js';
import { initTransfer } from './transfer.js';
import { initCloud } from './cloud.js';
import { claimLocal, setBooted } from './session.js';
import { initMaj } from './maj.js';
import { initMaterials, renderMatsBar, clickDrop } from './materials.js';
import { initCraft, renderCraftTile, setRecipes } from './craft.js';
import { initOrders, renderOrdersTile, setOrdersData } from './orders.js';
import { initStats } from './stats.js';
import { initFold } from './fold.js';
import { buildProgress, initProgress, renderUpgrades, checkAchievements, openAchievements } from './progress.js';
import { decorFor } from './decor.js';
import { initTutorial } from './tutorial.js';
import { initTips, renderTipTile } from './tips.js';
import { applyBackground } from './backgrounds.js';
import { initBoosts, renderBoostTile } from './boosts.js';
import { initDaily, checkDaily } from './daily.js';
import { initCommunity, renderCommunityCard } from './community.js';
import { applyOverrides, readDraft, previewOn, PREVIEW_KEY } from './content.js';
import { initEvents, renderEventTile } from './events.js';
import { initMissions, renderMissions } from './missions.js';
import { initHelp } from './help.js';
import { initGolden, renderBuffs } from './golden.js';
import { initSeason, renderProjects, renderSeason, applyMusicUnlocks, initTalents } from './season.js';

// ---------- Chargement ----------
async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url + ' : ' + r.status);
  return r.json();
}

async function boot() {
  try {
    let skins, upg, ach, proj;
    [DATA.buildings, DATA.eras, DATA.manifest, DATA.config, skins, upg, ach, proj] = await Promise.all([
      loadJSON('data/buildings.json'),
      loadJSON('data/eras.json'),
      loadJSON('assets/manifest.json'),
      loadJSON('data/config.json'),
      loadJSON('data/skins.json'),
      loadJSON('data/upgrades.json'),
      loadJSON('data/achievements.json'),
      loadJSON('data/projects.json'),
    ]);
    DATA.projects = proj.projects;
    DATA.tips = (await loadJSON('data/tips.json')).tips;
    DATA.backgrounds = (await loadJSON('data/backgrounds.json')).backgrounds;
    DATA.infos = (await loadJSON('data/infos.json')).infos;
    DATA.quiz = (await loadJSON('data/quiz.json')).questions;
    DATA.talents = (await loadJSON('data/talents.json')).talents;
    DATA.events = (await loadJSON('data/events.json')).events;
    DATA.missions = await loadJSON('data/missions.json');
    DATA.calendar = (await loadJSON('data/calendar.json').catch(() => ({ calendar: [] }))).calendar || [];
    setRecipes((await loadJSON('data/recipes.json')).recipes);
    setOrdersData(await loadJSON('data/orders.json'));
    // Contenu modifié depuis l'espace équipe : version publiée, puis brouillon en aperçu (appareil de l'équipe)
    applyOverrides(DATA, await loadJSON('data/overrides.json').catch(() => null));
    if (previewOn() && readDraft()) {
      applyOverrides(DATA, readDraft());
      document.body.insertAdjacentHTML('afterbegin', `<div class="preview-banner" role="status">👁️ Aperçu des modifications de l'espace équipe (non publiées)
        <button type="button" id="btn-preview-off">Quitter l'aperçu</button></div>`);
      document.getElementById('btn-preview-off').addEventListener('click', () => { localStorage.removeItem(PREVIEW_KEY); location.reload(); });
    }
    buildProgress(upg, ach);
    DATA.skins = skins.skins;
    DATA.rarities = skins.rarities;
  } catch (e) {
    // Réparation automatique : 1re fois on recharge, 2e fois on réinitialise le service worker et son cache
    // (la partie, enregistrée dans localStorage, n'est pas touchée)
    const tries = +sessionStorage.getItem('coclicker-boot-retry') || 0;
    if (tries < 2 && location.protocol !== 'file:') {
      sessionStorage.setItem('coclicker-boot-retry', tries + 1);
      if (tries === 1 && 'serviceWorker' in navigator) {
        try {
          for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
          for (const k of await caches.keys()) await caches.delete(k);
        } catch { /* rien */ }
      }
      setTimeout(() => location.reload(), 1200);
      document.body.insertAdjacentHTML('afterbegin', '<p class="fatal">Chargement du jeu… nouvelle tentative.</p>');
      return;
    }
    sessionStorage.removeItem('coclicker-boot-retry');
    document.body.insertAdjacentHTML('afterbegin',
      `<p class="fatal">Impossible de charger les données du jeu (${e.message}).<br>
       Vérifiez la connexion Internet puis <a href="" onclick="location.reload();return false">rechargez la page</a>.</p>`);
    return;
  }
  sessionStorage.removeItem('coclicker-boot-retry');

  // Assets via le manifest
  $('#logo').src = asset('logo');
  document.querySelectorAll('[data-asset]').forEach(img => (img.src = asset(img.dataset.asset)));

  await claimLocal(); // un seul onglet actif : les autres enregistrent puis se mettent en pause
  const hadSave = load();
  setBooted();
  // Oublie les bâtiments retirés des données (anciennes sauvegardes)
  for (const id of Object.keys(state.buildings))
    if (!DATA.buildings.some(b => b.id === id)) delete state.buildings[id];
  setMusicUrl(asset('music'));
  if (!DATA.skins.some(s => s.id === state.skin)) state.skin = 'classique';
  // Cristaux de bienvenue (une seule fois)
  if (!state.welcomed) {
    state.welcomed = true;
    const w = DATA.config.rewards?.welcomeCrystals ?? 20;
    if (w) { addCrystals(w); setTimeout(() => toast(`Bienvenue ! ${w} 💎 cristaux offerts pour votre première impression mystère.`, 6000), 1200); }
  }
  if (hadSave) {
    const away = (Date.now() - state.lastSave) / 1000;
    if (away > 60) offlineToast(applyOffline(away));
  }

  initFx($('#fx'));
  bindUI();
  initGacha();
  initGames();
  initPlayer();
  initProgress();
  initSeason();
  initTalents();
  initGolden();
  initTutorial();
  initTips();
  initBoosts();
  initEvents();
  initMissions();
  initHelp();
  initShare();
  initTransfer();
  initCloud();
  initMaj();
  initMaterials();
  initCraft();
  initOrders();
  initStats();
  initFold();
  initCommunity();
  initDaily();
  on('tutoEnd', () => setTimeout(checkDaily, 600));
  on('season', afterStateChange);
  applySkin();
  $('#opt-dark').addEventListener('change', e => { state.settings.dark = e.target.checked; if (e.target.checked) state.flags.sombre = 1; applyDark(); save(); });
  on('refresh', updateUI);
  on('skin', applySkin);
  renderShop();
  updateSound();
  updateQty();
  applyDark();
  $('#coach').classList.toggle('hidden', state.totalClicks >= 3);
  lastFrame = performance.now();
  requestAnimationFrame(loop);
  setInterval(save, CONFIG.autosaveSec * 1000);
  addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => document.hidden && save());
}

function offlineToast({ gain, seconds }) {
  if (gain > 0) toast(`Pendant votre absence (${fmtDuration(seconds)}), l'atelier a tourné : +${fmt(gain)} Co'Coins`);
}

// ---------- Boucle ----------
let lastFrame = 0, uiTimer = 0, smokeTimer = 0, achTimer = 0, eraId = 0;

function loop(now) {
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  // Onglet resté en arrière-plan longtemps : traité comme du hors-ligne
  if (dt > 60) { offlineToast(applyOffline(dt)); dt = 0; }

  earn(totalCps() * dt);
  stepFx(dt);

  // Fumée passive si la marmite produit seule
  smokeTimer += dt;
  if (totalCps() > 0 && smokeTimer > 1.2) { smokeTimer = 0; puff(1, false); }

  achTimer += dt;
  if (achTimer > 1) { achTimer = 0; checkAchievements(); }

  uiTimer += dt;
  if (uiTimer > 0.1) { uiTimer = 0; updateUI(); }
  requestAnimationFrame(loop);
}

// ---------- Interface ----------
const eraOf = id => DATA.eras.find(e => e.id === id);

function updateUI() {
  const cps = totalCps();
  $('#coins').textContent = fmt(state.coins);
  $('#cps').textContent = fmt(cps, 1);
  $('#total').textContent = fmt(state.totalEarned);
  $('#clicks').textContent = fmt(state.totalClicks);
  $('#nb-buildings').textContent = fmt(Object.values(state.buildings).reduce((a, n) => a + n, 0));
  $('#click-value').textContent = fmt(clickValue());
  $('#crystals').textContent = fmt(state.crystals);
  renderUpgrades();
  renderProjects();
  renderSeason();
  renderBuffs();
  renderTipTile();
  renderBoostTile();
  renderEventTile();
  renderMissions();
  renderCommunityCard();
  renderCraftTile();
  renderOrdersTile();
  $$('.js-crystals').forEach(e => (e.textContent = fmt(state.crystals)));

  const era = currentEra();
  if (era.id !== eraId) {
    const isNew = eraId !== 0 && era.id > eraId;
    eraId = era.id;
    document.body.className = 'era-' + era.id;
    $('#era-num').textContent = era.id;
    $('#era-max').textContent = DATA.eras.length;
    $('#era-name').textContent = era.name;
    $('#era-tagline').textContent = era.tagline || '';
    $('#bench-decor').innerHTML = decorFor(era.id);
    renderShop();
    if (isNew) {
      const c = DATA.config.rewards?.eraCrystals ?? 10;
      addCrystals(c);
      sfx.unlock();
      toast(`Nouvelle ère : ${era.name} ! ${era.tagline || ''} +${c} 💎`, 6000);
    }
  }
  updateEraBar(era);

  // Mise à jour légère des cartes (sans reconstruire le DOM)
  const qty = state.settings.buyQty;
  let suggested = false;
  const none = Object.keys(state.buildings).length === 0;
  for (const btn of document.querySelectorAll('.bld[data-id]')) {
    const b = DATA.buildings.find(x => x.id === btn.dataset.id);
    const n = owned(b.id), c = costOf(b, qty), can = state.coins >= c;
    btn.querySelector('.bld-cost span').textContent = fmt(c);
    btn.querySelector('.bld-qty').textContent = '×' + qty;
    const cnt = btn.querySelector('.bld-count');
    cnt.textContent = n;
    cnt.classList.toggle('has', n > 0);
    const each = buildingCps(b);
    btn.querySelector('.bld-each').textContent = fmt(each, 1);
    btn.querySelector('.bld-total').textContent = fmt(n * each, 1);
    btn.querySelector('.bld-progress span').style.width = Math.min(100, state.coins / c * 100) + '%';
    btn.classList.toggle('can', can);
    btn.classList.toggle('cant', !can);
    // Guide le tout premier achat
    const sug = none && can && !suggested;
    btn.classList.toggle('suggest', sug);
    if (sug) suggested = true;
    btn.setAttribute('aria-disabled', String(!can));
    btn.setAttribute('aria-label',
      `${b.name}, ${n} possédé${n > 1 ? 's' : ''}. Acheter ${qty} pour ${fmt(c)} Co'Coins${can ? '' : ' (pas assez de Co\'Coins)'}. +${fmt(buildingCps(b), 1)} par seconde chacun.`);
  }
}

// Barre de progression vers l'ère suivante
function updateEraBar(era) {
  const next = eraOf(era.id + 1);
  const fill = $('#era-fill'), bar = $('#era-bar');
  if (!next) {
    fill.style.width = '100%';
    bar.setAttribute('aria-valuenow', 100);
    $('#era-next').textContent = 'Toutes les ères sont débloquées. Bravo !';
    return;
  }
  const pct = Math.min(100, (state.totalEarned - era.unlockAt) / (next.unlockAt - era.unlockAt) * 100);
  fill.style.width = pct + '%';
  bar.setAttribute('aria-valuenow', Math.floor(pct));
  $('#era-next').innerHTML = `Prochaine ère : <strong>${next.name}</strong> dans ${fmt(next.unlockAt - state.totalEarned)} Co'Coins produits`;
}

// Reconstruit la liste : bâtiments des ères atteintes + 1 aperçu verrouillé
function renderShop() {
  const ul = $('#buildings');
  ul.innerHTML = '';
  const era = currentEra();
  for (const b of DATA.buildings) {
    const be = eraOf(b.era), color = be?.color || 'var(--c-orange)';
    const li = document.createElement('li');
    if (b.era > era.id) {
      li.innerHTML = `
        <div class="bld locked" style="--b:${color}">
          <span class="bld-ico"><img src="${asset('building.' + b.id)}" alt=""></span>
          <span>
            <span class="bld-tag">Plan à débloquer</span>
            <span class="bld-name">???</span>
            <span class="bld-desc">Arrive avec l'ère <strong>${be ? be.name : b.era}</strong> (${fmt(be ? be.unlockAt : 0)} Co'Coins produits).</span>
          </span>
        </div>`;
      ul.appendChild(li);
      break;
    }
    li.innerHTML = `
      <button class="bld" data-id="${b.id}" style="--b:${color}">
        <span class="bld-ico"><img src="${asset('building.' + b.id)}" alt=""><span class="bld-count" aria-hidden="true">0</span></span>
        <span>
          <span class="bld-tag">${be ? be.name : ''}</span>
          <span class="bld-name">${b.name}</span>
          <span class="bld-desc">${b.desc}</span>
          <span class="bld-prod">+<span class="bld-each"></span>/s chacun · total <b class="bld-total">0</b>/s</span>
        </span>
        <span class="bld-price" aria-hidden="true">
          <small>Acheter <span class="bld-qty">×1</span></small>
          <span class="bld-cost"><img src="${asset('cocoin')}" alt=""><span></span></span>
        </span>
        <span class="bld-progress" aria-hidden="true"><span></span></span>
      </button>`;
    li.querySelector('button').addEventListener('click', () => onBuy(b));
    ul.appendChild(li);
  }
  updateUI();
}

function onBuy(b) {
  if (buy(b, state.settings.buyQty)) {
    sfx.buy();
    const w = $('.wallet'); w.classList.remove('pop'); void w.offsetWidth; w.classList.add('pop');
    updateUI();
  } else sfx.deny();
}

const clickTimes = [];
function onPotClick(e) {
  const v = clickValue();
  earn(v);
  state.handEarned += v;
  state.totalClicks++;
  emit('potClick');
  if (state.totalClicks >= 3) $('#coach').classList.add('hidden');

  // Position du « +N » : pointeur, ou centre si clavier
  const wrap = $('#pot-wrap'), r = wrap.getBoundingClientRect();
  const kb = e.detail === 0;
  const x = kb ? r.width / 2 : e.clientX - r.left;
  const y = kb ? r.height * .35 : e.clientY - r.top;
  floatText(wrap, x, y, '+' + fmt(v));
  clickDrop(wrap, x, y);
  // Succès secrets : clic de minuit, rafale de 15 clics en 2 s
  const now = Date.now();
  if (new Date().getHours() === 0) state.flags.minuit = 1;
  clickTimes.push(now);
  while (clickTimes.length && now - clickTimes[0] > 2000) clickTimes.shift();
  if (clickTimes.length >= 15) state.flags.rafale = 1;
  puff(8);
  sfx.click();

  const pot = $('#pot');
  pot.classList.add('bump');
  wrap.classList.remove('flash'); void wrap.offsetWidth; wrap.classList.add('flash');
  setTimeout(() => pot.classList.remove('bump'), 80);
  updateUI();
}

// Synchronise l'audio et les boutons avec les réglages
function updateSound() {
  const st = state.settings;
  sfx.enabled = st.sound;
  music.enabled = st.music;
  setSfxVolume(st.sfxVol);
  setMusicVolume(st.musicVol);
  const bs = $('#btn-sound');
  bs.setAttribute('aria-pressed', String(st.sound));
  bs.querySelector('.ico').textContent = st.sound ? '🔔' : '🔕';
  bs.setAttribute('aria-label', st.sound ? 'Couper les effets sonores' : 'Activer les effets sonores');
  if (st.music && st.track === 'atelier') state.flags.musique = 1;
  const bm = $('#btn-music');
  bm.setAttribute('aria-pressed', String(st.music));
  bm.classList.toggle('playing', st.music);
  bm.setAttribute('aria-label', st.music ? 'Couper la musique' : 'Lancer la musique');
  $('#vol-sfx').value = Math.round(st.sfxVol * 100);
  $('#vol-music').value = Math.round(st.musicVol * 100);
}

// Mode sombre (classe sur <html> pour ne pas gêner les classes d'ère du <body>)
function applyDark() {
  document.documentElement.classList.toggle('dark', !!state.settings.dark);
  $('#opt-dark').checked = !!state.settings.dark;
  document.querySelector('meta[name=theme-color]').content = state.settings.dark ? '#16131f' : '#FCD260';
}

function updateQty() {
  document.querySelectorAll('.qty [data-qty]').forEach(btn =>
    btn.setAttribute('aria-checked', String(+btn.dataset.qty === state.settings.buyQty)));
  updateUI();
}

// Applique le skin équipé à la Cocotte (image + effet de rareté)
function applySkin() {
  const sk = skinById(state.skin);
  $('#pot img').src = skinImage(sk.id);
  $('#pot').dataset.fx = sk.fx || '';
  $('#pot').dataset.rarity = sk.rarity;
  applyBackground();
}

function bindUI() {
  $('#pot').addEventListener('click', onPotClick);

  // Activités
  $('#btn-games').addEventListener('click', () => { sfx.ui(); openGames(); });
  $('#btn-gacha').addEventListener('click', () => { sfx.ui(); openGacha(); });
  $('#btn-crystals').addEventListener('click', () => { sfx.ui(); openGacha(); });
  $('#btn-myqr').addEventListener('click', () => { sfx.ui(); openMyQR(); });
  $('#btn-ach').addEventListener('click', () => { sfx.ui(); openAchievements(); });


  $('#btn-sound').addEventListener('click', () => {
    state.settings.sound = !state.settings.sound;
    updateSound();
    sfx.ui();
  });
  $('#btn-music').addEventListener('click', () => {
    state.settings.music = !state.settings.music;
    updateSound();
    state.settings.music ? music.start() : music.stop();
  });
  $('#vol-sfx').addEventListener('input', e => { state.settings.sfxVol = e.target.value / 100; updateSound(); });
  $('#vol-sfx').addEventListener('change', () => sfx.ui());
  $('#vol-music').addEventListener('input', e => { state.settings.musicVol = e.target.value / 100; updateSound(); });

  // Musique activée dans une partie précédente : démarre au premier geste (règle des navigateurs)
  const firstGesture = () => { music.start(); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture); };
  addEventListener('pointerdown', firstGesture);
  addEventListener('keydown', firstGesture);

  // Groupe radio ×1 / ×10 / ×100 (flèches gauche/droite gérées)
  const radios = [...document.querySelectorAll('.qty [data-qty]')];
  radios.forEach((btn, i) => {
    btn.addEventListener('click', () => { state.settings.buyQty = +btn.dataset.qty; updateQty(); sfx.ui(); });
    btn.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const n = radios[(i + d + radios.length) % radios.length];
      n.focus(); n.click();
    });
  });

  // Options
  const dlg = $('#dlg-options');
  $('#btn-options').addEventListener('click', () => { sfx.ui(); $('#save-code').value = ''; dlg.showModal(); });
  $('#btn-save').addEventListener('click', () => toast(save() ? 'Partie sauvegardée.' : 'Sauvegarde impossible dans ce navigateur.'));
  $('#btn-export').addEventListener('click', async () => {
    const code = exportSave();
    $('#save-code').value = code;
    $('#save-code').select();
    try { await navigator.clipboard.writeText(code); toast('Code copié dans le presse-papiers.'); } catch {}
  });
  $('#btn-download').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportSave()], { type: 'text/plain' }));
    a.download = `cocotte-clicker-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const doImport = code => {
    try { importSave(code); afterStateChange(); toast('Sauvegarde importée.'); dlg.close(); }
    catch { toast('Code de sauvegarde invalide.'); }
  };
  $('#btn-import').addEventListener('click', () => doImport($('#save-code').value));
  $('#file-import').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (f) doImport(await f.text());
    e.target.value = '';
  });
  $('#btn-reset').addEventListener('click', () => {
    if (confirm('Effacer définitivement la partie en cours ?')) { hardReset(); afterStateChange(); dlg.close(); toast('Nouvelle partie.'); }
  });
}

function afterStateChange() {
  eraId = 0; // force la mise à jour du décor
  applyDark();
  applyMusicUnlocks();
  applySkin();
  if (!state.settings.music) music.stop(); else music.start();
  $('#coach').classList.toggle('hidden', state.totalClicks >= 3);
  updateSound();
  updateQty();
  renderShop();
}

boot();

import './app-shell.js';
