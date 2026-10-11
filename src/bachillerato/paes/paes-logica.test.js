/* Tests de la lógica pura de la preparación PAES. */
import { describe, it, expect } from 'vitest';
import {
  validarBanco, seleccionarPreguntas, ordenarOpciones,
  calificarSimulacro, temasAPracticar,
  crearTemporizador, formatearTiempo, segundosPorPregunta,
  tarjetaNueva, validarTarjeta, programarRepaso, tarjetasParaRepasar,
  resumenCajas, INTERVALOS_LEITNER, CAJA_MAXIMA,
  avanceMeta, serieHistorial,
} from './paes-logica.js';

/* --------- Bancos y preguntas de prueba --------- */
function pregunta(id, extra) {
  return Object.assign({
    id,
    enunciado: 'Pregunta ' + id,
    opciones: [{ id: 'a', texto: 'Opción A' }, { id: 'b', texto: 'Opción B' }],
    correcta: 'a',
    tema: 'Álgebra',
  }, extra || {});
}

function bancoValido() {
  return {
    materia: 'Matemática',
    preguntas: [pregunta('p1'), pregunta('p2', { correcta: 'b', tema: 'Geometría' }), pregunta('p3')],
  };
}

describe('validarBanco', () => {
  it('acepta un banco bien formado', () => {
    const r = validarBanco(bancoValido());
    expect(r.valido).toBe(true);
    expect(r.errores).toEqual([]);
    expect(r.preguntasValidas.length).toBe(3);
  });

  it('rechaza algo que no es un objeto', () => {
    expect(validarBanco(null).valido).toBe(false);
    expect(validarBanco('texto').valido).toBe(false);
  });

  it('rechaza un banco sin la lista de preguntas', () => {
    expect(validarBanco({ materia: 'X' }).valido).toBe(false);
  });

  it('avisa si el banco está vacío', () => {
    const r = validarBanco({ materia: 'X', preguntas: [] });
    expect(r.valido).toBe(false);
    expect(r.errores.join(' ')).toContain('ninguna pregunta');
  });

  it('detecta id repetido', () => {
    const r = validarBanco({ materia: 'X', preguntas: [pregunta('p1'), pregunta('p1')] });
    expect(r.valido).toBe(false);
    expect(r.errores.join(' ')).toContain('se repite');
  });

  it('detecta pregunta sin enunciado', () => {
    const r = validarBanco({ materia: 'X', preguntas: [pregunta('p1', { enunciado: '  ' })] });
    expect(r.valido).toBe(false);
  });

  it('exige al menos dos opciones', () => {
    const r = validarBanco({
      materia: 'X',
      preguntas: [pregunta('p1', { opciones: [{ id: 'a', texto: 'Única' }] })],
    });
    expect(r.valido).toBe(false);
    expect(r.errores.join(' ')).toContain('2 opciones');
  });

  it('exige que la respuesta correcta exista entre las opciones', () => {
    const r = validarBanco({ materia: 'X', preguntas: [pregunta('p1', { correcta: 'z' })] });
    expect(r.valido).toBe(false);
    expect(r.errores.join(' ')).toContain('no está entre las opciones');
  });

  it('exige id y texto en cada opción', () => {
    const r = validarBanco({
      materia: 'X',
      preguntas: [pregunta('p1', { opciones: [{ id: 'a', texto: 'x' }, { texto: 'sin id' }] })],
    });
    expect(r.valido).toBe(false);
  });

  it('rechaza una explicación que no es texto', () => {
    const r = validarBanco({ materia: 'X', preguntas: [pregunta('p1', { explicacion: 42 })] });
    expect(r.valido).toBe(false);
  });

  it('sigue devolviendo las preguntas válidas junto con los errores', () => {
    const r = validarBanco({
      materia: 'X',
      preguntas: [pregunta('ok'), pregunta('malo', { correcta: 'no-existe' })],
    });
    expect(r.valido).toBe(false);
    expect(r.preguntasValidas.map((p) => p.id)).toEqual(['ok']);
  });
});

describe('seleccionarPreguntas', () => {
  const banco = [pregunta('a'), pregunta('b'), pregunta('c'), pregunta('d'), pregunta('e')];

  it('devuelve la cantidad pedida', () => {
    expect(seleccionarPreguntas(banco, 3).length).toBe(3);
  });

  it('no devuelve más de las que hay', () => {
    expect(seleccionarPreguntas(banco, 50).length).toBe(5);
  });

  it('es determinista con la misma semilla', () => {
    const uno = seleccionarPreguntas(banco, 3, 42).map((p) => p.id);
    const dos = seleccionarPreguntas(banco, 3, 42).map((p) => p.id);
    expect(uno).toEqual(dos);
  });

  it('con semillas distintas suele cambiar el orden', () => {
    const uno = seleccionarPreguntas(banco, 5, 1).map((p) => p.id);
    const dos = seleccionarPreguntas(banco, 5, 2).map((p) => p.id);
    expect(uno).not.toEqual(dos);
  });

  it('no repite preguntas dentro de una misma selección', () => {
    const elegidas = seleccionarPreguntas(banco, 5, 7);
    expect(new Set(elegidas.map((p) => p.id)).size).toBe(5);
  });

  it('con lista vacía devuelve vacío', () => {
    expect(seleccionarPreguntas([], 5)).toEqual([]);
  });
});

describe('ordenarOpciones', () => {
  it('conserva las mismas opciones, en distinto orden', () => {
    const p = pregunta('x');
    const ordenadas = ordenarOpciones(p, 3);
    expect(ordenadas.opciones.length).toBe(p.opciones.length);
    expect(new Set(ordenadas.opciones.map((o) => o.id))).toEqual(new Set(['a', 'b']));
  });

  it('es determinista', () => {
    expect(ordenarOpciones(pregunta('x'), 9).opciones).toEqual(ordenarOpciones(pregunta('x'), 9).opciones);
  });

  it('no toca la pregunta original', () => {
    const p = pregunta('x');
    const antes = JSON.stringify(p.opciones);
    ordenarOpciones(p, 4);
    expect(JSON.stringify(p.opciones)).toBe(antes);
  });
});

describe('calificarSimulacro', () => {
  const preguntas = [
    pregunta('q1', { tema: 'Álgebra' }),
    pregunta('q2', { tema: 'Álgebra', correcta: 'b' }),
    pregunta('q3', { tema: 'Geometría' }),
    pregunta('q4', { tema: 'Geometría', correcta: 'b' }),
  ];

  it('califica correctamente', () => {
    const r = calificarSimulacro(preguntas, { q1: 'a', q2: 'b', q3: 'b', q4: 'a' });
    expect(r.total).toBe(4);
    expect(r.correctas).toBe(2);
    expect(r.incorrectas).toBe(2);
    expect(r.sinResponder).toBe(0);
    expect(r.porcentaje).toBe(50);
  });

  it('cuenta las preguntas sin responder aparte', () => {
    const r = calificarSimulacro(preguntas, { q1: 'a' });
    expect(r.correctas).toBe(1);
    expect(r.sinResponder).toBe(3);
    expect(r.incorrectas).toBe(0);
  });

  it('las respuestas incorrectas no cuentan como sin responder', () => {
    const r = calificarSimulacro(preguntas, { q1: 'z', q2: 'a' });
    expect(r.incorrectas).toBe(2);
    expect(r.sinResponder).toBe(2);
  });

  it('desglosa por tema, del peor al mejor', () => {
    const r = calificarSimulacro(preguntas, { q1: 'a', q2: 'b', q3: 'a', q4: 'a' });
    const temas = r.porTema.map((t) => t.tema);
    expect(temas).toEqual(['Geometría', 'Álgebra']);
    expect(r.porTema[0].porcentaje).toBe(50);
    expect(r.porTema[1].porcentaje).toBe(100);
  });

  it('agrupa lo que no tiene tema en «Sin tema»', () => {
    const r = calificarSimulacro([pregunta('q1', { tema: '' })], { q1: 'a' });
    expect(r.porTema[0].tema).toBe('Sin tema');
  });

  it('con cero preguntas no divide entre cero', () => {
    const r = calificarSimulacro([], {});
    expect(r.total).toBe(0);
    expect(r.porcentaje).toBe(0);
    expect(r.porTema).toEqual([]);
  });

  it('redondea el porcentaje a un decimal', () => {
    const ps = [pregunta('a'), pregunta('b'), pregunta('c')];
    expect(calificarSimulacro(ps, { a: 'a', b: 'a' }).porcentaje).toBe(66.7);
  });
});

describe('temasAPracticar', () => {
  it('devuelve los temas con menos aciertos, hasta el máximo', () => {
    // Álgebra queda con 100 % y Geometría con 0 %
    const r = calificarSimulacro([
      pregunta('a', { tema: 'Álgebra' }),
      pregunta('b', { tema: 'Álgebra' }),
      pregunta('c', { tema: 'Geometría', correcta: 'b' }),
    ], { a: 'a', b: 'a', c: 'a' });
    expect(temasAPracticar(r, 1)).toEqual(['Geometría']);
  });

  it('deja fuera los temas con 100 % de acierto', () => {
    const r = calificarSimulacro([pregunta('a', { tema: 'Álgebra' })], { a: 'a' });
    expect(temasAPracticar(r)).toEqual([]);
  });
});

describe('crearTemporizador', () => {
  const inicio = 1000000;

  it('cuenta hacia atrás desde la marca de inicio', () => {
    const t = crearTemporizador(60, inicio);
    expect(t.restante(inicio)).toBe(60);
    expect(t.restante(inicio + 10000)).toBe(50);
  });

  it('nunca baja de cero', () => {
    const t = crearTemporizador(60, inicio);
    expect(t.restante(inicio + 10 * 60 * 1000)).toBe(0);
    expect(t.terminado(inicio + 10 * 60 * 1000)).toBe(true);
  });

  it('no terminado antes del tiempo', () => {
    expect(crearTemporizador(60, inicio).terminado(inicio + 59000)).toBe(false);
  });

  it('el avance va de 0 a 1', () => {
    const t = crearTemporizador(60, inicio);
    expect(t.avance(inicio)).toBe(0);
    expect(t.avance(inicio + 30000)).toBeCloseTo(0.5, 3);
    expect(t.avance(inicio + 999000)).toBe(1);
  });

  it('con duración cero el avance es 0 y ya está terminado', () => {
    const t = crearTemporizador(0, inicio);
    expect(t.avance(inicio)).toBe(0);
    expect(t.terminado(inicio)).toBe(true);
  });

  it('sobrevive a guardar y volver a montar (misma marca de inicio)', () => {
    const guardado = { duracion: 120, inicio: 5000 };
    const t = crearTemporizador(guardado.duracion, guardado.inicio);
    expect(t.restante(60000)).toBe(65); // 55 s transcurridos de 120
  });
});

describe('formatearTiempo', () => {
  it('formatea minutos y segundos', () => {
    expect(formatearTiempo(0)).toBe('00:00');
    expect(formatearTiempo(65)).toBe('01:05');
    expect(formatearTiempo(600)).toBe('10:00');
  });

  it('agrega horas cuando hace falta', () => {
    expect(formatearTiempo(3600)).toBe('1:00:00');
    expect(formatearTiempo(3661)).toBe('1:01:01');
  });

  it('valores negativos o inválidos quedan en cero', () => {
    expect(formatearTiempo(-5)).toBe('00:00');
    expect(formatearTiempo('x')).toBe('00:00');
  });
});

describe('segundosPorPregunta', () => {
  it('reparte el tiempo por pregunta', () => {
    expect(segundosPorPregunta(120, 10)).toBe(12);
  });

  it('con cero preguntas devuelve cero', () => {
    expect(segundosPorPregunta(120, 0)).toBe(0);
  });
});

describe('tarjetas de repaso (Leitner)', () => {
  const HOY = '2026-10-11';

  it('tarjetaNueva arranca en la caja 1 sin fecha de repaso', () => {
    const t = tarjetaNueva('¿Qué es una hipotenusa?', 'El lado mayor del triángulo rectángulo');
    expect(t.caja).toBe(1);
    expect(t.proximaRevision).toBe(null);
    expect(t.vueltas).toBe(0);
  });

  it('validarTarjeta exige frente y dorso', () => {
    expect(validarTarjeta(tarjetaNueva('a', 'b'))).toEqual([]);
    expect(validarTarjeta(tarjetaNueva('  ', 'b')).length).toBeGreaterThan(0);
    expect(validarTarjeta(tarjetaNueva('a', '  ')).length).toBeGreaterThan(0);
  });

  it('un acierto sube de caja y aleja la próxima revisión', () => {
    const t = programarRepaso(tarjetaNueva('a', 'b'), true, HOY);
    expect(t.caja).toBe(2);
    expect(t.proximaRevision).toBe('2026-10-13'); // 2 días
    expect(t.vueltas).toBe(1);
  });

  it('un error devuelve la tarjeta a la caja 1', () => {
    const subida = programarRepaso(tarjetaNueva('a', 'b'), true, HOY);
    const bajada = programarRepaso(subida, false, HOY);
    expect(bajada.caja).toBe(1);
    expect(bajada.proximaRevision).toBe('2026-10-12'); // mañana
  });

  it('las cajas siguen los intervalos oficiales de Leitner', () => {
    let t = tarjetaNueva('a', 'b');
    const fechas = [];
    for (let i = 0; i < 5; i++) {
      t = programarRepaso(t, true, HOY);
      fechas.push(t.caja);
    }
    expect(fechas).toEqual([2, 3, 4, 5, 5]); // no pasa de la caja máxima
    expect(INTERVALOS_LEITNER.length).toBe(CAJA_MAXIMA);
    expect(t.proximaRevision).toBe('2026-10-27'); // 16 días
  });

  it('no modifica la tarjeta original', () => {
    const original = tarjetaNueva('a', 'b');
    programarRepaso(original, true, HOY);
    expect(original.caja).toBe(1);
    expect(original.vueltas).toBe(0);
  });

  it('tarjetasParaRepasar trae las vencidas y las nunca repasadas', () => {
    const hoy = tarjetaNueva('hoy', 'x');
    hoy.proximaRevision = HOY;
    const manana = tarjetaNueva('mañana', 'y');
    manana.proximaRevision = '2026-10-12';
    const nueva = tarjetaNueva('nueva', 'z');
    const ids = tarjetasParaRepasar([hoy, manana, nueva], HOY).map((t) => t.frente);
    expect(ids).toEqual(['hoy', 'nueva']);
  });

  it('tarjetasParaRepasar ignora entradas corruptas', () => {
    expect(tarjetasParaRepasar([null, undefined, {}], HOY).length).toBe(1);
  });

  it('resumenCajas cuenta cuántas hay en cada caja', () => {
    const a = tarjetaNueva('a', 'b');
    a.caja = 3;
    const b = tarjetaNueva('c', 'd');
    b.caja = 3;
    expect(resumenCajas([a, b, tarjetaNueva('e', 'f')]))
      .toEqual({ 1: 1, 2: 0, 3: 2, 4: 0, 5: 0 });
  });

  it('resumenCajas limita los valores fuera de rango', () => {
    const alto = tarjetaNueva('a', 'b');
    alto.caja = 99;
    const bajo = tarjetaNueva('c', 'd');
    bajo.caja = -3;
    expect(resumenCajas([alto, bajo])).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 });
  });
});

describe('avanceMeta', () => {
  it('compara el mejor resultado con la meta', () => {
    const r = avanceMeta(70, [{ porcentaje: 40 }, { porcentaje: 65 }]);
    expect(r.mejor).toBe(65);
    expect(r.alcanzada).toBe(false);
    expect(r.faltanPuntos).toBe(5);
  });

  it('marca la meta como alcanzada', () => {
    const r = avanceMeta(70, [{ porcentaje: 80 }]);
    expect(r.alcanzada).toBe(true);
    expect(r.faltanPuntos).toBe(0);
    expect(r.progreso).toBe(1);
  });

  it('con meta cero no marca nada como alcanzado', () => {
    const r = avanceMeta(0, [{ porcentaje: 100 }]);
    expect(r.alcanzada).toBe(false);
    expect(r.progreso).toBe(0);
  });

  it('sin historial el mejor es 0', () => {
    expect(avanceMeta(50, []).mejor).toBe(0);
  });
});

describe('serieHistorial', () => {
  it('arma puntos dentro del área de la gráfica', () => {
    const serie = serieHistorial([{ porcentaje: 0 }, { porcentaje: 100 }], 100, 100);
    expect(serie.length).toBe(2);
    expect(serie[0].y).toBe(100); // 0 % va abajo
    expect(serie[1].y).toBe(0);   // 100 % va arriba
  });

  it('limita la serie a 12 puntos para que se lea en un celular', () => {
    const muchos = [];
    for (let i = 0; i < 30; i++) muchos.push({ porcentaje: i });
    expect(serieHistorial(muchos).length).toBe(12);
  });

  it('con un solo punto empieza en el borde izquierdo', () => {
    expect(serieHistorial([{ porcentaje: 50 }], 100, 100)[0].x).toBe(0);
  });

  it('ignora entradas corruptas', () => {
    expect(serieHistorial([null, { porcentaje: 50 }, 'x']).length).toBe(1);
  });
});
