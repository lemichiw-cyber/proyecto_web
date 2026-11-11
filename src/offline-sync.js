// P3: sync offline real con IndexedDB (sin dependencia). Cada acción es {path, body}.
const DB = "cherrybomb-offline";
const STORE = "q";
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { autoIncrement: true }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function _put(action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ ...action, queued_at: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
async function _all() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const rows = [];
    const req = db.transaction(STORE).objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { rows.push(cur.value); cur.continue(); } else resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}
async function _clear() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve(true);
  });
}
export async function enqueue(action) {
  try { await _put(action); } catch (e) {
    try {
      const q = JSON.parse(localStorage.getItem("cherrybombOfflineQueue") || "[]");
      q.push({ ...action, queued_at: Date.now() });
      localStorage.setItem("cherrybombOfflineQueue", JSON.stringify(q));
    } catch (_e) { /* noop */ }
  }
}
export async function flush(executor) {
  let rows = [];
  try { rows = await _all(); } catch (e) { rows = []; }
  if (!rows.length) return { ok: true, total: 0 };
  let ok = 0;
  for (const r of rows) { try { await executor(r); ok++; } catch (e) { break; } }
  if (ok >= rows.length) { try { await _clear(); localStorage.setItem("cherrybombOfflineQueue", "[]"); } catch (e) { /* noop */ } }
  return { ok: ok >= rows.length, total: rows.length };
}
export async function len() { try { return (await _all()).length; } catch (e) { return 0; } }
