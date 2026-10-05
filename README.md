# Cherry-Bomb

Plataforma educativa institucional. App web estática (SPA) con Pomodoro,
notificaciones, persistencia en `localStorage` y soporte offline vía PWA.

13 temas: `sakura`, `chicawa`, `mlp`, `pastel`, `dark`, `dawn`, `light`,
`ocean`, `paraiso`, `sunset`, `frutiger`, `dreamcore`, `sakura-player`.

`sakura`, `frutiger`, `dreamcore`, `paraiso` y `mlp` además reproducen música
de fondo en segundo plano (pistas en `public/audio/`, control de volumen en el
header).

## 🌸 Sakura Player

Reproductor de música integrado: **YouTube Music** (vía backend Python) +
**archivos locales**, con ecualizador de 10 bandas, mezclador, visualizador,
vista Reproductor (portada, progreso, shuffle, repeat, favoritos, cola),
cola, playlists y mini reproductor.

```
src/sakura-player/
  sakura-player.js         controlador principal
  api/client.js            cliente HTTP (debounce, AbortController, caché)
  player/player.js         motor de audio (cola, shuffle, repeat, seek, favoritos)
  player/visualizer.js     visualizador de audio adaptativo al tema
  audio/equalizer.js       10 bandas + presets
  audio/mixer.js           MASTER / MÚSICA / BAJOS / AGUDOS / BALANCE
  library/library.js       biblioteca (canciones, artistas, álbumes, favoritos…)
  library/local-files.js   MP3/WAV/FLAC/OGG/M4A + metadatos + portada
  components/              búsqueda, biblioteca, playlists, cola, mezclador,
                           vista Reproductor, mini reproductor, upload,
                           utilidades de UI
  theme/                   tokens de tema + gestor (auto/manual)
backend/
  main.py                  FastAPI + CORS + health
  api/                     search, songs, artists, albums, playlists, library
  services/ytmusic_service.py   capa de abstracción sobre ytmusicapi
```

### Arranque del backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload        # → http://127.0.0.1:8000
```

Documentación interactiva: `http://127.0.0.1:8000/docs`.

### Autenticación de YouTube Music

Sin credenciales, el backend funciona en **modo invitado** (búsqueda, artistas,
álbumes, playlists públicas y streaming). Para biblioteca, historial y gestión
de playlists propias, generá un archivo de sesión **fuera del repo**:

```bash
python -c "from ytmusicapi import YTMusic; YTMusic().setup()"
# → crea auth.json (está en backend/.gitignore)
```

Copiá `backend/.env.example` a `backend/.env` y ajustá:

| Variable | Para qué |
|---|---|
| `SAKURA_HOST` / `SAKURA_PORT` | Escucha del backend |
| `SAKURA_CORS_ORIGINS` | Orígenes permitidos (default: `http://localhost:5173`) |
| `YTMUSIC_AUTH_FILE` | Ruta del archivo de sesión (default: `auth.json`) |
| `YTMUSIC_ALLOW_ANONYMOUS` | Permitir modo invitado si no hay auth |

**Nunca** commitees `auth.json`, `oauth.json` ni `.env`.

### Temas del reproductor

El reproductor usa tokens CSS (`--player-*`) y **se adapta solo** al tema de la
app (modo automático). En `Ajustes` del reproductor se puede elegir un tema manual
entre 12 configuraciones: Sakura, Cyberpunk, Neon, Ocean, Forest, Sunset,
Midnight, Lavender, Crimson, Arctic, Retro y Sakura Dark. Cada una cambia
colores, glow, bordes, animaciones (intensidad) y estilo del visualizador.

### Offline

El service worker sigue cacheando el app shell. Sin conexión, el reproductor
muestra un aviso y deshabilita las funciones de YouTube Music; la biblioteca
local (archivos cargados) sigue disponible.

---

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 18 o superior (probado en 22) | compilar y servir |
| npm | 9 o superior | dependencias |
| Podman | 4 o superior | sólo si vas a usar la imagen |

Instalá Node con [nvm](https://github.com/nvm-sh/nvm) o desde
[nodejs.org](https://nodejs.org). No hace falta instalar nada global más.

---

## Arranque rápido

```bash
npm ci        # instala según package-lock.json (reproducible)
npm run dev   # desarrollo con recarga en caliente → http://localhost:5173
```

## Build de producción

```bash
npm run build   # compila a dist/
npm start       # sirve dist/ → http://localhost:3000
```

`npm start` usa `scripts/start.mjs`, que funciona **igual en Linux, macOS y
Windows**. El puerto sale de la variable `PORT` (por defecto `3000`):

```bash
PORT=8080 npm start
```

### Por qué no `serve dist -l $PORT -s` directo

Ese era el script anterior y **no funcionaba en Windows**. `$PORT` es sintaxis
de shell POSIX; en `cmd.exe` no se expande, así que `serve` recibía la cadena
literal y abortaba con:

```
Error: Unknown --listen endpoint scheme (protocol): undefined
```

`start.mjs` resuelve el puerto en Node y lanza `serve` vía `process.execPath`,
sin depender de `.cmd` ni de shell. Además valida el valor y avisa con un
mensaje claro en vez de fallar con un error de `serve`.

---

## Imagen con Podman

```bash
podman build -t cherry-bomb:local -f Containerfile .
podman run --rm -p 8080:8080 -e PORT=8080 cherry-bomb:local
# → http://localhost:8080
```

O con compose (sirve igual en Docker):

```bash
podman compose up --build -d
podman compose logs -f
podman compose down
```

Para cambiar el puerto del host: `CHERRY_BOMB_PORT=9000 podman compose up`.

### Atajos

Si tenés `make`:

```bash
make image      # construir la imagen
make run        # construir y levantar en :8080
make help       # ver todos los objetivos
```

O los scripts de npm, que no dependen de `make`:

```bash
npm run image:build
npm run image:run
```

### Sobre el `Containerfile`

* **No usa `RUN --mount=type=cache`.** Podman usa buildah y no soporta los
  cache mounts de BuildKit; si se agrega uno, el build funciona en Docker y
  falla en Podman, al revés de lo que queremos.
* **No declara `# syntax=`.** No necesita el frontend de BuildKit.
* Multi-stage: la primera etapa compila, la final lleva sólo Node + `serve`
  (7 MB de dependencias), sin toolchain de compilación.
* Corre como usuario `node` (uid 1000), con `read_only: true` en compose: la
  app es estática y no escribe nada.
* El healthcheck usa el `fetch` global de Node 22, así que la imagen no
  necesita `curl` ni `wget`.
* El registry va explícito (`docker.io/library/node:22-alpine`) para que
  funcione en máquinas rootless sin `registries.conf` configurado.

---

## Verificación

```bash
npm run verify:build
```

Sirve `dist/` en un subdirectorio y en la raíz, y comprueba que **todas** las
referencias del `index.html`, de los `url()` del CSS y del precache del service
worker respondan `200`.

Existe porque el bug de `base` de Vite llegó a producción dos veces. Ninguna
prueba unitaria lo detecta: el problema no está en el código, sino en cómo se
compone la URL final. Si tocás `base` o movés assets, corré esto.

## Tests y lint

```bash
npm test        # vitest
npm run lint    # eslint
```

---

## Despliegue

La app se publica en GitHub Pages y Render. `vite.config.ts` usa
`base: './'` (rutas relativas) a propósito: es lo que permite que la misma
build funcione en un subdirectorio (`/proyecto_web/`) y en la raíz.

Si cambiás `base`, volvé a correr `npm run verify:build`.

### GitHub Pages

El workflow publica el contenido de `dist/` en cada push a `main`. La
configuración de Pages en el repo debe apuntar a **GitHub Actions** (no a la
rama), y el build usar `./` como base.

---

## Estructura

```
Containerfile            imagen multi-stage para Podman
compose.yml              orquestación (Podman/Docker)
Makefile                 atajos de desarrollo e imagen
scripts/
  start.mjs              servidor de producción cross-platform
  entrypoint.sh          PID 1 del contenedor
  verify-build.mjs       regresión de rutas del deploy
docs/
  supabase-schema.sql    esquema con RLS (10 tablas, 35 políticas)
src/
  app.js                 lógica principal
  data.js                persistencia en localStorage
  notifications.js       notificaciones
  styles.css             temas + tipografía
  assets/                fuente KanjiStyle
  sakura-player/         reproductor de música (ver arriba)
backend/
  main.py                API FastAPI (YouTube Music vía ytmusicapi)
  api/                   endpoints REST
  services/              capa de abstracción ytmusicapi
index.html               markup (24 secciones app-*)
```

## Seguridad

`src/app.js` no guarda contraseñas en claro: usa un hash FNV-1a con sal y un
XOR con clave fija (`CHERRYBOMB_SALT_2026`). Es ofuscación contra alguien que
mire por encima del hombro, **no cifrado**: no protege contra nadie con acceso
al `localStorage`. Para datos reales, mové la autenticación al servidor.

## Licencia

Proyecto educativo interno.
