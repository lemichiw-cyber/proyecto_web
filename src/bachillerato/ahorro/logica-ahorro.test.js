import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  decidirModoAhorro,
  conexionDelNavegador,
  normalizarModo,
  aplicarModoAhorro,
} from './logica-ahorro.js';

describe('decidirModoAhorro', () => {
  it('respeta cuando el estudiante lo apaga a mano', () => {
    expect(decidirModoAhorro({ saveData: true, guardado: { activo: false } }).activo).toBe(false);
    expect(decidirModoAhorro({ saveData: true, guardado: false }).activo).toBe(false);
    expect(decidirModoAhorro({ efectivo: '2g', guardado: { modo: 'nunca', activo: false } }).activo).toBe(false);
  });

  it('respeta cuando el estudiante lo enciende a mano', () => {
    expect(decidirModoAhorro({ saveData: false, guardado: { activo: true } }).activo).toBe(true);
    expect(decidirModoAhorro({ saveData: false, guardado: true }).activo).toBe(true);
    expect(decidirModoAhorro({ efectivo: '4g', guardado: { modo: 'siempre', activo: true } }).activo).toBe(true);
  });

  it('en automático se activa con datos limitados o red lenta', () => {
    expect(decidirModoAhorro({ saveData: true }).activo).toBe(true);
    expect(decidirModoAhorro({ efectivo: '2g' }).activo).toBe(true);
    expect(decidirModoAhorro({ efectivo: 'slow-2g' }).activo).toBe(true);
    expect(decidirModoAhorro({ efectivo: '4g' }).activo).toBe(false);
    expect(decidirModoAhorro({}).activo).toBe(false);
  });

  it('explica siempre el motivo (para mostrarlo en la tarjeta)', () => {
    expect(decidirModoAhorro({ saveData: true }).motivo).toMatch(/datos móviles/);
    expect(decidirModoAhorro({ efectivo: '2g' }).motivo).toMatch(/lenta/);
    expect(decidirModoAhorro({}).motivo).toMatch(/normal/);
    expect(decidirModoAhorro({ guardado: false }).motivo).toMatch(/manualmente/);
  });

  it('un modo "auto" guardado deja decidir a la red', () => {
    expect(decidirModoAhorro({ saveData: true, guardado: { modo: 'auto' } }).activo).toBe(true);
    expect(decidirModoAhorro({ saveData: false, guardado: { modo: 'auto' } }).activo).toBe(false);
  });

  it('no explota con entradas vacías', () => {
    expect(decidirModoAhorro().activo).toBe(false);
    expect(decidirModoAhorro({ guardado: null }).activo).toBe(false);
  });
});

describe('conexionDelNavegador', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lee saveData y effectiveType si existen', () => {
    vi.stubGlobal('navigator', { connection: { saveData: true, effectiveType: '3g' } });
    expect(conexionDelNavegador()).toEqual({ saveData: true, efectivo: '3g' });
  });

  it('devuelve vacío cuando el navegador no informa la conexión', () => {
    vi.stubGlobal('navigator', {});
    expect(conexionDelNavegador()).toEqual({ saveData: false, efectivo: '' });
  });

  it('tolera saveData no booleano y effectiveType que no es texto', () => {
    vi.stubGlobal('navigator', { connection: { saveData: 'yes', effectiveType: 42 } });
    expect(conexionDelNavegador()).toEqual({ saveData: false, efectivo: '' });
  });
});

describe('normalizarModo', () => {
  it('usa "auto" cuando no hay nada guardado', () => {
    expect(normalizarModo(undefined)).toBe('auto');
    expect(normalizarModo(null)).toBe('auto');
    expect(normalizarModo({})).toBe('auto');
    expect(normalizarModo({ modo: 'auto' })).toBe('auto');
  });

  it('reconoce "siempre"', () => {
    expect(normalizarModo({ modo: 'siempre', activo: true })).toBe('siempre');
    expect(normalizarModo({ activo: true })).toBe('siempre');
  });

  it('reconoce "nunca"', () => {
    expect(normalizarModo({ modo: 'nunca', activo: false })).toBe('nunca');
    expect(normalizarModo({ modo: 'algo-desconocido' })).toBe('nunca');
  });
});

describe('aplicarModoAhorro', () => {
  it('cambia el atributo sólo cuando hace falta', () => {
    const atributos = new Map();
    const raiz = {
      getAttribute: (k) => (atributos.has(k) ? atributos.get(k) : null),
      setAttribute: (k, v) => atributos.set(k, v),
    };
    const doc = { documentElement: raiz };

    expect(aplicarModoAhorro(doc, true)).toBe(true);
    expect(atributos.get('data-ahorro')).toBe('on');
    expect(aplicarModoAhorro(doc, true)).toBe(false); // ya estaba
    expect(aplicarModoAhorro(doc, false)).toBe(true);
    expect(atributos.get('data-ahorro')).toBe('off');
  });

  it('no se rompe sin documento', () => {
    expect(aplicarModoAhorro(null, true)).toBe(false);
    expect(aplicarModoAhorro(undefined, false)).toBe(false);
    expect(aplicarModoAhorro({}, true)).toBe(false);
  });
});
