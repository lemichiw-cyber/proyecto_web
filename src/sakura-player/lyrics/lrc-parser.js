/* ===================================================================
   Sakura Player — Parser de letras sincronizadas (formato LRC)
   Adaptado de la lógica de letras de Echo Music (LyricsEntry).
   
   Formato LRC:
     [00:12.34] Letra de la canción
     [00:15.67] Segunda línea
     
   Soporta también etiquetas con múltiples tiempos:
     [00:12.34][00:15.00] Letra que aparece en dos momentos
   
   Devuelve un array de { time, text, words } ordenado por tiempo.
   =================================================================== */

const _TAG_RE = /\[(\d{2}):(\d{2})\.(\d{2,3})\]([^\n]*)/g;
const TAG_SINGLE_RE = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

/**
 * Convierte una marca de tiempo LRC a segundos.
 * [01:23.456] -> 83.456
 */
function tagToSeconds(min, sec, cent) {
  const m = parseInt(min, 10) || 0;
  const s = parseInt(sec, 10) || 0;
  const c = parseInt(cent, 10) || 0;
  // cent puede ser 2 o 3 dígitos; normalizamos a milésimas
  const ms = cent.length === 3 ? c : c * 10;
  return m * 60 + s + ms / 1000;
}

/**
 * Parsea un string LRC y devuelve un array de entradas:
 *   { time: number (segundos), text: string, words: Array<{text, startTime, endTime}> | null }
 *
 * Si el LRC tiene etiquetas de palabra (<mm:ss.tt>dentro del texto),
 * se extraen los timestamps de palabra.
 */
export function parseLrc(lrc) {
  if (!lrc || typeof lrc !== 'string') return [];

  const lines = lrc.split(/\r?\n/);
  const entries = [];
  const seenTimes = new Map();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Ignorar encabezados de metadatos (id3v1 style): [ti:...], [ar:...], [al:...], etc.
    if (/^\[[a-z]{2}:/i.test(line)) continue;

    let match;
    const tags = [];
    let rest = line;

    // Extraer todas las etiquetas de tiempo al inicio: [00:12.34][00:15.00]
    while ((match = TAG_SINGLE_RE.exec(rest)) !== null) {
      const time = tagToSeconds(match[1], match[2], match[3]);
      const text = match[4];
      tags.push({ time, text });
      rest = rest.slice(match[0].length);
    }

    // Si no hay etiquetas válidas al inicio, saltar la línea
    if (tags.length === 0) continue;

    // Extraer etiquetas de palabra dentro del texto: <00:12.34>palabra<00:12.56>
    const wordRegex = /<(\d{2}):(\d{2})\.(\d{2,3})>([^<]*)/g;
    const words = [];
    let __textWithoutWords = tags[0].text;
    let wm;
    while ((wm = wordRegex.exec(tags[0].text)) !== null) {
      const wStart = tagToSeconds(wm[1], wm[2], wm[3]);
      const wText = wm[4];
      words.push({ text: wText, startTime: wStart });
    }
    if (words.length > 0) {
      // Quitar las etiquetas de palabra del texto visible
      _textWithoutWords = tags[0].text.replace(/<\d{2}:\d{2}\.\d{2,3}>/g, '').trim();
      // Asignar endTime a cada palabra (startTime de la siguiente, o time del tag + 0.3s)
      for (let i = 0; i < words.length; i++) {
        const next = words[i + 1];
        words[i].endTime = next ? next.startTime : tags[0].time + 0.3;
      }
    }

    for (const tag of tags) {
      if (seenTimes.has(tag.time)) continue;
      seenTimes.set(tag.time, true);
      entries.push({
        time: tag.time,
        text: tag.text,
        words: words.length > 0 ? words : null,
      });
    }
  }

  entries.sort((a, b) => a.time - b.time);
  return entries;
}

/**
 * Dado el tiempo actual de reproducción (segundos), devuelve el índice
 * de la entrada de letra que debe mostrarse (la última cuyo time <= currentTime).
 */
export function currentLineIndex(entries, currentTime) {
  if (!entries.length) return -1;
  let idx = -1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].time <= currentTime + 0.05) idx = i;
    else break;
  }
  return idx;
}

/**
 * Dado el tiempo actual, devuelve la palabra activa dentro de la línea actual
 * (si la línea tiene palabras con timestamps).
 */
export function currentWordIndex(entries, lineIndex, currentTime) {
  const entry = entries[lineIndex];
  if (!entry || !entry.words || !entry.words.length) return -1;
  let wi = -1;
  for (let i = 0; i < entry.words.length; i++) {
    if (entry.words[i].startTime <= currentTime + 0.05) wi = i;
    else break;
  }
  return wi;
}
