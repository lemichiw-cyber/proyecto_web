/* ===================================================================
   modelo-hoy.js — construye el modelo de la pantalla "Hoy".
   Sin DOM y sin storage directo: recibe la capa de datos y la hora,
   devuelve un objeto listo para pintar. Así se puede testear toda la
   lógica (fechas, horario, tareas, estudio, cuenta regresiva) sin
   navegador.
   =================================================================== */

import { hoyISO, nombreDia, textoCuentaRegresiva, minutosDelDia } from './fechas.js';
import { datos as capaPorDefecto } from './datos.js';

var MAX_CLASES = 8;
var MAX_TAREAS = 6;

export function construirModeloHoy(opciones) {
  var op = opciones || {};
  var capa = op.capa || capaPorDefecto;
  var ahora = op.ahora instanceof Date ? op.ahora : new Date();
  var fechaISO = hoyISO(ahora);
  var diaClave = claveDia(ahora);
  var enFinDeSemana = !diaClave;

  var ahoraMinutos = op.ahoraMinutos;
  if (typeof ahoraMinutos !== 'number') ahoraMinutos = minutosDelDia(ahora);

  var clases = enFinDeSemana ? [] : capa.clasesDelDia(ahora).slice(0, MAX_CLASES);
  var proxima = enFinDeSemana ? null : capa.proximaClaseHoy(ahoraMinutos, ahora);

  var tareas = capa.tareasDe(fechaISO).slice(0, MAX_TAREAS).map(function (t) {
    return {
      titulo: t.titulo,
      materia: t.materia,
      personal: t.personal,
      hecha: t.hecha,
      id: t.id,
      cuando: textoCuentaRegresiva(t.fecha, fechaISO)
    };
  });

  var evaluacion = capa.proximaEvaluacion(fechaISO);
  var agenda = capa.leerAgenda().slice(0, 5);

  return {
    fechaISO: fechaISO,
    diaNombre: nombreDia(ahora),
    esFinDeSemana: enFinDeSemana,
    clases: clases,
    proximaClase: proxima,
    tareas: tareas,
    minutosEstudio: capa.minutosEstudiadosHoy(fechaISO),
    agenda: agenda,
    evaluacion: evaluacion ? {
      titulo: evaluacion.titulo,
      fecha: evaluacion.fecha,
      tipo: evaluacion.tipo,
      dias: evaluacion.dias,
      cuenta: textoCuentaRegresiva(evaluacion.fecha, fechaISO)
    } : null
  };
}

/* 'Lunes'…'Viernes' o null si hoy es fin de semana */
function claveDia(fecha) {
  return { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' }[fecha.getDay()] || null;
}

/* 45 → '45 min', 95 → '1 h 35 min', 120 → '2 h' */
export function textoMinutos(minutos) {
  var m = Math.max(0, Math.round(Number(minutos) || 0));
  if (m === 0) return '0 min';
  var h = Math.floor(m / 60);
  var r = m % 60;
  if (h === 0) return m + ' min';
  if (r === 0) return h + ' h';
  return h + ' h ' + r + ' min';
}
