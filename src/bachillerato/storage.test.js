/* Tests de la capa de datos (sin DOM: si no hay localStorage cae a memoria). */
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageLocal, CLAVES } from './storage.js';

describe('StorageLocal', () => {
  let s;

  beforeEach(() => {
    s = new StorageLocal('test.');
  });

  it('get devuelve el valor por defecto cuando no hay nada', async () => {
    expect(await s.get('nada', 42)).toBe(42);
    expect(await s.get('nada')).toBe(null);
  });

  it('set y get guardan y recuperan objetos', async () => {
    await s.set('obj', { a: 1, b: 'hola' });
    expect(await s.get('obj')).toEqual({ a: 1, b: 'hola' });
  });

  it('set con undefined guarda null', async () => {
    await s.set('u', undefined);
    expect(await s.get('u')).toBe(null);
  });

  it('list siempre devuelve un array', async () => {
    expect(await s.list('vacío')).toEqual([]);
    await s.set('noArray', { x: 1 });
    expect(await s.list('noArray')).toEqual([]);
    await s.set('arr', [1, 2]);
    expect(await s.list('arr')).toEqual([1, 2]);
  });

  it('remove borra el dato', async () => {
    await s.set('x', 'valor');
    await s.remove('x');
    expect(await s.get('x', 'defecto')).toBe('defecto');
  });

  it('keys lista las claves guardadas sin el prefijo', async () => {
    await s.set('alpha', 1);
    await s.set('beta', 2);
    const claves = await s.keys();
    expect(claves.sort()).toEqual(['alpha', 'beta']);
  });

  it('clear borra todo lo suyo y nada más', async () => {
    const otro = new StorageLocal('otro.');
    await s.set('a', 1);
    await otro.set('b', 2);
    await s.clear();
    expect(await s.keys()).toEqual([]);
    expect(await otro.get('b')).toBe(2);
  });

  it('no mezcla claves con el mismo nombre de otro prefijo', async () => {
    const otro = new StorageLocal('otro.');
    await s.set('k', 'mio');
    await otro.set('k', 'suyo');
    expect(await s.get('k')).toBe('mio');
    expect(await otro.get('k')).toBe('suyo');
  });

  it('rechaza claves vacías', async () => {
    await expect(s.get('   ')).rejects.toThrow();
    await expect(s.set('', 1)).rejects.toThrow();
  });

  it('rechaza guardar datos que no son JSON', async () => {
    const circular = {};
    circular.self = circular;
    await expect(s.set('circ', circular)).rejects.toThrow();
  });

  it('sobrevive a un JSON corrupto devolviendo el defecto', async () => {
    // Simulamos el caso real: alguien editó el almacenamiento a mano
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('test.corrupto', '{esto no es json');
    } else {
      s._memoria.set('test.corrupto', '{esto no es json');
    }
    expect(await s.get('corrupto', 'sano')).toBe('sano');
  });
});

describe('CLAVES', () => {
  it('son únicas', () => {
    const valores = Object.values(CLAVES);
    expect(new Set(valores).size).toBe(valores.length);
  });

  it('todas son strings no vacíos', () => {
    for (const v of Object.values(CLAVES)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
