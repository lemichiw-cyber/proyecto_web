/* ===================================================================
   backup.test.js — Pruebas unitarias para backup.js
   =================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  APP_NAME,
  WHITELIST_KEYS,
  EXCLUDED_KEYS,
  EXCLUDED_PREFIXES,
  MAX_BACKUP_SIZE,
  IMPORT_MODE,
  generateBackupJSON,
  validateBackup,
  importBackup,
  previewImport,
  isLegacyOrigin,
  hasLocalData,
} from './backup.js';
import { escapeHtml } from '../utils/escape.js';

/* ------------------------------------------------------------------
   Mock de localStorage
   ------------------------------------------------------------------ */
const createStorageMock = () => {
  const store = new Map();
  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, value)),
    removeItem: vi.fn((key) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    get length() { return store.size; },
    key: vi.fn((i) => Array.from(store.keys())[i] ?? null),
    _store: store,
  };
};

describe('backup.js — Lista blanca y exclusiones', () => {
  it('WHITELIST_KEYS contiene claves de config UI', () => {
    expect(WHITELIST_KEYS.has('cherrybombTheme')).toBe(true);
    expect(WHITELIST_KEYS.has('cherrybombVol')).toBe(true);
    expect(WHITELIST_KEYS.has('cherrybombPomodoro')).toBe(true);
    expect(WHITELIST_KEYS.has('cherrybombNotifReminders')).toBe(true);
    expect(WHITELIST_KEYS.has('claseAvisos')).toBe(true);
  });

  it('WHITELIST_KEYS contiene claves de Sakura Player', () => {
    expect(WHITELIST_KEYS.has('sp_eq')).toBe(true);
    expect(WHITELIST_KEYS.has('sp_mixer')).toBe(true);
    expect(WHITELIST_KEYS.has('sp_theme')).toBe(true);
    expect(WHITELIST_KEYS.has('sp_theme_mode')).toBe(true);
    expect(WHITELIST_KEYS.has('sp_animations')).toBe(true);
    expect(WHITELIST_KEYS.has('sp_library_v1')).toBe(true);
  });

  it('WHITELIST_KEYS contiene claves de datos de estudiante', () => {
    expect(WHITELIST_KEYS.has('actividades')).toBe(true);
    expect(WHITELIST_KEYS.has('agendaItems')).toBe(true);
    expect(WHITELIST_KEYS.has('bachillerato_tareas')).toBe(true);
    expect(WHITELIST_KEYS.has('bachillerato_entregas')).toBe(true);
    expect(WHITELIST_KEYS.has('bachillerato_examenes')).toBe(true);
    expect(WHITELIST_KEYS.has('bachillerato_exam_resultados')).toBe(true);
    expect(WHITELIST_KEYS.has('bachillerato_plan_trabajo')).toBe(true);
    expect(WHITELIST_KEYS.has('planificaciones')).toBe(true);
  });

  it('EXCLUDED_KEYS contiene claves sensibles', () => {
    expect(EXCLUDED_KEYS.has('cherrybombSession')).toBe(true);
    expect(EXCLUDED_KEYS.has('cherrybombCuentas')).toBe(true);
    expect(EXCLUDED_KEYS.has('cherrybombApiBase')).toBe(true);
    expect(EXCLUDED_KEYS.has('aulas')).toBe(true);
    expect(EXCLUDED_KEYS.has('aula_inscripciones')).toBe(true);
    expect(EXCLUDED_KEYS.has('estudiantes_db')).toBe(true);
    expect(EXCLUDED_KEYS.has('aula_entregas')).toBe(true);
    expect(EXCLUDED_KEYS.has('aula_calificaciones')).toBe(true);
    expect(EXCLUDED_KEYS.has('aula_asistencia')).toBe(true);
    expect(EXCLUDED_KEYS.has('aula_tareas')).toBe(true);
  });

  it('EXCLUDED_PREFIXES incluye passHash_', () => {
    expect(EXCLUDED_PREFIXES).toContain('passHash_');
  });

  it('Ninguna clave excluida está en la lista blanca', () => {
    for (const key of EXCLUDED_KEYS) {
      expect(WHITELIST_KEYS.has(key)).toBe(false);
    }
  });
});

describe('generateBackupJSON', () => {
  let originalLS;

  beforeEach(() => {
    originalLS = global.localStorage;
    global.localStorage = createStorageMock();
    localStorage.setItem('cherrybombTheme', '"sakura"');
    localStorage.setItem('cherrybombVol', '0.7');
    localStorage.setItem('actividades', JSON.stringify([{ id: 1, titulo: 'Tarea 1' }]));
    localStorage.setItem('sp_eq', JSON.stringify([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    // Clave excluida no debe aparecer
    localStorage.setItem('cherrybombSession', JSON.stringify({ email: 'test@test.com', rol: 'estudiante' }));
    localStorage.setItem('passHash_test', 'hash123');
  });

  afterEach(() => {
    global.localStorage = originalLS;
  });

  it('genera JSON con estructura correcta', () => {
    const backup = generateBackupJSON();
    expect(backup.app).toBe(APP_NAME);
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(backup.exportedAt).toBeDefined();
    expect(backup.origin).toBeDefined();
    expect(backup.data).toBeDefined();
    expect(backup.data.localStorage).toBeDefined();
    expect(backup.data.indexedDB).toEqual({});
    expect(backup.data.meta).toBeDefined();
  });

  it('incluye solo claves de la lista blanca', () => {
    const backup = generateBackupJSON();
    const lsData = backup.data.localStorage;
    expect(lsData.cherrybombTheme).toBeDefined();
    expect(lsData.cherrybombVol).toBeDefined();
    expect(lsData.actividades).toBeDefined();
    expect(lsData.sp_eq).toBeDefined();
  });

  it('EXCLUYE claves sensibles (cherrybombSession, passHash_*)', () => {
    const backup = generateBackupJSON();
    const lsData = backup.data.localStorage;
    expect(lsData.cherrybombSession).toBeUndefined();
    expect(lsData.passHash_test).toBeUndefined();
  });

  it('meta contiene conteos correctos', () => {
    const backup = generateBackupJSON();
    expect(backup.data.meta.localStorageKeys).toBeGreaterThan(0);
    expect(backup.data.meta.categories).toBeDefined();
    expect(backup.data.meta.excludedKeys).toBeGreaterThan(0);
  });
});

describe('validateBackup', () => {
  const validBackup = {
    app: APP_NAME,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    origin: 'https://example.com',
    data: {
      localStorage: {
        cherrybombTheme: 'sakura',
        actividades: [{ id: 1 }],
        sp_eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      indexedDB: {},
      meta: { localStorageKeys: 3, categories: { config: 1, estudiante: 1, sakuraPlayer: 1, excluidas: 0 } },
    },
  };

  it('acepta backup válido', () => {
    const result = validateBackup(JSON.stringify(validBackup));
    expect(result.ok).toBe(true);
    expect(result.backup).toBeDefined();
  });

  it('rechaza JSON inválido', () => {
    const result = validateBackup('no es json');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('JSON válido');
  });

  it('rechaza app distinta', () => {
    const bad = { ...validBackup, app: 'OtraApp' };
    const result = validateBackup(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('App distinta');
  });

  it('rechaza schemaVersion mayor', () => {
    const bad = { ...validBackup, schemaVersion: BACKUP_SCHEMA_VERSION + 1 };
    const result = validateBackup(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no soportada');
  });

  it('rechaza claves no permitidas', () => {
    const bad = {
      ...validBackup,
      data: { ...validBackup.data, localStorage: { ...validBackup.data.localStorage, claveMala: 'valor' } },
    };
    const result = validateBackup(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Claves no permitidas');
  });

  it('rechaza archivo demasiado grande', () => {
    const huge = 'x'.repeat(MAX_BACKUP_SIZE + 1);
    const result = validateBackup(huge);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('demasiado grande');
  });
});

describe('importBackup', () => {
  let originalLS;

  beforeEach(() => {
    originalLS = global.localStorage;
    global.localStorage = createStorageMock();
    // Estado inicial
    localStorage.setItem('cherrybombTheme', '"dark"');
    localStorage.setItem('actividades', JSON.stringify([{ id: 1, titulo: 'Existente' }]));
    localStorage.setItem('sp_eq', JSON.stringify([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]));
  });

  afterEach(() => {
    global.localStorage = originalLS;
  });

  const backup = {
    app: APP_NAME,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    origin: 'https://example.com',
    data: {
      localStorage: {
        cherrybombTheme: 'sakura',
        actividades: [{ id: 2, titulo: 'Nueva' }],
        sp_eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        nuevaClaveListaBlanca: 'valor', // en whitelist
      },
      indexedDB: {},
      meta: {},
    },
  };

  it('modo REPLACE: reemplaza claves y borra las que no vienen', () => {
    const result = importBackup(backup, IMPORT_MODE.REPLACE);
    expect(result.ok).toBe(true);
    expect(result.imported).toBeGreaterThan(0);
    expect(localStorage.getItem('cherrybombTheme')).toBe('"sakura"');
    expect(JSON.parse(localStorage.getItem('actividades'))).toEqual([{ id: 2, titulo: 'Nueva' }]);
    expect(JSON.parse(localStorage.getItem('sp_eq'))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // clave que no venía en backup se borra (solo claves en whitelist)
  });

  it('modo MERGE: combina, claves del backup ganan', () => {
    const result = importBackup(backup, IMPORT_MODE.MERGE);
    expect(result.ok).toBe(true);
    expect(localStorage.getItem('cherrybombTheme')).toBe('"sakura"'); // backup gana
    expect(JSON.parse(localStorage.getItem('actividades'))).toEqual([{ id: 2, titulo: 'Nueva' }]); // backup gana
    expect(JSON.parse(localStorage.getItem('sp_eq'))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // backup gana
  });

  it('fallo en una clave no rompe la importación (se registra error y continúa)', () => {
    // Simular error en una clave específica
    const originalSetItem = localStorage.setItem;
    
    
    localStorage.setItem = vi.fn((key, value) => {
      callCount++;
      if (key === 'cherrybombTheme') throw new Error('Storage full');
      originalSetItem.call(localStorage, key, value);
    });

    const result = importBackup(backup, IMPORT_MODE.REPLACE);
    expect(result.ok).toBe(true); // Importación sigue OK
    expect(result.errors.length).toBeGreaterThan(0); // pero registra error
    expect(result.errors[0]).toContain('cherrybombTheme');
    expect(result.skipped).toBeGreaterThan(0);

    localStorage.setItem = originalSetItem;
  });
});

describe('previewImport', () => {
  const validBackup = {
    app: APP_NAME,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    origin: 'https://example.com',
    data: {
      localStorage: {
        cherrybombTheme: 'sakura',
        actividades: [{ id: 1 }, { id: 2 }],
        sp_eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      indexedDB: {},
      meta: {},
    },
  };

  it('devuelve vista previa con conteos por clave', () => {
    const result = previewImport(JSON.stringify(validBackup));
    expect(result.ok).toBe(true);
    expect(result.preview.cherrybombTheme).toEqual({ type: 'string', count: 6 });
    expect(result.preview.actividades).toEqual({ type: 'array', count: 2 });
    expect(result.preview.sp_eq).toEqual({ type: 'array', count: 10 });
  });

  it('rechaza backup inválido', () => {
    const result = previewImport('{invalid');
    expect(result.ok).toBe(false);
  });
});

describe('isLegacyOrigin / hasLocalData', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'https://legacy.example.com' } });
    global.localStorage = createStorageMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detecta origen legacy', () => {
    expect(isLegacyOrigin(['https://legacy.example.com'])).toBe(true);
    expect(isLegacyOrigin(['https://otro.com'])).toBe(false);
  });

  it('detecta si hay datos locales', () => {
    global.localStorage.setItem('cherrybombTheme', '"sakura"');
    expect(hasLocalData()).toBe(true);
    global.localStorage.clear();
    expect(hasLocalData()).toBe(false);
  });
});

describe("escapeHtml attribute safety", () => {
  it('escapes quotes and angle brackets in attribute context', () => {
    const malicious = '" onmouseover="x';
    const escaped = escapeHtml(malicious);
    // The escaped string should not contain unescaped quotes or angle brackets
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    // The escaped value should be the original with entities (" becomes ")
    expect(escaped).toBe('" onmouseover="x');
  });
});
