import { describe, it, expect } from 'vitest';
import { crearCapa, CLAVES, textoSeguro } from './datos.js';

/* Adaptador en memoria: misma interfaz que localStorage, sin navegador */
function adapterMemoria(inicial) {
  var mem = Object.assign({}, inicial || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    _mem: mem
  };
}

function capaCon(datos) { return crearCapa(adapterMemoria(datos)); }

// Lunes 2026-10-12 y martes 2026-10-13
var LUNES = '2026-10-12';
var MARTES = '2026-10-13';

describe('datos · sanitización', () => {
  it('textoSeguro recorta, quita saltos de línea y descarta tipos raros', () => {
    expect(textoSeguro('  Hola\nmundo\u0007  ')).toBe('Hola mundo');
    expect(textoSeguro('x'.repeat(500), 10).length).toBe(10);
    expect(textoSeguro(123)).toBe('');
    expect(textoSeguro(null)).toBe('');
  });

  it('no lanza con JSON corrupto y devuelve listas vacías', () => {
    var capa = capaCon({ [CLAVES.horario]: '{no es json', [CLAVES.agenda]: '"texto"', [CLAVES.misTareas]: '[1,2]' });
    expect(capa.leerHorario()).toEqual([]);
    expect(capa.leerAgenda()).toEqual([]);
    expect(capa.leerMisTareas()).toEqual([]);
  });

  it('recorta títulos largos guardados por alguien curioso', () => {
    var capa = capaCon({ [CLAVES.misTareas]: JSON.stringify([{ id: 'a1', titulo: 'A'.repeat(900), fecha: LUNES }]) });
    var t = capa.leerMisTareas()[0];
    expect(t.titulo.length).toBe(160);
  });
});

describe('datos · horario y clases del día', () => {
  var horario = [{
    hora: '07:00 - 07:45', Lunes: 'Matemática', Martes: 'Física',
    'Miércoles': 'RECESO', Jueves: 'Química', Viernes: 'Biología'
  }];

  it('leerHorario conserva el formato que ya usa la sección Horario', () => {
    var capa = capaCon({ [CLAVES.horario]: JSON.stringify(horario) });
    expect(capa.leerHorario()[0].Lunes).toBe('Matemática');
    expect(capa.leerHorario()[0]['Miércoles']).toBe('RECESO');
  });

  it('clasesDelDia devuelve solo las del día, marcando receso y almuerzo', () => {
    var capa = capaCon({ [CLAVES.horario]: JSON.stringify(horario) });
    var lunes = capa.clasesDelDia(LUNES);
    expect(lunes).toEqual([{ hora: '07:00 - 07:45', materia: 'Matemática', tipo: 'clase' }]);
    expect(capa.clasesDelDia(LUNES + 'T09:00:00')).toHaveLength(1);
    expect(capa.clasesDelDia(MARTES)[0].materia).toBe('Física');
  });

  it('clasesDelDia marca receso y almuerzo, y no hay clases el fin de semana', () => {
    var capa = capaCon({
      [CLAVES.horario]: JSON.stringify([{ hora: '10:00', Lunes: 'RECESO', Martes: 'ALMUERZO' }])
    });
    expect(capa.clasesDelDia(LUNES)[0].tipo).toBe('receso');
    expect(capa.clasesDelDia(MARTES)[0].tipo).toBe('almuerzo');
    expect(capa.clasesDelDia('2026-10-17')).toEqual([]); // sábado
  });

  it('proximaClaseHoy devuelve la clase en curso o la que sigue', () => {
    var capa = capaCon({
      [CLAVES.horario]: JSON.stringify([
        { hora: '07:00', Lunes: 'Matemática' },
        { hora: '08:00', Lunes: 'Física' }
      ])
    });
    expect(capa.proximaClaseHoy(7 * 60 + 10, LUNES).materia).toBe('Matemática'); // en curso
    expect(capa.proximaClaseHoy(9 * 60, LUNES).materia).toBe('Física');         // la que sigue
    expect(capa.proximaClaseHoy(20 * 60, LUNES)).toBe(null);                    // ya se fue
    expect(capa.proximaClaseHoy(null, LUNES).materia).toBe('Matemática');       // sin hora: la primera
  });
});

describe('datos · mis tareas (captura rápida)', () => {
  it('crea, lista, marca y borra', () => {
    var capa = capaCon();
    var creada = capa.agregarMisTarea({ titulo: 'Leer el capítulo 4', materia: 'Literatura', fecha: MARTES });
    expect(creada.titulo).toBe('Leer el capítulo 4');
    expect(creada.fecha).toBe(MARTES);
    expect(creada.hecha).toBe(false);
    expect(capa.leerMisTareas()).toHaveLength(1);

    capa.alternarMisTarea(creada.id);
    expect(capa.leerMisTareas()[0].hecha).toBe(true);

    expect(capa.eliminarMisTarea(creada.id)).toBe(true);
    expect(capa.leerMisTareas()).toHaveLength(0);
  });

  it('no crea tareas vacías ni con solo espacios', () => {
    var capa = capaCon();
    expect(capa.agregarMisTarea({ titulo: '   ' })).toBe(null);
    expect(capa.agregarMisTarea({})).toBe(null);
    expect(capa.agregarMisTarea({ titulo: 42 })).toBe(null);
    expect(capa.leerMisTareas()).toHaveLength(0);
  });

  it('si no lleva fecha, vence hoy', () => {
    var capa = capaCon();
    var creada = capa.agregarMisTarea({ titulo: 'Practicar inglés' });
    expect(creada.fecha).toBe(hoyLocal());
  });

  it('las ids no se repiten aunque se llame muy rápido', () => {
    var capa = capaCon();
    var ids = {};
    for (var i = 0; i < 50; i++) ids[capa.agregarMisTarea({ titulo: 'T' + i }).id] = true;
    expect(Object.keys(ids)).toHaveLength(50);
  });

  it('ignora registros rotos al leer', () => {
    var capa = capaCon({
      [CLAVES.misTareas]: JSON.stringify([
        { id: 'ok', titulo: 'Válida', fecha: LUNES },
        { titulo: 'Sin id' },
        { id: 'vacia', titulo: '' },
        null
      ])
    });
    expect(capa.leerMisTareas()).toHaveLength(1);
    expect(capa.leerMisTareas()[0].titulo).toBe('Válida');
  });
});

function hoyLocal() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

describe('datos · tareas que vencen hoy y mañana', () => {
  it('une tareas personales y del docente, sin hechas ni vencidas', () => {
    var capa = capaCon({
      [CLAVES.misTareas]: JSON.stringify([
        { id: 'm1', titulo: 'Terminar ensayo', fecha: LUNES, hecha: false },
        { id: 'm2', titulo: 'Ya hecha', fecha: LUNES, hecha: true },
        { id: 'm3', titulo: 'La de la otra semana', fecha: '2026-10-30', hecha: false }
      ]),
      [CLAVES.tareasDocente]: JSON.stringify([
        { titulo: 'Ejercicio 12', materia: 'Matemática', fecha: MARTES },
        { titulo: 'Informe', materia: 'Química', fecha: '2026-10-20' },
        { titulo: 'Vieja', materia: 'Física', fecha: '2026-10-01' }
      ]),
      [CLAVES.entregas]: JSON.stringify([])
    });
    var lista = capa.tareasDe(LUNES);
    // 'Ya hecha' (personal) se queda visible con tachado; las del
    // docente entregadas y las de más adelante no aparecen.
    expect(lista.map(function (t) { return t.titulo; })).toEqual(['Terminar ensayo', 'Ya hecha', 'Ejercicio 12']);
    expect(lista[0].personal).toBe(true);
    expect(lista[1].hecha).toBe(true);
    expect(lista[2].personal).toBe(false);
  });

  it('no lista una tarea del docente ya entregada', () => {
    var capa = capaCon({
      [CLAVES.tareasDocente]: JSON.stringify([{ titulo: 'Ejercicio 12', fecha: LUNES }]),
      [CLAVES.entregas]: JSON.stringify([{ tareaIdx: 0, estudiante: 'invitado', fecha: LUNES }])
    });
    expect(capa.tareasDe(LUNES)).toHaveLength(0);
  });
});

describe('datos · tiempo de estudio del Pomodoro', () => {
  it('suma minutos por día y respeta los topes', () => {
    var capa = capaCon();
    expect(capa.minutosEstudiadosHoy(LUNES)).toBe(0);
    expect(capa.registrarMinutosEstudio(25, LUNES)).toBe(25);
    expect(capa.registrarMinutosEstudio(25, LUNES)).toBe(25);
    expect(capa.minutosEstudiadosHoy(LUNES)).toBe(50);
    expect(capa.minutosEstudiadosHoy(MARTES)).toBe(0);

    expect(capa.registrarMinutosEstudio(-10, MARTES)).toBe(0);
    expect(capa.registrarMinutosEstudio('abc', MARTES)).toBe(0);
    expect(capa.registrarMinutosEstudio(9999, MARTES)).toBe(180); // tope por llamada
  });

  it('aguanta un registro corrupto sin explotar', () => {
    var capa = capaCon({ [CLAVES.estudioTiempo]: JSON.stringify({ [LUNES]: 'veinte' }) });
    expect(capa.minutosEstudiadosHoy(LUNES)).toBe(0);
    capa.registrarMinutosEstudio(25, LUNES);
    expect(capa.minutosEstudiadosHoy(LUNES)).toBe(25);
  });
});

describe('datos · próxima evaluación con cuenta regresiva', () => {
  it('elige el examen más cercano con fecha', () => {
    var capa = capaCon({
      [CLAVES.examenes]: JSON.stringify([
        { titulo: 'Examen de Química', fecha: '2026-10-20', tiempo: 45 },
        { titulo: 'Examen de Física', fecha: MARTES, tiempo: 30 },
        { titulo: 'Sin fecha todavía', tiempo: 30 }
      ])
    });
    var prox = capa.proximaEvaluacion(LUNES);
    expect(prox.titulo).toBe('Examen de Física');
    expect(prox.tipo).toBe('Examen');
    expect(prox.dias).toBe(1);
  });

  it('también cuenta eventos del calendario que suenen a evaluación', () => {
    var capa = capaCon({
      [CLAVES.calendario]: JSON.stringify([
        { titulo: 'Día del maestro', fecha: MARTES },
        { titulo: 'Examen de Literatura', fecha: '2026-10-14' },
        { titulo: 'Examen viejo', fecha: '2026-01-01' }
      ])
    });
    var prox = capa.proximaEvaluacion(LUNES);
    expect(prox.titulo).toBe('Examen de Literatura');
    expect(prox.tipo).toBe('Evaluación');
    expect(prox.dias).toBe(2);
  });

  it('devuelve null si no hay nada próximo', () => {
    expect(capaCon().proximaEvaluacion(LUNES)).toBe(null);
    var capa = capaCon({ [CLAVES.calendario]: JSON.stringify([{ titulo: 'Examen pasado', fecha: '2026-01-01' }]) });
    expect(capa.proximaEvaluacion(LUNES)).toBe(null);
  });
});

describe('datos · tutorial de primer uso', () => {
  it('empieza sin ver, se marca y se puede reiniciar', () => {
    var capa = capaCon();
    expect(capa.onboardingVisto()).toBe(false);
    capa.marcarOnboardingVisto();
    expect(capa.onboardingVisto()).toBe(true);
    capa.reiniciarOnboarding();
    expect(capa.onboardingVisto()).toBe(false);
  });

  it('un guardado corrupto se toma como "no visto"', () => {
    expect(capaCon({ [CLAVES.onboarding]: 'xyz' }).onboardingVisto()).toBe(false);
  });
});
