# Funciones — Estado y Hoja de Ruta

> **Alcance actual:** Organizador personal del estudiante en su dispositivo.
> **Multiusuario:** Desactivado por defecto. Requiere backend real con autenticación, base de datos con RLS y canales de comunicación reales.

---

## Tabla: Función → Estado → Qué hace falta para activarla

| Función | Sección (`app-*`) | Estado | Qué hace falta para activarla |
|---------|-------------------|--------|-------------------------------|
| **Actividades / Pendientes** | `app-actividades` | ✅ Activa | — |
| **Agenda / Plan diario** | `app-agenda` | ✅ Activa | — |
| **Calendario** | `app-calendario` | ✅ Activa | — |
| **Horario de clases** | `app-horario` | ✅ Activa | — |
| **Clases en línea** | `app-clases` | ✅ Activa | — |
| **Tareas (bachillerato)** | `app-tareas` | ✅ Activa | — |
| **Estudio (Pomodoro)** | `app-estudio` | ✅ Activa | — |
| **Sakura Player** | `app-sakura-player` | ✅ Activa | — |
| **Respaldos (Export/Import JSON)** | `app-respaldos` | ✅ Activa | — |
| **Configuración (tema, volumen, backend)** | `app-configuracion` | ✅ Activa | — |
| **Exámenes (creador/simulador)** | `app-examenes` | ✅ Activa | — |
| **Picker (fecha/hora)** | `app-picker` | ✅ Activa | — |
| **Digital (firma/documentos)** | `app-digital` | ✅ Activa | — |
| **Foros** | `app-foros` | ✅ Activa (con backend) | Backend real + moderación de reportes (`/api/moderacion`). Ver detalle en la nota 3. |
| **Mensajes** | `app-mensajes` | ✅ Activa (con backend) | Backend real: `/api/mensajes/*`. Bandeja, conversación, envío, leído y borrado. Sólo remitente y destinatario ven la conversación; el estudiante escribe al personal del colegio. |
| **Actividades grupales** | `app-grupales` | ✅ Activa (con backend) | Backend real: `/api/grupales/*`. Grupos con integrantes, chat interno, entregas compartidas e invitaciones. Ven el grupo el dueño, los miembros y el personal docente. |
| **Colegio Protegido (reportes)** | `app-protegido` | ✅ Activa (con backend) | Backend real: `/api/protegido/incidentes`. Reportar: cualquiera con sesión. Ver: el autor ve los suyos, el personal docente ve todos. Atender: sólo personal docente. **Pendiente**: protocolo de actuación escrito y canal de contacto al adulto responsable (hoy la app no es un canal de emergencia) |
| **Aulas Virtuales** | `app-aulas` | ✅ Activa (con backend) | Backend real: `/api/aulas/*`. Aulas, inscripciones, tareas, entregas, calificaciones y asistencia. Persistencia atómica en `SAKURA_DATA_DIR`. |
| **Inscripciones a aulas** | (parte de `app-aulas`) | ✅ Activa (con backend) | Desde la UI de Aulas Virtuales (inscribir / quitar por aula). |
| **Tareas de aula** | (parte de `app-aulas`) | ✅ Activa (con backend) | Crear, ver y entregar tareas del aula. |
| **Calificaciones de aula** | (parte de `app-aulas`) | ✅ Activa (con backend) | Visibles para inscritos, docentes y administración. |
| **Asistencia de aula** | (parte de `app-aulas`) | ✅ Activa (con backend) | Registro docente + vista del alumno. |
| **Planificación docente** | `app-planificacion` | 🔒 Próximamente | Backend real + BD con RLS + visibilidad por rol (docente/director). Hoy es 100% local en el dispositivo. |
| **Matrícula / Inscripciones** | `app-matricula` | 🔒 Próximamente | Backend real: `/api/matricula/*` existe; falta que el frontend deje de depender de la sesión local y use el backend (Fase 2). |
| **Asistencia docente** | `app-asistencias` | 🔒 Próximamente | Fase 2: flag `ASISTENCIA_DOCENTE`; hoy el panel “Pendientes” del inicio tampoco muestra las entregas por corregir. |
| **Roles docente/director/admin** | `app-auth` (panel) | 🔒 Próximamente | Fase 2: flag `ROLES_DOCENTE`. El backend (`/api/accounts`, `/api/auth/*`) ya existe; falta que el login/registro y el panel de usuarios usen el backend de punta a punta. |
| **Experiencias educativas** | `app-experiencias` | 🔒 Próximamente | Backend real + BD con RLS (si requiere datos de otros). |
| **Portal Padres** | `app-parents` | ✅ Activa (con backend) | Backend real: `/api/padres/*`. Resumen de tareas, notas y asistencia de los hijos vinculados (`hijo_email` / `hijos` en la cuenta). Sólo cuentas con rango `padres`. |
| **SABI (alertas/sistema)** | `app-sabi` | 🔒 Próximamente | Backend real + canal de comunicación real (push, email, SMS). |
| **Digital (firma/docs)** | `app-digital` | ✅ Activa | — (si es solo local) |

---

## Notas clave

1. **Las banderas mandan sobre el rol**: Cambiar `cherrybombSession.rol` a `admin`, `docente` o `director` desde la consola **NO** habilita ninguna función desactivada. Las banderas (`FEATURES` en `src/config/features.js`) son constantes de compilación.

2. **Datos locales no se borran**: Al desactivar una función, sus datos en `localStorage` (`foros`, `mensajesItems`, `gruposItems`, `protegidoItems`, `aulas`, `aula_*`, `estudiantes_db`, `asistencia_historial`, `bachillerato_plan_trabajo`, etc.) **permanecen intactos**. Si se reactiva la bandera, los datos siguen ahí.

3. **Fase 1 (Multiusuario real) — 2026-11-14**: Mensajes, Actividades Grupales, Portal Padres y Aulas Virtuales pasaron a funcionar contra el backend real con sesión por cookie. Los módulos se cargan de forma lazy (`import()` en `src/app.js`) y cada uno tiene su lógica pura separada (`*-utils.js`) con pruebas propias. Ver `PHASE0_PREPARACION.md` para el detalle.

4. **Reactivaión de "Colegio Protegido" (`PROTEGIDO`)**: Se reactivó el **2026-11-11** porque ya existe backend real (`backend/api/protegido.py`): los reportes llegan al servidor, los ve el personal docente y quedan auditados. **Sigue pendiente**:
   - Protocolo de actuación escrito y conocido por el colegio
   - Canal real de contacto al adulto responsable (psicólogo, orientador, dirección)
   - Notificación inmediata al adulto responsable (hoy es una cola que el docente consulta)
   - Definir la política de anonimato (hoy el reporte guarda el email del autor)

5. **Registro / Roles**: Mientras `ROLES_DOCENTE` sea `false`, el formulario de registro **no muestra** el selector de rol y asigna `estudiante` por defecto. El usuario no puede elegir `docente`, `director`, `subdirector` ni `admin`. El cambio de rango lo hace un administrador desde el panel de usuarios (escribe en la cuenta: el rol vigente se lee de `accounts.json` en cada request).

6. **Notificaciones docente**: Mientras `ASISTENCIA_DOCENTE` sea `false`, el panel "Pendientes" en Inicio **no muestra** entregas de estudiantes (notificaciones de "tareas por corregir").

7. **Sin sincronización total**: las secciones personales (actividades, agenda, horario, exámenes…) siguen siendo 100% `localStorage`. Solo las que dicen "con backend" arriba comparten datos entre personas.

---

## Cómo reactivar una función multiusuario

1. Editar `src/config/features.js`: cambiar la bandera a `true`.
2. Rebuild y redeploy (`npm run build` → deploy).
2. Verificar que el backend correspondiente está desplegado y accesible.
3. Probar flujo completo con al menos dos usuarios reales.
4. Actualizar esta tabla (estado → ✅ Activa).
3. Comunicar a usuarios si aplica.
