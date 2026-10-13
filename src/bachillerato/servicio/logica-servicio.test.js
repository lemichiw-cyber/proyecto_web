import { describe, it, expect } from 'vitest';
import {
  resumenServicio,
  agregarRegistroServicio,
  editarRegistroServicio,
  eliminarRegistroServicio,
  historialServicio,
  avanceProyecto,
  estadosHitos,
  siguienteHito,
  agregarHito,
  alternarHito,
  editarHito,
  eliminarHito,
} from './logica-servicio.js';

describe('resumenServicio', () => {
  it('suma horas, calcula saldo y avance', () => {
    const r = resumenServicio(
      [
        { horas: 8, fecha: '2026-01-01', actividad: 'a' },
        { horas: 4, fecha: '2026-01-02', actividad: 'b' },
      ],
      200,
    );
    expect(r.horas).toBe(12);
    expect(r.meta).toBe(200);
    expect(r.faltan).toBe(188);
    expect(r.avance).toBe(6);
    expect(r.completo).toBe(false);
  });

  it('usa meta configurable y marca completo', () => {
    const r = resumenServicio([{ horas: 30, fecha: '2026-01-01', actividad: 'a' }], 30);
    expect(r.completo).toBe(true);
    expect(r.faltan).toBe(0);
  });

  it('metas inválidas caen a 200 y nunca divide por cero', () => {
    expect(resumenServicio([], 0).meta).toBe(200);
    expect(resumenServicio([{ horas: 5, fecha: 'x', actividad: 'a' }], -1).avance).toBe(2.5);
  });
});

describe('agregarRegistroServicio', () => {
  it('rechaza actividad vacía', () => {
    expect(agregarRegistroServicio([], { fecha: '2026-01-01', actividad: '  ', horas: 4 }).ok).toBe(false);
  });

  it('rechaza horas no numéricas o mayores a 24', () => {
    expect(agregarRegistroServicio([], { fecha: '2026-01-01', actividad: 'a', horas: -2 }).ok).toBe(false);
    expect(agregarRegistroServicio([], { fecha: '2026-01-01', actividad: 'a', horas: 'x' }).ok).toBe(false);
    expect(agregarRegistroServicio([], { fecha: '2026-01-01', actividad: 'a', horas: 30 }).ok).toBe(false);
  });

  it('rechaza más de 24 horas acumuladas en un mismo día', () => {
    const previos = [{ id: '1', fecha: '2026-01-01', actividad: 'a', horas: 20 }];
    const r = agregarRegistroServicio(previos, { fecha: '2026-01-01', actividad: 'b', horas: 6 });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/24/);
  });

  it('agrega un registro válido con id', () => {
    const r = agregarRegistroServicio([], { fecha: '2026-01-01', actividad: ' Limpiar el parque ', horas: 4 }, { id: () => 'abc' });
    expect(r.ok).toBe(true);
    expect(r.registros[0]).toMatchObject({ id: 'abc', actividad: 'Limpiar el parque', horas: 4 });
  });
});

describe('editar y eliminar registros', () => {
  const base = [{ id: '1', fecha: '2026-01-01', actividad: 'a', horas: 4 }];

  it('edita un registro existente', () => {
    const r = editarRegistroServicio(base, '1', { horas: 6 });
    expect(r.ok).toBe(true);
    expect(r.registros[0].horas).toBe(6);
  });

  it('no deja editar a un valor inválido', () => {
    expect(editarRegistroServicio(base, '1', { horas: -3 }).ok).toBe(false);
    expect(editarRegistroServicio(base, '999', { horas: 3 }).ok).toBe(false);
  });

  it('elimina un registro y avisa si no existe', () => {
    expect(eliminarRegistroServicio(base, '1').registros).toHaveLength(0);
    expect(eliminarRegistroServicio(base, 'x').ok).toBe(false);
  });
});

describe('historialServicio', () => {
  it('ordena de la más reciente a la más antigua', () => {
    const h = historialServicio([
      { fecha: '2026-01-05', actividad: 'a' },
      { fecha: '2026-01-02', actividad: 'b' },
      { fecha: '2026-01-09', actividad: 'c' },
    ]);
    expect(h.map((r) => r.fecha)).toEqual(['2026-01-09', '2026-01-05', '2026-01-02']);
  });
});

describe('proyecto de grado', () => {
  it('calcula avance y restantes', () => {
    const a = avanceProyecto([
      { titulo: 'a', hecho: true },
      { titulo: 'b', hecho: false },
      { titulo: 'c', hecho: true },
    ]);
    expect(a).toMatchObject({ total: 3, hechos: 2, faltan: 1 });
    expect(a.avance).toBeCloseTo(66.7, 1);
  });

  it('marca hitos vencidos sin tocar los hechos', () => {
    const e = estadosHitos(
      [
        { titulo: 'a', fecha: '2026-01-01', hecho: true },
        { titulo: 'b', fecha: '2026-01-01', hecho: false },
        { titulo: 'c', fecha: '', hecho: false },
      ],
      '2026-01-05',
    );
    expect(e.map((h) => h.estado)).toEqual(['hecho', 'vencido', 'pendiente']);
  });

  it('sigue el hito vencido más antiguo y si no, el próximo con fecha', () => {
    const hitos = [
      { titulo: 'a', fecha: '2026-02-01', hecho: false },
      { titulo: 'b', fecha: '2026-01-01', hecho: false },
      { titulo: 'c', fecha: '2026-03-01', hecho: false },
    ];
    expect(siguienteHito(hitos, '2026-01-05').titulo).toBe('b');
    expect(siguienteHito([{ titulo: 'x', fecha: '2026-03-01', hecho: false }], '2026-01-01').titulo).toBe('x');
    expect(siguienteHito([{ titulo: 'x', hecho: true }], '2026-01-01')).toBeNull();
  });

  it('agrega, alterna, edita y elimina hitos', () => {
    expect(agregarHito([], { titulo: '' }).ok).toBe(false);
    expect(agregarHito([], { titulo: '  Anteproyecto ', fecha: '2026-03-01' }).hitos[0]).toMatchObject({
      titulo: 'Anteproyecto',
      fecha: '2026-03-01',
      hecho: false,
    });
    const r1 = alternarHito([{ titulo: 'a', hecho: false }], 0);
    expect(r1.hitos[0].hecho).toBe(true);
    expect(alternarHito([{ titulo: 'a', hecho: false }], 5).ok).toBe(false);
    expect(editarHito([{ titulo: 'a', hecho: false }], 0, { titulo: ' b ' }).hitos[0].titulo).toBe('b');
    expect(editarHito([{ titulo: 'a' }], 0, { fecha: 'no' }).ok).toBe(false);
    expect(eliminarHito([{ titulo: 'a' }], 0).hitos).toHaveLength(0);
    expect(eliminarHito([{ titulo: 'a' }], 3).ok).toBe(false);
  });
});
