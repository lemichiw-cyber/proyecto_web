/* Tests de la parte pura del módulo de compartir (sin canvas). */
import { describe, it, expect } from 'vitest';
import { construirModelo, construirTexto } from './compartir.js';

describe('construirModelo', () => {
  it('construye con valores por defecto', () => {
    const m = construirModelo({});
    expect(m.titulo).toBe('Cherry-Bomb');
    expect(m.encabezados).toEqual([]);
    expect(m.filas).toEqual([]);
    expect(m.alto).toBeGreaterThanOrEqual(320);
  });

  it('recibe los encabezados y las filas tal cual', () => {
    const m = construirModelo({
      titulo: 'Horario',
      encabezados: ['Hora', 'Materia'],
      filas: [['07:30', 'Matemática']],
    });
    expect(m.encabezados).toEqual(['Hora', 'Materia']);
    expect(m.filas).toEqual([['07:30', 'Matemática']]);
  });

  it('crece el alto con cada fila', () => {
    const uno = construirModelo({ encabezados: ['A'], filas: [['1']] });
    const tres = construirModelo({ encabezados: ['A'], filas: [['1'], ['2'], ['3']] });
    expect(tres.alto).toBeGreaterThan(uno.alto);
  });

  it('corta las celdas demasiado largas para no desbordar la imagen', () => {
    const m = construirModelo({
      encabezados: ['Nombre'],
      filas: [['x'.repeat(200)]],
    });
    expect(m.filas[0][0].length).toBeLessThanOrEqual(34);
    expect(m.filas[0][0].endsWith('…')).toBe(true);
  });

  it('convierte celdas nulas en cadena vacía', () => {
    const m = construirModelo({ encabezados: ['A'], filas: [[null, undefined, 5]] });
    expect(m.filas[0]).toEqual(['', '', '5']);
  });

  it('una fila que no es arreglo se convierte en vacía', () => {
    const m = construirModelo({ encabezados: ['A'], filas: ['no-es-arreglo'] });
    expect(m.filas).toEqual([[]]);
  });
});

describe('construirTexto', () => {
  it('arma el texto con título y filas', () => {
    const texto = construirTexto(construirModelo({
      titulo: 'Horario semanal',
      subtitulo: 'Lunes a viernes',
      encabezados: ['Hora', 'Materia'],
      filas: [['07:30', 'Matemática'], ['09:00', 'Lenguaje']],
      pie: 'Generado con Cherry-Bomb',
    }));
    expect(texto).toContain('Horario semanal');
    expect(texto).toContain('Lunes a viernes');
    expect(texto).toContain('07:30');
    expect(texto).toContain('Lenguaje');
    expect(texto).toContain('Generado con Cherry-Bomb');
  });

  it('alinea las columnas con relleno', () => {
    const texto = construirTexto(construirModelo({
      encabezados: ['Hora', 'Materia'],
      filas: [['07:30', 'Matemática']],
    }));
    const lineas = texto.split('\n');
    const cabecera = lineas.find((l) => l.includes('Hora'));
    const fila = lineas.find((l) => l.includes('07:30'));
    // La materia debe arrancar exactamente donde empieza su encabezado
    expect(fila.indexOf('Matemática')).toBe(cabecera.indexOf('Materia'));
  });

  it('no incluye el pie si no hay filas', () => {
    const texto = construirTexto(construirModelo({ titulo: 'Vacío', encabezados: ['A'], filas: [] }));
    expect(texto).not.toContain('Generado');
  });

  it('funciona con modelo vacío', () => {
    expect(typeof construirTexto(construirModelo({}))).toBe('string');
  });
});
