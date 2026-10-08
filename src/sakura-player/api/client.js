/* ===================================================================
   Sakura Player — Cliente HTTP del backend (FastAPI + ytmusicapi)
   - Fetch asíncrono, debounce, AbortController, caché con TTL
   - Normalización de errores (nunca se muestra técnica al usuario)
   =================================================================== */

// URL base del backend. Puede fijarse en el build con la variable de
// entorno VITE_API_URL (p. ej. el backend desplegado en Render) para que
// el sitio funcione desde cualquier dispositivo; sin ella se usa el
// backend de la propia máquina. Ajustes → Backend (localStorage) tiene
// prioridad sobre ambas.
const DEFAULT_BASE = import.meta.env.VITE_API_URL || 'https://sakura-backend-indb.onrender.com';
export { DEFAULT_BASE };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const LS_BASE_KEY = 'sakuraPlayerApiBase';

/* Base activa de la sesión. Si la URL guardada en Ajustes falla a nivel
   de red (DNS, host muerto, mixed content…), `request()` reintenta una
   vez contra la URL por defecto del sitio y fija esta variable para el
   resto de la sesión: así el reproductor sigue funcionando sin pisar
   silenciosamente la configuración del usuario (que puede ser intencional
   y volver cuando su backend responda). */
let forcedBase = null;

function baseInUse() {
  return forcedBase || getApiBase();
}

/* URL con la que se está hablando de verdad (por defecto la guardada). */
export function activeApiBase() {
  return baseInUse();
}

/* URL guardada en Ajustes → Backend, saneada:
   - quita espacios y barra final;
   - sin esquema → se lo añade (si no, el navegador lo toma como ruta
     relativa del sitio y "responde" el HTML del SPA);
   - http:// de un host no-local en una página https → https (mixed
     content lo bloquea y el error se disfraza de "backend apagado").
   Devuelve null si no hay nada utilizable. */
function sanitizeBase(raw) {
  if (raw === null || raw === undefined) return null;
  let v = String(raw).trim().replace(/\/+$/, '');
  if (!v) return null;
  const loopback = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i;
  if (!/^https?:\/\//i.test(v)) v = (loopback.test(v) ? 'http://' : 'https://') + v;
  let httpsPage = false;
  try { httpsPage = typeof location !== 'undefined' && location.protocol === 'https:'; } catch (e) { /* sin location */ }
  if (httpsPage && /^http:\/\//i.test(v)) {
    const host = v.slice(v.indexOf('://') + 3);
    if (!loopback.test(host)) v = 'https://' + host;
  }
  return v;
}

function sameBase(a, b) {
  const norm = (x) => String(x || '').trim().replace(/\/+$/, '');
  return norm(a) === norm(b);
}

export function getApiBase() {
  try { return sanitizeBase(localStorage.getItem(LS_BASE_KEY)) || DEFAULT_BASE; } catch (e) { return DEFAULT_BASE; }
}

export function setApiBase(url) {
  try { localStorage.setItem(LS_BASE_KEY, sanitizeBase(url) || DEFAULT_BASE); } catch (e) { /* sin storage */ }
  forcedBase = null; // el usuario eligió una URL nueva: le damos una chance
  clearCache();
}

/* ------------------------------------------------------------------
   Error de aplicación con código estable
   ------------------------------------------------------------------ */
export class PlayerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlayerError';
    this.code = code; // backend_offline | upstream | network | not_found | auth | api | playback
  }
}

/* ------------------------------------------------------------------
   Caché simple con TTL
   ------------------------------------------------------------------ */
const cache = new Map();

export function clearCache() { cache.clear(); }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL) { cache.delete(key); return null; }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { ts: Date.now(), value });
}

/* ------------------------------------------------------------------
   Petición base
   ------------------------------------------------------------------ */

/* `backend_offline` causado por la red: fetch rechazó de entrada (DNS,
   host inexistente, CORS, mixed content), se agotó el timeout o el
   proxy devolvió un 5xx sin cuerpo JSON. Son los casos en los que la URL
   guardada en Ajustes puede ser la culpable y conviene probar la
   por defecto del sitio. Un 5xx con detalle JSON en cambio significa que
   el backend contestó: el fallo es aguas arriba (YouTube Music) y se
   reporta con el código `upstream`. */
function isNetLevel(err) {
  return err instanceof PlayerError && err.code === 'backend_offline' && err.netLevel === true;
}

async function requestOnce(base, path, { method = 'GET', body, signal, timeout = 15000, retried = false, headers } = {}) {
  // Normaliza barra final: una base con "/" producía "//api/..." (404)
  const url = base.replace(/\/+$/, '') + path;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  // Si el llamador pasa su propio signal, lo respetamos
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  // Cabeceras propias (p. ej. Authorization del modo administrador)
  const reqHeaders = body ? { 'Content-Type': 'application/json', ...(headers || {}) } : (headers || undefined);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      // ¿Canceló el llamador (p. ej. se tipeó una búsqueda nueva)?
      if (signal && signal.aborted) throw new PlayerError('network', 'La solicitud fue cancelada');
      // Fue nuestro timeout: un backend en la nube recién "despertando"
      // (cold start del plan gratuito) tarda ~50 s. Los GET se reintantan
      // una vez con más tiempo antes de dar por perdido el backend.
      if (method === 'GET' && !retried) {
        return requestOnce(base, path, { method, body, signal, timeout: 60000, retried: true, headers });
      }
      const timeoutErr = new PlayerError('backend_offline', 'El backend tardó demasiado en responder');
      timeoutErr.netLevel = true;
      throw timeoutErr;
    }
    // Fetch rechazó de entrada (DNS, CORS, mixed content, host muerto):
    // la URL configurada es la sospechosa principal.
    const netErr = new PlayerError('backend_offline', 'El backend no está disponible');
    netErr.netLevel = true;
    throw netErr;
  }
  clearTimeout(timer);

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch (e) { /* respuesta vacía o no-JSON */ }

  // Si el caller abortó mientras se leía el cuerpo, res.ok sería true y se
  // devolvería null → el caller lo guardaba en caché (búsquedas "envenenadas")
  if (signal && signal.aborted) throw new PlayerError('network', 'La solicitud fue cancelada');

  if (!res.ok) {
    let detail = (data && data.detail) || 'Error de API';
    // FastAPI devuelve detail como lista en errores de validación
    if (Array.isArray(detail)) detail = detail.map((d) => (d && d.msg) || String(d)).join(' · ');
    if (res.status === 404) throw new PlayerError('not_found', detail);
    if (res.status === 401 || res.status === 403) throw new PlayerError('auth', detail);
    if (res.status === 400) throw new PlayerError('api', detail);
    if (res.status >= 500) {
      // ¿Contestó nuestro backend con detalle estructurado? Entonces está
      // vivo y el fallo es aguas arriba (YouTube Music), no "backend apagado".
      if (data && typeof data.detail === 'string' && data.detail) {
        throw new PlayerError('upstream', data.detail);
      }
      // 5xx sin cuerpo (proxy/edge de Render, cold start): red.
      const srvErr = new PlayerError('backend_offline', detail);
      srvErr.netLevel = true;
      throw srvErr;
    }
    throw new PlayerError('api', detail);
  }
  return data;
}

/* Ejecuta contra la base activa y, si esa base falla a nivel de red y
   no es la por defecto del sitio, reintenta una vez contra la por
   defecto (auto-sanado de una URL vieja o mal tipeada en Ajustes).
   Solo para GET: nunca se reenvía una petición con efectos. */
async function request(path, opts = {}) {
  const base = baseInUse();
  try {
    return await requestOnce(base, path, opts);
  } catch (err) {
    if (!isNetLevel(err) || sameBase(base, DEFAULT_BASE)) throw err;
    if ((opts.method || 'GET') !== 'GET') throw err;
    if (opts.signal && opts.signal.aborted) throw err;
    let data;
    try {
      data = await requestOnce(DEFAULT_BASE, path, opts);
    } catch (e2) {
      // Si también falla la por defecto, informamos el error original
      // (la URL configurada) salvo que el caller haya cancelado.
      if (e2 instanceof PlayerError && e2.code === 'network') throw e2;
      throw err;
    }
    forcedBase = DEFAULT_BASE;
    // Avisamos una sola vez por sesión: el usuario debe saber que su URL
    // configurada no respondía y que se está usando la del sitio.
    try {
      if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('sp:api-base-fallback', {
          detail: { from: base, to: DEFAULT_BASE },
        }));
      }
    } catch (e) { /* sin DOM (tests) */ }
    return data;
  }
}

/* ------------------------------------------------------------------
   Endpoints
   ------------------------------------------------------------------ */
export const api = {
  health: () => request('/api/health'),

  search: (q, filter = 'all', limit = 20, signal) => {
    const key = `search:${q}:${filter}:${limit}`;
    const hit = cacheGet(key);
    if (hit) return Promise.resolve(hit);
    return request(`/api/music/search?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}&limit=${limit}`, { signal })
      .then((r) => { if (r) cacheSet(key, r); return r; });
  },

  song: (id) => request(`/api/music/song/${encodeURIComponent(id)}`),

  streamUrl: (id) => `${baseInUse().replace(/\/+$/, '')}/api/music/stream/${encodeURIComponent(id)}`,

  artist: (id) => request(`/api/music/artist/${encodeURIComponent(id)}`),

  album: (id) => request(`/api/music/album/${encodeURIComponent(id)}`),

  playlist: (id) => request(`/api/music/playlist/${encodeURIComponent(id)}`),

  library: (limit = 50) => request(`/api/music/library?limit=${limit}`),

  history: (limit = 50) => request(`/api/music/history?limit=${limit}`),

  recommendations: (limit = 20) => request(`/api/music/recommendations?limit=${limit}`),

  watchPlaylist: (id, limit = 25) => request(`/api/music/watch-playlist/${encodeURIComponent(id)}?limit=${limit}`),

  createPlaylist: (title, description = '', privacy = 'PRIVATE') =>
    request('/api/music/playlists', { method: 'POST', body: { title, description, privacy } }),

  updatePlaylist: (id, updates) =>
    request(`/api/music/playlists/${encodeURIComponent(id)}`, { method: 'PUT', body: updates }),

  deletePlaylist: (id) =>
    request(`/api/music/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addTracks: (id, videoIds) =>
    request(`/api/music/playlists/${encodeURIComponent(id)}/tracks`, { method: 'POST', body: { videoIds } }),

  removeTracks: (id, videoIds) =>
    request(`/api/music/playlists/${encodeURIComponent(id)}/tracks`, { method: 'DELETE', body: { videoIds } }),

  moveTrack: (id, videoId, toIndex) =>
    request(`/api/music/playlists/${encodeURIComponent(id)}/tracks/move`, { method: 'PUT', body: { videoId, toIndex } }),

  /* ---------------- modo administrador ---------------- */
  adminLogin: (email, password) =>
    request('/api/admin/login', { method: 'POST', body: { email, password }, timeout: 30000 }),

  adminMe: (token) => request('/api/admin/me', { headers: { Authorization: `Bearer ${token}` } }),

  adminStats: (token) => request('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
};

/* ------------------------------------------------------------------
   Debounce para la búsqueda en vivo
   ------------------------------------------------------------------ */
export function debounce(fn, wait = 350) {
  let t = null;
  let lastArgs = null;
  const debounced = function (...args) {
    lastArgs = args;
    clearTimeout(t);
    t = setTimeout(() => { lastArgs = null; fn.apply(this, args); }, wait);
  };
  // flush corre ya (Enter en la búsqueda); cancel descarta (vista destruida)
  debounced.flush = function () {
    if (t !== null) {
      clearTimeout(t);
      t = null;
      const a = lastArgs;
      lastArgs = null;
      if (a) fn.apply(this, a);
    }
  };
  debounced.cancel = function () {
    clearTimeout(t);
    t = null;
    lastArgs = null;
  };
  return debounced;
}

/* ------------------------------------------------------------------
   Mensajes de error amigables (sección 19)
   ------------------------------------------------------------------ */
/* ¿La página está servida desde un host que no es local? */
function servedRemotely() {
  try {
    return typeof location !== 'undefined' && !!location.hostname &&
      !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
  } catch (e) { return false; }
}

/* ¿La API activa apunta a la propia máquina del navegador? */
function apiPointsLocal() {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/.test(baseInUse());
}

export function friendlyError(err) {
  if (err instanceof PlayerError) {
    switch (err.code) {
      case 'backend_offline':
        // Sitio desplegado (Render/GitHub Pages) apuntando a 127.0.0.1:
        // en este dispositivo no existe ese backend (caso típico: celular).
        return (servedRemotely() && apiPointsLocal())
          ? 'Este sitio apunta a 127.0.0.1, que en este dispositivo no existe: configurá el backend en Ajustes → Backend'
          : 'Backend apagado o sin conexión';
      case 'upstream':
        // El backend contestó: falló YouTube Music (aguas arriba).
        return err.message || 'YouTube Music no está disponible ahora mismo';
      case 'network': return 'Sin conexión con el servidor';
      case 'not_found': return 'No se encontró el contenido';
      case 'auth': return 'Sesión de YouTube Music no disponible';
      case 'playback': return 'Error de reproducción';
      default: return err.message || 'Error de API';
    }
  }
  return 'Error inesperado';
}
