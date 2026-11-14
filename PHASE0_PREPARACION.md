# Fase 0 – Preparación común

Creado:
- src/modules/comunicaciones/
- src/modules/grupales/
- src/modules/padres/
- backend/api/mensajes.py, grupales.py, padres.py

(Los modelos Pydantic viven en cada router: no hace falta `backend/models/`.)

---

# Fase 1 – Multiusuario real (Mensajes · Grupales · Portal Padres)

Estado: **completa**. Los tres módulos tienen backend FastAPI, persistencia
en JSON atómico (modo 0600, fuera del código con `SAKURA_DATA_DIR`), auditoría
en `audit.log`, UI propia cargada de forma lazy y tests.

## Backend (`backend/api/`)

| Router | Endpoints |
|---|---|
| `mensajes.py` | `GET /contactos`, `GET /bandeja`, `GET /conversacion/{contacto}`, `POST /enviar`, `POST /{id}/leer`, `DELETE /{id}` |
| `grupales.py` | `GET /`, `POST /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`, `POST /{id}/miembros`, `POST /{id}/mensajes`, `POST /{id}/entregas` |
| `padres.py` | `GET /hijos`, `GET /resumen`, `GET /contactos` |

Reglas implementadas:
- **Mensajes**: sólo remitente y destinatario ven la conversación; el
  estudiante escribe al personal del colegio; el personal escribe a cualquiera;
  el borrado es del remitente (o de la dirección); abrir el hilo marca lo
  recibido como leído.
- **Grupales**: ven el grupo el dueño, los miembros y el personal docente;
  invitar/editar es del dueño o del docente; borrar, del dueño o de la
  dirección; cualquier miembro puede escribir en el chat y registrar entregas.
- **Padres**: sólo las cuentas con rango `padres`; los hijos se vinculan por
  `hijo_email` o `hijos` (lista de emails) en la cuenta; los datos académicos
  salen de `aulas.json` y nunca de otros alumnos.

Los tres routers están importados y registrados en `backend/main.py`.

## Frontend (`src/`)

- `src/api-client.ts`: `apiMensajes*`, `apiGrupales*`, `apiGrupo*`, `apiPadres*`.
- Módulos autocontenidos (inyectan su UI en la sección del `index.html`):
  - `src/modules/comunicaciones/mensajes-app.js` + `mensajes-utils.js`
  - `src/modules/grupales/grupales-app.js` + `grupales-utils.js`
  - `src/modules/padres/padres-app.js` + `padres-utils.js`
- `src/app.js`: carga lazy con `import()` (chunks separados:
  `mensajes-app`, `grupales-app`, `padres-app`) y delegación de
  `renderMensajes()` / `renderGrupos()` al módulo real cuando ya está cargado.
- `src/config/features.js`: `MENSAJES`, `GRUPALES` y `PADRES` en `true`
  (ya hay backend real); `APP_TO_FEATURE` los mapea a sus flags.
- Navegación: link "Portal Padres" en el sidebar (`#nav-parents`, visible sólo
  para cuentas con rango `padres` o admin) y tarjeta en el inicio con el mismo
  filtro por rango.

Si el backend no responde, cada módulo cae al respaldo local del dispositivo
(`localStorage`) y avisa con un banner, sin romper la navegación.

## Tests

- Backend (`backend/tests/`): `test_mensajes.py`, `test_grupales.py`,
  `test_padres.py` (24 tests) — permisos, aislamiento entre cuentas,
  persistencia fuera del código y permisos 0600.
  Suite completa: **145 tests en verde**.
- Frontend (vitest): `mensajes-utils.test.js`, `grupales-utils.test.js`,
  `padres-utils.test.js` (lógica pura) y `mensajes-app.test.js`,
  `grupales-app.test.js`, `padres-app.test.js` (integración DOM con el API
  simulado).
  Suite completa: **283 tests en verde**.
- `npm run build` (incluye `tsc`) en verde: los tres módulos quedan en
  chunks aparte (lazy), no engordan el bundle principal.

## Pendiente (fases siguientes)

- Roles docente/coordinador en Aulas Virtuales, Asistencias y Matrícula
  (`ROLES_DOCENTE`, `ASISTENCIA_DOCENTE`, `MATRICULA` siguen apagados).
- Notificaciones push de mensajes nuevos y de entregas grupales.
