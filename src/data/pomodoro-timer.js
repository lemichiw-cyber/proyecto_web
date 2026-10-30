/* ===================================================================
   pomodoro-timer.js — Cálculo del temporizador Pomodoro (puro, sin DOM)
   Calcula el restante desde la hora de inicio (no setInterval acumulado).
   =================================================================== */
export function pomodoroRestante(durSeg, inicioMs) {
  const transcurrido = Math.max(0, Math.floor((Date.now() - inicioMs) / 1000));
  return Math.max(0, durSeg - transcurrido);
}
