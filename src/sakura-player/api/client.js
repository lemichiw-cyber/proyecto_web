/* ===================================================================
   Sakura Player — Capa de datos (sin backend)

   Antes este módulo era un cliente HTTP contra un backend FastAPI que
   buscaba en YouTube Music y resolvía URLs de stream con yt-dlp. Ese
   servidor ya no existe, así que ahora:

   - `api.search()` filtra el catálogo curado incluido en el bundle;
   - la reproducción usa el reproductor oficial de YouTube (IFrame API)
     con el ID de video de cada pista, sin pasar por ningún servidor;
   - no hay red, ni caché, ni modo administrador, ni URL configurable.

   Se conservan `debounce`, `PlayerError` y `friendlyError` porque los
   usan los componentes de UI.
   =================================================================== */

import * as catalogo from './catalogo.js';

/* ------------------------------------------------------------------
   Error de aplicación con código estable (para no filtrar errores técnicos)
   ------------------------------------------------------------------ */
export class PlayerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlayerError';
    this.code = code; // not_found | api | playback | cancelled
  }
}

/* ------------------------------------------------------------------
   API del catálogo. Firma compatible con el viejo cliente HTTP para no
   reescribir los componentes: devuelve promesas.
   ------------------------------------------------------------------ */
export const api = {
  /* Búsqueda sobre el catálogo curado. `q` también puede ser un enlace
     o ID suelto de YouTube, que se agrega como primer resultado. */
  search: (q, _filter = 'all', _limit = 20, signal) => {
    if (signal && signal.aborted) {
      return Promise.reject(new PlayerError('cancelled', 'La búsqueda fue cancelada'));
    }
    try {
      return Promise.resolve(catalogo.buscar(q));
    } catch (e) {
      return Promise.reject(new PlayerError('api', 'No se pudo buscar en el catálogo'));
    }
  },

  /* Detalle de artista/album a partir del catálogo (para las vistas). */
  artist: (id) => {
    const nombre = String(id || '').replace(/^art:/, '');
    const canciones = catalogo.porArtista(nombre);
    if (!canciones.length) return Promise.reject(new PlayerError('not_found', 'Artista no encontrado'));
    return Promise.resolve({ name: nombre, thumb: canciones[0].thumb, songs: canciones });
  },

  album: (id) => {
    const nombre = String(id || '').replace(/^alb:/, '');
    const canciones = catalogo.porAlbum(nombre);
    if (!canciones.length) return Promise.reject(new PlayerError('not_found', 'Álbum no encontrado'));
    return Promise.resolve({ title: nombre, artist: canciones[0].artist, thumb: canciones[0].thumb, songs: canciones });
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
