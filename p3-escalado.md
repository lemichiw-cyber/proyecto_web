# P3 — Escalado (post-P2)

## Objetivo
Cerrar lo que P0-P2 dejó como stub: sesiones con ventana deslizante, sync offline real (no solo localStorage) y observabilidad frontend sin dependencia obligatoria.

## Alcance P3 (este sprint)
1. **Refresh deslizante de sesión** — `backend/api/auth.py` + `/me`
   - Cada `GET /api/auth/me` válido extiende `creado = now` y re-emite cookie `Max-Age=86400` (ventana deslizante 24h desde último uso, no desde login).
   - Coste mínimo y retrocompatible. El cliente no cambia.
2. **IndexedDB offline (sync real)** — `src/offline-sync.js`
   - Store `cherrybomb-offline/q` con `put/getAll/delete`. Sin dependencia externa (native IndexedDB).
   - `enqueue(action)` persiste en idb + espejo en localStorage (compat lectura rápida). `flush(fetchFn)` re-ejecuta en `online` y devuelve `{ok, total}`.
   - `src/main.ts` importa el módulo (preload) y escucha `online` → `flush`.
3. **Sentry frontend opcional** — `src/main.ts`
   - Si `VITE_SENTRY_DSN` existe, `import('@sentry/browser').init()` dinámico con `try/catch`. Sin DSN → no carga nada. Sin la dependencia instalada → no rompe build.
4. **Migración JSON→Postgres lista** — `backend/migrate.py`
   - Si `DATABASE_URL` vacío → imprime “no DATABASE_URL, nada que migrar” y sale 0.
   - Si hay URL: lee `accounts.json/sessions.json/foro_reportes.json`, hace `INSERT ... ON CONFLICT DO NOTHING` con `psycopg` (si `psycopg2`/`psycopg` no está, imprime ayuda y sale 0). No se ejecuta en CI.

## No-P3
- Postgres como backend por defecto, JWT refresh rotativo, telemetría de notas.

## Verificación
- `eslint 0`, `vitest 83/83`, `pytest 27/27`, `tsc` + `vite build` OK.
- Tras `/me` con cookie válida, `Set-Cookie` se re-emite (ventana deslizante).
- `src/offline-sync.js` exporta `enqueue/flush/openDB` y `npm run build` sigue en verde con import dinámico.
