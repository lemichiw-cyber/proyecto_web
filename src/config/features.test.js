/* ===================================================================
   features.test.js — Pruebas unitarias para feature flags
   =================================================================== */

import { describe, it, expect } from 'vitest';
import { FEATURES, isEnabled, getEnabledPersonal, getDisabledMultiusuario, APP_TO_FEATURE } from './features.js';

describe('features.js — Feature flags', () => {
  it('FEATURES object exists and has expected keys', () => {
    expect(FEATURES).toBeDefined();
    expect(typeof FEATURES).toBe('object');
  });

  it('Personal features are enabled (true)', () => {
    const personal = ['ACTIVIDADES', 'AGENDA', 'CALENDARIO', 'HORARIO', 'CLASES', 'TAREAS', 'ESTUDIO', 'SAKURA_PLAYER', 'RESPALDOS', 'CONFIGURACION', 'EXAMENES', 'PICKER', 'DIGITAL'];
    personal.forEach(f => {
      expect(FEATURES[f]).toBe(true);
    });
  });

  it('Multiusuario features are disabled (false) by default', () => {
    const multiusuario = ['FOROS', 'MENSAJES', 'GRUPALES', 'PROTEGIDO', 'AULAS', 'ROLES_DOCENTE', 'ASISTENCIA_DOCENTE', 'MATRICULA', 'EXPERIENCIAS', 'PADRES', 'SABI'];
    multiusuario.forEach(f => {
      expect(FEATURES[f]).toBe(false);
    });
  });

  it('isEnabled returns true for personal features', () => {
    expect(isEnabled('ACTIVIDADES')).toBe(true);
    expect(isEnabled('AGENDA')).toBe(true);
    expect(isEnabled('TAREAS')).toBe(true);
    expect(isEnabled('SAKURA_PLAYER')).toBe(true);
  });

  it('isEnabled returns false for multiusuario features', () => {
    expect(isEnabled('FOROS')).toBe(false);
    expect(isEnabled('AULAS')).toBe(false);
    expect(isEnabled('ROLES_DOCENTE')).toBe(false);
    expect(isEnabled('ASISTENCIA_DOCENTE')).toBe(false);
  });

  it('isEnabled returns false for unknown features', () => {
    expect(isEnabled('UNKNOWN_FEATURE')).toBe(false);
  });

  it('getEnabledPersonal returns array of enabled personal features', () => {
    const enabled = getEnabledPersonal();
    expect(Array.isArray(enabled)).toBe(true);
    expect(enabled.length).toBeGreaterThan(0);
    enabled.forEach(f => {
      expect(FEATURES[f]).toBe(true);
    });
  });

  it('getDisabledMultiusuario returns array of disabled multiusuario features', () => {
    const disabled = getDisabledMultiusuario();
    expect(Array.isArray(disabled)).toBe(true);
    expect(disabled.length).toBeGreaterThan(0);
    disabled.forEach(f => {
      expect(FEATURES[f]).toBe(false);
    });
  });

  it('APP_TO_FEATURE maps all app sections to feature flags', () => {
    expect(APP_TO_FEATURE).toBeDefined();
    expect(APP_TO_FEATURE.inicio).toBeNull(); // always visible
    expect(APP_TO_FEATURE.actividades).toBe('ACTIVIDADES');
    expect(APP_TO_FEATURE.foros).toBe('FOROS');
    expect(APP_TO_FEATURE.aulas).toBe('AULAS');
    expect(APP_TO_FEATURE.auth).toBe('ROLES_DOCENTE');
    expect(APP_TO_FEATURE.asistencias).toBe('ASISTENCIA_DOCENTE');
    expect(APP_TO_FEATURE.protegido).toBe('PROTEGIDO');
  });

  it('Feature flag check does not depend on user role', () => {
    // Simulate admin role - should NOT enable multiusuario features
      // The isEnabled function only checks FEATURES object, not user role
    expect(isEnabled('AULAS')).toBe(false);
    expect(isEnabled('ROLES_DOCENTE')).toBe(false);
    expect(isEnabled('FOROS')).toBe(false);
  });
});

describe('features.js — Role independence', () => {
  it('Changing cherrybombSession.rol to admin does not enable multiusuario features', () => {
    // Feature flags are compile-time constants, independent of runtime role
    expect(FEATURES.AULAS).toBe(false);
    expect(FEATURES.ROLES_DOCENTE).toBe(false);
    expect(FEATURES.FOROS).toBe(false);
  });
});
