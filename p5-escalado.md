# P5 — Postgres como respaldo y rotación de sesión

## Alcance
- **P5-A Migración real** — `backend/migrate.py`: si hay `DATABASE_URL`, crea schema y hace `INSERT ... ON CONFLICT DO NOTHING` desde `accounts.json`, `sessions.json`, `audit.log`, `foro_reportes.json`. Sin URL → no-op.
- **P5-B Rotación** — `backend/api/auth.py:/me`: al tocar la sesión, genera nuevo token (`secrets.token_urlsafe`), invalida el anterior, re-emite cookie + devuelve `{token_nuevo}` para que el cliente en memoria se actualice.
- **P5-C Frontend** — `src/auth.ts:me()`: si la respuesta trae `token`, actualiza `token` en memoria (sin tocar localStorage).

## Criterios
- Sin `DATABASE_URL` todo sigue en JSON (dev/test verde).
- `pytest 27/27`, `vitest 83/83` (sin backend), `eslint 0`, `tsc 0`, `build OK`.
- `/me` con cookie vieja post-rotación → `401` (token invalidado).
