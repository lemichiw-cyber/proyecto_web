/* ===================================================================
   datos.js — capa de datos única del estudiante.
   Todo pasa por aquí: ninguna vista lee localStorage directamente.
   - Usa las MISMAS claves que ya escribe el resto de la app, así que
     lo que se creó en la sección Tareas, Horario o Exámenes se ve en
     la pantalla "Hoy" sin migrar nada.
   - 100% local: nada sale del dispositivo y funciona sin conexión.
   - Sanitiza todo lo que sale (texto recortado, listas acotadas):
     lo que se guarda puede venir de un campo de texto de un menor.
   - El adaptador es inyectable para poder testear sin navegador.
   =================================================================== */

import { hoyISO, diasHasta, parsearFecha, minutoHora } from './fechas.js';

export var CLAVES = {
  horario: 'horarioItems',
  agenda: 'agendaItems',
  calendario: 'calEventos',
  tareasDocente: 'bachillerato_tareas',
  entregas: 'bachillerato_entregas',
  examenes: 'bachillerato_examenes',
  misTareas: 'cherrybombMisTareas',
  estudioTiempo: 'cherrybombEstudioTiempo',
  onboarding: 'cherrybombOnboarding'
};

var MAX_LISTA = 500;
var MAX_TITULO = 160;
var MAX_DETALLE = 500;
var MINUTOS_POR_LLAMADA = 180;   // nadie estudia 10 horas en un clic
var MINUTOS_POR_DIA = 24 * 60;

/* ---------- texto seguro ---------------------------------------- */
export function textoSeguro(valor, max) {
  if (typeof valor !== 'string') return '';
  var lim = max || MAX_TITULO;
  var limpio = '';
  for (var i = 0; i < valor.length; i++) {
    var cod = valor.charCodeAt(i);
    limpio += (cod < 32 || cod === 127) ? ' ' : valor.charAt(i);
  }
  return limpio.replace(/\s+/g, ' ').trim().slice(0, lim);
}

function numeroSeguro(valor, defecto, min, max) {
  var n = Number(valor);
  if (!isFinite(n)) return defecto;
  return Math.min(max, Math.max(min, n));
}

function fechaSegura(valor) {
  // La guardamos tal cual la escribió el input (YYYY-MM-DD) si cumple el patrón
  if (typeof valor !== 'string') return '';
  var m = /^\s*(\d{4}-\d{2}-\d{2})/.exec(valor);
  return m ? m[1] : '';
}

/* ---------- adaptador por defecto -------------------------------- */
function adaptadorLocalStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.getItem('cb-probe', '1');
      return window.localStorage;
    }
  } catch (e) { /* modo privado o sin storage: cae a memoria */ }
  var mem = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}

function leerLista(adaptador, clave) {
  try {
    var bruto = adaptador.getItem(clave);
    if (!bruto) return [];
    var datos = JSON.parse(bruto);
    if (!Array.isArray(datos)) return [];
    return datos.slice(0, MAX_LISTA);
  } catch (e) { return []; }
}

function leerObjeto(adaptador, clave) {
  try {
    var bruto = adaptador.getItem(clave);
    if (!bruto) return {};
    var datos = JSON.parse(bruto);
    return datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {};
  } catch (e) { return {}; }
}

/* ---------- fábrica ---------------------------------------------- */
export function crearCapa(adaptador) {
  var ad = adaptador || adaptadorLocalStorage();

  function guardarLista(clave, lista) {
    ad.setItem(clave, JSON.stringify(lista.slice(0, MAX_LISTA)));
  }

  function leerObjetoJSON(clave) { return leerObjeto(ad, clave); }

  var capa = {
    /* ===== HORARIO (mismo formato que la sección Horario) ===== */
    leerHorario: function () {
      return leerLista(ad, CLAVES.horario).map(function (fila) {
        return {
          hora: textoSeguro(fila && fila.hora, 40),
          Lunes: textoSeguro(fila && fila.Lunes, MAX_DETALLE),
          Martes: textoSeguro(fila && fila.Martes, MAX_DETALLE),
          'Miércoles': textoSeguro(fila && fila['Miércoles'], MAX_DETALLE),
          Jueves: textoSeguro(fila && fila.Jueves, MAX_DETALLE),
          Viernes: textoSeguro(fila && fila.Viernes, MAX_DETALLE)
        };
      });
    },

    /* Clases del día: [{ hora, materia, tipo: 'clase'|'receso'|'almuerzo' }] */
    clasesDelDia: function (fecha) {
      var diaClave = diaDeLaSemana(fecha);
      if (!diaClave) return [];
      return capa.leerHorario().reduce(function (acc, fila) {
        var materia = fila[diaClave];
        if (!materia) return acc;
        var arriba = materia.toUpperCase();
        var tipo = arriba === 'RECESO' ? 'receso' : (arriba === 'ALMUERZO' ? 'almuerzo' : 'clase');
        acc.push({ hora: textoSeguro(fila.hora, 40), materia: materia, tipo: tipo });
        return acc;
      }, []);
    },

    /* ===== AGENDA (artículos de "hoy" sin fecha) ===== */
    leerAgenda: function () {
      return leerLista(ad, CLAVES.agenda).map(function (it) {
        return { titulo: textoSeguro(it && it.titulo, MAX_TITULO), hora: textoSeguro(it && it.hora, 40) };
      }).filter(function (it) { return !!it.titulo; });
    },

    /* ===== CALENDARIO (eventos con fecha) ===== */
    leerEventos: function () {
      return leerLista(ad, CLAVES.calendario).map(function (ev) {
        return { titulo: textoSeguro(ev && ev.titulo, MAX_TITULO), fecha: fechaSegura(ev && ev.fecha) };
      }).filter(function (ev) { return !!ev.titulo && !!ev.fecha; });
    },

    /* ===== TAREAS DEL DOCENTE (misma colección de siempre) ===== */
    leerTareasDocente: function () {
      return leerLista(ad, CLAVES.tareasDocente).map(function (t) {
        return {
          titulo: textoSeguro(t && t.titulo, MAX_TITULO),
          desc: textoSeguro(t && t.desc, MAX_DETALLE),
          materia: textoSeguro(t && t.materia, 40),
          grupo: textoSeguro(t && t.grupo, 10),
          fecha: fechaSegura(t && t.fecha)
        };
      });
    },

    leerEntregas: function () {
      return leerLista(ad, CLAVES.entregas).map(function (e) {
        return {
          tareaIdx: numeroSeguro(e && e.tareaIdx, -1, -1, 100000),
          estudiante: textoSeguro(e && e.estudiante, 80),
          fecha: fechaSegura(e && e.fecha)
        };
      });
    },

    /* ===== EXÁMENES (los del creador de exámenes) ===== */
    leerExamenes: function () {
      return leerLista(ad, CLAVES.examenes).map(function (ex) {
        return {
          titulo: textoSeguro(ex && ex.titulo, MAX_TITULO),
          tiempo: numeroSeguro(ex && ex.tiempo, 0, 0, 600),
          notamin: numeroSeguro(ex && ex.notamin, 60, 0, 100),
          intentos: numeroSeguro(ex && ex.intentos, 3, 1, 20),
          fecha: fechaSegura(ex && ex.fecha),
          creado: textoSeguro(ex && ex.creado, 40)
        };
      });
    },

    /* Próxima evaluación real: examen con fecha > hoy, o evento de
       calendario que suene a evaluación. null si no hay nada. */
    proximaEvaluacion: function (hoy) {
      var base = hoy || hoyISO();
      var candidatos = [];
      capa.leerExamenes().forEach(function (ex) {
        if (!ex.fecha || !ex.titulo) return;
        candidatos.push({ titulo: ex.titulo, fecha: ex.fecha, tipo: 'Examen', minutos: ex.tiempo });
      });
      capa.leerEventos().forEach(function (ev) {
        var t = ev.titulo.toLowerCase();
        if (!/examen|evaluaci|prueba|parcial|final/.test(t)) return;
        candidatos.push({ titulo: ev.titulo, fecha: ev.fecha, tipo: 'Evaluación', minutos: 0 });
      });
      var futuras = candidatos.filter(function (c) { return diasHasta(c.fecha, base) >= 0; });
      futuras.sort(function (a, b) { return diasHasta(a.fecha, base) - diasHasta(b.fecha, base); });
      var mejor = futuras[0];
      if (!mejor) return null;
      mejor.dias = diasHasta(mejor.fecha, base);
      return mejor;
    },

    /* ===== MIS TAREAS (tarea personal del estudiante, local) ===== */
    leerMisTareas: function () {
      return leerLista(ad, CLAVES.misTareas).map(function (t) {
        return {
          id: textoSeguro(t && t.id, 40),
          titulo: textoSeguro(t && t.titulo, MAX_TITULO),
          materia: textoSeguro(t && t.materia, 40),
          fecha: fechaSegura(t && t.fecha),
          creada: textoSeguro(t && t.creada, 40),
          hecha: !!(t && t.hecha)
        };
      }).filter(function (t) { return !!t.id && !!t.titulo; });
    },

    /* Crea una tarea personal. Devuelve la tarea o null si no es válida. */
    agregarMisTarea: function (datos) {
      var titulo = textoSeguro(datos && datos.titulo, MAX_TITULO);
      if (!titulo) return null;
      var lista = capa.leerMisTareas();
      var nueva = {
        id: 'mt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        titulo: titulo,
        materia: textoSeguro(datos && datos.materia, 40),
        fecha: fechaSegura(datos && datos.fecha) || hoyISO(),
        creada: new Date().toISOString(),
        hecha: false
      };
      lista.push(nueva);
      guardarLista(CLAVES.misTareas, lista);
      return nueva;
    },

    alternarMisTarea: function (id) {
      var lista = capa.leerMisTareas();
      var encontrada = null;
      lista.forEach(function (t) { if (t.id === id) { t.hecha = !t.hecha; encontrada = t; } });
      if (encontrada) guardarLista(CLAVES.misTareas, lista);
      return encontrada;
    },

    eliminarMisTarea: function (id) {
      var lista = capa.leerMisTareas();
      var quedan = lista.filter(function (t) { return t.id !== id; });
      if (quedan.length === lista.length) return false;
      guardarLista(CLAVES.misTareas, quedan);
      return true;
    },

    /* ===== TIEMPO DE ESTUDIO (lo registra el Pomodoro) ===== */
    tiempoEstudioTodo: function () { return leerObjetoJSON(CLAVES.estudioTiempo); },

    minutosEstudiadosHoy: function (hoy) {
      var registro = capa.tiempoEstudioTodo();
      var clave = hoy || hoyISO();
      return numeroSeguro(registro[clave], 0, 0, MINUTOS_POR_DIA);
    },

    registrarMinutosEstudio: function (minutos, hoy) {
      var m = numeroSeguro(minutos, 0, 0, MINUTOS_POR_LLAMADA);
      if (m <= 0) return 0;
      var clave = hoy || hoyISO();
      var registro = capa.tiempoEstudioTodo();
      var ya = numeroSeguro(registro[clave], 0, 0, MINUTOS_POR_DIA);
      var total = Math.min(MINUTOS_POR_DIA, ya + m);
      registro[clave] = total;
      ad.setItem(CLAVES.estudioTiempo, JSON.stringify(registro));
      return total - ya;
    },

    /* ===== TUTORIAL DE PRIMER USO ===== */
    onboardingVisto: function () {
      try { return !!leerObjetoJSON(CLAVES.onboarding).visto; } catch (e) { return false; }
    },
    marcarOnboardingVisto: function () {
      ad.setItem(CLAVES.onboarding, JSON.stringify({ visto: true, fecha: hoyISO() }));
    },
    reiniciarOnboarding: function () { ad.removeItem(CLAVES.onboarding); },

    /* ===== utilidades para la pantalla Hoy ===== */
    /* Tareas (docente + personales) que vencen hoy o mañana */
    tareasDe: function (hoy) {
      var base = hoy || hoyISO();
      var entregas = capa.leerEntregas();
      var mias = capa.leerMisTareas().map(function (t) {
        return { titulo: t.titulo, materia: t.materia, fecha: t.fecha, personal: true, hecha: t.hecha, id: t.id };
      });
      var delDocente = capa.leerTareasDocente().map(function (t, idx) {
        var entregada = entregas.some(function (e) { return e.tareaIdx === idx; });
        return { titulo: t.titulo, materia: t.materia, fecha: t.fecha, personal: false, hecha: entregada, id: 'doc' + idx };
      });
      return mias.concat(delDocente).filter(function (t) {
        if (!t.fecha || t.hecha) return false;
        var d = diasHasta(t.fecha, base);
        return d === 0 || d === 1;
      }).sort(function (a, b) {
        return (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
      }).slice(0, 12);
    },

    /* Próxima clase de hoy según el horario (la que empieza después) */
    proximaClaseHoy: function (ahoraMinutos, hoy) {
      var min = typeof ahoraMinutos === 'number' ? ahoraMinutos : null;
      var enCurso = null;
      var despues = null;
      capa.clasesDelDia(hoy).forEach(function (c) {
        if (c.tipo !== 'clase') return;
        var ini = minutoHora(c.hora);
        if (ini === null) return;
        if (min !== null && ini <= min && min < ini + 90) { if (!enCurso) enCurso = c; return; }
        if (min === null || ini > min) { if (!despues || ini < minutoHora(despues.hora)) despues = c; }
      });
      return enCurso || despues || null;
    }
  };

  return capa;
}

/* 'Lunes'…'Viernes' según la fecha (Date, 'YYYY-MM-DD' u hoy), o null
   en fin de semana. */
function diaDeLaSemana(fecha) {
  var d = fecha instanceof Date ? fecha : (parsearFecha(fecha) || new Date());
  return { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' }[d.getDay()] || null;
}

/* Instancia única que usa la app */
export var datos = crearCapa(adaptadorLocalStorage());
