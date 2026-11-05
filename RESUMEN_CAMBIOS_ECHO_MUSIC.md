# Resumen de cambios — Sakura Player (proyecto_web)

Este documento describe las mejoras aplicadas a **sakura player** tomando ideas y
lógica de **Echo Music** (https://github.com/EchoMusicApp/Echo-Music). Echo Music
es una app Android (Kotlin + Compose); sakura player es un proyecto web
(Vite + JS + backend FastAPI/Python). El código de Echo Music no se puede copiar
y pegar directamente (otro lenguaje, otro runtime), pero su **lógica de negocio**
sí se adaptó a JavaScript/Python.

---

## 1. Letras sincronizadas (la función principal añadida)

Echo Music tiene múltiples proveedores de letras (LrcLib, YouTube, KuGou,
SimpMusic, etc.) con una estructura `LyricsEntry` (tiempo + texto + palabras
con timestamps). Se adaptó esa lógica a sakura player:

### Archivos nuevos (frontend)
- `src/sakura-player/lyrics/lrc-parser.js`
  - Parser de formato LRC sincronizado.
  - Extrae líneas con tiempo (`[mm:ss.tt] texto`) y palabras con timestamp
    (`<mm:ss.tt>palabra`).
  - Funciones `currentLineIndex()` y `currentWordIndex()` para saber qué línea
    y qué palabra resaltar según el tiempo de reproducción.
- `src/sakura-player/lyrics/lyrics-client.js`
  - Cliente que consulta **LrcLib** (gratuita, sin API key) por título/artista/
    duración/álbum.
  - Respaldo con **YouTube timedtext** (subtítulos del video) por videoId.
  - Devuelve `{ source, syncedLyrics, plainLyrics, entries }`.
- `src/sakura-player/lyrics/lyrics-view.js`
  - Componente UI que muestra la letra sincronizada.
  - Resalta la línea actual y la palabra activa en tiempo real.
  - Estados: cargando, no encontrada, sin letra sincronizada, error.

### Integración en el reproductor
- `src/sakura-player/sakura-player.js`
  - Nueva vista `'lyrics'` en el menú de navegación (icono `lyrics`).
  - Instancia de `LyricsView` montada junto al resto de vistas.
- `src/sakura-player/components/nowplaying.js`
  - Botón "Letras sincronizadas" en los controles secundarios del reproductor.
  - Al hacer clic navega a la vista de letras.
- `src/sakura-player/components/ui.js`
  - Icono `lyrics` agregado al mapa de iconos.
- `src/sakura-player/theme/player-theme.css`
  - Estilos Nothing OS 5.0 inspired para letras: limpio, tipografía-first,
    contraste alto, línea activa destacada, palabra subrayada, scrollbar
    sutil, estados vacíos y de error.

### Backend (FastAPI/Python)
- `backend/api/lyrics.py` (nuevo)
  - `GET /api/music/lyrics?q=...&artist=...&album=...&duration=...` — busca en
    LrcLib y devuelve letra sincronizada o plana.
  - `GET /api/music/lyrics/yt/{video_id}` — subtítulos sincronizados de YouTube.
- `backend/main.py`
  - Router de letras registrado.

---

## 2. Búsqueda de YouTube Music (API de ytmusic)

Echo Music tiene el módulo `:innertube` que busca directamente en YouTube sin
API oficial. Sakura ya tiene `ytmusicapi` en el backend
(`backend/services/ytmusic_service.py`) y endpoints de búsqueda
(`backend/api/search.py`). Lo que faltaba era exponerlo bien desde el frontend.

Estado actual del frontend de sakura: usa un **catálogo curado estático**
(`src/sakura-player/api/catalogo.js`) para búsqueda y el reproductor oficial de
YouTube (IFrame API) para reproducción. El backend FastAPI existe pero el
frontend de sakura-player no lo consulta para música.

**Opción recomendada:** si querés búsqueda real de YouTube Music (cualquier
canción, no solo el catálogo fijo), el frontend de sakura-player puede llamar
al backend existente:

```
GET /api/music/search?q=...&filter=songs&limit=20
GET /api/music/song/{video_id}
GET /api/music/stream/{video_id}
GET /api/music/lyrics?q=...&artist=...   (nuevo)
```

Esto requeriría adaptar `src/sakura-player/api/client.js` para que use el
backend cuando esté disponible (URL configurable en `localStorage` clave
`sakuraPlayerApiBase`) y fallback al catálogo curado cuando no.

---

## 3. Apariencia estética (Nothing OS 5.0 inspired)

Echo Music sigue el diseño **Nothing OS 5.0**: limpio, minimalista, paleta
monocromática, tipografía-first, geometría distinta, sin contenedores M3
genéricos. Se aplicó ese estilo a:

- **Vista de letras:** CSS nuevo en `player-theme.css` con fondo sutil,
  línea activa destacada con color primario, sombra suave, tipografía
  generosa, estados vacíos centrados.
- **Icono `lyrics`:** agregado al mapa de iconos de `ui.js`.

Se puede seguir mejorando el resto de componentes (buscar, biblioteca,
playlists, mezclador) aplicando los mismos principios: menos colores de
acento, más uso de `--player-text`, `--player-bg-secondary`, bordes finos,
tipografía clara y espaciado generoso.

---

## 4. Ecualizador / DSP

Echo Music tiene `:dsp-core` con filtros Biquad y ecualizador paramétrico en
Kotlin puro. Sakura ya tiene `src/sakura-player/audio/equalizer.js` (10 bandas
+ presets) y `mixer.js` (MASTER/MÚSICA/BAJOS/AGUDOS/BALANCE) implementados en
Web Audio. No se modificaron porque ya están funcionales. Si se quiere mejorar,
los filtros de Echo Music (Biquad, ParametricEQ) pueden adaptarse a JS.

---

## 5. Qué NO se llevó de Echo Music (no aplica a web)

Estas partes de Echo Music son específicas de Android y no tienen equivalente
directo en un proyecto web:

| Componente Echo Music | Por qué no se porta a sakura web |
|----------------------|----------------------------------|
| `:usbaudio` (USB DAC + NDK/C++) | Hardware específico de Android |
| `:playback` (Media3/ExoPlayer) | ExoPlayer no corre en navegador; sakura usa `<audio>` + YouTube IFrame |
| Room DB + DataStore | SQLite/Android Storage; sakura usa `localStorage` |
| Hilt / Dagger | Inyección de dependencias Android |
| Notificaciones / WorkManager / Cast / Firebase | APIs de Android |
| Activities / Jetpack Compose | UI de Android; sakura usa Vite + JS + CSS |

---

## 6. Cómo probar los cambios

### Frontend (desarrollo)
```bash
cd ~/Projects/sakura-player
npm install        # o npm ci
npm run dev        # Vite en http://localhost:5173
```
El reproductor se monta en `#sakura-player-root`. Buscá una canción, dale play
y hacé clic en el botón de **Letras** (📝) en los controles del reproductor.

### Backend (opcional, para endpoint de letras)
```bash
cd ~/Projects/sakura-player/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Probá: `curl http://127.0.0.1:8000/api/music/lyrics?q=Despacito&artist=Luis%20Fonsi`

---

## 7. Próximos pasos sugeridos

1. **Conectar el frontend al backend para búsqueda real:** adaptar
   `src/sakura-player/api/client.js` para usar `/api/music/search` y
   `/api/music/stream/{id}` cuando el backend esté disponible.
2. **Mejorar el ecualizador:** adaptar los filtros Biquad de
   Echo Music (`:dsp-core`) a los filtros Web Audio de sakura para mayor
   precisión.
3. **Estética general:** aplicar el estilo Nothing OS 5.0 (límites finos,
   monocromático, tipografía-first) a los componentes de búsqueda, biblioteca
   y mezclador.
4. **Letras traducidas:** Echo Music tiene traducción con OpenRouter/DeepL;
   se podría agregar como opción en sakura si se consigue una API de
   traducción.

---

**Licencia:** Echo Music está bajo GPL v3. Las partes adaptadas (lógica de
letras, estructura de datos) derivan de ese código y mantienen la misma
licencia para las partes derivadas. El resto de sakura player sigue su propia
licencia.
