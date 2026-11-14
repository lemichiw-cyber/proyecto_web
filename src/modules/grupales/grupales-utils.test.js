/* ===================================================================
   grupales-utils.test.js — Pruebas de la lógica pura de
   Actividades Grupales
   =================================================================== */

import { describe, it, expect } from 'vitest';
import {
  normalizarId,
  iniciales,
  fechaCorta,
  horaCorta,
  etiquetaEstado,
  validarGrupo,
  resumen,
  filtrarGrupos,
} from './grupales-utils.js';

function grupo(extra = {}) {
  return {
    id: 'gr-1',
    nombre: 'Proyecto science',
    descripcion: 'Experimento sobre la fotosíntesis',
    materia: 'Biología',
    ...extra,
  };
}

describe('grupales-utils — básicos', () => {
  it('normaliza ids', () => {
    expect(normalizarId('  gr-1 ')).toBe('gr-1');
    expect(normalizarId(null)).toBe('');
  });

  it('arma iniciales', () => {
    expect(iniciales('Ana García')).toBe('AG');
    expect(iniciales('Ana')).toBe('AN');
    expect(iniciales('')).toBe('?');
  });

  it('formatea fecha y hora', () => {
    const ts = new Date(2024, 2, 5, 14, 30).getTime() / 1000;
    expect(fechaCorta(ts)).toMatch(/^\d{2}\/\d{2}(\/\d{4})?$/);
    expect(horaCorta(ts)).toMatch(/^\d{2}:\d{2}$/);
    expect(fechaCorta(0)).toBe('');
    expect(horaCorta('xyz')).toBe('');
  });

  it('traduce el estado del grupo', () => {
    expect(etiquetaEstado('activo')).toBe('Activo');
    expect(etiquetaEstado('archivado')).toBe('Archivado');
    expect(etiquetaEstado('')).toBe('Activo');
  });
});

describe('grupales-utils — validación y resumen', () => {
  it('exige un nombre', () => {
    expect(validarGrupo('')).toMatch(/obligatorio/i);
    expect(validarGrupo('   ')).toMatch(/obligatorio/i);
  });

  it('avisa si el nombre es demasiado largo', () => {
    expect(validarGrupo('a'.repeat(121))).toMatch(/largo/i);
  });

  it('acepta un nombre válido', () => {
    expect(validarGrupo('Proyecto science')).toBe('');
  });

  it('recorta el texto a una línea', () => {
    expect(resumen('hola\n  mundo')).toBe('hola mundo');
    expect(resumen('a'.repeat(100), 10)).toBe('aaaaaaaaaa…');
  });
});

describe('grupales-utils — filtrado', () => {
  const grupos = [
    grupo({ id: '1', nombre: 'Proyecto science', materia: 'Biología', descripcion: 'Fotosíntesis' }),
    grupo({ id: '2', nombre: 'Ensayo de historia', materia: 'Historia', descripcion: 'Revolución' }),
  ];

  it('sin texto devuelve todos', () => {
    expect(filtrarGrupos(grupos, '')).toHaveLength(2);
  });

  it('filtra por nombre, materia o descripción', () => {
    expect(filtrarGrupos(grupos, 'science').map((g) => g.id)).toEqual(['1']);
    expect(filtrarGrupos(grupos, 'historia').map((g) => g.id)).toEqual(['2']);
    expect(filtrarGrupos(grupos, 'fotosíntesis').map((g) => g.id)).toEqual(['1']);
    expect(filtrarGrupos(grupos, 'nada')).toHaveLength(0);
  });

  it('no rompe si la lista no es un array', () => {
    expect(filtrarGrupos(null, 'x')).toEqual([]);
    expect(filtrarGrupos(undefined, '')).toEqual([]);
  });
});
