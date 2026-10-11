# Migración de autenticación a Supabase Auth

> **Estado: PLAN (no implementado).** Este documento describe *cómo* migrar la
> autenticación actual —que corre entera en el navegador— a **Supabase Auth**.
> La migración **no se ha hecho**: requiere decisión y aprobación del
> propietario del proyecto porque cambia el modelo de datos y el flujo de
> login. Mientras tanto, el README lleva una advertencia visible.

---

## 1. Estado actual (por qué esto es un problema)

La autenticación vive **completamente en el cliente** (`src/app.js`), con
persistencia en `localStorage`. No hay verificación de contraseñas en el
servidor: `backend/api/accounts.py` es solo un directorio de cuentas
(rol/nombre/activo) y **no valida contraseñas**.

Código afectado (líneas aproximadas de `src/app.js`):

| Función | Líneas | Qué hace | Problema |
|---|---|---|---|
| `cryptoDeriveKey(password, salt)` | 280–304 | «Key stretching» con 1000 iteraciones de **FNV-1a** (32 bits) sobre `password:CHERRYBOMB_SALT_2026` | FNV-1a no es un hash criptográfico; la sal es **fija y global**, no por usuario |
| `cryptoXOR(data, key)` | 306–313 | Cifrado XOR con la clave derivada | XOR con clave derivada de FNV-1a **no es cifrado seguro** |
| `cryptoEncrypt` / `cryptoDecrypt` | 315–331 | «Cifra» `userData` y `matSolicitudes` antes de guardarlos en `localStorage` | Ofuscación reversible por cualquiera con acceso al `localStorage` |
| `secureKeys` / `secureGetItem` / `secureSetItem` | 333–351 | Wrapper de `localStorage` con ese cifrado | Lo anterior, aplicado a datos «sensibles» |
| `hashPassword(password)` | 353–368 | Hash de contraseña: 500 iteraciones de una función tipo djb2 sobre `password:CHERRYBOMB_HASH`, sin sal por usuario | Hash **débil, sin sal por cuenta**, fácil de fuerza bruta offline |
| Login (`form-login` submit) | 708–743 | Compara `hashPassword(pass)` con `localStorage['passHash_' + btoa(email)]` | El verificador vive en el navegador; no hay reto servidor |
| Registro (`form-registro` submit) | 746–769 | Guarda `passHash_…` en `localStorage` | Las «cuentas» solo existen en ese navegador/dispositivo |

Claves de `localStorage` implicadas: `passHash_<btoa(email)>`, `userData`,
`matSolicitudes`, `cherrybombCuentas` (directorio de cuentas).

**Conclusión:** esto es ofuscación, no autenticación. Cualquier persona con
acceso al dispositivo (o que abra DevTools) puede leer los hashes, derivar las
claves (la sal es fija) y recuperar/alterar datos. **No debe usarse con datos
reales ni con roles con privilegios.**

---

## 2. Objetivo de la migración

Mover la identidad a **Supabase Auth** (hosteado, con `auth.users`), usando el
esquema ya presente en `docs/supabase-schema.sql`:

- La tabla `perfiles` ya referencia `auth.users(id)` y guarda `email`, `nombre`,
  `rol` y `activo`. Es el destino natural del directorio de cuentas actual.
- El RLS de `perfiles` ya está definido (propios vs. admin/director).
- Todas las demás tablas (`aulas`, `aula_*`, `estudiantes`, `planificaciones`,
  `actividades`, `mat_solicitudes`) referencian `auth.users(id)` → el resto del
  modelo ya espera UUIDs de Supabase.

### Cambio de modelo (importante)

- **Hoy:** email → `{rol, nombre, activo, semestre}` en `localStorage`, con
  hash de contraseña local por email.
- **Después:** `auth.users` (UUID, email, credenciales) + fila en `perfiles`
  con `id = auth.users.id`. El «rol» deja de venir de `localStorage` y pasa a
  leerse de `perfiles.rol` (ya protegido por RLS).

---

## 3. Plan de implementación (fases)

### Fase 0 — Preparación
1. Crear proyecto Supabase y aplicar `docs/supabase-schema.sql` (+ RLS de
   `docs/supabase-fix-rls.sql` si aplica).
2. Configurar el *Auth Provider* (email/password; Google si se desea).
3. Definir *redirect URLs* permitidos (incluye el dominio de GitHub Pages).
4. Añadir dependencias: `@supabase/supabase-js` (nueva dependencia — requiere
   aprobación) y las variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   (ya planteadas en `.env.example`).

### Fase 1 — Cliente de auth
5. Crear `src/auth/` con un cliente Supabase (singleton) y helpers:
   `signUp`, `signIn`, `signOut`, `getCurrentUser`, `getPerfil`.
6. Sustituir `hashPassword` / `passHash_*` por la sesión de Supabase
   (`supabase.auth.getSession()`), que ya expone access/refresh tokens firmados.
7. **Eliminar** `cryptoDeriveKey`, `cryptoXOR`, `cryptoEncrypt`, `cryptoDecrypt`,
   `secureGetItem/secureSetItem` y `hashPassword` de `src/app.js`, y con ellos
   las claves `CHERRYBOMB_SALT_2026` / `CHERRYBOMB_HASH`.
8. Reemplazar el guardado de `userData` / `matSolicitudes` en `localStorage`
   «cifrado» por tablas Supabase con RLS (o, como paso intermedio, dejarlos en
   `localStorage` **sin** cifrado simulado, que es lo honesto).

### Fase 2 — Perfiles y roles
9. Trigger o *edge function* de Supabase que, al registrarse, inserte la fila
   en `perfiles` con el rol elegido (validado contra el `CHECK` del esquema).
10. Cambiar `obtenerCuenta` / `crearCuenta` / `cuentaActiva` de `src/app.js`
    para que lean/escriban `perfiles` vía Supabase (con el rol ya validado
    servidor-side) en vez de `cherrybombCuentas`.
11. Ajustar el flujo de login para que el rol venga de `perfiles.rol`, no del
    valor enviado por el cliente.

### Fase 3 — Migración de datos y limpieza
12. Script de migración one-shot: para cada `passHash_*` / cuenta de
    `localStorage`, crear el usuario en Supabase Auth (vía admin API o
    invitación por email) y la fila en `perfiles`. *Nota:* **no** se puede
    «migrar» la contraseña (el hash actual es irreversible y no equivalente a
    bcrypt de Supabase) → la opción recomendada es **invitar por email** a que
    cada usuario defina su contraseña una vez.
13. Eliminar los caminos legacy de `localStorage` y limpiar claves obsoletas.
14. Auditar `backend/api/accounts.py`: o bien se retira (Supabase pasa a ser la
    fuente de verdad) o se mantiene solo como cache read-through.

### Fase 4 — Verificación
15. Pruebas: registro, login, logout, expiración de sesión, rol correcto por
    RLS, y que ningún endpoint acepte rol/usuario autoafirmado.
16. `npm run lint && npm test && npm run build && npm run verify:build`.

---

## 4. Riesgos y decisiones que hay que tomar

| Decisión | Opciones | Recomendación |
|---|---|---|
| **Proveedor** | Supabase Auth vs. backend propio | Supabase (el esquema ya está escrito para ello) |
| **Migración de contraseñas** | (a) invitación por email, (b) forzar reset | (a) — el hash actual no es recuperable |
| **`localStorage` de datos** | mover a tablas Supabase vs. dejar local | Mover `matSolicitudes` y contenido real; dejar preferencias no sensibles en local |
| **`backend/accounts.py`** | retirar vs. caché | Retirar o reducir a read-through |
| **Administrador** | rol en `perfiles` vs. cuenta separada | Rol `admin` en `perfiles` (el esquema ya lo contempla) |

---

## 5. Fuera de alcance de esta fase

- El panel admin del reproductor de música (`backend/api/admin.py`, token HMAC
  con contraseña por defecto `MLRTJAH`) es **otro** sistema de autenticación
  aparte y también debería migrarse (o al menos exigir secreto por entorno),
  pero se trata en un cambio separado.
