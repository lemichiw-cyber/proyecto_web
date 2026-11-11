# P1 — Salto a producción docente (post-P0)

## Objetivo
Sacar sesiones/cuentas de JSON suelto a almacenamiento endurecido + auditoría para trazabilidad, y sacar el token de `localStorage`.

## Alcance P1 (este sprint)
1. **Cookie-only frontend** — `src/auth.ts`
   - `token` solo en memoria (ya no `localStorage`). `usuario` solo en memoria.
   - `me()` llama a `/api/auth/me` vía `credentials:include` aunque `token` sea null (usa cookie HttpOnly). Sin `localStorage`, un XSS ya no roba el token.
   - Sigue enviando `Bearer` en memoria si existe (compat backend). Los viejos keys `cherrybombAuthToken/User` se borran al cargar.
2. **Auditoría server-side** — `backend/audit.py` + endpoints
   - `audit.log` JSONL append-only (`0600`, gitignored), una línea por evento: `ts, evento, email, ip`.
   - Eventos: `auth.register`, `auth.login_ok`, `auth.login_fail`, `auth.logout`, `accounts.create`, `accounts.update`, `accounts.delete`.
   - `GET /api/audit?limit=100` solo admin HMAC (P1: trazabilidad para director/coordinador).
3. **Storage endurecido** — `backend/db.py`
   - Escritura atómica (tmp + `os.replace`) + `chmod 0600` + lock `fcntl.flock` (fallback sin lock en Windows). Evita truncados y carreras a las 7am con 500 alumnos.
   - `accounts.py:_save_accounts` y `auth.py:_save_sessions` migran a `db.write_json_atomic()`. Lectura tolerante a JSON corrupto (backup si falla).
4. **Higiene**
   - `.gitignore`: `audit.log`, `*.tmp`, `backend/*.log`.
   - `pytest.ini` ya en P0 (funciona desde raíz).

## No-P1 (P2)
- Postgres real + offline sync IndexedDB, moderación de foros, Sentry, JWT con refresh rotativo.

## Verificación
- `eslint 0`, `vitest 83/83`, `pytest 27/27`, `tsc` + `vite build` OK.
- `login` → `Set-Cookie HttpOnly` + `audit.log` con `login_ok`.
- `login` mala clave → `401` + `login_fail` en auditoría, 6º intento → `429`.
- `GET /api/audit` sin admin → `401`, con admin env → devuelve eventos.
- `localStorage` tras login ya no contiene `cherrybombAuthToken`.
