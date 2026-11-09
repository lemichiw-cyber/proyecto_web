// P2: cola offline para tareas/notas (sin PII extra). JSON en localStorage, flush en online.
const KEY = "cherrybombOfflineQueue";
export function enqueue(action) {
  try {
    const q = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(q)) return;
    q.push({ ...action, queued_at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch (e) { /* noop */ }
}
export function len() {
  try { return (JSON.parse(localStorage.getItem(KEY) || "[]") || []).length; } catch (e) { return 0; }
}
export async function flush() {
  let q = [];
  try { q = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return 0; }
  if (!q.length) return 0;
  localStorage.setItem(KEY, "[]");
  return q.length; // el caller (api-client) re-ejecuta; aquí solo drena y cuenta
}
