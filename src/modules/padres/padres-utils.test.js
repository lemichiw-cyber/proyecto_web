/* ===================================================================
   padres-utils.test.js — Pruebas de la lógica pura del Portal de Padres
   =================================================================== */

import { describe, it, expect } from 'vitest';
import {
  normalizarEmail,
  etiquetaRol,
  iniciales,
  promedio,
  porcentajeAsistencia,
  contarPendientes,
  agruparPorMateria,
  construirNotificaciones,
  formatoPorcentaje,
  formatoPromedio,
} from './padres-utils.js';

function hijo(extra = {}) {
  return {
    email: 'hijo@colegio.edu',
    nombre: 'Ana Hija',
    semestre: '2026-1',
    tareas: [],
    notas: [],
    asistencia: { registros: 0, presentes: 0 },
    ...extra,
  };
}

describe('padres-utils — básicos', () => {
  it('normaliza emails', () => {
    expect(normalizarEmail('  Ana@Colegio.EDU ')).toBe('ana@colegio.edu');
    expect(normalizarEmail(null)).toBe('');
  });

  it('traduce el rango a una etiqueta legible', () => {
    expect(etiquetaRol('docente')).toBe('Docente');
    expect(etiquetaRol('padres')).toBe('Padre / madre');
    expect(etiquetaRol('inventado')).toBe('Colegio');
  });

  it('arma iniciales', () => {
    expect(iniciales('Ana Hija')).toBe('AH');
    expect(iniciales('Ana')).toBe('AN');
    expect(iniciales('')).toBe('?');
  });
});

describe('padres-utils — rendimiento', () => {
  it('calcula el promedio de las notas', () => {
    expect(promedio([{ nota: 8 }, { nota: 10 }])).toBe(9);
    expect(promedio([{ nota: 7.5 }, { nota: 8.5 }])).toBe(8);
    expect(promedio([])).toBeNull();
    expect(promedio(null)).toBeNull();
  });

  it('ignora las notas inválidas o en cero', () => {
    expect(promedio([{ nota: 0 }, { nota: 'x' }, { nota: 10 }])).toBe(10);
  });

  it('calcula el porcentaje de asistencia', () => {
    expect(porcentajeAsistencia({ registros: 4, presentes: 3 })).toBe(75);
    expect(porcentajeAsistencia({ registros: 0, presentes: 0 })).toBeNull();
    expect(porcentajeAsistencia(null)).toBeNull();
  });

  it('cuenta las tareas pendientes', () => {
    const h = hijo({
      tareas: [{ id: 't1', entregada: true }, { id: 't2', entregada: false }, { id: 't3' }],
    });
    expect(contarPendientes(h)).toBe(2);
    expect(contarPendientes(hijo())).toBe(0);
    expect(contarPendientes(null)).toBe(0);
  });
});

describe('padres-utils — agrupar por materia', () => {
  it('agrupa las notas según la materia de su tarea', () => {
    const h = hijo({
      tareas: [
        { id: 't1', materia: 'Matemáticas' },
        { id: 't2', materia: 'Matemáticas' },
        { id: 't3', materia: 'Biología' },
      ],
      notas: [
        { tarea_id: 't1', nota: 8 },
        { tarea_id: 't2', nota: 10 },
        { tarea_id: 't3', nota: 6 },
      ],
    });
    const salida = agruparPorMateria(h);
    expect(salida.map((m) => m.materia)).toEqual(['Biología', 'Matemáticas']);
    expect(salida.find((m) => m.materia === 'Matemáticas').promedio).toBe(9);
    expect(salida.find((m) => m.materia === 'Biología').promedio).toBe(6);
  });

  it('deja en "General" las notas sin tarea conocida', () => {
    const h = hijo({ notas: [{ tarea_id: 'nada', nota: 7 }] });
    const salida = agruparPorMateria(h);
    expect(salida).toHaveLength(1);
    expect(salida[0].materia).toBe('General');
  });

  it('no rompe sin datos', () => {
    expect(agruparPorMateria(hijo())).toEqual([]);
    expect(agruparPorMateria(null)).toEqual([]);
  });
});

describe('padres-utils — notificaciones', () => {
  it('avisa de pendientes, notas y baja asistencia', () => {
    const lista = construirNotificaciones([
      hijo({
        tareas: [{ id: 't1', entregada: false }],
        notas: [{ nota: 9 }],
        asistencia: { registros: 10, presentes: 5 },
      }),
    ]);
    expect(lista).toHaveLength(3);
    expect(lista.filter((n) => n.tipo === 'alerta')).toHaveLength(2);
    expect(lista.filter((n) => n.tipo === 'info')).toHaveLength(1);
  });

  it('sin datos no genera notificaciones', () => {
    expect(construirNotificaciones([hijo()])).toEqual([]);
    expect(construirNotificaciones([])).toEqual([]);
  });
});

describe('padres-utils — formatos', () => {
  it('formatea porcentaje y promedio', () => {
    expect(formatoPorcentaje(75)).toBe('75%');
    expect(formatoPorcentaje(null)).toBe('—');
    expect(formatoPromedio(8.5)).toBe('8.5');
    expect(formatoPromedio(null)).toBe('—');
  });
});
