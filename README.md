# Cherry-Bomb

Plataforma educativa institucional. App web estática (SPA) con Pomodoro,
notificaciones, persistencia en `localStorage` y soporte offline vía PWA.

10 temas: `sakura`, `chicawa`, `mlp`, `pastel`, `dark`, `dawn`, `light`,
`ocean`, `paraiso`, `sunset`.

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
index.html               markup (23 secciones app-*)
```

## Seguridad

`src/app.js` no guarda contraseñas en claro: usa un hash FNV-1a con sal y un
XOR con clave fija (`CHERRYBOMB_SALT_2026`). Es ofuscación contra alguien que
mire por encima del hombro, **no cifrado**: no protege contra nadie con acceso
al `localStorage`. Para datos reales, mové la autenticación al servidor.

## Licencia

Proyecto educativo interno.
