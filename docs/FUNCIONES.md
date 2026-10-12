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
| **Foros** | `app-foros` | 🔒 Próximamente | Backend real + WebSockets / polling + moderación + RLS en BD |
| **Mensajes** | `app-mensajes` | 🔒 Próximamente | Backend real + WebSockets / polling + cifrado extremo-a-extremo opcional + RLS |
| **Actividades grupales** | `app-grupales` | 🔒 Próximamente | Backend real + gestión de grupos + invitaciones + RLS |
| **Colegio Protegido (reportes)** | `app-protegido` | 🔒 Próximamente | **Canal real con responsable** (psicólogo, orientador, dirección) + protocolo de actuación + anonimato real + notificación a adulto responsable |
| **Aulas Virtuales** | `app-aulas` | 🔒 Próximamente | Backend real + BD con RLS + gestión de inscripciones + tareas + calificaciones + asistencia |
| **Inscripciones a aulas** | (parte de `app-aulas`) | 🔒 Próximamente | Backend real + BD con RLS + aprobación docente/director |
| **Tareas de aula** | (parte de `app-aulas`) | 🔒 Próximamente | Backend real + BD con RLS + entregas + calificaciones |
| **Calificaciones de aula** | (parte de `app-aulas`) | 🔒 Próximamente | Backend real + BD con RLS + visibilidad por rol |
| **Asistencia de aula** | (parte de `app-aulas`) | 🔒 Próximamente | Backend real + BD con RLS + registro docente + visibilidad por rol |
| **Planificación docente** | `app-planificacion` | 🔒 Próximamente | Backend real + BD con RLS + visibilidad por rol (docente/director) |
| **Matrícula / Inscripciones** | `app-matricula` | 🔒 Próximamente | Backend real + BD con RLS + gestión de estudiantes + aprobación admin |
| **Asistencia docente** | `app-asistencias` | 🔒 Próximamente | Backend real + BD con RLS + registro docente + visibilidad director |
| **Roles docente/director/admin** | `app-auth` (panel) | 🔒 Próximamente | Autenticación real (no editable en consola) + backend + RLS + auditoría |
| **Experiencias educativas** | `app-experiencias` | 🔒 Próximamente | Backend real + BD con RLS (si requiere datos de otros) |
| **Portal Padres** | `app-parents` | 🔒 Próximamente | Backend real + BD con RLS + vínculo estudiante-padre verificado + autenticación real |
| **SABI (alertas/sistema)** | `app-sabi` | 🔒 Próximamente | Backend real + canal de comunicación real (push, email, SMS) |
| **Digital (firma/docs)** | `app-digital` | ✅ Activa | — (si es solo local) |

---

## Notas clave

1. **Las banderas mandan sobre el rol**: Cambiar `cherrybombSession.rol` a `admin`, `docente` o `director` desde la consola **NO** habilita ninguna función desactivada. Las banderas (`FEATURES` en `src/config/features.js`) son constantes de compilación.

2. **Datos locales no se borran**: Al desactivar una función, sus datos en `localStorage` (`foros`, `mensajesItems`, `gruposItems`, `protegidoItems`, `aulas`, `aula_*`, `estudiantes_db`, `asistencia_historial`, `bachillerato_plan_trabajo`, etc.) **permanecen intactos**. Si se reactiva la bandera, los datos siguen ahí.

3. **Reactivaión de "Colegio Protegido" (`PROTEGIDO`)**: Solo habilitar cuando exista:
   - Un canal real de comunicación con un adulto responsable (psicólogo, orientador, dirección)
   - Protocolo de actuación escrito y conocido
   - Garantía de anonimato real (no trazable a IP/usuario)
   - Notificación inmediata a adulto responsable
   - Documentar en `docs/FUNCIONES.md` la fecha y responsable de la reactivación.

4. **Registro / Roles**: Mientras `ROLES_DOCENTE` sea `false`, el formulario de registro **no muestra** el selector de rol y asigna `estudiante` por defecto. El usuario no puede elegir `docente`, `director`, `subdirector` ni `admin`.

5. **Notificaciones docente**: Mientras `ASISTENCIA_DOCENTE` sea `false`, el panel "Pendientes" en Inicio **no muestra** entregas de estudiantes (notificaciones de "tareas por corregir").

6. **Sin sincronización**: Los datos viven **solo en este dispositivo** (localStorage). No hay servidor, no hay sincronización, no hay cuentas en la nube. El respaldo es un archivo JSON local.

---

## Cómo reactivar una función multiusuario

1. Editar `src/config/features.js`: cambiar la bandera a `true`.
2. Rebuild y redeploy (`npm run build` → deploy).
2. Verificar que el backend correspondiente está desplegado y accesible.
3. Probar flujo completo con al menos dos usuarios reales.
4. Actualizar esta tabla (estado → ✅ Activa).
3. Comunicar a usuarios si aplica.
