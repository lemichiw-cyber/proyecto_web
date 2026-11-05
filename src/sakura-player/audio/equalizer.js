/* ===================================================================
   Sakura Player — Ecualizador de 10 bandas (Web Audio API nativa)
   
   Aplica ecualización real usando las propiedades estándar de
   BiquadFilterNode: frequency, Q y gain.
   
   - Banda 1 (60 Hz):  lowshelf
   - Bandas 2-9:       peaking (paramétrico)
   - Banda 10 (16 kHz): highshelf
   =================================================================== */

export const EQ_FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

export const EQ_LABELS = ['60', '170', '310', '600', '1K', '3K', '6K', '12K', '14K', '16K'];

export const EQ_PRESETS = {
  normal:      { name: 'Normal',      gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  rock:        { name: 'Rock',        gains: [5, 4, 2, -1, -2, 1, 3, 4, 5, 5] },
  pop:         { name: 'Pop',         gains: [-1, 1, 3, 5, 4, 2, 0, -1, 1, 2] },
  jazz:        { name: 'Jazz',        gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  electronica: { name: 'Electrónica', gains: [6, 5, 2, 0, -2, 2, 4, 5, 6, 6] },
  bassboost:   { name: 'Bass Boost',  gains: [8, 7, 6, 4, 2, 0, 0, 0, 0, 0] },
  vocal:       { name: 'Vocal',       gains: [-2, -3, -2, 0, 3, 5, 5, 4, 3, 2] },
  retro:       { name: 'Retro',       gains: [4, 3, 1, 0, -1, 0, 2, 3, 4, 4] },
  cyberpunk:   { name: 'Cyberpunk',   gains: [7, 5, 1, -2, 1, 3, 5, 6, 7, 7] },
  sakura:      { name: 'Sakura',      gains: [2, 3, 4, 3, 1, 0, 1, 2, 3, 3] },
  custom:      { name: 'Personalizado', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
};

/* ---------- Aplicar coeficientes al nodo Biquad ---------- */

export function applyEqCoefficients(player, gains) {
  if (!player || !player.nodes) return;

  const { nodes } = player;
  const bands = nodes.bands;

  if (!bands || bands.length !== 10) return;

  // Banda 1 (60 Hz): lowshelf
  setBiquadLowShelf(bands[0], EQ_FREQUENCIES[0], gains[0]);

  // Bandas 2-9 (170-14000 Hz): peaking
  for (let i = 1; i < 9; i++) {
    setBiquadPeaking(bands[i], EQ_FREQUENCIES[i], gains[i], 1.0);
  }

  // Banda 10 (16000 Hz): highshelf
  setBiquadHighShelf(bands[9], EQ_FREQUENCIES[9], gains[9]);
}

function setBiquadPeaking(node, frequency, gainDb, q) {
  node.type = 'peaking';
  node.frequency.value = frequency;
  node.Q.value = q;
  node.gain.value = gainDb;
}

function setBiquadLowShelf(node, frequency, gainDb) {
  node.type = 'lowshelf';
  node.frequency.value = frequency;
  node.Q.value = 1.0;
  node.gain.value = gainDb;
}

function setBiquadHighShelf(node, frequency, gainDb) {
  node.type = 'highshelf';
  node.frequency.value = frequency;
  node.Q.value = 1.0;
  node.gain.value = gainDb;
}

export function applyPreset(player, name) {
  const preset = EQ_PRESETS[name];
  if (!preset) return null;
  player.setEqGains(preset.gains);
  applyEqCoefficients(player, preset.gains);
  return preset.gains.slice();
}

export function readCurrentGains() {
  try {
    const raw = localStorage.getItem('sp_eq');
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length === 10 ? arr : EQ_PRESETS.normal.gains.slice();
  } catch (e) {
    return EQ_PRESETS.normal.gains.slice();
  }
}
