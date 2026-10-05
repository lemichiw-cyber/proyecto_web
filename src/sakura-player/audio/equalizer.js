/* ===================================================================
   Sakura Player — Ecualizador de 10 bandas + presets
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

export function applyPreset(player, name) {
  const preset = EQ_PRESETS[name];
  if (!preset) return null;
  player.setEqGains(preset.gains);
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
