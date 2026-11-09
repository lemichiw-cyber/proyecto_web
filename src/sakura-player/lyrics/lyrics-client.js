/* ===================================================================
   Sakura Player — Cliente de letras sincronizadas
   
   Consulta APIs públicas y gratuitas para obtener letras sincronizadas
   (formato LRC) sin requerir autenticación ni API key.
   
   Proveedores usados:
     1. LrcLib (lrclib.net) — letras sincronizadas, gratuita, sin API key
     2. YouTube subtitles (timedtext) — respaldo para videos de YouTube
   
   Adaptado de la arquitectura de proveedores de letras de Echo Music.
   =================================================================== */

const LRC_LIB_SEARCH = 'https://lrclib.net/api/search';
const LRC_LIB_GET = 'https://lrclib.net/api/get';

export class LyricsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LyricsError';
    this.code = code; // not_found | api | network | cancelled
  }
}

/**
 * Normaliza una respuesta de LrcLib al formato interno de sakura player:
 *   { source, syncedLyrics: string|null, plainLyrics: string|null }
 */
function normalizeLrcLib(item) {
  const synced = item.syncedLyrics || null;
  const plain = item.plainLyrics || null;
  return {
    source: 'lrclib',
    trackName: item.trackName || '',
    artistName: item.artistName || '',
    albumName: item.albumName || '',
    syncedLyrics: synced,
    plainLyrics: plain,
  };
}

/**
 * Busca letras en LrcLib por título y artista.
 * Devuelve la mejor coincidencia o null.
 */
async function searchLrcLib(title, artist, duration, album, signal) {
  const params = new URLSearchParams();
  if (title) params.set('track_name', title);
  if (artist) params.set('artist_name', artist);
  if (album) params.set('album_name', album);
  if (duration && Number.isFinite(duration)) params.set('duration', Math.round(duration));

  const url = `${LRC_LIB_SEARCH}?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new LyricsError('api', `LrcLib respondió ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  // Tomar el primer resultado con letra sincronizada si existe, si no el primero
  const withSynced = data.find((d) => d.syncedLyrics);
  return normalizeLrcLib(withSynced || data[0]);
}

/**
 * Obtiene letra exacta por ID de LrcLib.
 */
async function _getLrcLibById(lrcId, signal) {
  const url = `${LRC_LIB_GET}?id=${encodeURIComponent(lrcId)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new LyricsError('api', `LrcLib respondió ${res.status}`);
  }
  const data = await res.json();
  return normalizeLrcLib(data);
}

/**
 * Intenta obtener subtítulos sincronizados de YouTube (timedtext API)
 * para un videoId dado. Sin API key, solo funciona si el video tiene
 * subtítulos generados automáticamente o subidos.
 */
async function searchYouTubeSubtitles(videoId, signal) {
  // Intentar lista de pistas de subtítulos
  const listUrl = `https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`;
  try {
    const listRes = await fetch(listUrl, { signal });
    if (!listRes.ok) return null;
    const listText = await listRes.text();
    // Buscar código de idioma disponible (preferir español o inglés)
    const langMatch = listText.match(/lang_code="([a-z]{2}(?:-[A-Z]{2})?)"/g);
    const langs = langMatch ? langMatch.map((m) => m.match(/lang_code="([^"]+)"/)[1]) : [];
    const preferred = langs.find((l) => l.startsWith('es') || l.startsWith('en')) || langs[0];
    if (!preferred) return null;

    const trackUrl = `https://video.google.com/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(preferred)}&fmt=json3`;
    const trackRes = await fetch(trackUrl, { signal });
    if (!trackRes.ok) return null;
    const trackData = await trackRes.json();
    const events = trackData.events || [];
    const lines = [];
    for (const ev of events) {
      if (!ev.segs) continue;
      const text = ev.segs.map((s) => s.utf8 || '').join('').trim();
      if (!text) continue;
      const tStart = (ev.tStartMs || 0) / 1000;
      const _tDur = (ev.tDurationMs || 0) / 1000;
      lines.push({ time: tStart, text, words: null });
    }
    if (lines.length === 0) return null;
    lines.sort((a, b) => a.time - b.time);
    return {
      source: 'youtube',
      trackName: '',
      artistName: '',
      albumName: '',
      syncedLyrics: lines.map((l) => `[${formatLrcTime(l.time)}] ${l.text}`).join('\n'),
      plainLyrics: lines.map((l) => l.text).join('\n'),
    };
  } catch (e) {
    // YouTube timedtext puede bloquear peticiones sin cookies; silenciamos y probamos el siguiente proveedor
    return null;
  }
}

/**
 * Formatea segundos a timestamp LRC [mm:ss.tt]
 */
function formatLrcTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Obtiene letras sincronizadas para una canción.
 *
 * @param {Object} track - { id (videoId), title, artist, album, duration }
 * @param {AbortSignal} [signal]
 * @returns {Promise<{source, syncedLyrics, plainLyrics, entries}>}
 *   entries: array parseado de LRC listo para usar con lrc-parser.js
 */
export async function fetchLyrics(track, signal) {
  if (!track || (!track.title && !track.id)) {
    throw new LyricsError('not_found', 'No hay suficiente información para buscar letras');
  }

  const title = track.title || '';
  const artist = track.artist || '';
  const album = track.album || null;
  const duration = track.duration || 0;
  const videoId = track.id; // para YouTube es el videoId

  let result = null;

  // 1) Probar LrcLib por título/artista
  try {
    result = await searchLrcLib(title, artist, duration, album, signal);
    if (result && result.syncedLyrics) {
      return { ...result, entries: parseLrc(result.syncedLyrics) };
    }
  } catch (e) {
    if (!(e instanceof LyricsError) || e.code !== 'not_found') throw e;
  }

  // 2) Si tenemos videoId de YouTube, probar subtítulos de YouTube
  if (videoId) {
    try {
      const yt = await searchYouTubeSubtitles(videoId, signal);
      if (yt && yt.syncedLyrics) {
        return { ...yt, entries: parseLrc(yt.syncedLyrics) };
      }
    } catch (e) {
      // Ignorar y continuar
    }
  }

  // 3) Si LrcLib devolvió algo sin letra sincronizada, devolver letra plana
  if (result && result.plainLyrics) {
    return { ...result, entries: [] };
  }

  throw new LyricsError('not_found', 'No se encontraron letras sincronizadas para esta canción');
}
