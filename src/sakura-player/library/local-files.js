/* ===================================================================
   Sakura Player — Archivos de música locales
   MP3 / WAV / FLAC / OGG / M4A — metadatos, portada y duración.
   =================================================================== */

const ACCEPTED = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
const EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'];

export function isAudioFile(file) {
  if (ACCEPTED.includes(file.type)) return true;
  const name = (file.name || '').toLowerCase();
  return EXTS.some((ext) => name.endsWith(ext));
}

/* ------------------------------------------------------------------
   Duración mediante un <audio> temporal
   ------------------------------------------------------------------ */
export function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    // Sin timeout, un archivo ilegible dejaba la promesa colgada y la
    // subida se quedaba en "Leyendo metadatos..." para siempre
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(0);
    }, 15000);
    audio.onloadedmetadata = () => {
      const d = isFinite(audio.duration) ? audio.duration : 0;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(d);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
}

/* ------------------------------------------------------------------
   Metadatos ID3v2 (MP3) — TIT2/TPE1/APIC
   ------------------------------------------------------------------ */
function readId3(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseId3(new Uint8Array(reader.result)));
      } catch (e) {
        resolve({});
      }
    };
    reader.onerror = () => resolve({});
    reader.readAsArrayBuffer(file.slice(0, 4 * 1024 * 1024)); // primeros 4 MB bastan
  });
}

function parseId3(buf) {
  const out = { title: '', artist: '', cover: '' };
  if (buf.length < 10 || String.fromCharCode(buf[0], buf[1], buf[2]) !== 'ID3') return out;
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  const end = Math.min(10 + size, buf.length);
  let off = 10;
  while (off + 10 <= end) {
    const id = String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const frameSize = (buf[off + 4] << 24) | (buf[off + 5] << 16) | (buf[off + 6] << 8) | buf[off + 7];
    if (frameSize <= 0 || off + 10 + frameSize > end) break;
    const dataStart = off + 10;
    if (id === 'TIT2' || id === 'TPE1') {
      const encoding = buf[dataStart];
      const text = decodeText(buf.subarray(dataStart + 1, dataStart + frameSize), encoding);
      if (id === 'TIT2' && !out.title) out.title = text;
      if (id === 'TPE1' && !out.artist) out.artist = text;
    } else if (id === 'APIC') {
      const encoding = buf[dataStart];
      let p = dataStart + 1;
      // mime terminado en 0
      let mime = '';
      while (p < buf.length && buf[p] !== 0) { mime += String.fromCharCode(buf[p]); p++; }
      p++;
      if (p < buf.length) p++; // tipo de imagen
      // descripción terminada en 0 (o 00 00 en UTF-16)
      if (encoding === 1 || encoding === 2) {
        while (p + 1 < buf.length && !(buf[p] === 0 && buf[p + 1] === 0)) p++;
        p += 2;
      } else {
        while (p < buf.length && buf[p] !== 0) p++;
        p++;
      }
      if (p < dataStart + frameSize) {
        const bytes = buf.subarray(p, dataStart + frameSize);
        const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
        out.cover = URL.createObjectURL(blob);
      }
    }
    off = dataStart + frameSize;
  }
  return out;
}

function decodeText(bytes, encoding) {
  try {
    if (encoding === 1 || encoding === 2) {
      // UTF-16: TextDecoder ya omite el BOM al inicio. La versión anterior
      // desplazaba los bytes con un 0x00 adelante y decodificaba todo corrido.
      if (!bytes.length) return '';
      const isBE = bytes.length > 1 && bytes[0] === 0xfe && bytes[1] === 0xff;
      return new TextDecoder(isBE ? 'utf-16be' : 'utf-16le').decode(bytes).replace(/^\uFEFF/, '');
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    return new TextDecoder('latin1').decode(bytes);
  }
}

/* ------------------------------------------------------------------
   Portada para M4A/MP4 (átomo covr)
   ------------------------------------------------------------------ */
function readMp4Cover(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseMp4Cover(new Uint8Array(reader.result)));
      } catch (e) {
        resolve('');
      }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(file);
  });
}

function parseMp4Cover(buf) {
  // Busca el átomo 'covr' en los primeros 256 KB
  const limit = Math.min(buf.length, 256 * 1024);
  for (let i = 0; i + 8 < limit; i++) {
    const size = (buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3];
    const type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
    if (type === 'covr' && size > 16 && i + size <= buf.length) {
      // covr: 4 version/flags + 4 data reference + datos de imagen
      const start = i + 16;
      const bytes = buf.subarray(start, i + size);
      if (bytes.length > 8) {
        return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
      }
    }
    if (size <= 0) break;
    i += size - 1;
  }
  return '';
}

/* ------------------------------------------------------------------
   API pública
   ------------------------------------------------------------------ */
export async function processLocalFile(file) {
  const isM4a = (file.name || '').toLowerCase().endsWith('.m4a') || file.type === 'audio/mp4';
  const [duration, meta, mp4Cover] = await Promise.all([
    readDuration(file),
    isM4a ? Promise.resolve({}) : readId3(file),
    isM4a ? readMp4Cover(file) : Promise.resolve(''),
  ]);
  const name = (file.name || 'Sin título').replace(/\.[^.]+$/, '');
  const track = {
    id: 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    title: meta.title || name,
    artist: meta.artist || 'Artista desconocido',
    artists: meta.artist ? [{ name: meta.artist }] : [],
    album: '',
    duration: Math.round(duration),
    durationText: formatTime(duration),
    thumb: meta.cover || mp4Cover || '',
    source: 'local',
    fileName: file.name,
  };
  return track;
}

export async function processLocalFiles(files) {
  const audioFiles = Array.from(files || []).filter(isAudioFile);
  const tracks = [];
  for (const f of audioFiles) {
    try {
      const track = await processLocalFile(f);
      const url = URL.createObjectURL(f);
      track.url = url;
      tracks.push(track);
    } catch (e) {
      // archivo corrupto: se ignora
    }
  }
  return tracks;
}

export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}
