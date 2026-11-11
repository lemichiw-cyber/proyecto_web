# P2 — Madurez (post-P1)

## Objetivo
Sin romper lo que ya funciona (P0+P1), añadir los 4 pilares P2 de forma incremental y verificable.

## Alcance P2 (este sprint)
1. **Sentry opcional** — `backend/main.py`
   - Si `SENTRY_DSN` existe: `sentry_sdk.init()` + capturador de excepciones 500 (ya hay handler).
   - Si no existe: no-op total (sin dependencia obligatoria).
2. **Cola offline** — `src/offline-queue.js`
   - `enqueue(action)` → `localStorage["cherrybombOfflineQueue"]` (solo tareas/notas, sin PII extra).
   - `flush()` en `online` y al cargar: reintenta `fetch` y limpia.
   - `api-client.ts:apiFetch` encola en `TypeError` (falla de red) y retorna `{ok:false, queued:true}`.
3. **Moderación de foros** — `backend/api/moderacion.py`
   - `POST /api/moderacion/report` `{foro_id, mensaje_id?, motivo}` (auth usuario) → `foro_reportes.json` atómico (`db.write_json_atomic`).
   - `GET /api/moderacion/cola` (admin) → lista pendientes.
   - `POST /api/moderacion/resolver/{id}` (admin) marca `resuelto:true`.
   - Auditoría: `foro.report` + `foro.resolver`.
4. **Postgres-ready (sin romper dev)** — `backend/schema_pg.sql`
   - Esquema `accounts`, `sessions`, `audit`, `foro_reportes` (tablas espejo de los JSON actuales).
   - `backend/db_pg.py`: detector `DATABASE_URL` + `schema_ready()` (todavía no migra datos; lo hace P2-b).
5. **Health ampliado** — `GET /api/health` devuelve `{version, uptime_s, audit_count, reportes_pendientes}`.

## No-P2
- Migración automática JSON→Postgres, IndexedDB completa, Sentry en frontend, JWT refresh rotativo.

## Verificación
- `eslint 0`, `vitest 83/83`, `pytest 27/27`, `tsc` + `vite build` OK.
- `POST /api/moderacion/report` sin auth → 401, con auth → 201 + `foro_reportes.json` 600.
- `GET /api/moderacion/cola` sin admin → 401.
- Sin `SENTRY_DSN`, backend arranca igual.
- `offline-queue.js` exporta `enqueue/flush/len` y no rompe `apiFetch`.
