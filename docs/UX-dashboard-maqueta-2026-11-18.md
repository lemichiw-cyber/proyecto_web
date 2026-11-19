# UX Dashboard Maqueta por Rol — Cherry-Bomb 2026-11-18

Basado en inventario `UX-inventario-2026-11-18.md`. Sin cambios de código, solo propuesta de orden y visibilidad.

## Principios
- Máximo 6 tarjetas en primer nivel.
- 1 hero con resumen del día.
- Acceso secundario “Más” agrupa herramientas.
- Consistencia de iconografía y color.

## ESTUDIANTE

### Hero
¡Bienvenido, Nombre! Rol: Estudiante
Resumen: Pendientes hoy X, Clases hoy Y, Próximo examen Z

### Tarjetas core 1-6
1. Pendientes - Actividades + Tareas
   Icono clipboard-check, color pink
   Descripción: Entregas vencidas y próximas 24h
   Acción primaria: Ver

2. Horario del día
   Icono calendar-time, amber
   Descripción: Clases actuales y próximas
   Acción: Abrir horario

3. Aulas Virtuales
   Icono building-community, purple
   Descripción: Acceso rápido a tus aulas activas
   Acción: Entrar

4. Exámenes
   Icono file-text, purple
   Descripción: Próximos exámenes y simuladores
   Acción: Ver

5. Agenda
   Icono calendar-check, green
   Descripción: Plan diario personal
   Acción: Ver

6. Mensajes
   Icono mail, teal
   Descripción: Bandeja de entrada
   Acción: Leer

### Secundario “Más”
Foros, Calendario, Estudio Pomodoro, Planificación personal, Configuración, Respaldos, Sakura Player

## DOCENTE

### Hero
¡Bienvenido, Nombre! Rol: Docente
Resumen: Entregas pendientes de revisión X, Clases hoy Y, Aulas activas Z

### Tarjetas core 1-6
1. Aulas Virtuales
   Icono building-community, purple
   Descripción: Tareas, entregas, calificaciones
   Acción: Gestionar

2. Planificación
   Icono clipboard-data, #A78BFA
   Descripción: Jornalización y cuadro de notas
   Acción: Abrir

3. Pendientes de corrección
   Icono clipboard-list, #56CCF2
   Descripción: Entregas sin calificar
   Acción: Revisar

4. Horario
   Icono calendar-time, amber
   Descripción: Clases del día
   Acción: Ver

5. Exámenes
   Icono file-text, purple
   Descripción: Crear y publicar exámenes
   Acción: Crear

6. Mensajes grupales
   Icono users, orange
   Descripción: Comunicación con cursos
   Acción: Abrir

### Secundario “Más”
Actividades, Agenda, Calendario, Foros, Colegio Protegido, Configuración, Respaldos

## PADRE

### Hero
Portal Padres - Hijo: Nombre
Resumen: Asistencia mes, Tareas pendientes, Próximo evento

### Tarjetas core 1-6
1. Portal Padres
   Icono users-group, teal
   Descripción: Seguimiento académico
   Acción: Ver resumen

2. Asistencias
   Icono shield-check, red
   Descripción: Registro de asistencia del hijo
   Acción: Ver

3. Tareas del hijo
   Icono clipboard-check, pink
   Descripción: Entregas pendientes
   Acción: Ver

4. Calificaciones
   Icono file-text, purple
   Descripción: Notas por materia
   Acción: Ver

5. Comunicación
   Icono mail, teal
   Descripción: Mensajes del docente
   Acción: Leer

6. Calendario escolar
   Icono calendar, pink
   Descripción: Eventos y fechas importantes
   Acción: Ver

### Secundario “Más”
Configuración, Respaldos

## ADMIN / DIRECTOR / SUBDIRECTOR

### Hero
Panel administrativo
Resumen: Usuarios activos, Matrículas pendientes, Incidentes reportados

### Tarjetas core 1-6
1. Gestión de usuarios
   Icono user-plus, teal
   Descripción: Crear/editar roles
   Acción: Gestionar

2. Matrícula
   Icono user-plus, teal
   Descripción: Inscripciones en línea
   Acción: Ver solicitudes

3. Asistencias
   Icono shield-check, red
   Descripción: Reportes de asistencia
   Acción: Ver

4. Colegio Protegido
   Icono shield-check, red
   Descripción: Incidentes y seguridad
   Acción: Ver

5. Aulas Virtuales
   Icono building-community, purple
   Descripción: Supervisión general
   Acción: Explorar

6. Respaldos
   Icono device-floppy, #4ADE80
   Descripción: Exportar/importar datos
   Acción: Gestionar

### Secundario “Más”
Configuración, Planificación, Horario, Calendario

## Reglas de implementación
- appsData filtrar por rol en renderInicio.
- Mantener feature flags existentes.
- “Más” abre un modal de grid 3 columnas con apps secundarias.
- Iconos y colores ya definidos en appsData, no cambiar.
