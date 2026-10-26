/* ===================================================================
   Sakura Player — Catálogo curado (sin backend)

   La tienda de YouTube Music ya no pasa por un servidor: la búsqueda
   se hace sobre esta lista fija de pistas y la reproducción usa el
   reproductor oficial de YouTube (IFrame API). Cada pista se identifica
   por su ID de video de YouTube, que el motor de iframe reproduce.

   - `buscar(q)` filtra por título/artista y además acepta pegar un
     enlace o ID suelto de YouTube (reproducir cualquier cosa).
   - Las miniaturas usan el CDN de i.ytimg.com con el ID del video
     (no requiere API key ni backend).

   Para añadir pistas: agregá un objeto a CATALOGO con id (ID de
   YouTube), título, artista, álbum y duración en segundos.
   =================================================================== */

/**
 * @typedef {Object} CatalogTrack
 * @property {string} id      ID de video de YouTube (11 caracteres)
 * @property {string} title
 * @property {string} artist
 * @property {string} [album]
 * @property {number} [duration]  duración estimada en segundos
 * @property {'yt'} source
 * @property {string} thumb   URL de la miniatura
 */

/** Miniatura del video desde el CDN público de YouTube. */
function thumbFor(id) {
  return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
}

/** Normaliza una entrada del catálogo a la forma que espera el player. */
function toTrack(c) {
  return {
    id: c.id,
    title: c.title,
    artist: c.artist,
    artists: [{ name: c.artist }],
    album: c.album || '',
    duration: c.duration || 0,
    durationText: '',
    thumb: c.thumb || thumbFor(c.id),
    source: 'yt',
  };
}

/* Catálogo curado. Los IDs fueron verificados contra el endpoint público
   de oEmbed de YouTube (devuelven metadatos válidos). */
const CATALOGO = [
  { id: 'kJQP7kiw5Fk', title: 'Despacito', artist: 'Luis Fonsi', album: 'Vida', duration: 282 },
  { id: '9bZkp7q19f0', title: 'Gangnam Style', artist: 'PSY', album: 'PSY 6 (Six Rules), Part 1', duration: 253 },
  { id: 'JGwWNGJdvx8', title: 'Shape of You', artist: 'Ed Sheeran', album: '÷ (Divide)', duration: 264 },
  { id: 'RgKAFK5djSk', title: 'See You Again', artist: 'Wiz Khalifa', album: 'Furious 7', duration: 237 },
  { id: 'OPf0YbXqDm0', title: 'Uptown Funk', artist: 'Mark Ronson', album: 'Uptown Special', duration: 270 },
  { id: 'CevxZvSJLk8', title: 'Roar', artist: 'Katy Perry', album: 'Prism', duration: 269 },
  { id: 'YQHsXMglC9A', title: 'Hello', artist: 'Adele', album: '25', duration: 367 },
  { id: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', duration: 355 },
  { id: '60ItHLz5WEA', title: 'Faded', artist: 'Alan Walker', album: 'Different World', duration: 212 },
  { id: 'lp-EO5I60KA', title: 'Thinking Out Loud', artist: 'Ed Sheeran', album: 'x (Multiply)', duration: 297 },
  { id: 'pRpeEdMmmQ0', title: 'Waka Waka', artist: 'Shakira', album: 'Sale el Sol', duration: 201 },
  { id: 'hT_nvWreIhg', title: 'Counting Stars', artist: 'OneRepublic', album: 'Native', duration: 288 },
  { id: 'ZbZSe6N_BXs', title: 'Happy', artist: 'Pharrell Williams', album: 'G I R L', duration: 233 },
  { id: 'ru0K8uYEZWw', title: "Can't Stop the Feeling!", artist: 'Justin Timberlake', album: 'Trolls', duration: 276 },
  { id: '2vjPBrBU-TM', title: 'Chandelier', artist: 'Sia', album: '1000 Forms of Fear', duration: 236 },
  { id: 'YykjpeuMNEk', title: 'Hymn For The Weekend', artist: 'Coldplay', album: 'A Head Full of Dreams', duration: 261 },
  { id: 'SlPhMPnQ58k', title: 'Memories', artist: 'Maroon 5', album: 'Jordi', duration: 189 },
  { id: '09R8_2nJtjg', title: 'Sugar', artist: 'Maroon 5', album: 'V', duration: 235 },
  { id: 'lY2yjAdbvdQ', title: 'Treat You Better', artist: 'Shawn Mendes', album: 'Illuminate', duration: 248 },
  { id: '0KSOMA3QBU0', title: 'Dark Horse', artist: 'Katy Perry', album: 'Prism', duration: 215 },
].map(toTrack);

/** Expresión regular para un ID de YouTube de 11 caracteres. */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extrae el ID de video de un enlace de YouTube o de un ID suelto.
 * Devuelve el ID o null si la entrada no parece un video.
 */
export function extraerVideoId(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  if (ID_RE.test(t)) return t;
  // Enlaces típicos: watch?v=, youtu.be/, /shorts/, /embed/
  const m =
    t.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    t.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    t.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Convierte un ID de YouTube suelto en una pista reproducible. */
export function trackDesdeId(id) {
  return toTrack({ id, title: 'Video de YouTube', artist: 'YouTube', duration: 0 });
}

/** Devuelve una pista del catálogo por su ID (o null). */
export function porId(id) {
  return CATALOGO.find((t) => t.id === id) || null;
}

/** Catálogo completo (copia defensiva). */
export function todos() {
  return CATALOGO.slice();
}

/**
 * Busca en el catálogo. `q` se compara contra título y artista
 * (sin distinción de mayúsculas). Si `q` es un enlace/ID de YouTube
 * válido, se agrega como primer resultado para poder reproducir
 * cualquier video pegando su enlace.
 *
 * @returns {{songs: CatalogTrack[], artists: Array, albums: Array, playlists: Array}}
 */
export function buscar(q) {
  const consulta = String(q || '').trim().toLowerCase();
  const songs = [];
  const seen = new Set();

  // 1) Un enlace/ID de YouTube pegado tiene prioridad.
  const id = extraerVideoId(q);
  if (id) {
    const t = porId(id) || trackDesdeId(id);
    songs.push(t);
    seen.add(t.id);
  }

  if (consulta) {
    for (const t of CATALOGO) {
      if (seen.has(t.id)) continue;
      const enTitulo = t.title.toLowerCase().includes(consulta);
      const enArtista = t.artist.toLowerCase().includes(consulta);
      if (enTitulo || enArtista) songs.push(t);
    }
  }

  // 2) Tarjetas de artista y álbum derivadas de los resultados de canciones.
  const artistas = [];
  const albumes = [];
  const seenArtist = new Set();
  const seenAlbum = new Set();
  for (const t of songs) {
    if (!seenArtist.has(t.artist)) {
      seenArtist.add(t.artist);
      artistas.push({ id: 'art:' + t.artist, name: t.artist, thumb: t.thumb, subscribers: '' });
    }
    if (t.album && !seenAlbum.has(t.album)) {
      seenAlbum.add(t.album);
      albumes.push({ id: 'alb:' + t.album, title: t.album, artist: t.artist, thumb: t.thumb });
    }
  }

  // 3) Las playlists siguen siendo locales: el catálogo no aporta ninguna.
  return { songs, artists: artistas, albums: albumes, playlists: [] };
}

/** Canciones de un artista (para la vista de detalle). */
export function porArtista(nombre) {
  return CATALOGO.filter((t) => t.artist === nombre);
}

/** Canciones de un álbum (para la vista de detalle). */
export function porAlbum(nombre) {
  return CATALOGO.filter((t) => t.album === nombre);
}
