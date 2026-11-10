// Lecture de QR code par la caméra (jeu et espace équipe)
// BarcodeDetector quand le navigateur le propose, sinon jsQR (chargé seulement à la demande)

async function loadJsQR() {
  if (window.jsQR) return;
  await new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/jsQR.js';
    s.onload = ok; s.onerror = ko;
    document.head.appendChild(s);
  });
}

// Démarre la caméra dans <video> et appelle onText(texte) à chaque QR lu (jusqu'à ce que onText renvoie true).
// Renvoie une fonction stop(). Lève une erreur si la caméra est inaccessible.
export async function startScanner(video, onText) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();
  let alive = true, last = '';
  const detector = 'BarcodeDetector' in window
    ? await BarcodeDetector.getSupportedFormats().then(f => f.includes('qr_code') ? new BarcodeDetector({ formats: ['qr_code'] }) : null).catch(() => null)
    : null;
  if (!detector) await loadJsQR();
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });

  const stop = () => {
    alive = false;
    stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  };

  const loop = async () => {
    if (!alive) return;
    let txt = null;
    if (video.readyState >= 2) {
      if (detector) {
        txt = (await detector.detect(video).catch(() => []))[0]?.rawValue || null;
      } else {
        // Image réduite pour aller plus vite sur les petits appareils
        const w = Math.min(640, video.videoWidth), h = Math.round(video.videoHeight * w / video.videoWidth);
        canvas.width = w; canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        txt = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data || null;
      }
    }
    if (txt && txt !== last) {
      last = txt;
      if (onText(txt) === true) { stop(); return; }
    }
    setTimeout(() => requestAnimationFrame(loop), 120);
  };
  loop();
  return stop;
}
