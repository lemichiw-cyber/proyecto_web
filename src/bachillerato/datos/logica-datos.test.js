import { describe, it, expect } from 'vitest';
import {
  construirRespaldo, validarRespaldo, datosAImportar, resumenRespaldo,
  decidirModoAhorro, aplicarModoAhorro, pesoRespaldo,
  ESQUEMA_RESPALDO, CLAVES_EXCLUIDAS, NOMBRES_CLAVES, VERSION_RESPALDO,
} from './logica-datos.js';

describe('construirRespaldo', () => {
  it('incluye sólo claves del esquema y excluye el modo ahorro', () => {
    const r = construirRespaldo({
      'notas.materias': [{ id: 'm1' }],
      'servicio.meta': 200,
      'sistema.ahorro': { activo: true },
      'clave.rara': 'no debería estar',
    }, { fecha: '2026-01-05' });

    expect(r.version).toBe(VERSION_RESPALDO);
    expect(r.fecha).toBe('2026-01-05');
    expect(r.datos['notas.materias']).toEqual([{ id: 'm1' }]);
    expect(r.datos['servicio.meta']).toBe(200);
    expect(r.datos['clave.rara']).toBeUndefined();
    expect(r.datos['sistema.ahorro']).toBeUndefined();
    expect(r.excluidas).toEqual(['sistema.ahorro']);
    expect(r.cantidad).toBe(2);
  });

  it('no explota con entradas vacías o inválidas', () => {
    expect(construirRespaldo(null).cantidad).toBe(0);
    expect(construirRespaldo({}).cantidad).toBe(0);
  });
});

describe('validarRespaldo', () => {
  const bueno = () => construirRespaldo({ 'notas.materias': [] }, { fecha: '2026-01-05' });

  it('acepta un respaldo correcto', () => {
    const v = validarRespaldo(bueno());
    expect(v.ok).toBe(true);
    expect(v.clavesValidas).toEqual(['notas.materias']);
  });

  it('rechaza lo que no es un objeto con versión', () => {
    expect(validarRespaldo(null).ok).toBe(false);
    expect(validarRespaldo('texto').ok).toBe(false);
    expect(validarRespaldo([1, 2]).ok).toBe(false);
    expect(validarRespaldo({ datos: {} }).ok).toBe(false);
  });

  it('rechaza respaldos de una versión más nueva', () => {
    const v = validarRespaldo({ version: VERSION_RESPALDO + 1, datos: { 'notas.materias': [] } });
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/más nueva/);
  });

  it('ignora claves desconocidas y tipos equivocados sin rechazar el archivo', () => {
    const v = validarRespaldo({
      version: 1,
      datos: {
        'notas.materias': [{ id: 'a' }],   // correcta
        'clave.inventada': 'x',            // desconocida
        'servicio.meta': 'no soy número',  // tipo mal
      },
    });
    expect(v.ok).toBe(true);
    expect(v.clavesValidas).toEqual(['notas.materias']);
    expect(v.clavesIgnoradas).toContain('clave.inventada');
    expect(v.clavesIgnoradas).toContain('servicio.meta');
  });

  it('rechaza si al final no queda nada reconocible', () => {
    expect(validarRespaldo({ version: 1, datos: { 'clave.inventada': 1 } }).ok).toBe(false);
    expect(validarRespaldo({ version: 1, datos: {} }).ok).toBe(false);
  });
});

describe('datosAImportar y resumenRespaldo', () => {
  it('devuelve sólo las claves válidas', () => {
    const r = datosAImportar({
      version: 1,
      datos: { 'notas.materias': [{ id: 'a' }], 'clave.inventada': 1 },
    });
    expect(r.ok).toBe(true);
    expect(r.datos).toEqual({ 'notas.materias': [{ id: 'a' }] });
    expect(r.ignoradas).toEqual(['clave.inventada']);
  });

  it('se niega si el archivo no es válido', () => {
    expect(datosAImportar({ version: 1, datos: {} }).ok).toBe(false);
    expect(datosAImportar(null).ok).toBe(false);
  });

  it('resume el contenido para decidir antes de restaurar', () => {
    const s = resumenRespaldo(construirRespaldo({
      'notas.materias': [{ id: 'a' }, { id: 'b' }],
      'servicio.meta': 200,
    }, { fecha: '2026-01-05' }));
    expect(s.ok).toBe(true);
    expect(s.fecha).toBe('2026-01-05');
    expect(s.lineas.find((l) => l.clave === 'notas.materias').detalle).toBe('2 elementos');
    expect(s.lineas.find((l) => l.clave === 'servicio.meta').detalle).toBe('200');
    expect(resumenRespaldo({ version: 1, datos: {} }).ok).toBe(false);
  });
});

describe('esquema del respaldo', () => {
  it('todas las claves del esquema tienen nombre legible', () => {
    Object.keys(ESQUEMA_RESPALDO).forEach((clave) => {
      expect(NOMBRES_CLAVES[clave]).toBeTruthy();
    });
  });

  it('el modo ahorro está excluido a propósito', () => {
    expect(CLAVES_EXCLUIDAS).toContain('sistema.ahorro');
  });
});

describe('decidirModoAhorro', () => {
  it('respeta cuando el estudiante lo apaga a mano', () => {
    expect(decidirModoAhorro({ saveData: true, guardado: { activo: false } }).activo).toBe(false);
    expect(decidirModoAhorro({ saveData: true, guardado: false }).activo).toBe(false);
  });

  it('respeta cuando el estudiante lo enciende a mano', () => {
    expect(decidirModoAhorro({ saveData: false, guardado: { activo: true } }).activo).toBe(true);
    expect(decidirModoAhorro({ saveData: false, guardado: true }).activo).toBe(true);
  });

  it('en automático se activa con datos limitados o red lenta', () => {
    expect(decidirModoAhorro({ saveData: true }).activo).toBe(true);
    expect(decidirModoAhorro({ efectivo: '2g' }).activo).toBe(true);
    expect(decidirModoAhorro({ efectivo: 'slow-2g' }).activo).toBe(true);
    expect(decidirModoAhorro({ efectivo: '4g' }).activo).toBe(false);
    expect(decidirModoAhorro({}).activo).toBe(false);
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
  });
});

describe('pesoRespaldo', () => {
  it('mide el tamaño en texto del respaldo', () => {
    const p = pesoRespaldo(construirRespaldo({ 'notas.materias': [{ id: 'a' }] }));
    expect(p.bytes).toBeGreaterThan(0);
    expect(p.kb).toBeGreaterThan(0);
  });

  it('con datos no serializables devuelve cero en vez de explotar', () => {
    const circ = {};
    circ.circular = circ;
    expect(pesoRespaldo(circ).bytes).toBe(0);
  });
});
