/* ===================================================================
   Sakura Player — Mezclador (MASTER / MÚSICA / BAJOS / AGUDOS / BALANCE)
   =================================================================== */

export const MIXER_DEFAULTS = {
  master: 1.0,   // 0..1
  music: 1.0,    // 0..1
  bass: 0,       // -12..12 dB
  treble: 0,     // -12..12 dB
  balance: 0,    // -1..1
  masterMute: false,
  musicMute: false,
};

export function loadMixer() {
  try {
    const raw = localStorage.getItem('sp_mixer');
    const obj = raw ? JSON.parse(raw) : null;
    return Object.assign({}, MIXER_DEFAULTS, obj || {});
  } catch (e) {
    return { ...MIXER_DEFAULTS };
  }
}

export function saveMixer(state) {
  try { localStorage.setItem('sp_mixer', JSON.stringify(state)); } catch (e) { /* sin storage */ }
}

export function applyMixer(player, state) {
  player.setMixer({
    master: state.masterMute ? 0 : state.master,
    music: state.musicMute ? 0 : state.music,
    bass: state.bass,
    treble: state.treble,
    balance: state.balance,
  });
}

/* Niveles en vivo para los indicadores (0..1) */
export function readLevels(analyser) {
  if (!analyser) return { master: 0, music: 0 };
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const avg = sum / data.length / 255;
  return { master: Math.min(1, avg * 1.6), music: Math.min(1, avg * 1.6) };
}
