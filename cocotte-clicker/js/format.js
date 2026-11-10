// Formatage des nombres : abréviations K, M, B… au-delà de 1 000 000
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function fmt(n, decimals = 0) {
  if (!isFinite(n)) return '∞';
  if (Math.abs(n) < 1e6) {
    // En dessous d'un million : nombre complet, séparateurs français
    return decimals && n < 100
      ? n.toLocaleString('fr-FR', { maximumFractionDigits: decimals })
      : fr.format(Math.floor(n));
  }
  const tier = Math.min(Math.floor(Math.log10(Math.abs(n)) / 3), SUFFIXES.length - 1);
  const v = n / Math.pow(1000, tier);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: v < 100 ? 2 : 1 }) + ' ' + SUFFIXES[tier];
}

// Durée lisible (offline)
export function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return `${h} h ${m.toString().padStart(2, '0')}`;
  if (m) return `${m} min`;
  return `${Math.floor(sec)} s`;
}
