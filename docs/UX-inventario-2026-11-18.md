# UX Inventario Cherry-Bomb — 2026-11-18

## Apps actuales y flags

Extraído de `src/app.js` `appsData` y `src/config/features.js`.

| id | label | descripción | feature flag | estado | roles restringidos |
|----|-------|-------------|--------------|--------|--------------------|
| actividades | Actividades | Tareas y pendientes | ACTIVIDADES | true | - |
| examenes | Exámenes | Creador y simulador | EXAMENES | true | - |
| foros | Foros | Discusión académica | FOROS | true | - |
| agenda | Agenda | Plan diario | AGENDA | true | - |
| calendario | Calendario | Eventos y fechas | CALENDARIO | true | - |
| horario | Horario | Clases del semestre | HORARIO | true | - |
| clases | Clases en línea | Enlaces y reuniones | CLASES | true | - |
| mensajes | Mensajes | Bandeja de entrada | MENSAJES | true | - |
| grupales | Act. grupales | Proyectos en equipo | GRUPALES | true | - |
| parents | Portal Padres | Seguimiento de tus hijos | PADRES | true | padres, admin |
| protegido | Colegio Protegido | Seguridad escolar | PROTEGIDO | true | - |
| tareas | Tareas | Gestión de actividades | TAREAS | true | - |
| aulas | Aulas Virtuales | Espacios de clase | AULAS | true | - |
| planificacion | Planificación | Jornalización docente | PLANIFICACION | true | - |
| matricula | Matrícula | Inscripciones en línea | MATRICULA | false | - |
| estudio | Estudio | Técnica Pomodoro | ESTUDIO | true | - |
| sakura-player | Sakura Player | Música con YouTube Music | SAKURA_PLAYER | true | - |
| configuracion | Configuración | Personaliza tu experiencia | CONFIGURACION | true | - |
| respaldos | Respaldos | Exportar / Importar mis datos | RESPALDOS | true | - |

Flags multiusuario desactivados: ROLES_DOCENTE, ASISTENCIA_DOCENTE, MATRICULA, EXPERIENCIAS, SABI.

## Roles definidos

ROLES_VALIDOS: estudiante, docente, director, subdirector, admin, coordinador, padres

## Flujos críticos por rol - propuesta

### Estudiante
Prioridad 1:
- Ver tareas pendientes / entregas del día
- Ver horario y clases del día
- Entregar archivos a aula / tarea
- Ver calificaciones y exámenes próximos

Prioridad 2:
- Agenda personal, Pomodoro
- Foros y mensajes
- Planificación personal

Ocultar / secundario:
- Sakura Player, configuración, respaldos

### Docente
Prioridad 1:
- Aulas Virtuales: tareas, entregas, calificaciones
- Planificación / Jornalización
- Horario y clases
- Asistencias

Prioridad 2:
- Exámenes, foros, mensajes grupales
- Agenda

### Padre
Prioridad 1:
- Portal Padres: asistencia, tareas, calificaciones, comunicación
- Calendario de eventos del hijo

### Admin / Director
Prioridad 1:
- Gestión de usuarios / auth
- Matrícula, asistencias
- Colegio Protegido, respaldos

## Recomendaciones de simplificación

1. Dashboard con core por rol: mostrar máximo 6 tarjetas en primer nivel.
2. Mover Sakura Player, Configuración, Respaldos a menú secundario “Herramientas”.
3. Agrupar Actividades + Tareas en un único acceso “Pendientes”.
4. Búsqueda global y atajos de teclado para tareas repetitivas.
5. Estados vacíos claros y acciones primarias visibles.
6. Consistencia de lenguaje: usar “Tareas”, no “Actividades” y “Tareas” separado.

## Próximos pasos
- Validar inventario con usuarios reales.
- Definir maqueta de dashboard por rol.
- Establecer reglas de visibilidad con feature flags.
