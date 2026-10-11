import { describe, it, expect } from 'vitest';
import { construirModeloHoy, textoMinutos } from './modelo-hoy.js';
import { crearCapa, CLAVES } from './datos.js';

function adapterMemoria(inicial) {
  var mem = Object.assign({}, inicial || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}

// Lunes 2026-10-12 a las 08:40
var LUNES_8AM = new Date(2026, 9, 12, 8, 40, 0);

describe('modelo-hoy', () => {
  it('con una app recién instalada no se rompe nada', () => {
    var m = construirModeloHoy({ capa: crearCapa(adapterMemoria()), ahora: LUNES_8AM });
    expect(m.fechaISO).toBe('2026-10-12');
    expect(m.diaNombre).toBe('Lunes');
    expect(m.esFinDeSemana).toBe(false);
    expect(m.clases).toEqual([]);
    expect(m.tareas).toEqual([]);
    expect(m.minutosEstudio).toBe(0);
    expect(m.evaluacion).toBe(null);
  });

  it('arma el día completo: clases, próxima, tareas, estudio y evaluación', () => {
    var capa = crearCapa(adapterMemoria({
      [CLAVES.horario]: JSON.stringify([
        { hora: '07:00', Lunes: 'Matemática' },
        { hora: '09:00', Lunes: 'Física' },
        { hora: '10:00', Lunes: 'RECESO' }
      ]),
      [CLAVES.misTareas]: JSON.stringify([
        { id: 'm1', titulo: 'Terminar ensayo', fecha: '2026-10-12', hecha: false },
        { id: 'm2', titulo: 'Mañana es', fecha: '2026-10-13', hecha: false }
      ]),
      [CLAVES.estudioTiempo]: JSON.stringify({ '2026-10-12': 50 }),
      [CLAVES.examenes]: JSON.stringify([{ titulo: 'Examen de Química', fecha: '2026-10-14', tiempo: 45 }])
    }));

    var m = construirModeloHoy({ capa: capa, ahora: LUNES_8AM });

    expect(m.clases.map(function (c) { return c.materia; })).toEqual(['Matemática', 'Física', 'RECESO']);
    // A las 8:40 la de 7:00 (90 min) ya terminó: la próxima es Física
    expect(m.proximaClase.materia).toBe('Física');
    expect(m.tareas.map(function (t) { return t.cuando; })).toEqual(['Hoy', 'Mañana']);
    expect(m.minutosEstudio).toBe(50);
    expect(m.evaluacion.titulo).toBe('Examen de Química');
    expect(m.evaluacion.cuenta).toBe('En 2 días');
    expect(m.evaluacion.tipo).toBe('Examen');
  });

  it('el fin de semana no muestra clases', () => {
    var capa = crearCapa(adapterMemoria({
      [CLAVES.horario]: JSON.stringify([{ hora: '07:00', Lunes: 'Matemática' }])
    }));
    var m = construirModeloHoy({ capa: capa, ahora: new Date(2026, 9, 17, 9, 0) }); // sábado
    expect(m.esFinDeSemana).toBe(true);
    expect(m.clases).toEqual([]);
    expect(m.proximaClase).toBe(null);
  });

  it('marca como "en curso" la clase que se está dando', () => {
    var capa = crearCapa(adapterMemoria({
      [CLAVES.horario]: JSON.stringify([{ hora: '07:30', Lunes: 'Matemática' }])
    }));
    var m = construirModeloHoy({ capa: capa, ahora: LUNES_8AM, ahoraMinutos: 8 * 60 + 10 });
    expect(m.proximaClase.materia).toBe('Matemática');
  });
});

describe('textoMinutos', () => {
  it('habla corto y claro', () => {
    expect(textoMinutos(0)).toBe('0 min');
    expect(textoMinutos(45)).toBe('45 min');
    expect(textoMinutos(95)).toBe('1 h 35 min');
    expect(textoMinutos(120)).toBe('2 h');
    expect(textoMinutos(-5)).toBe('0 min');
    expect(textoMinutos('veinte')).toBe('0 min');
  });
});
