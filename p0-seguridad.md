# P0 — Seguridad mínima para despliegue docente (INCOA)

## Objetivo
Cerrar los 4 vectores que impiden lanzar en un bachillerato público salvadoreño con datos de primero.

## Alcance P0 (este sprint)
1. **XSS via `data-onclick` → allowlist** — `src/global-delegator.js`
   - Hoy: `window[fnName](...)` permite ejecutar cualquier función global.
   - Fix: lista cerrada `ALLOWED_ACTIONS` (clickLogin + 18 acciones del HTML), `data-onclick` con formato inválido se ignora y se loggea.
2. **Headers + CORS** — `backend/main.py`
   - Añade `Content-Security-Policy`, `Strict-Transport-Security`, `Permissions-Policy` (CSP report-only en dev → enforce en prod).
   - CORS: elimina `SAKURA_ALLOW_LOCAL_CORS` implícito (regex localhost + `Allow-Private-Network`). Solo origins explícitas en `_CORS` (prod). Local solo si `SAKURA_ENV=dev`.
3. **Auth endurecida** — `backend/api/auth.py`
   - Rate-limit login/register (in-memory: 5 intentos / 5 min por IP+email → 429).
   - `sessions.json` + `accounts.json` con modo `0o600`, `sessions.json` ignorado en git.
   - Cookie `HttpOnly + SameSite=Lax` (`cherrybomb_session`, 24h) en login; `require_auth` acepta `cookie OR Bearer` (compatibilidad).
4. **Higiene repo**
   - `pytest.ini` para que `pytest` funcione desde raíz (`pythonpath=backend`).
   - `.gitignore`: `backend/sessions.json`, `backend/auth.json`, `backend/oauth.json`.
   - `debug.router` no se monta si `SAKURA_ENV=production`.

## No-P0 (documentado, fuera de sprint)
- Migrar `sessions.json/accounts.json` → Postgres (Sprint P1).
- Mover token fuera de `localStorage` → solo cookie (requiere cambiar `src/auth.ts`).
- Moderación de foros, auditoría de notas, backups cifrados (P1).

## Verificación
- `eslint 0`, `vitest 83/83`, `pytest 27/27` (desde backend y desde raíz), `npm run build` OK.
- `curl -i` backend: `content-security-policy`, `strict-transport-security`, `x-content-type-options` presentes.
- `OPTIONS` con `Origin: http://evil.com` → sin `Access-Control-Allow-Origin`.
- 6º intento de login → `429`.
