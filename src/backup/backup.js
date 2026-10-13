/* ===================================================================
   backup.js — Exportación / Importación de datos del estudiante
   Módulo sin DOM, cargado bajo demanda con import()
   =================================================================== */

import { CLAVES, PREFIJO } from '../bachillerato/storage.js';

export const BACKUP_SCHEMA_VERSION = 1;
export const APP_NAME = 'Cherry-Bomb';

/* ------------------------------------------------------------------
   Claves de las funciones de bachillerato (cb.bach.*).

   Se derivan de CLAVES en vez de escribirse a mano, para que si algún
   día se añade una clave nueva al módulo de datos entre sola en el
   respaldo sin tener que tocar dos archivos.

   `sistema.ahorro` queda fuera: es una preferencia del aparato y de la
   conexión del momento, no algo que el estudiante quiera llevarse a
   otro dispositivo.
   ------------------------------------------------------------------ */
export const BACHILLERATO_KEYS = Object.values(CLAVES)
  .map((clave) => PREFIJO + clave)
  .filter((claveCompleta) => claveCompleta !== PREFIJO + CLAVES.MODO_AHORRO);

/* ------------------------------------------------------------------
   Lista blanca de claves a exportar (sin datos de otros usuarios)
   ------------------------------------------------------------------ */
export const WHITELIST_KEYS = new Set([
  // Config UI
  'cherrybombTheme',
  'cherrybombVol',
  'cherrybombPomodoro',
  'cherrybombNotifReminders',
  'claseAvisos',

  // Sakura Player
  'sp_eq',
  'sp_mixer',
  'sp_theme',
  'sp_theme_mode',
  'sp_animations',
  'sp_library_v1', // biblioteca local del player (LS_KEY = 'sp_library_v1')

  // Datos del estudiante (propios - SOLO claves personales, sin datos de otros)
  'actividades',          // propias
  'agendaItems',          // propias
  'calEventos',           // propias
  'clasesItems',          // propias
  'horarioItems',         // propias
  'bachillerato_tareas',
  'bachillerato_entregas',
  'bachillerato_examenes',
  'bachillerato_exam_resultados',
  'bachillerato_plan_trabajo',
  'planificaciones',
  'planData',
  'cherrybombPomodoro',
  'nuevaClaveListaBlanca', // test key

  // Funciones de bachillerato (cb.bach.notas.*, cb.bach.paes.*, …)
  ...BACHILLERATO_KEYS,
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
  // Datos globales con info de otros usuarios (foros, mensajes, grupos)
  'foros',
  'mensajesItems',
  'gruposItems',
  'asistencia_historial',
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

/* Temas válidos para cherrybombTheme */
const VALID_THEMES = new Set([
  'light', 'dark', 'pastel', 'sunset', 'dawn', 'ocean', 'mlp',
  'chicawa', 'sakura', 'paraiso', 'frutiger', 'dreamcore', 'sakura-player'
]);

/* Límite de tamaño para strings (100 KB) */
const MAX_STRING_LENGTH = 100 * 1024;

/* ------------------------------------------------------------------
   Validación de valores por clave
   ------------------------------------------------------------------ */
function validateValue(key, value) {
  if (value === null || value === undefined) return { ok: true };

  // Validar strings
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      return { ok: false, error: `String demasiado largo para ${key} (máx. ${MAX_STRING_LENGTH} chars)` };
    }
    // Validaciones específicas por clave
    if (key === 'cherrybombTheme' && !VALID_THEMES.has(value)) {
      return { ok: false, error: `Tema inválido: ${value}` };
    }
    if (key === 'cherrybombVol') {
      const vol = parseFloat(value);
      if (isNaN(vol) || vol < 0 || vol > 1) {
        return { ok: false, error: `Volumen inválido: ${value} (debe ser 0-1)` };
      }
    }
    return { ok: true };
  }

  // Validar arrays
  if (Array.isArray(value)) {
    if (value.length > 10000) {
      return { ok: false, error: `Array demasiado largo para ${key} (máx. 10000 items)` };
    }
    for (const item of value) {
      const itemCheck = validateValue(key, item);
      if (!itemCheck.ok) return itemCheck;
    }
    return { ok: true };
  }

  // Validar objetos
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 5000) {
      return { ok: false, error: `Objeto con demasiadas claves para ${key} (máx. 5000)` };
    }
    for (const k of keys) {
      const itemCheck = validateValue(`${key}.${k}`, value[k]);
      if (!itemCheck.ok) return itemCheck;
    }
    return { ok: true };
  }

  // number, boolean: OK
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { ok: true };
  }

  return { ok: false, error: `Tipo no soportado para ${key}: ${typeof value}` };
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
      // Validar en exportación también (detecta datos corruptos)
      const check = validateValue(key, parsed);
      if (!check.ok) {
        console.warn('[Backup] Valor inválido en exportación', key, check.error);
        excluded++;
        categories.excluidas++;
        continue;
      }
      lsData[key] = parsed; // Sin sanitizar: se guarda tal cual
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

  // Validar todos los valores ANTES de escribir
  for (const [key, value] of Object.entries(lsData)) {
    if (!WHITELIST_KEYS.has(key)) {
      errors.push(`Clave no permitida: ${key}`);
      skipped++;
      continue;
    }
    const check = validateValue(key, value);
    if (!check.ok) {
      errors.push(`Valor inválido para ${key}: ${check.error}`);
      skipped++;
      continue;
    }
  }
  if (skipped > 0 && imported === 0) {
    return { ok: false, error: 'Todos los valores son inválidos: ' + errors.join('; '), imported: 0 };
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