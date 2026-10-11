import { describe, it, expect } from 'vitest';
import {
  ordenarComunicados, agregarComunicado, editarComunicado, eliminarComunicado,
  proximosComunicados, comunicadosVencidos, diasRestantes, filtrarComunicados,
  buscarCarreras, areasAfinas, CARRERAS_EJEMPLO, FUENTES_OFICIALES,
} from './logica-centro.js';

describe('comunicados', () => {
  it('ordena por fecha ascendente y los sin fecha al final', () => {
    const l = ordenarComunicados([
      { id: '2', fecha: '2026-02-01' },
      { id: '1', fecha: '2026-01-01' },
      { id: '3', fecha: '' },
    ]);
    expect(l.map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('valida título, fecha y tipo', () => {
    expect(agregarComunicado([], { titulo: '  ' }).ok).toBe(false);
    expect(agregarComunicado([], { titulo: 'x'.repeat(200) }).ok).toBe(false);
    expect(agregarComunicado([], { titulo: 'a', fecha: 'ayer' }).ok).toBe(false);
    expect(agregarComunicado([], { titulo: 'a', tipo: 'superhéroe' }).ok).toBe(false);
    expect(agregarComunicado([], { titulo: 'Reunión de padres', fecha: '2026-02-01', tipo: 'evento' }, { id: () => 'n' }).ok).toBe(true);
  });

  it('agrega, edita y elimina', () => {
    const base = agregarComunicado([], { titulo: 'a' }, { id: () => 'i1' }).lista;
    expect(base[0].tipo).toBe('comunicado');
    expect(editarComunicado(base, 'i1', { titulo: 'b' }).lista[0].titulo).toBe('b');
    expect(editarComunicado(base, 'no', { titulo: 'b' }).ok).toBe(false);
    expect(eliminarComunicado(base, 'i1').lista).toHaveLength(0);
    expect(eliminarComunicado(base, 'no').ok).toBe(false);
  });

  it('separa próximos y vencidos', () => {
    const l = [
      { id: 'a', fecha: '2026-01-10', titulo: 'a' },
      { id: 'b', fecha: '2026-01-03', titulo: 'b' },
      { id: 'c', fecha: '', titulo: 'c' },
    ];
    expect(proximosComunicados(l, '2026-01-05').map((c) => c.id)).toEqual(['a']);
    expect(comunicadosVencidos(l, '2026-01-05').map((c) => c.id)).toEqual(['b']);
  });

  it('calcula días restantes y devuelve null con fechas mal formadas', () => {
    expect(diasRestantes('2026-01-10', '2026-01-05')).toBe(5);
    expect(diasRestantes('2026-01-05', '2026-01-05')).toBe(0);
    expect(diasRestantes('', '2026-01-05')).toBeNull();
    expect(diasRestantes('ayer', '2026-01-05')).toBeNull();
  });

  it('filtra por texto y tipo', () => {
    const l = [
      { id: '1', titulo: 'Examen de matemática', detalle: 'capítulo 4', tipo: 'examen', fecha: '2026-01-01' },
      { id: '2', titulo: 'Reunión', detalle: 'padres', tipo: 'evento', fecha: '2026-01-02' },
    ];
    expect(filtrarComunicados(l, { texto: 'matemática' })).toHaveLength(1);
    expect(filtrarComunicados(l, { tipo: 'evento' })).toHaveLength(1);
    expect(filtrarComunicados(l, { texto: 'zzz' })).toHaveLength(0);
    expect(filtrarComunicados(l, {})).toHaveLength(2);
  });
});

describe('orientación vocacional', () => {
  it('el catálogo de ejemplo siempre trae enlaces oficiales para verificar', () => {
    expect(CARRERAS_EJEMPLO.length).toBeGreaterThan(0);
    CARRERAS_EJEMPLO.forEach((g) => {
      expect(g.area).toBeTruthy();
      g.carreras.forEach((c) => {
        expect(c.nombre).toBeTruthy();
        expect(c.url).toMatch(/^https:\/\/www\./);
      });
    });
    expect(FUENTES_OFICIALES.length).toBeGreaterThan(0);
    FUENTES_OFICIALES.forEach((f) => expect(f.url).toMatch(/^https:\/\/www\./));
  });

  it('busca carreras por nombre o área', () => {
    expect(buscarCarreras(CARRERAS_EJEMPLO, 'medicina')).toHaveLength(1);
    expect(buscarCarreras(CARRERAS_EJEMPLO, 'salud')[0].carreras.length).toBeGreaterThan(0);
    expect(buscarCarreras(CARRERAS_EJEMPLO, 'zzz')).toHaveLength(0);
    expect(buscarCarreras(CARRERAS_EJEMPLO, '')).toHaveLength(CARRERAS_EJEMPLO.length);
  });

  it('ordena áreas por afinidad simple con intereses', () => {
    const a = areasAfinas(['me gustan las computadoras y programar']);
    expect(a[0].area).toBe('Ingeniería y tecnología');
    expect(a[0].afinidad).toBe(100);
  });

  it('con intereses vacíos no sugiere nada (no es un diagnóstico)', () => {
    expect(areasAfinas([])).toHaveLength(0);
    expect(areasAfinas(null)).toHaveLength(0);
  });
});
