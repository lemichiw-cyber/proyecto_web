/* Tests de la lógica del horario y la agenda. Fecha de referencia: 2026-10-11 (domingo). */
import { describe, it, expect } from 'vitest';
import {
  validarTarea, validarClase, minutosDesdeMedianoche, aHora,
  estadoTarea, estaVencida, proximosDias, ordenarPorFecha, resumenEstados,
  clasesDelDia, diaDeHoy, clasesDeHoy, horasSemanales, materiasDelHorario,
  detectarSolapes, tareasParaRecordar, agruparPorFecha,
  TIPOS_TAREA, ESTADOS_TAREA,
} from './logica-agenda.js';

const HOY = '2026-10-11'; // domingo

function tarea(id, fecha, extra) {
  return Object.assign({ id, titulo: 'Tarea ' + id, fecha, tipo: 'tarea', estado: 'pendiente' }, extra || {});
}

describe('minutosDesdeMedianoche y aHora', () => {
  it('convierte 07:30 a 450 minutos', () => {
    expect(minutosDesdeMedianoche('07:30')).toBe(450);
  });

  it('convierte 00:00 y 23:59', () => {
    expect(minutosDesdeMedianoche('00:00')).toBe(0);
    expect(minutosDesdeMedianoche('23:59')).toBe(23 * 60 + 59);
  });

  it('formato inválido devuelve 0', () => {
    expect(minutosDesdeMedianoche('no-es-hora')).toBe(0);
    expect(minutosDesdeMedianoche('')).toBe(0);
  });

  it('aHora devuelve el formato de dos dígitos', () => {
    expect(aHora(450)).toBe('07:30');
    expect(aHora(0)).toBe('00:00');
    expect(aHora(23 * 60 + 59)).toBe('23:59');
  });
});

describe('validarTarea', () => {
  it('acepta una tarea válida', () => {
    expect(validarTarea(tarea('a', '2026-10-20'))).toEqual([]);
  });

  it('exige título', () => {
    expect(validarTarea(tarea('a', '2026-10-20', { titulo: '  ' })).length).toBeGreaterThan(0);
  });

  it('exige fecha válida', () => {
    expect(validarTarea(tarea('a', 'mañana')).length).toBeGreaterThan(0);
    expect(validarTarea(tarea('a', '2026-13-40')).length).toBeGreaterThan(0);
    expect(validarTarea(tarea('a', '2026-02-31')).length).toBeGreaterThan(0); // febrero no tiene 31
  });

  it('acepta tipos y estados de la lista', () => {
    for (const tipo of TIPOS_TAREA) {
      expect(validarTarea(tarea('a', '2026-10-20', { tipo }))).toEqual([]);
    }
    for (const estado of ESTADOS_TAREA) {
      expect(validarTarea(tarea('a', '2026-10-20', { estado }))).toEqual([]);
    }
  });

  it('rechaza tipos y estados desconocidos', () => {
    expect(validarTarea(tarea('a', '2026-10-20', { tipo: 'lluvia' })).length).toBeGreaterThan(0);
    expect(validarTarea(tarea('a', '2026-10-20', { estado: 'vuelo' })).length).toBeGreaterThan(0);
  });
});

describe('validarClase', () => {
  it('acepta una clase válida', () => {
    expect(validarClase({ materia: 'Matemática', dia: 'lunes', horaInicio: '07:30', horaFin: '09:00', aula: 'B-2' })).toEqual([]);
  });

  it('acepta el día con mayúscula y lo valida igual', () => {
    expect(validarClase({ materia: 'M', dia: 'Lunes', horaInicio: '07:30' })).toEqual([]);
  });

  it('exige materia', () => {
    expect(validarClase({ materia: ' ', dia: 'lunes', horaInicio: '07:30' }).length).toBeGreaterThan(0);
  });

  it('exige un día de la semana real', () => {
    expect(validarClase({ materia: 'M', dia: 'festivo', horaInicio: '07:30' }).length).toBeGreaterThan(0);
  });

  it('exige hora con formato HH:MM', () => {
    expect(validarClase({ materia: 'M', dia: 'lunes', horaInicio: '7' }).length).toBeGreaterThan(0);
    expect(validarClase({ materia: 'M', dia: 'lunes', horaInicio: '25:00' }).length).toBeGreaterThan(0);
    expect(validarClase({ materia: 'M', dia: 'lunes', horaInicio: '07:99' }).length).toBeGreaterThan(0);
  });

  it('la hora de fin debe ser posterior a la de inicio', () => {
    expect(validarClase({ materia: 'M', dia: 'lunes', horaInicio: '09:00', horaFin: '07:30' }).length).toBeGreaterThan(0);
    expect(validarClase({ materia: 'M', dia: 'lunes', horaInicio: '09:00', horaFin: '09:00' }).length).toBeGreaterThan(0);
  });
});

describe('estadoTarea', () => {
  it('entregada pase lo que pase', () => {
    expect(estadoTarea(tarea('a', '2026-10-01', { estado: 'entregada' }), HOY)).toBe('entregada');
  });

  it('vencida si la fecha ya pasó', () => {
    expect(estadoTarea(tarea('a', '2026-10-10'), HOY)).toBe('vencida');
    expect(estaVencida(tarea('a', '2026-10-10'), HOY)).toBe(true);
  });

  it('hoy si vence hoy', () => {
    expect(estadoTarea(tarea('a', '2026-10-11'), HOY)).toBe('hoy');
    expect(estaVencida(tarea('a', '2026-10-11'), HOY)).toBe(false);
  });

  it('manana si vence mañana', () => {
    expect(estadoTarea(tarea('a', '2026-10-12'), HOY)).toBe('manana');
  });

  it('semana si está dentro de los próximos 6 días', () => {
    expect(estadoTarea(tarea('a', '2026-10-17'), HOY)).toBe('semana');
  });

  it('futuro si está más lejos', () => {
    expect(estadoTarea(tarea('a', '2026-11-01'), HOY)).toBe('futuro');
  });

  it('sin-fecha si no tiene fecha o es inválida', () => {
    expect(estadoTarea(tarea('a', ''), HOY)).toBe('sin-fecha');
    expect(estadoTarea(tarea('a', 'no-se'), HOY)).toBe('sin-fecha');
  });
});

describe('proximosDias', () => {
  const lista = [
    tarea('vieja', '2026-10-01'),
    tarea('hoy', '2026-10-11'),
    tarea('septimo', '2026-10-17'),
    tarea('octavo', '2026-10-18'), // fuera del rango de 7 días
    tarea('entregada', '2026-10-05', { estado: 'entregada' }),
    tarea('sin-fecha', ''),
  ];

  it('incluye vencidas, hoy y hasta el día 7', () => {
    const ids = proximosDias(lista, HOY).map((t) => t.id);
    expect(ids).toContain('vieja');
    expect(ids).toContain('hoy');
    expect(ids).toContain('septimo');
  });

  it('deja fuera lo que está más allá, lo entregado y lo sin fecha', () => {
    const ids = proximosDias(lista, HOY).map((t) => t.id);
    expect(ids).not.toContain('octavo');
    expect(ids).not.toContain('entregada');
    expect(ids).not.toContain('sin-fecha');
  });

  it('las vencidas van primero, ordenadas de más vieja a más reciente', () => {
    const ids = proximosDias(lista, HOY).map((t) => t.id);
    expect(ids[0]).toBe('vieja');
  });

  it('acepta un rango distinto de días', () => {
    const ids = proximosDias(lista, HOY, 3).map((t) => t.id);
    expect(ids).toContain('hoy');
    expect(ids).not.toContain('septimo');
  });

  it('con lista vacía devuelve lista vacía', () => {
    expect(proximosDias([], HOY)).toEqual([]);
    expect(proximosDias(null, HOY)).toEqual([]);
  });

  it('no se rompe con entradas corruptas', () => {
    const ids = proximosDias([null, undefined, {}, tarea('ok', '2026-10-12')], HOY).map((t) => t.id);
    expect(ids).toContain('ok');
  });
});

describe('ordenarPorFecha', () => {
  it('ponga las entregadas al final', () => {
    const r = ordenarPorFecha([
      tarea('e', '2026-10-12', { estado: 'entregada' }),
      tarea('p', '2026-10-12'),
    ], HOY).map((t) => t.id);
    expect(r).toEqual(['p', 'e']);
  });

  it('respeta el orden de fechas ascendente', () => {
    const r = ordenarPorFecha([
      tarea('lejos', '2026-11-05'),
      tarea('cerca', '2026-10-20'),
    ], HOY).map((t) => t.id);
    expect(r).toEqual(['cerca', 'lejos']);
  });
});

describe('resumenEstados', () => {
  it('cuenta por estado y marca las vencidas', () => {
    const r = resumenEstados([
      tarea('a', '2026-10-01'),                 // pendiente + vencida
      tarea('b', '2026-11-01', { estado: 'en-proceso' }),
      tarea('c', '2026-11-02', { estado: 'entregada' }),
    ], HOY);
    expect(r.total).toBe(3);
    expect(r.pendiente).toBe(1);
    expect(r['en-proceso']).toBe(1);
    expect(r.entregada).toBe(1);
    expect(r.vencida).toBe(1); // la entregada no cuenta como vencida
  });

  it('con lista vacía todo en cero', () => {
    expect(resumenEstados([], HOY)).toEqual({ pendiente: 0, 'en-proceso': 0, entregada: 0, vencida: 0, total: 0 });
  });
});

describe('horario', () => {
  const horario = [
    { id: '1', materia: 'Matemática', dia: 'lunes', horaInicio: '07:30', horaFin: '09:00', aula: 'B-2' },
    { id: '2', materia: 'Lenguaje', dia: 'lunes', horaInicio: '09:00', horaFin: '10:30', aula: '' },
    { id: '3', materia: 'Física', dia: 'martes', horaInicio: '08:00', horaFin: '09:30', aula: 'Lab' },
  ];

  it('clasesDelDia devuelve sólo ese día y ordenado por hora', () => {
    expect(clasesDelDia(horario, 'lunes').map((c) => c.materia)).toEqual(['Matemática', 'Lenguaje']);
    expect(clasesDelDia(horario, 'martes').map((c) => c.materia)).toEqual(['Física']);
  });

  it('clasesDelDia con día inexistente devuelve vacío', () => {
    expect(clasesDelDia(horario, 'sábado')).toEqual([]);
  });

  it('diaDeHoy devuelve el día en minúscula', () => {
    expect(diaDeHoy(HOY)).toBe('domingo');
    expect(diaDeHoy('2026-10-12')).toBe('lunes');
    expect(diaDeHoy('2026-10-16')).toBe('viernes');
  });

  it('clasesDeHoy usa el día correcto', () => {
    expect(clasesDeHoy(horario, '2026-10-12').map((c) => c.materia)).toEqual(['Matemática', 'Lenguaje']);
    expect(clasesDeHoy(horario, HOY)).toEqual([]);
  });

  it('horasSemanales suma las duraciones', () => {
    // 2 clases de 1,5 h + 1 de 1,5 h = 4,5 h
    expect(horasSemanales(horario)).toBeCloseTo(4.5, 2);
    expect(horasSemanales([])).toBe(0);
  });

  it('materiasDelHorario lista sin repetir y en orden alfabético', () => {
    expect(materiasDelHorario(horario)).toEqual(['Física', 'Lenguaje', 'Matemática']);
  });

  it('detectarSolapes avisa cuando dos clases del mismo día se cruzan', () => {
    const conflictivo = [
      { materia: 'M', dia: 'lunes', horaInicio: '07:30', horaFin: '09:00' },
      { materia: 'L', dia: 'lunes', horaInicio: '08:30', horaFin: '10:00' },
    ];
    const r = detectarSolapes(conflictivo);
    expect(r.length).toBe(1);
    expect(r[0].mensaje).toContain('lunes');
  });

  it('detectarSolapes no avisa si están pegadas pero no se cruzan', () => {
    expect(detectarSolapes(horario)).toEqual([]);
  });

  it('sin horaFin se supone una clase de 45 minutos', () => {
    const r = detectarSolapes([
      { materia: 'M', dia: 'lunes', horaInicio: '07:30' },
      { materia: 'L', dia: 'lunes', horaInicio: '08:00' },
    ]);
    expect(r.length).toBe(1);
    expect(detectarSolapes([
      { materia: 'M', dia: 'lunes', horaInicio: '07:30' },
      { materia: 'L', dia: 'lunes', horaInicio: '08:15' },
    ])).toEqual([]);
  });
});

describe('tareasParaRecordar', () => {
  it('avisa de lo que vence mañana', () => {
    const r = tareasParaRecordar([tarea('a', '2026-10-12')], {}, HOY);
    expect(r.length).toBe(1);
    expect(r[0].aviso).toBe('manana');
    expect(r[0].mensaje).toContain('Mañana');
  });

  it('avisa de lo que vence hoy', () => {
    const r = tareasParaRecordar([tarea('a', '2026-10-11')], {}, HOY);
    expect(r[0].aviso).toBe('hoy');
    expect(r[0].mensaje).toContain('Hoy');
  });

  it('no repite un aviso ya enviado', () => {
    const lista = [tarea('a', '2026-10-12')];
    const primera = tareasParaRecordar(lista, {}, HOY);
    const hechos = {};
    hechos[primera[0].claveRecordatorio] = true;
    expect(tareasParaRecordar(lista, hechos, HOY)).toEqual([]);
  });

  it('los dos avisos (hoy y mañana) son claves distintas', () => {
    const r = tareasParaRecordar([tarea('a', '2026-10-11'), tarea('a', '2026-10-12')], {}, HOY);
    expect(r.length).toBe(2);
    expect(r[0].claveRecordatorio).not.toBe(r[1].claveRecordatorio);
  });

  it('ignora entregadas, vencidas viejas y las que faltan mucho', () => {
    const r = tareasParaRecordar([
      tarea('e', '2026-10-12', { estado: 'entregada' }),
      tarea('vieja', '2026-10-01'),
      tarea('lejos', '2026-11-20'),
      tarea('ok', '2026-10-12'),
    ], {}, HOY);
    expect(r.map((x) => x.id)).toEqual(['ok']);
  });
});

describe('agruparPorFecha', () => {
  it('agrupa por día y mete lo sin fecha aparte', () => {
    const g = agruparPorFecha([
      tarea('a', '2026-10-12'),
      tarea('b', '2026-10-12'),
      tarea('c', '2026-10-20'),
      tarea('d', ''),
    ]);
    expect(g['2026-10-12'].length).toBe(2);
    expect(g['2026-10-20'].length).toBe(1);
    expect(g['sin-fecha'].length).toBe(1);
  });
});
