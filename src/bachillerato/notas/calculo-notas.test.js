/* Tests de la lógica pura de la calculadora de notas. */
import { describe, it, expect } from 'vitest';
import {
  CONFIG_DEFECTO, normalizarConfig, validarActividad,
  validarPorcentajesPeriodo, validarPonderaciones,
  calcularPeriodo, calcularMateria, cuantoNecesito,
  estadoMateria, materiaNueva,
} from './calculo-notas.js';

/* --------- Constructores de prueba --------- */
function act(nombre, porcentaje, nota) {
  return { nombre, porcentaje, nota: nota === undefined ? null : nota };
}

describe('CONFIG_DEFECTO', () => {
  it('usa escala 0 a 10 y aprobación en 6', () => {
    expect(CONFIG_DEFECTO.escalaMin).toBe(0);
    expect(CONFIG_DEFECTO.escalaMax).toBe(10);
    expect(CONFIG_DEFECTO.notaAprobacion).toBe(6);
  });

  it('sus períodos por defecto suman 100 %', () => {
    const suma = CONFIG_DEFECTO.periodosPorDefecto.reduce((t, p) => t + p.ponderacion, 0);
    expect(suma).toBe(100);
  });
});

describe('normalizarConfig', () => {
  it('devuelve la configuración por defecto si recibe undefined', () => {
    const { config } = normalizarConfig(undefined);
    expect(config.escalaMax).toBe(10);
    expect(config.notaAprobacion).toBe(6);
  });

  it('respeta los valores que manda el usuario', () => {
    const { config } = normalizarConfig({ notaAprobacion: 5, escalaMax: 100 });
    expect(config.notaAprobacion).toBe(5);
    expect(config.escalaMax).toBe(100);
  });

  it('avisa si la nota de aprobación queda fuera de la escala', () => {
    const { config, errores } = normalizarConfig({ escalaMin: 0, escalaMax: 10, notaAprobacion: 12 });
    expect(errores.length).toBeGreaterThan(0);
    expect(config.notaAprobacion).toBe(10); // se acomoda para no romper el cálculo
  });

  it('rechaza una escala máxima menor o igual a la mínima', () => {
    const { errores } = normalizarConfig({ escalaMin: 10, escalaMax: 5 });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('corrige las ponderaciones de los períodos para que sumen 100 %', () => {
    const { config } = normalizarConfig({
      periodosPorDefecto: [{ nombre: 'A', ponderacion: 30 }, { nombre: 'B', ponderacion: 40 }],
    });
    const suma = config.periodosPorDefecto.reduce((t, p) => t + p.ponderacion, 0);
    expect(suma).toBeCloseTo(100, 5);
  });
});

describe('validarActividad', () => {
  it('acepta una actividad válida', () => {
    expect(validarActividad(act('Examen', 30, 7.5))).toEqual([]);
  });

  it('exige nombre', () => {
    expect(validarActividad(act('   ', 30, 7)).length).toBeGreaterThan(0);
  });

  it('exige porcentaje mayor que cero', () => {
    expect(validarActividad(act('Tarea', 0, 7)).length).toBeGreaterThan(0);
    expect(validarActividad(act('Tarea', -5, 7)).length).toBeGreaterThan(0);
  });

  it('permite nota vacía (actividad pendiente)', () => {
    expect(validarActividad(act('Examen', 30, null))).toEqual([]);
  });

  it('rechaza notas fuera de escala', () => {
    expect(validarActividad(act('Examen', 30, 11)).length).toBeGreaterThan(0);
    expect(validarActividad(act('Examen', 30, -1)).length).toBeGreaterThan(0);
  });
});

describe('validarPorcentajesPeriodo', () => {
  it('detecta que suman 100', () => {
    expect(validarPorcentajesPeriodo([act('a', 60), act('b', 40)]).ok).toBe(true);
  });

  it('detecta que faltan porcentajes', () => {
    const r = validarPorcentajesPeriodo([act('a', 60)]);
    expect(r.ok).toBe(false);
    expect(r.falta).toBe(40);
    expect(r.sobra).toBe(0);
  });

  it('detecta que sobran porcentajes', () => {
    const r = validarPorcentajesPeriodo([act('a', 70), act('b', 60)]);
    expect(r.ok).toBe(false);
    expect(r.sobra).toBe(30);
  });

  it('sin actividades, suma 0 y falta 100', () => {
    const r = validarPorcentajesPeriodo([]);
    expect(r.suma).toBe(0);
    expect(r.falta).toBe(100);
  });
});

describe('validarPonderaciones', () => {
  it('acepta 4 períodos de 25 %', () => {
    expect(validarPonderaciones([{ ponderacion: 25 }, { ponderacion: 25 },
      { ponderacion: 25 }, { ponderacion: 25 }]).ok).toBe(true);
  });

  it('rechaza ponderaciones que no suman 100', () => {
    expect(validarPonderaciones([{ ponderacion: 40 }, { ponderacion: 40 }]).ok).toBe(false);
  });
});

describe('calcularPeriodo', () => {
  it('sin actividades acumula 0 y todo queda pendiente', () => {
    const r = calcularPeriodo({ nombre: 'P1', ponderacion: 25, actividades: [] });
    expect(r.notaAcumulada).toBe(0);
    expect(r.porcentajePendiente).toBe(100);
    expect(r.completo).toBe(false);
    expect(r.promedio).toBe(null);
  });

  it('un período totalmente calificado tiene promedio definido', () => {
    const r = calcularPeriodo({
      nombre: 'P1', ponderacion: 25,
      actividades: [act('Tareas', 40, 8), act('Examen', 60, 6)],
    });
    // 40 % de 8 = 3,2  +  60 % de 6 = 3,6  →  6,8
    expect(r.promedio).toBeCloseTo(6.8, 2);
    expect(r.completo).toBe(true);
    expect(r.porcentajePendiente).toBe(0);
  });

  it('acumula sólo lo calificado y marca el resto como pendiente', () => {
    const r = calcularPeriodo({
      nombre: 'P1', ponderacion: 25,
      actividades: [act('Tareas', 50, 10), act('Examen', 50, null)],
    });
    expect(r.notaAcumulada).toBeCloseTo(5, 2); // la mitad del período con 10
    expect(r.porcentajePendiente).toBe(50);
    expect(r.promedio).toBe(null);
  });

  it('promedioCon devuelve lo que quedaría con una nota dada', () => {
    const r = calcularPeriodo({
      nombre: 'P1', ponderacion: 100,
      actividades: [act('Tareas', 50, 10), act('Examen', 50, null)],
    });
    expect(r.promedioCon(10)).toBeCloseTo(10, 2);
    expect(r.promedioCon(0)).toBeCloseTo(5, 2);
    expect(r.promedioCon(6)).toBeCloseTo(8, 2);
  });

  it('marca los porcentajes incompletos', () => {
    const r = calcularPeriodo({ nombre: 'P1', ponderacion: 25, actividades: [act('a', 70, 8)] });
    expect(r.porcentajesOk).toBe(false);
    expect(r.faltaDefinir).toBe(30);
  });

  it('no se rompe con una sola actividad que suma 100 %', () => {
    const r = calcularPeriodo({ nombre: 'P1', ponderacion: 100, actividades: [act('Única', 100, 9)] });
    expect(r.promedio).toBeCloseTo(9, 2);
  });

  it('redondea a los decimales de la configuración', () => {
    const r = calcularPeriodo({
      nombre: 'P1', ponderacion: 100,
      actividades: [act('a', 50, 7.777), act('b', 50, 7.777)],
    }, { decimales: 1 });
    expect(r.promedio).toBe(7.8);
  });

  it('reporta notas fuera de escala sin romper el cálculo', () => {
    const r = calcularPeriodo({
      nombre: 'P1', ponderacion: 100,
      actividades: [act('a', 100, 99)],
    });
    expect(r.fueraDeEscala).toEqual(['a']);
  });
});

describe('calcularMateria', () => {
  it('promedia los períodos según su ponderación', () => {
    const materia = {
      nombre: 'Lenguaje',
      periodos: [
        { nombre: 'P1', ponderacion: 50, actividades: [act('a', 100, 8)] },
        { nombre: 'P2', ponderacion: 50, actividades: [act('b', 100, 6)] },
      ],
    };
    expect(calcularMateria(materia).promedio).toBeCloseTo(7, 2);
  });

  it('respeta ponderaciones distintas', () => {
    const materia = {
      nombre: 'Lenguaje',
      periodos: [
        { nombre: 'P1', ponderacion: 20, actividades: [act('a', 100, 10)] },
        { nombre: 'P2', ponderacion: 80, actividades: [act('b', 100, 5)] },
      ],
    };
    // 0,2 × 10 + 0,8 × 5 = 2 + 4 = 6
    expect(calcularMateria(materia).promedio).toBeCloseTo(6, 2);
  });

  it('con todo pendiente el promedio es 0 y no está aprobada', () => {
    const materia = { nombre: 'X', periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [] }] };
    const r = calcularMateria(materia);
    expect(r.promedio).toBe(0);
    expect(r.aprobada).toBe(false);
    expect(r.alcanzadoTodo).toBe(false);
  });

  it('sin ningún período no falla y avisa', () => {
    const r = calcularMateria({ nombre: 'Vacía', periodos: [] });
    expect(r.promedio).toBe(0);
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('avisa cuando los porcentajes de un período no suman 100 %', () => {
    const materia = {
      nombre: 'X',
      periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [act('a', 40, 8)] }],
    };
    expect(calcularMateria(materia).avisos.join(' ')).toContain('40');
  });

  it('avisa cuando las ponderaciones de los períodos no suman 100 %', () => {
    const materia = {
      nombre: 'X',
      periodos: [
        { nombre: 'P1', ponderacion: 40, actividades: [act('a', 100, 8)] },
        { nombre: 'P2', ponderacion: 40, actividades: [act('b', 100, 8)] },
      ],
    };
    const r = calcularMateria(materia);
    expect(r.ponderacionesOk).toBe(false);
    expect(r.avisos.join(' ')).toContain('ponderaciones');
  });

  it('con todo calificado, el máximo posible es el promedio actual', () => {
    const materia = {
      nombre: 'X',
      periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [act('a', 100, 4)] }],
    };
    expect(calcularMateria(materia).promedioMaximo).toBeCloseTo(4, 2);
  });
});

describe('cuantoNecesito', () => {
  it('calcula la nota mínima en lo pendiente', () => {
    // 50 % del período con nota 5 → acumulado 2,5; falta el 50 %.
    // Para llegar a 6: (6 - 2,5) / 0,5 = 7
    const materia = {
      nombre: 'X',
      periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [act('a', 50, 5)] }],
    };
    const r = cuantoNecesito(materia, 6);
    expect(r.hayPendiente).toBe(true);
    expect(r.alcanzable).toBe(true);
    expect(r.minima).toBeCloseTo(7, 5);
    expect(r.mensaje).toContain('7');
  });

  it('un caso simple: mitad con 10, mitad pendiente, meta 6', () => {
    const materia = {
      nombre: 'X',
      periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [act('a', 50, 10)] }],
    };
    // acumulado 5; (6-5)/0,5 = 2
    expect(cuantoNecesito(materia, 6).minima).toBeCloseTo(2, 5);
  });

  it('dice que es inalcanzable cuando la meta supera el máximo posible', () => {
    const materia = {
      nombre: 'X',
      periodos: [{
        nombre: 'P1', ponderacion: 100,
        actividades: [act('a', 90, 2), act('b', 10, null)], // sólo 10 % pendiente
      }],
    };
    const r = cuantoNecesito(materia, 9);
    expect(r.alcanzable).toBe(false);
    expect(r.motivo).toBe('inalcanzable');
    expect(r.maximaPosible).toBeLessThan(9);
    expect(r.mensaje).toContain('no se llega');
  });

  it('detecta que ya se alcanzó la meta', () => {
    const materia = {
      nombre: 'X',
      periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [act('a', 100, 9)] }],
    };
    const r = cuantoNecesito(materia, 6);
    expect(r.yaAlcanzado).toBe(true);
    expect(r.mensaje).toContain('No te falta nada');
  });

  it('sin actividades pendientes y meta no alcanzada lo dice con claridad', () => {
    const materia = {
      nombre: 'X',
      periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [act('a', 100, 3)] }],
    };
    const r = cuantoNecesito(materia, 6);
    expect(r.alcanzable).toBe(false);
    expect(r.motivo).toBe('sin-pendiente-imposible');
    expect(r.hayPendiente).toBe(false);
    expect(r.minima).toBe(null);
  });

  it('todo pendiente: se llega a la meta máxima sólo con nota máxima', () => {
    const materia = { nombre: 'X', periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [] }] };
    const r = cuantoNecesito(materia, 10);
    // Con el 100 % pendiente, 10 es posible con nota 10
    expect(r.alcanzable).toBe(true);
    expect(r.minima).toBeCloseTo(10, 2);
  });

  it('meta mayor que la escala es inalcanzable', () => {
    const materia = { nombre: 'X', periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [] }] };
    const r = cuantoNecesito(materia, 15);
    expect(r.alcanzable).toBe(false);
  });

  it('funciona con varios períodos y ponderaciones distintas', () => {
    const materia = {
      nombre: 'X',
      periodos: [
        { nombre: 'P1', ponderacion: 25, actividades: [act('a', 100, 4)] },   // aporte 1,0
        { nombre: 'P2', ponderacion: 25, actividades: [] },                    // aporte 0
        { nombre: 'P3', ponderacion: 25, actividades: [act('b', 50, 8)] },    // aporte 1,0
        { nombre: 'P4', ponderacion: 25, actividades: [] },                    // aporte 0
      ],
    };
    const r = cuantoNecesito(materia, 6);
    // A = 0,25×4 + 0,25×0 + 0,25×(0,5×8) + 0,25×0 = 1 + 0 + 1 + 0 = 2
    // B = 0,25×0 + 0,25×1 + 0,25×0,5 + 0,25×1 = 0 + 0,25 + 0,125 + 0,25 = 0,625
    // x = (6-2)/0,625 = 6,4
    expect(r.minima).toBeCloseTo(6.4, 5);
    expect(r.alcanzable).toBe(true);
  });

  it('la nota mínima redondeada hacia arriba nunca baja de lo necesario', () => {
    const materia = {
      nombre: 'X',
      periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [act('a', 70, 7), act('b', 30, null)] }],
    };
    const r = cuantoNecesito(materia, 6);
    // acumulado 4,9; (6-4,9)/0,3 = 3,666…
    expect(r.minima).toBeCloseTo(3.6666, 3);
    expect(r.minimaRedondeada).toBeGreaterThanOrEqual(r.minima);
  });

  it('usa la nota de aprobación como meta por defecto si objetivo no es número', () => {
    const materia = { nombre: 'X', periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [] }] };
    expect(cuantoNecesito(materia, 'no-numero').objetivo).toBe(6);
  });
});

describe('estadoMateria', () => {
  it('en-curso si falta algo por calificar', () => {
    expect(estadoMateria({
      nombre: 'X',
      periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [act('a', 50, 10)] }],
    })).toBe('en-curso');
  });

  it('aprobada con nota suficiente', () => {
    expect(estadoMateria({
      nombre: 'X',
      periodos: [{ nombre: 'P1', ponderacion: 100, actividades: [act('a', 100, 8)] }],
    })).toBe('aprobada');
  });

  it('reprobada cuando ni el máximo posible alcanza', () => {
    expect(estadoMateria({
      nombre: 'X',
      periodos: [{
        nombre: 'P1', ponderacion: 100,
        actividades: [act('a', 90, 1), act('b', 10, null)],
      }],
    })).toBe('reprobada');
  });
});

describe('materiaNueva', () => {
  it('crea los 4 períodos por defecto que suman 100 %', () => {
    const m = materiaNueva('Física');
    expect(m.nombre).toBe('Física');
    expect(m.periodos.length).toBe(4);
    expect(m.periodos.reduce((t, p) => t + p.ponderacion, 0)).toBe(100);
  });

  it('todas las materias nuevas tienen id distinto', () => {
    expect(materiaNueva('A').id).not.toBe(materiaNueva('B').id);
  });

  it('nombre vacío cae a «Materia»', () => {
    expect(materiaNueva('   ').nombre).toBe('Materia');
  });
});
