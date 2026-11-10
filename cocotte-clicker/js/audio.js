// =========================================================
// Audio : effets sonores + musique lofi générée en direct (WebAudio)
// Aucun fichier son requis (pas de droits d'auteur). Une musique
// externe peut remplacer le générateur via la clé "music" du manifest.
// =========================================================

let ctx, master, sfxBus, musicBus, musicIn, noiseBuf;
let musicUrl = '';      // fichier externe optionnel
let musicEl = null;     // <audio> si fichier externe
let sfxVol = 0.7, musicVol = 0.5;

const midi = n => 440 * Math.pow(2, (n - 69) / 12);

// Création paresseuse : les navigateurs exigent un geste de l'utilisateur
function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9;
    // Compresseur doux : évite la saturation quand on clique très vite
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);

    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicVol; musicBus.connect(master);

    // Chaîne « lofi » : filtre passe-bas chaud
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2300; lp.Q.value = 0.6;
    musicIn = ctx.createGain(); musicIn.gain.value = 0.55;
    musicIn.connect(lp).connect(musicBus);

    // Bruit blanc réutilisable (percussions, vinyle)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---------- Briques de synthèse ----------
function tone(dest, freq, t, dur, { type = 'sine', gain = 0.3, attack = 0.005, slideTo, detune = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
  return o;
}

function noise(dest, t, dur, { gain = 0.2, type = 'highpass', freq = 6000, q = 0.8 } = {}) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random()); s.stop(t + dur + 0.02);
}

// Son « cloche » : fondamentale + harmonique
function bell(dest, freq, t, dur = 0.5, gain = 0.2) {
  tone(dest, freq, t, dur, { gain });
  tone(dest, freq * 2.01, t, dur * 0.6, { gain: gain * 0.35 });
}

// ---------- Effets sonores ----------
const PENTA = [72, 74, 76, 79, 81, 84]; // do majeur pentatonique, accordé avec la musique
let lastNote = 0;

export const sfx = {
  enabled: false,

  // Clic sur la Cocotte : « toc » boisé + note pentatonique (jamais deux fois la même)
  click() {
    if (!this.enabled) return;
    const t = ensure().currentTime;
    let i; do { i = (Math.random() * PENTA.length) | 0; } while (i === lastNote);
    lastNote = i;
    tone(sfxBus, 520, t, 0.07, { type: 'triangle', gain: 0.35, slideTo: 240 });
    noise(sfxBus, t, 0.03, { gain: 0.12, type: 'bandpass', freq: 2500 });
    tone(sfxBus, midi(PENTA[i]), t + 0.01, 0.22, { gain: 0.09 });
  },

  // Achat réussi : petit arpège montant + pièce
  buy() {
    if (!this.enabled) return;
    const t = ensure().currentTime;
    bell(sfxBus, midi(76), t, 0.3, 0.18);
    bell(sfxBus, midi(81), t + 0.07, 0.4, 0.18);
    noise(sfxBus, t, 0.08, { gain: 0.06, freq: 8000 });
  },

  // Achat impossible : « bonk » grave et doux
  deny() {
    if (!this.enabled) return;
    const t = ensure().currentTime;
    tone(sfxBus, 180, t, 0.16, { type: 'square', gain: 0.07, slideTo: 120 });
  },

  // Nouvelle ère : fanfare cloches
  unlock() {
    if (!this.enabled) return;
    const t = ensure().currentTime;
    [72, 76, 79, 84, 88].forEach((n, k) => bell(sfxBus, midi(n), t + k * 0.09, 0.8, 0.16));
  },

  // Tête d'impression (gacha) : bips de moteur pas à pas qui montent
  printTick(p = 0) {
    if (!this.enabled) return;
    const t = ensure().currentTime;
    tone(sfxBus, 260 + p * 520, t, 0.06, { type: 'square', gain: 0.035 });
    tone(sfxBus, 390 + p * 780, t + 0.07, 0.05, { type: 'square', gain: 0.025 });
  },

  // Mini-jeux : alignement (la note monte avec le combo)
  pop(level = 0) {
    if (!this.enabled) return;
    const t = ensure().currentTime;
    const n = PENTA[level % PENTA.length] + 12 * Math.min(1, Math.floor(level / PENTA.length));
    bell(sfxBus, midi(n), t, 0.35, 0.14);
    noise(sfxBus, t, 0.05, { gain: 0.05, type: 'bandpass', freq: 3500 });
  },

  // Carte retournée (memory)
  flip() {
    if (!this.enabled) return;
    const t = ensure().currentTime;
    noise(sfxBus, t, 0.06, { gain: 0.1, type: 'bandpass', freq: 1800, q: 1.2 });
  },

  // Touché (chasse aux bugs)
  hit() {
    if (!this.enabled) return;
    const t = ensure().currentTime;
    tone(sfxBus, 620, t, 0.09, { type: 'triangle', gain: 0.25, slideTo: 1300 });
  },

  // Bouton d'interface
  ui() {
    if (!this.enabled) return;
    const t = ensure().currentTime;
    tone(sfxBus, 900, t, 0.05, { type: 'triangle', gain: 0.12, slideTo: 700 });
  },
};
// ---------- Musique lofi procédurale ----------
// Deux pistes. Motifs de batterie sur 16 pas : 1 = coup, valeurs < 1 = coup léger
const TRACKS = {
  // « Classique » : ii–V–I–vi en do (Rém9 · Sol13 · Domaj9 · Lam9), 74 BPM
  classique: {
    bpm: 74,
    chords: [
      { bass: 38, notes: [53, 57, 60, 64] },
      { bass: 43, notes: [53, 57, 59, 64] },
      { bass: 36, notes: [52, 55, 59, 62] },
      { bass: 45, notes: [55, 59, 60, 64] },
    ],
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,.4],
    hat:   [.8,0,.4,0, .8,0,.4,.3, .8,0,.4,0, .8,0,.4,0],
  },
  // « Atelier Musique » (débloquée par le projet) : Fa maj7 · Mim7 · Rém9 · Domaj7/Sol, 86 BPM, plus dansante
  atelier: {
    bpm: 86,
    chords: [
      { bass: 41, notes: [57, 60, 64, 65] },
      { bass: 40, notes: [55, 59, 62, 64] },
      { bass: 38, notes: [53, 57, 60, 64] },
      { bass: 43, notes: [52, 55, 59, 62] },
    ],
    kick:  [1,0,0,.6, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,.3, 1,0,0,0],
    hat:   [.8,.3,.5,.3, .8,.3,.5,.3, .8,.3,.5,.3, .8,.3,.6,.4],
  },
};
let CHORDS, S16, KICK, SNARE, HAT;
function useTrack(name) {
  const t = TRACKS[name] || TRACKS.classique;
  CHORDS = t.chords; S16 = 60 / t.bpm / 4; KICK = t.kick; SNARE = t.snare; HAT = t.hat;
}
useTrack('classique');
const SWING = 0.3;          // décalage des contretemps (groove « boom bap »)

let timer = null, step = 0, bar = 0, nextT = 0, vinyl = null, wow = null;

// Piano électrique : sinus + harmonique « tine », légère modulation de hauteur (wow)
function ep(freq, t, dur, gain) {
  const o1 = tone(musicIn, freq, t, dur, { gain, attack: 0.02 });
  const o2 = tone(musicIn, freq * 2, t, dur * 0.35, { gain: gain * 0.25, attack: 0.005 });
  const o3 = tone(musicIn, freq, t, dur, { type: 'triangle', gain: gain * 0.3, attack: 0.03, detune: 6 });
  if (wow) for (const o of [o1, o2, o3]) wow.connect(o.detune);
}

function kick(t, v) {
  tone(musicIn, 110, t, 0.35, { gain: 0.9 * v, slideTo: 42 });
}
function snare(t, v) {
  noise(musicIn, t, 0.2, { gain: 0.35 * v, type: 'bandpass', freq: 1700, q: 0.7 });
  tone(musicIn, 190, t, 0.08, { type: 'triangle', gain: 0.15 * v });
}
function hat(t, v) {
  noise(musicIn, t, 0.045, { gain: 0.11 * v * (0.75 + Math.random() * 0.5), freq: 7500 });
}

function scheduleStep(s, t) {
  const ch = CHORDS[bar % CHORDS.length];
  if (KICK[s]) kick(t, KICK[s]);
  if (SNARE[s]) snare(t, SNARE[s]);
  if (HAT[s]) hat(t, HAT[s]);

  // Accord plaqué « égrené » au premier temps, rappel léger au pas 10
  if (s === 0) ch.notes.forEach((n, k) => ep(midi(n), t + k * 0.018, S16 * 15, 0.07));
  if (s === 10 && Math.random() < 0.6) ch.notes.slice(1).forEach((n, k) => ep(midi(n), t + k * 0.015, S16 * 5, 0.04));

  // Basse ronde
  if (s === 0) tone(musicIn, midi(ch.bass), t, S16 * 7, { gain: 0.3, attack: 0.02 });
  if (s === 10) tone(musicIn, midi(ch.bass + (Math.random() < 0.5 ? 7 : 12)), t, S16 * 5, { gain: 0.22, attack: 0.02 });

  // Mélodie aléatoire très clairsemée, sur les 2 dernières mesures de chaque cycle de 4
  if (bar % 4 >= 2 && s % 2 === 0 && Math.random() < 0.28) {
    const pool = [...ch.notes.map(n => n + 12), 72, 74, 76, 79, 81];
    ep(midi(pool[(Math.random() * pool.length) | 0]), t, S16 * 3, 0.06);
  }
}

function tick() {
  while (nextT < ctx.currentTime + 0.15) {
    const swing = step % 2 ? S16 * SWING : 0;
    scheduleStep(step, nextT + swing);
    nextT += S16;
    if (++step === 16) { step = 0; bar++; }
  }
}

// Craquements de vinyle en boucle
function startVinyl() {
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.012 + (Math.random() < 0.0006 ? (Math.random() - .5) * 0.9 : 0);
  vinyl = ctx.createBufferSource(); vinyl.buffer = buf; vinyl.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.5;
  vinyl.connect(f).connect(musicIn); vinyl.start();
}

export const music = {
  enabled: false,
  playing: false,

  start() {
    if (!this.enabled || this.playing || document.hidden) return;
    this.playing = true;
    if (musicUrl) {
      musicEl ||= Object.assign(new Audio(musicUrl), { loop: true });
      musicEl.volume = musicVol;
      musicEl.play().catch(() => { this.playing = false; });
      return;
    }
    ensure();
    // LFO lent sur la hauteur : effet « cassette »
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35;
    wow = ctx.createGain(); wow.gain.value = 7;
    lfo.connect(wow); lfo.start();
    wow._lfo = lfo;
    musicIn.gain.cancelScheduledValues(ctx.currentTime);
    musicIn.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicIn.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 1.5); // fondu d'entrée
    startVinyl();
    step = 0; nextT = ctx.currentTime + 0.1;
    timer = setInterval(tick, 25);
  },

  stop() {
    if (!this.playing) return;
    this.playing = false;
    if (musicEl) { musicEl.pause(); return; }
    clearInterval(timer); timer = null;
    const t = ctx.currentTime;
    musicIn.gain.setValueAtTime(musicIn.gain.value, t);
    musicIn.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const v = vinyl, w = wow;
    setTimeout(() => { try { v?.stop(); w?._lfo.stop(); } catch {} }, 700);
    vinyl = null; wow = null;
  },
};

export function setSfxVolume(v) { sfxVol = v; if (sfxBus) sfxBus.gain.value = v; }
export function setMusicVolume(v) {
  musicVol = v;
  if (musicBus) musicBus.gain.value = v;
  if (musicEl) musicEl.volume = v;
}
export function setMusicUrl(url) { musicUrl = url || ''; }
export function setTrack(name) { useTrack(name); }

// Pause automatique quand l'onglet est caché (et reprise au retour)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) music.stop(); else music.start();
});
