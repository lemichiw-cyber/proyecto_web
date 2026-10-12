/* ===================================================================
   features.js — Feature flags (compile-time constants)
   These control which sections are available.
   Multiusuario features are OFF by default (require real backend).
   =================================================================== */

/**
 * Feature flags — set at build time (vite.define or manual edit).
 * DO NOT read from localStorage or make runtime-configurable.
 * Changing these requires rebuild + redeploy.
 */
export const FEATURES = {
  // ===== FUNCIONES PERSONALES (siempre activas) =====
  // Organizador personal del estudiante en su dispositivo
  ACTIVIDADES: true,        // app-actividades
  AGENDA: true,             // app-agenda
  CALENDARIO: true,         // app-calendario
  HORARIO: true,            // app-horario
  CLASES: true,             // app-clases
  TAREAS: true,             // app-tareas (bachillerato_tareas)
  ESTUDIO: true,            // app-estudio (Pomodoro)
  SAKURA_PLAYER: true,      // app-sakura-player
  RESPALDOS: true,          // app-respaldos
  CONFIGURACION: true,      // app-configuracion
  EXAMENES: true,           // app-examenes (bachillerato_examenes)
  PICKER: true,             // app-picker (componente UI)
  DIGITAL: true,            // app-digital (si se usa)

  // ===== FUNCIONES MULTIUSUARIO (desactivadas por defecto) =====
  // Requieren backend real con autenticación, base de datos, RLS
  FOROS: false,             // app-foros
  MENSAJES: false,          // app-mensajes
  GRUPALES: false,          // app-grupales
  PROTEGIDO: false,         // app-protegido (reportes de incidentes)
  AULAS: false,             // app-aulas + aula_inscripciones, aula_tareas, aula_entregas, aula_calificaciones, aula_asistencia
  ROLES_DOCENTE: false,     // app-planificacion, app-auth (panel admin), app-asistencias
  ASISTENCIA_DOCENTE: false, // app-asistencias
  MATRICULA: false,         // app-matricula (inscripciones, estudiantes_db)
  EXPERIENCIAS: false,      // app-experiencias (si requiere datos de otros)
  PADRES: false,            // app-parents (portal padres)
  SABI: false,              // app-sabi (alertas/sistema comunicación)
};

/**
 * Helper: check if a feature is enabled.
 * @param {keyof typeof FEATURES} feature
 * @returns {boolean}
 */
export function isEnabled(feature) {
  return FEATURES[feature] === true;
}

/**
 * Helper: get all enabled personal features.
 * @returns {string[]}
 */
export function getEnabledPersonal() {
  return Object.entries(FEATURES)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
}

/**
 * Helper: get all disabled multiusuario features.
 * @returns {string[]}
 */
export function getDisabledMultiusuario() {
  return Object.entries(FEATURES)
    .filter(([, v]) => v === false)
    .map(([k]) => k);
}

/**
 * Map app section IDs to feature flags.
 * Used by UI to decide visibility/access.
 */
export const APP_TO_FEATURE = {
  'inicio': null,                    // siempre visible
  'actividades': 'ACTIVIDADES',
  'foros': 'FOROS',
  'agenda': 'AGENDA',
  'calendario': 'CALENDARIO',
  'horario': 'HORARIO',
  'clases': 'CLASES',
  'mensajes': 'MENSAJES',
  'grupales': 'GRUPALES',
  'protegido': 'PROTEGIDO',
  'tareas': 'TAREAS',
  'aulas': 'AULAS',
  'planificacion': 'ROLES_DOCENTE',
  'matricula': 'MATRICULA',
  'estudio': 'ESTUDIO',
  'sakura-player': 'SAKURA_PLAYER',
  'configuracion': 'CONFIGURACION',
  'respaldos': 'RESPALDOS',
  'auth': 'ROLES_DOCENTE',           // panel admin/roles
  'asistencias': 'ASISTENCIA_DOCENTE',
  'examenes': 'EXAMENES',
  'experiencias': 'EXPERIENCIAS',
  'parents': 'PADRES',
  'sabi': 'SABI',
  'picker': 'PICKER',
  'digital': 'DIGITAL',
};
