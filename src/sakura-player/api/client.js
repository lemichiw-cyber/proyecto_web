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
const DEFAULT_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const LS_BASE_KEY = 'sakuraPlayerApiBase';

export function getApiBase() {
  try { return localStorage.getItem(LS_BASE_KEY) || DEFAULT_BASE; } catch (e) { return DEFAULT_BASE; }
}

export function setApiBase(url) {
  try { localStorage.setItem(LS_BASE_KEY, url || DEFAULT_BASE); } catch (e) { /* sin storage */ }
  clearCache();
}

/* ------------------------------------------------------------------
   Error de aplicación con código estable
   ------------------------------------------------------------------ */
export class PlayerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlayerError';
    this.code = code; // backend_offline | network | not_found | auth | api | playback
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
async function request(path, { method = 'GET', body, signal, timeout = 15000, retried = false } = {}) {
  const url = getApiBase() + path;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  // Si el llamador pasa su propio signal, lo respetamos
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
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
        return request(path, { method, body, signal, timeout: 60000, retried: true });
      }
      throw new PlayerError('backend_offline', 'El backend tardó demasiado en responder');
    }
    throw new PlayerError('backend_offline', 'El backend no está disponible');
  }
  clearTimeout(timer);

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch (e) { /* respuesta vacía o no-JSON */ }

  if (!res.ok) {
    const detail = (data && data.detail) || 'Error de API';
    if (res.status === 404) throw new PlayerError('not_found', detail);
    if (res.status === 401) throw new PlayerError('auth', detail);
    if (res.status === 400) throw new PlayerError('api', detail);
    if (res.status >= 500) throw new PlayerError('backend_offline', detail);
    throw new PlayerError('api', detail);
  }
  return data;
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
    return request(`/api/music/search?q=${encodeURIComponent(q)}&filter=${filter}&limit=${limit}`, { signal })
      .then((r) => { cacheSet(key, r); return r; });
  },

  song: (id) => request(`/api/music/song/${encodeURIComponent(id)}`),

  streamUrl: (id) => `${getApiBase()}/api/music/stream/${encodeURIComponent(id)}`,

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
};

/* ------------------------------------------------------------------
   Debounce para la búsqueda en vivo
   ------------------------------------------------------------------ */
export function debounce(fn, wait = 350) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
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

/* ¿La API apunta a la propia máquina del navegador? */
function apiPointsLocal() {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/.test(getApiBase());
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
      case 'network': return 'Sin conexión con el servidor';
      case 'not_found': return 'No se encontró el contenido';
      case 'auth': return 'Sesión de YouTube Music no disponible';
      case 'playback': return 'Error de reproducción';
      default: return err.message || 'Error de API';
    }
  }
  return 'Error inesperado';
}
