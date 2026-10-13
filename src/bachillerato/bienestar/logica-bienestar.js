// Bienestar: estadísticas del Pomodoro, metas semanales, rachas y apoyo.
// Lógica pura, sin DOM.
//
// Reglas importantes:
// * No hay ninguna comparación entre estudiantes. Los datos son personales.
// * No hay diagnósticos ni consejos médicos: sólo ideas generales y contactos
//   que el propio estudiante registra.

import { redondear } from '../utils.js';

/** Tope de sesiones guardadas por día (evita crecer sin límite). */
export const MAX_SESIONES_POR_DIA = 96;

/**
 * Avanza (o retrocede, con negativo) una cantidad de días sobre una fecha
 * 'YYYY-MM-DD'. Se parsea a mano para no caer en el desfase UTC de
 * new Date('AAAA-MM-DD').
 */
export function avanzaDias(fecha, dias) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(fecha || ''));
  if (!m) return fecha;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(dias || 0));
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Registra una sesión de estudio terminada.
 * @param {Array<{fecha:string,minutos:number,hora:string}>} sesiones
 * @param {{fecha:string, minutos:number, hora?:string}} sesion
 */
export function registrarSesion(sesiones, sesion) {
  if (!sesion) return { ok: false, motivo: 'Sesión vacía.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sesion.fecha || '')) return { ok: false, motivo: 'La fecha no es válida.' };
  const minutos = Number(sesion.minutos);
  if (!Number.isFinite(minutos) || minutos <= 0) return { ok: false, motivo: 'Los minutos deben ser mayor que cero.' };
  if (minutos > 240) return { ok: false, motivo: 'Una sesión no puede durar más de 240 minutos.' };

  const lista = Array.isArray(sesiones) ? sesiones.slice() : [];
  const mismoDia = lista.filter((s) => s.fecha === sesion.fecha);
  if (mismoDia.length >= MAX_SESIONES_POR_DIA) {
    return { ok: false, motivo: 'Ya hay demasiadas sesiones registradas ese día.' };
  }
  lista.push({
    fecha: sesion.fecha,
    minutos: redondear(minutos, 2),
    hora: sesion.hora || '',
  });
  return { ok: true, sesiones: lista };
}

/** Minutos totales y número de sesiones en un rango de fechas (inclusive). */
export function resumenRango(sesiones, desde, hasta) {
  const lista = Array.isArray(sesiones) ? sesiones : [];
  const dentro = lista.filter((s) => (!desde || s.fecha >= desde) && (!hasta || s.fecha <= hasta));
  const minutos = redondear(dentro.reduce((suma, s) => suma + (Number(s.minutos) || 0), 0), 2);
  return {
    minutos,
    sesiones: dentro.length,
    promedio: dentro.length > 0 ? redondear(minutos / dentro.length, 1) : 0,
  };
}

/**
 * Serie diaria de minutos para los últimos `dias` días (incluye hoy).
 * @param {Array} sesiones
 * @param {string} hoyTexto 'YYYY-MM-DD'
 * @param {number} dias
 * @param {(fecha:string)=>string} siguienteFecha fn para avanzar un día
 */
export function serieDiaria(sesiones, hoyTexto, dias) {
  const lista = Array.isArray(sesiones) ? sesiones : [];
  const pasos = Math.max(1, Number(dias) || 7);
  const porFecha = new Map();
  lista.forEach((s) => {
    porFecha.set(s.fecha, (porFecha.get(s.fecha) || 0) + (Number(s.minutos) || 0));
  });
  const serie = [];
  let fecha = hoyTexto;
  for (let i = 0; i < pasos; i += 1) {
    serie.unshift({ fecha, minutos: redondear(porFecha.get(fecha) || 0, 2) });
    fecha = avanzaDias(fecha, -1);
  }
  return serie;
}

/**
 * Racha actual: días consecutivos (terminando en hoy) con al menos un minuto.
 * Si hoy aún no estudió, se cuenta desde ayer (la racha no se pierde por un
 * día a medio camino).
 */
export function rachaActual(sesiones, hoyTexto) {
  const lista = Array.isArray(sesiones) ? sesiones : [];
  const dias = new Set(lista.filter((s) => (Number(s.minutos) || 0) > 0).map((s) => s.fecha));
  if (dias.size === 0) return 0;
  let racha = 0;
  let fecha = dias.has(hoyTexto) ? hoyTexto : avanzaDias(hoyTexto, -1);
  while (dias.has(fecha)) {
    racha += 1;
    fecha = avanzaDias(fecha, -1);
  }
  return racha;
}

/** Récord: la racha más larga registrada. */
export function mejorRacha(sesiones) {
  const lista = Array.isArray(sesiones) ? sesiones : [];
  const fechas = Array.from(new Set(lista.filter((s) => (Number(s.minutos) || 0) > 0).map((s) => s.fecha))).sort();
  let mejor = 0;
  let actual = 0;
  let anterior = null;
  fechas.forEach((f) => {
    if (anterior && avanzaDias(anterior, 1) === f) actual += 1;
    else actual = 1;
    if (actual > mejor) mejor = actual;
    anterior = f;
  });
  return mejor;
}

/**
 * Avance de la meta semanal.
 * @param {number} metaMinutos meta configurable por el estudiante
 * @param {number} minutosSemana minutos ya estudiados esta semana
 */
export function avanceMetaSemanal(metaMinutos, minutosSemana) {
  const meta = Number(metaMinutos);
  const usados = Number(minutosSemana) || 0;
  if (!Number.isFinite(meta) || meta <= 0) {
    return { meta: 0, minutos: usados, faltan: 0, avance: 0, completo: false, sinMeta: true };
  }
  return {
    meta,
    minutos: redondear(usados, 2),
    faltan: redondear(Math.max(meta - usados, 0), 2),
    avance: Math.min(100, redondear((usados / meta) * 100, 1)),
    completo: usados >= meta,
    sinMeta: false,
  };
}

/** Lunes de la semana a la que pertenece una fecha ('YYYY-MM-DD'). */
export function lunesDeLaSemana(fecha) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(fecha || ''));
  if (!m) return fecha;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dia = d.getDay(); // 0 domingo … 6 sábado (fecha local)
  const correccion = dia === 0 ? -6 : 1 - dia;
  return avanzaDias(fecha, correccion);
}

// ---------------------------------------------------------------
// Contactos de apoyo y consejos
// ---------------------------------------------------------------

/**
 * Contacto de apoyo que el propio estudiante registra (familiar, amigo,
 * orientador…). No se comparte con nadie.
 */
export function validarContacto(c) {
  if (!c) return { ok: false, motivo: 'Contacto vacío.' };
  const nombre = (c.nombre || '').trim();
  if (!nombre) return { ok: false, motivo: 'Indica el nombre de la persona de confianza.' };
  if (nombre.length > 60) return { ok: false, motivo: 'El nombre es muy largo (máx. 60 caracteres).' };
  const telefono = (c.telefono || '').trim();
  if (!telefono) return { ok: false, motivo: 'Indica un teléfono o forma de contacto.' };
  if (telefono.replace(/\D/g, '').length < 7) return { ok: false, motivo: 'Ese teléfono parece muy corto.' };
  if (telefono.length > 20) return { ok: false, motivo: 'El teléfono es muy largo.' };
  return { ok: true };
}

export function agregarContacto(lista, c, opciones = {}) {
  const v = validarContacto(c);
  if (!v.ok) return v;
  const l = Array.isArray(lista) ? lista.slice() : [];
  if (l.length >= 20) return { ok: false, motivo: 'Ya tienes 20 contactos guardados.' };
  const id = typeof opciones.id === 'function' ? String(opciones.id()) : `ap-${Date.now()}`;
  l.push({
    id,
    nombre: c.nombre.trim(),
    telefono: c.telefono.trim(),
    relacion: (c.relacion || '').trim(),
  });
  return { ok: true, lista: l };
}

export function editarContacto(lista, id, cambios) {
  const l = Array.isArray(lista) ? lista : [];
  const indice = l.findIndex((x) => x.id === id);
  if (indice === -1) return { ok: false, motivo: 'No existe ese contacto.' };
  const otro = l.map((x) => (x.id === id ? { ...x, ...cambios } : x));
  const v = validarContacto(otro[indice]);
  if (!v.ok) return v;
  return { ok: true, lista: otro };
}

export function eliminarContacto(lista, id) {
  const l = Array.isArray(lista) ? lista : [];
  if (!l.some((x) => x.id === id)) return { ok: false, motivo: 'No existe ese contacto.' };
  return { ok: true, lista: l.filter((x) => x.id !== id) };
}

/**
 * Consejos generales. NO son consejo médico ni psicológico: son recordatorios
 * de hábitos y a dónde pedir ayuda.
 */
export const CONSEJOS_EJEMPLO = [
  'Si algo te supera o te sientes mal varios días seguidos, háblalo con un adulto de confianza.',
  'Tu centro tiene orientación: pregunta por el orientador o la orientadora.',
  'Descansar también es estudiar: duerme, come y muévete un rato cada día.',
  'Cuando no entiendas algo, pide ayuda en clase o a un compañero; no es debilidad.',
  'Pon el teléfono lejos durante los bloques de estudio: se estudia mejor sin interrupciones.',
];
