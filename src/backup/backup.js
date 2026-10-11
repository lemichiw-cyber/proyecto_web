/* ===================================================================
   backup.js — Exportación / Importación de datos del estudiante
   Módulo sin DOM, cargado bajo demanda con import()
   =================================================================== */

export const BACKUP_SCHEMA_VERSION = 1;
export const APP_NAME = 'Cherry-Bomb';

/* ------------------------------------------------------------------
   Lista blanca de claves a exportar (sin datos de otros usuarios)
   ------------------------------------------------------------------ */
export const WHITELIST_KEYS = new Set([
  // Config UI
  'cherrybombTheme',
  'cherrybombVol',
  'cherrybombPomodoro',
  'cherrybombNotifPermission',
  'cherrybombNotifReminders',
  'claseAvisos',

  // Sakura Player
  'sp_eq',
  'sp_mixer',
  'sp_theme',
  'sp_theme_mode',
  'sp_animations',
  'sp_theme_mode', // duplicado intencional para claridad
  'LS_KEY', // biblioteca local del player

  // Datos del estudiante (propios)
  'actividades',
  'agendaItems',
  'asistencia_historial',
  'calEventos',
  'clasesItems',
  'foros',
  'horarioItems',
  'mensajesItems',
  'gruposItems',
  'protegidoItems',
  'bachillerato_tareas',
  'bachillerato_entregas',
  'bachillerato_examenes',
  'bachillerato_exam_resultados',
  'bachillerato_plan_trabajo',
  'planificaciones',
  'planData',
  'cherrybombPomodoro',
]);

/* Claves que NUNCA se exportan (sensibles o datos de otros) */
export const EXCLUDED_KEYS = new Set([
  'cherrybombSession',
  'cherrybombCuentas',
  'cherrybombApiBase',
  'aulas',
  'aula_inscripciones',
  'estudiantes_db',
  'aula_entregas',
  'aula_calificaciones',
  'aula_asistencia',
  'aula_tareas',
  // passHash_* se detectan por prefijo
]);

/* Prefijos de claves a excluir (p. ej. passHash_*) */
export const EXCLUDED_PREFIXES = [
  'passHash_',
];

/* ------------------------------------------------------------------
   Utilidades
   ------------------------------------------------------------------ */
function isExcluded(key) {
  if (EXCLUDED_KEYS.has(key)) return true;
  for (const prefix of EXCLUDED_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  // En entorno sin DOM (tests, SSR), usar reemplazo simple
  if (typeof document === 'undefined' || !document.createElement) {
    return text
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;');
  }
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

function deepSanitize(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepSanitize(v);
    }
    return out;
  }
  return obj;
}

/* ------------------------------------------------------------------
   Exportación
   ------------------------------------------------------------------ */
export function collectBackupData() {
  const lsData = {};
  let included = 0;
  let excluded = 0;
  const categories = { config: 0, estudiante: 0, sakuraPlayer: 0, excluidas: 0 };

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (isExcluded(key)) {
      excluded++;
      categories.excluidas++;
      continue;
    }

    if (!WHITELIST_KEYS.has(key)) {
      // Clave no listada: por seguridad, no la incluimos
      excluded++;
      categories.excluidas++;
      continue;
    }

    try {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const parsed = JSON.parse(raw);
      lsData[key] = deepSanitize(parsed);
      included++;

      // Categorizar para meta
      if (['cherrybombTheme', 'cherrybombVol', 'cherrybombPomodoro', 'cherrybombNotifPermission', 'cherrybombNotifReminders', 'claseAvisos'].includes(key)) {
        categories.config++;
      } else if (['sp_eq', 'sp_mixer', 'sp_theme', 'sp_theme_mode', 'sp_animations', 'LS_KEY'].includes(key)) {
        categories.sakuraPlayer++;
      } else {
        categories.estudiante++;
      }
    } catch (e) {
      console.warn('[Backup] Error parseando', key, e);
      excluded++;
    }
  }

  const meta = {
    localStorageKeys: included,
    indexedDBStores: 0,
    totalBytes: JSON.stringify(lsData).length,
    categories,
    excludedKeys: excluded,
  };

  return { lsData, meta };
}

export function generateBackupJSON() {
  const { lsData, meta } = collectBackupData();
  const now = new Date().toISOString();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

  const backup = {
    app: APP_NAME,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    origin,
    data: {
      localStorage: lsData,
      indexedDB: {},
      meta,
    },
  };

  return backup;
}

export function downloadBackup(backup, filename) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `respaldo-${APP_NAME.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareBackup(backup, filename) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], filename || `respaldo-${APP_NAME.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });

  if (navigator.share && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Respaldo Cherry-Bomb' });
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('[Backup] Share falló, usando descarga:', e);
    }
  }
  return false;
}

/* ------------------------------------------------------------------
   Importación / Validación
   ------------------------------------------------------------------ */
export const MAX_BACKUP_SIZE = 10 * 1024 * 1024; // 10 MB

export function validateBackup(jsonString) {
  if (!jsonString || jsonString.length > MAX_BACKUP_SIZE) {
    return { ok: false, error: 'Archivo demasiado grande o vacío (máx. 10 MB)' };
  }

  let backup;
  try {
    backup = JSON.parse(jsonString);
  } catch (e) {
    return { ok: false, error: 'No es un JSON válido' };
  }

  // Campos obligatorios
  if (backup.app !== APP_NAME) {
    return { ok: false, error: `App distinta: esperaba "${APP_NAME}", recibió "${backup.app}"` };
  }

  if (typeof backup.schemaVersion !== 'number') {
    return { ok: false, error: 'Falta schemaVersion' };
  }

  if (backup.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: `Versión ${backup.schemaVersion} no soportada (máx. ${BACKUP_SCHEMA_VERSION}). Actualiza la app.` };
  }

  if (!backup.data || typeof backup.data !== 'object') {
    return { ok: false, error: 'Estructura inválida: falta data' };
  }

  if (!backup.data.localStorage || typeof backup.data.localStorage !== 'object') {
    return { ok: false, error: 'Estructura inválida: falta data.localStorage' };
  }

  // Validar claves: solo lista blanca
  const lsData = backup.data.localStorage;
  const invalidKeys = [];
  for (const key of Object.keys(lsData)) {
    if (!WHITELIST_KEYS.has(key)) {
      invalidKeys.push(key);
    }
  }
  if (invalidKeys.length > 0) {
    return { ok: false, error: `Claves no permitidas en el respaldo: ${invalidKeys.join(', ')}` };
  }

  // Validar tipos básicos por clave conocida
  for (const [key, value] of Object.entries(lsData)) {
    if (value === null || value === undefined) continue;
    const type = Array.isArray(value) ? 'array' : typeof value;
    if (type !== 'object' && type !== 'array' && type !== 'string' && type !== 'number' && type !== 'boolean') {
      return { ok: false, error: `Tipo inválido para ${key}: ${type}` };
    }
  }

  return { ok: true, backup };
}

/* ------------------------------------------------------------------
   Importación — modos
   ------------------------------------------------------------------ */
export const IMPORT_MODE = {
  REPLACE: 'replace',  // Reemplaza todo (borra claves no en backup)
  MERGE: 'merge',      // Combina: claves en backup ganan; otras se mantienen
};

export function importBackup(backup, mode = IMPORT_MODE.REPLACE) {
  const lsData = backup.data.localStorage;
  let imported = 0;
  let skipped = 0;
  const errors = [];

  // Backup del estado actual (para rollback)
  const previousState = {};
  for (const key of WHITELIST_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) previousState[key] = val;
  }

  try {
    if (mode === IMPORT_MODE.REPLACE) {
      // Borrar claves de la lista blanca que no vengan en el backup
      for (const key of WHITELIST_KEYS) {
        if (key in lsData) {
          try {
            localStorage.setItem(key, JSON.stringify(lsData[key]));
            imported++;
          } catch (e) {
            errors.push(`Error guardando ${key}: ${e.message}`);
            skipped++;
          }
        } else {
          localStorage.removeItem(key);
        }
      }
    } else { // MERGE
      for (const [key, value] of Object.entries(lsData)) {
        if (!WHITELIST_KEYS.has(key)) continue;
        try {
          localStorage.setItem(key, JSON.stringify(value));
          imported++;
        } catch (e) {
          errors.push(`Error guardando ${key}: ${e.message}`);
          skipped++;
        }
      }
    }
  } catch (e) {
    // Rollback
    for (const [key, value] of Object.entries(previousState)) {
      localStorage.setItem(key, value);
    }
    for (const key of WHITELIST_KEYS) {
      if (!(key in previousState)) localStorage.removeItem(key);
    }
    return { ok: false, error: `Falló la importación: ${e.message}`, imported: 0 };
  }

  return { ok: true, imported, skipped, errors };
}

/* ------------------------------------------------------------------
   Vista previa de importación (para UI)
   ------------------------------------------------------------------ */
export function previewImport(jsonString) {
  const validation = validateBackup(jsonString);
  if (!validation.ok) return validation;

  const backup = validation.backup;
  const lsData = backup.data.localStorage;
  const preview = {};

  for (const [key, value] of Object.entries(lsData)) {
    let count = 0;
    let type = typeof value;
    if (Array.isArray(value)) {
      count = value.length;
      type = 'array';
    } else if (type === 'object' && value !== null) {
      count = Object.keys(value).length;
    } else if (type === 'string') {
      count = value.length;
    } else if (type === 'number') {
      count = 1;
    } else if (type === 'boolean') {
      count = 1;
    }
    preview[key] = { type, count };
  }

  return { ok: true, preview, meta: backup.data.meta };
}

/* ------------------------------------------------------------------
   Detección de migración (para UI)
   ------------------------------------------------------------------ */
export function isLegacyOrigin(legacyOrigins = []) {
  if (typeof window === 'undefined') return false;
  const current = window.location.origin;
  return legacyOrigins.some(o => current === o || current.startsWith(o));
}

export function hasLocalData() {
  for (const key of WHITELIST_KEYS) {
    if (localStorage.getItem(key) !== null) return true;
  }
  return false;
}