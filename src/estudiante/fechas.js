/* ===================================================================
   fechas.js — utilidades de fecha 100% puras (sin DOM, sin storage).
   Todo en hora local del dispositivo. Formatos de entrada soportados:
   'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM', 'DD/MM/YYYY' y 'DD-MM-YYYY'.
   =================================================================== */

var RE_ISO = /^(\d{4})-(\d{2})-(\d{2})/;
var RE_BARRAS = /^(\d{2})[-/](\d{2})[-/](\d{4})/;

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* 'YYYY-MM-DD' de una fecha (o de hoy si no se pasa nada) */
export function hoyISO(fecha) {
  var d = fecha instanceof Date ? fecha : new Date();
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/* Convierte un texto cualquiera a Date local, o null si no se puede */
export function parsearFecha(texto) {
  if (texto instanceof Date) return isNaN(texto.getTime()) ? null : texto;
  if (typeof texto !== 'string') return null;
  var t = texto.trim();
  if (!t) return null;
  var m = RE_ISO.exec(t);
  if (m) return nuevaFecha(+m[1], +m[2], +m[3], t);
  m = RE_BARRAS.exec(t);
  if (m) return nuevaFecha(+m[3], +m[2], +m[1], t);
  return null;
}

function nuevaFecha(anio, mes, dia, original) {
  var d = new Date(anio, mes - 1, dia);
  d.setHours(0, 0, 0, 0);
  // Rechaza fechas imposibles tipo 2026-02-31 (se normaliza a marzo)
  var ok = d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia;
  if (!ok) {
    // Soporta fecha con hora 'YYYY-MM-DDTHH:MM'
    var mh = /T(\d{2}):(\d{2})/.exec(original || '');
    if (mh) return new Date(anio, mes - 1, dia, +mh[1], +mh[2]);
    return null;
  }
  var mh2 = /T(\d{2}):(\d{2})/.exec(original || '');
  if (mh2) d.setHours(+mh2[1], +mh2[2], 0, 0);
  return d;
}

/* Fecha de mañana en ISO */
export function mananaISO(fecha) {
  var d = fecha instanceof Date ? new Date(fecha.getTime()) : new Date();
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + 1);
  return hoyISO(d);
}

/* Diferencia en días completos (positivo = futuro). -Infinity si no hay fecha */
export function diasHasta(iso, hoy) {
  var f = parsearFecha(iso);
  if (!f) return -Infinity;
  var base = parsearFecha(hoy) || new Date();
  base.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - base.getTime()) / 86400000);
}

export function esHoy(iso, hoy) { return !!iso && diasHasta(iso, hoy) === 0; }
export function esManana(iso, hoy) { return !!iso && diasHasta(iso, hoy) === 1; }
export function yaVencio(iso, hoy) { return !!iso && diasHasta(iso, hoy) < 0; }

/* 'Lunes' … 'Domingo' */
var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export function nombreDia(fecha) {
  var d = fecha instanceof Date ? fecha : new Date();
  if (isNaN(d.getTime())) return '';
  return DIAS[d.getDay()];
}

/* Clave de columna del horario ('Lunes'…'Viernes') o null en fin de semana */
var DIAS_LABORABLES = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' };
export function diaHorario(fecha) {
  var d = fecha instanceof Date ? fecha : new Date();
  if (isNaN(d.getTime())) return null;
  return DIAS_LABORABLES[d.getDay()] || null;
}

/* Texto corto y claro para una cuenta regresiva */
export function textoCuentaRegresiva(iso, hoy) {
  var n = diasHasta(iso, hoy);
  if (n === -Infinity) return '';
  if (n < 0) return 'Vencida';
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  return 'En ' + n + ' días';
}

/* Minutos transcurridos del día de una fecha, desde 00:00 */
export function minutosDelDia(fecha) {
  var d = fecha instanceof Date ? fecha : new Date();
  if (isNaN(d.getTime())) return 0;
  return d.getHours() * 60 + d.getMinutes();
}

/* Minuto de inicio del bloque (hora:MM de la fila del horario) o null */
export function minutoHora(texto) {
  if (typeof texto !== 'string') return null;
  var m = /^\s*(\d{1,2}):(\d{2})/.exec(texto);
  if (!m) return null;
  var h = +m[1];
  var mm = +m[2];
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}
