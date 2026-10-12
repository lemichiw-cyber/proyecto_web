# Formato de Respaldo — Cherry-Bomb

## Esquema del archivo JSON

```json
{
  "app": "Cherry-Bomb",
  "schemaVersion": 1,
  "exportedAt": "2026-10-11T15:30:00.000Z",
  "origin": "https://lemichiw-cyber.github.io",
  "data": {
    "localStorage": {
      "cherrybombTheme": "sakura",
      "cherrybombVol": 0.7,
      "actividades": [...],
      "agendaItems": [...],
      ...
    },
    "indexedDB": {},
    "meta": {
      "localStorageKeys": 23,
      "indexedDBStores": 0,
      "totalBytes": 45231,
      "categories": {
        "config": 5,
        "estudiante": 12,
        "sakuraPlayer": 6,
        "excluidas": 8
      }
    }
  }
}
```

## Campos obligatorios

| Campo | Tipo | Descripción |
|---|---|---|
| `app` | string | Nombre de la app ("Cherry-Bomb") |
| `schemaVersion` | integer | Versión del esquema (empezando en 1) |
| `exportedAt` | string (ISO 8601) | Timestamp de la exportación |
| `origin` | string | Dominio desde donde se exportó (window.location.origin) |
| `data.localStorage` | object | Clave-valor de localStorage (solo lista blanca) |
| `data.indexedDB` | object | Vacío (no se usa IndexedDB) |
| `data.meta` | object | Metadatos de la exportación |

## Lista blanca de claves (INCLUIR en respaldo)

### Configuración de UI
- `cherrybombTheme` — tema visual activo
- `cherrybombVol` — volumen global (0-1)
- `cherrybombPomodoro` — estado del temporizador Pomodoro
- `cherrybombNotifReminders` — recordatorios ya mostrados (para no duplicar)
- `claseAvisos` — avisos de clases vistos (permite no volver a mostrar avisos ya leídos)

### Sakura Player
- `sp_eq` — ganancias del ecualizador (10 bandas)
- `sp_mixer` — estado del mezclador (master, music, bass, treble, balance, mutes)
- `sp_theme` — tema manual del reproductor
- `sp_theme_mode` — modo de tema (auto/manual)
- `sp_animations` — animaciones on/off
- `sp_library_v1` — biblioteca local: favoritos, historial, playlists, tracks locales (LS_KEY = 'sp_library_v1')

### Datos del estudiante (propios - SOLO claves personales, sin datos de otros)
- `actividades` — actividades personales
- `agendaItems` — eventos de agenda personal
- `calEventos` — eventos de calendario
- `clasesItems` — clases en línea propias
- `horarioItems` — horario personal
- `bachillerato_tareas` — tareas propias
- `bachillerato_entregas` — entregas propias
- `bachillerato_examenes` — exámenes propios
- `bachillerato_exam_resultados` — resultados de exámenes
- `bachillerato_plan_trabajo` — plan de trabajo docente
- `planificaciones` — planificaciones
- `planData` — plan de materias
- `planificaciones` — planificaciones
- `planData` — plan de materias
- `POMO_KEY` (cherrybombPomodoro) — estado pomodoro

## Claves EXCLUIDAS (NUNCA en respaldo)

| Clave | Motivo |
|---|---|
| `cherrybombSession` | Sesión activa (token implícito) |
| `passHash_*` | Hash de contraseña (credencial) |
| `cherrybombCuentas` (LS_CUENTAS) | Directorio de cuentas con roles |
| `cherrybombApiBase` | URL de backend (configuración de entorno) |
| `aulas` | Contiene `owner_id` (email docente) — datos de otros |
| `aula_inscripciones` | Emails de estudiantes inscritos — datos de otros |
| `estudiantes_db` | Nombres, emails, grupos de estudiantes — datos de otros |
| `aula_entregas` | Entregas de estudiantes — datos de otros |
| `aula_calificaciones` | Calificaciones — datos de otros |
| `aula_asistencia` | Asistencias — datos de otros |
| `aula_tareas` | Tareas de aulas (pueden ser de docentes) |
| `foros` | Participaciones en foros con mensajes de múltiples usuarios |
| `mensajesItems` | Mensajes entre usuarios |
| `gruposItems` | Grupos con múltiples miembros |
| `asistencia_historial` | Registros de asistencia de otros usuarios |
| `protegidoItems` | Reportes de incidentes sensibles (acoso, robo, emergencias) |
| `passHash_*` (prefijo) | Hashes de contraseña |

**Regla:** Si la clave contiene datos identificables de OTROS usuarios (emails, nombres, calificaciones, entregas, mensajes, incidentes), se excluye. El respaldo es **personal**.

## Archivos de audio (MP3/FLAC/OGG)

- **NO se incluyen** en el respaldo JSON.
- Los archivos locales se guardan como `blob:` URLs en memoria y **no persisten** entre sesiones.
- La biblioteca Sakura Player guarda solo metadatos en localStorage (`LS_KEY`).
- **Opción opcional** "Incluir archivos de música" (desactivada por defecto):
  - Requiere que el usuario vuelva a seleccionar los archivos tras importar.
  - Advertencia: archivos grandes (>50MB) pueden fallar en la descarga/importación.

## Política de versiones

| schemaVersion | Cambios |
|---|---|
| 1 | Versión inicial |

- **Mayor incompatible**: Rechazar importación con mensaje claro.
- **Menor compatible**: Migrar automáticamente (añadir campos faltantes con defaults).

## Seguridad y privacidad

1. **Nunca** se envía el archivo a servidor alguno. Todo ocurre en el navegador.
2. El archivo contiene **datos personales** (tareas, notas, horarios). El usuario debe guardarlo con cuidado.
3. Al importar: validación estricta de esquema, tipos, tamaños. Lista blanca obligatoria.
4. **Nunca** `eval`, `innerHTML` con contenido del archivo, ni `JSON.parse` sin try/catch.
5. Sanitización de textos antes de pintar en pantalla (escapeHtml).

## Interfaz

- **Exportar**: Botón en Ajustes + banner temporal en Inicio durante migración.
- **Importar**: Selector de archivo → vista previa (conteos) → confirmación explícita → modo "Reemplazar" / "Combinar".
- **Migración guiada**: Aviso en dominios legacy (`VITE_LEGACY_ORIGINS`) con botón exportar + URL nueva (`VITE_NEW_APP_URL`). En dominio nuevo, aviso de importar si no hay datos.

### Cómo migrar tus datos

> **⚠️ Importante**: Los datos se guardan **solo en el dispositivo** (localStorage). **Las claves son globales del dispositivo, no por usuario**. Si el dispositivo es compartido, **todos los usuarios verán los mismos datos**. El respaldo **no se vincula a ninguna cuenta** y **no hay sincronización con servidor**. El archivo JSON es un archivo local.

1. En el sitio **nuevo**, creá tu cuenta (botón "Iniciar sesión" → "Crear cuenta").
2. **Luego**: En Ajustes → Respaldos, seleccioná tu archivo JSON e importá.

Si importás **sin haber creado la cuenta**, los datos se guardarán en localStorage pero **no se vincularán a tu cuenta**. Al recargar o cambiar de dispositivo, se perderán.

Al importar, los datos se escriben en `localStorage`. No hay sincronización automática con servidor.

⚠️ **Advertencia**: En dispositivos compartidos, todos los usuarios ven los mismos datos locales. El respaldo no distingue usuarios; al importar, los datos se mezclan con los del dispositivo.