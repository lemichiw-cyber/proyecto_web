/* ===================================================================
   Sakura Player — Capa de datos (backend FastAPI + catálogo local)
   
   Modos de operación:
     1. Con backend: la búsqueda y los detalles salen de
        http://<SAKURA_API_BASE>/api/music/* (FastAPI + ytmusicapi).
        La URL se guarda en localStorage clave `sakuraPlayerApiBase`
        (por defecto http://127.0.0.1:8000).
     2. Sin backend: se usa el catálogo curado incluido en el bundle
        (catalogo.js) y la reproducción usa el reproductor oficial de
        YouTube (IFrame API).
   
   La detección es automática: si el backend responde, se usa; si no,
   se cae al catálogo local sin mostrar errores técnicos al usuario.
   =================================================================== */

import * as catalogo from './catalogo.js';

const DEFAULT_API_BASE = 'http://127.0.0.1:8000';
const LS_API_BASE = 'sakuraPlayerApiBase';

/* ------------------------------------------------------------------
   Configuración de la URL del backend
   ------------------------------------------------------------------ */
export function getApiBase() {
  try {
    const saved = localStorage.getItem(LS_API_BASE);
    return (saved && saved.trim()) ? saved.replace(/\/+$/, '') : DEFAULT_API_BASE;
  } catch (e) {
    return DEFAULT_API_BASE;
  }
}

export function setApiBase(url) {
  try {
    const clean = String(url || '').replace(/\/+$/, '');
    localStorage.setItem(LS_API_BASE, clean || DEFAULT_API_BASE);
  } catch (e) { /* sin storage */ }
}

/* ------------------------------------------------------------------
   Petición HTTP con timeout y detección de backend disponible
   ------------------------------------------------------------------ */
const BACKEND_PING_CACHE = { ok: null, ts: 0 };

async function _backendDisponible(timeout = 1500) {
  const ahora = Date.now();
  if (BACKEND_PING_CACHE.ok !== null && ahora - BACKEND_PING_CACHE.ts < 10000) {
    return BACKEND_PING_CACHE.ok;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const r = await fetch(getApiBase() + '/api/health', {
      method: 'GET',
      signal: ctrl.signal,
      credentials: 'include',
    });
    clearTimeout(t);
    BACKEND_PING_CACHE.ok = r.ok;
    BACKEND_PING_CACHE.ts = ahora;
    return r.ok;
  } catch (e) {
    BACKEND_PING_CACHE.ok = false;
    BACKEND_PING_CACHE.ts = ahora;
    return false;
  }
}

/* ------------------------------------------------------------------
   Error de aplicación con código estable
   ------------------------------------------------------------------ */
export class PlayerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlayerError';
    this.code = code; // not_found | api | playback | cancelled
  }
}

/* ------------------------------------------------------------------
   Normalización de respuestas del backend al formato del frontend
   ------------------------------------------------------------------ */

function _normalizeTrackFromBackend(item) {
  return {
    id: item.videoId || item.id || '',
    title: item.title || item.name || 'Sin título',
    artist: item.artist || '',
    artists: Array.isArray(item.artists) ? item.artists : [{ name: item.artist || '' }],
    album: item.album || '',
    albumId: item.albumId || null,
    duration: item.duration || 0,
    durationText: item.durationText || '',
    thumb: item.thumb || (item.videoId ? 'https://i.ytimg.com/vi/' + item.videoId + '/hqdefault.jpg' : ''),
    source: item.source || 'yt',
  };
}

function _normalizeArtistFromBackend(item) {
  return {
    id: item.id || '',
    name: item.name || 'Desconocido',
    thumb: item.thumb || '',
    subscribers: item.subscribers || '',
    source: item.source || 'yt',
  };
}

function _normalizeAlbumFromBackend(item) {
  return {
    id: item.id || '',
    title: item.title || 'Sin título',
    artist: item.artist || '',
    thumb: item.thumb || '',
    year: item.year || '',
    source: item.source || 'yt',
  };
}

/* ------------------------------------------------------------------
   Cliente de API con backend + fallback local
   ------------------------------------------------------------------ */
export const api = {
  /* Indica si el backend está disponible en este momento. */
  async backendDisponible() {
    return await _backendDisponible();
  },

  /* Búsqueda unificada. Intenta el backend primero; si no está
     disponible, usa el catálogo curado local. */
  search: async (q, _filter = 'all', _limit = 20, signal) => {
    if (signal && signal.aborted) {
      return Promise.reject(new PlayerError('cancelled', 'La búsqueda fue cancelada'));
    }

    // 1) Intentar backend
    try {
      const disponible = await _backendDisponible();
      if (disponible) {
        const params = new URLSearchParams({ q: String(q), filter: _filter, limit: String(_limit) });
        const url = getApiBase() + '/api/music/search?' + params.toString();
        console.log('[sakura] Llamando backend:', url);
        const r = await fetch(url, {
          method: 'GET',
          signal,
          credentials: 'include',
        });
        if (!r.ok) throw new Error('Backend respondió ' + r.status);
        const data = await r.json();
        console.log('[sakura] Respuesta backend:', data);
        const songs = (data.songs || []).map(_normalizeTrackFromBackend);
        const artists = (data.artists || []).map(_normalizeArtistFromBackend);
        const albums = (data.albums || []).map(_normalizeAlbumFromBackend);
        const playlists = (data.playlists || []).map((p) => ({
          id: p.id || '',
          title: p.title || 'Sin título',
          artist: p.author || '',
          count: p.count || 0,
          thumb: p.thumb || '',
          source: p.source || 'yt',
        }));
        return { songs, artists, albums, playlists };
      }
    } catch (e) {
      console.warn('[sakura] Backend no disponible para búsqueda:', e.message);
    }

    // 2) Fallback: catálogo curado local (siempre disponible)
    try {
      return catalogo.buscar(String(q));
    } catch (e) {
      return Promise.reject(new PlayerError('api', 'No se pudo buscar. Verificá la conexión al backend o intentá de nuevo.'));
    }
  },

  /* Detalle de una canción por videoId. */
  song: async (videoId, signal) => {
    if (signal && signal.aborted) {
      return Promise.reject(new PlayerError('cancelled', 'Cancelado'));
    }
    try {
      if (await _backendDisponible()) {
        const r = await fetch(getApiBase() + '/api/music/song/' + encodeURIComponent(videoId), {
          method: 'GET',
          signal,
          credentials: 'include',
        });
        if (!r.ok) throw new Error('Canción no encontrada');
        const data = await r.json();
        return _normalizeTrackFromBackend(data);
      }
    } catch (e) {
      console.warn('[sakura] Backend no disponible para canción:', e.message);
    }
    // Fallback local
    const t = catalogo.porId(videoId);
    if (t) return t;
    return Promise.reject(new PlayerError('not_found', 'Canción no encontrada'));
  },

  /* Detalle de artista. */
  artist: async (id, signal) => {
    if (signal && signal.aborted) {
      return Promise.reject(new PlayerError('cancelled', 'Cancelado'));
    }
    const nombre = String(id || '').replace(/^art:/, '');
    try {
      if (await _backendDisponible()) {
        const r = await fetch(getApiBase() + '/api/music/artist/' + encodeURIComponent(nombre), {
          method: 'GET',
          signal,
          credentials: 'include',
        });
        if (!r.ok) throw new Error('Artista no encontrado');
        const data = await r.json();
        const songs = (data.songs || []).map(_normalizeTrackFromBackend);
        return {
          id: 'art:' + nombre,
          name: nombre,
          thumb: data.thumb || '',
          subscribers: data.subscribers || '',
          songs,
        };
      }
    } catch (e) {
      console.warn('[sakura] Backend no disponible para artista:', e.message);
    }
    // Fallback local
    const canciones = catalogo.porArtista(nombre);
    if (!canciones.length) {
      return Promise.reject(new PlayerError('not_found', 'Artista no encontrado'));
    }
    return {
      id: 'art:' + nombre,
      name: nombre,
      thumb: canciones[0].thumb,
      subscribers: '',
      songs: canciones,
    };
  },

  /* Detalle de álbum. */
  album: async (id, signal) => {
    if (signal && signal.aborted) {
      return Promise.reject(new PlayerError('cancelled', 'Cancelado'));
    }
    const nombre = String(id || '').replace(/^alb:/, '');
    try {
      if (await _backendDisponible()) {
        const r = await fetch(getApiBase() + '/api/music/album/' + encodeURIComponent(nombre), {
          method: 'GET',
          signal,
          credentials: 'include',
        });
        if (!r.ok) throw new Error('Álbum no encontrado');
        const data = await r.json();
        const songs = (data.songs || []).map(_normalizeTrackFromBackend);
        return {
          id: 'alb:' + nombre,
          title: nombre,
          artist: data.artist || '',
          thumb: data.thumb || '',
          year: data.year || '',
          songs,
        };
      }
    } catch (e) {
      console.warn('[sakura] Backend no disponible para álbum:', e.message);
    }
    // Fallback local
    const canciones = catalogo.porAlbum(nombre);
    if (!canciones.length) {
      return Promise.reject(new PlayerError('not_found', 'Álbum no encontrado'));
    }
    return {
      id: 'alb:' + nombre,
      title: nombre,
      artist: canciones[0].artist,
      thumb: canciones[0].thumb,
      songs: canciones,
    };
  },

  /* URL de stream de una canción (para reproducir). */
  streamUrl: async (videoId, signal) => {
    if (signal && signal.aborted) {
      return Promise.reject(new PlayerError('cancelled', 'Cancelado'));
    }
    try {
      if (await _backendDisponible()) {
        const r = await fetch(getApiBase() + '/api/music/stream/' + encodeURIComponent(videoId), {
          method: 'GET',
          signal,
          credentials: 'include',
        });
        if (!r.ok) throw new Error('Stream no disponible');
        const data = await r.json();
        return data.url || null;
      }
    } catch (e) {
      console.warn('[sakura] Backend no disponible para stream:', e.message);
    }
    return null;
  },

  /* Letras sincronizadas (nuevo endpoint del backend).
   * Soporta word-level de Lyrica (karaoke) cuando el proveedor es 'lyrica'.
   */
  lyrics: async (track, signal) => {
    if (signal && signal.aborted) {
      return Promise.reject(new PlayerError('cancelled', 'Cancelado'));
    }
    const params = new URLSearchParams();
    if (track.title) params.set('q', track.title);
    if (track.artist) params.set('artist', track.artist);
    if (track.album) params.set('album', track.album);
    if (track.duration && Number.isFinite(track.duration)) params.set('duration', Math.round(track.duration));
    try {
      if (await _backendDisponible()) {
        const r = await fetch(getApiBase() + '/api/music/lyrics?' + params.toString(), {
          method: 'GET',
          signal,
          credentials: 'include',
        });
        if (!r.ok) throw new Error('Letras no encontradas en backend');
        const data = await r.json();
        const l = data.lyrics || {};
        // Extraer palabras con timestamps si Lyrica las devolvió
        const words = l.words || null;
        return {
          source: l.source || 'lrclib',
          sync_level: l.sync_level || 'line',
          syncedLyrics: l.syncedLyrics || null,
          plainLyrics: l.plainLyrics || null,
          entries: [],
          words: words, // array de {id, text, start, end, words:[{word,start,end}]}
        };
      }
    } catch (e) {
      console.warn('[sakura] Backend no disponible para letras:', e.message);
    }
    return Promise.reject(new PlayerError('not_found', 'No se encontraron letras'));
  },

  /* Traducir letra (requiere NVIDIA_API_KEY en backend). */
  translateLyrics: async (text, targetLang = 'es', signal) => {
    if (signal && signal.aborted) {
      return Promise.reject(new PlayerError('cancelled', 'Cancelado'));
    }
    try {
      if (await _backendDisponible()) {
        const r = await fetch(getApiBase() + '/api/music/lyrics/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          credentials: 'include',
          body: JSON.stringify({ text, target_lang: targetLang }),
        });
        if (!r.ok) throw new Error('Traducción no disponible');
        const data = await r.json();
        return data.translated || '';
      }
    } catch (e) {
      console.warn('[sakura] Backend no disponible para traducción:', e.message);
    }
    return Promise.reject(new PlayerError('api', 'Servicio de traducción no configurado'));
  },
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
   Mensajes de error amigables
   ------------------------------------------------------------------ */
export function friendlyError(err) {
  if (err instanceof PlayerError) {
    switch (err.code) {
      case 'not_found': return 'No se encontró el contenido';
      case 'playback': return 'Error de reproducción';
      case 'cancelled': return 'La búsqueda fue cancelada';
      case 'api': return err.message || 'No se pudo completar la búsqueda';
      default: return err.message || 'Error inesperado';
    }
  }
  return 'Error inesperado';
}
