/* ===================================================================
   logica-agenda.js — Lógica pura del horario y de la agenda de tareas.

   Sin DOM ni almacenamiento, para poder probarla. Fechas: se trabaja
   con cadenas 'YYYY-MM-DD' y con días de la semana en minúscula
   ('lunes' … 'domingo'), que es lo que se guarda.
   =================================================================== */

import { aFecha, hoy as hoyPorDefecto, sumarDias, diasEntre, claveFecha, redondear, DIAS_SEMANA } from '../utils.js';

export const TIPOS_TAREA = ['tarea', 'examen', 'laboratorio', 'proyecto'];
export const ESTADOS_TAREA = ['pendiente', 'en-proceso', 'entregada'];
export const TEXTO_TIPO = {
  tarea: 'Tarea',
  examen: 'Examen',
  laboratorio: 'Laboratorio',
  proyecto: 'Proyecto',
};
export const TEXTO_ESTADO = {
  pendiente: 'Pendiente',
  'en-proceso': 'En proceso',
  entregada: 'Entregada',
};

/* ------------------------------------------------------------------
   Validaciones
   ------------------------------------------------------------------ */

/**
 * Valida una tarea de la agenda.
 * @returns {string[]} errores (vacía si está bien)
 */
export function validarTarea(tarea) {
  const t = tarea || {};
  const errores = [];
  if (!String(t.titulo || '').trim()) errores.push('La tarea necesita un título.');
  if (!aFecha(t.fecha)) errores.push('La fecha debe tener el formato AAAA-MM-DD.');
  if (t.tipo && TIPOS_TAREA.indexOf(t.tipo) === -1) errores.push('El tipo de actividad no es válido.');
  if (t.estado && ESTADOS_TAREA.indexOf(t.estado) === -1) errores.push('El estado no es válido.');
  return errores;
}

/**
 * Valida una clase del horario.
 * @returns {string[]} errores (vacía si está bien)
 */
export function validarClase(clase) {
  const c = clase || {};
  const errores = [];
  if (!String(c.materia || '').trim()) errores.push('La clase necesita una materia.');
  if (DIAS_SEMANA.indexOf(String(c.dia || '').toLowerCase()) === -1) {
    errores.push('Elegí un día de la semana válido.');
  }
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(c.horaInicio || ''))) {
    errores.push('La hora de inicio debe tener el formato HH:MM (ej: 07:30).');
  }
  if (c.horaFin && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(c.horaFin))) {
    errores.push('La hora de fin debe tener el formato HH:MM (ej: 09:00).');
  }
  if (c.horaInicio && c.horaFin && minutosDesdeMedianoche(c.horaFin) <= minutosDesdeMedianoche(c.horaInicio)) {
    errores.push('La hora de fin debe ser posterior a la hora de inicio.');
  }
  return errores;
}

/** 'HH:MM' → minutos desde la medianoche. */
export function minutosDesdeMedianoche(hora) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hora || ''));
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Convierte minutos a 'HH:MM'. */
export function aHora(minutos) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutos)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
}

/* ------------------------------------------------------------------
   Estado visual de una tarea, según cuándo vence
   ------------------------------------------------------------------ */

/**
 * Clasifica una tarea respecto a la fecha de hoy.
 * @returns {'entregada'|'vencida'|'hoy'|'manana'|'semana'|'futuro'|'sin-fecha'}
 */
export function estadoTarea(tarea, deso) {
  const t = tarea || {};
  if (t.estado === 'entregada') return 'entregada';
  const fecha = aFecha(t.fecha);
  if (!fecha) return 'sin-fecha';
  const dias = diasEntre(hoyPorDefecto(deso), fecha);
  if (dias < 0) return 'vencida';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'manana';
  if (dias <= 6) return 'semana';
  return 'futuro';
}

/** true si la tarea ya venció y todavía no se entregó. */
export function estaVencida(tarea, deso) {
  return estadoTarea(tarea, deso) === 'vencida';
}

/**
 * Devuelve las tareas de los próximos N días (por defecto 7),
 * incluyendo las de hoy y las vencidas sin entregar.
 * @returns {object[]} tareas ordenadas: vencidas primero, después por fecha
 */
export function proximosDias(tareas, deso, dias = 7) {
  const base = hoyPorDefecto(deso);
  const limite = sumarDias(base, dias - 1);
  const lista = (Array.isArray(tareas) ? tareas : []).filter((t) => {
    if (!t || typeof t !== 'object') return false;
    const f = aFecha(t.fecha);
    if (!f) return false;
    if (t.estado === 'entregada') return false;
    return f.getTime() <= limite.getTime();
  });
  return ordenarPorFecha(lista, base);
}

/**
 * Ordena para mostrar: primero las vencidas (más vieja primero),
 * después las de hoy y las demás en orden de fecha.
 * Las entregadas quedan al final.
 */
export function ordenarPorFecha(tareas, deso) {
  const base = hoyPorDefecto(deso);
  return (Array.isArray(tareas) ? tareas : []).filter((t) => t && typeof t === 'object')
    .sort((a, b) => {
      const fa = aFecha(a.fecha);
      const fb = aFecha(b.fecha);
    const ea = a.estado === 'entregada';
    const eb = b.estado === 'entregada';
    if (ea !== eb) return ea ? 1 : -1;         // las entregadas al final
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    const va = fa < base ? 0 : 1;               // vencidas primero
    const vb = fb < base ? 0 : 1;
    if (va !== vb) return va - vb;
    return fa.getTime() - fb.getTime();
  });
}

/** Cuenta cuántas tareas hay por cada estado. */
export function resumenEstados(tareas, deso) {
  const r = { pendiente: 0, 'en-proceso': 0, entregada: 0, vencida: 0, total: 0 };
  (Array.isArray(tareas) ? tareas : []).forEach((t) => {
    r.total += 1;
    const e = ESTADOS_TAREA.indexOf(t.estado) === -1 ? 'pendiente' : t.estado;
    r[e] += 1;
    if (estaVencida(t, deso)) r.vencida += 1;
  });
  return r;
}

/* ------------------------------------------------------------------
   Horario semanal
   ------------------------------------------------------------------ */

/**
 * Clases de un día concreto, ordenadas por hora.
 * @param {string} dia  'lunes' … 'domingo'
 */
export function clasesDelDia(horario, dia) {
  const buscado = String(dia || '').toLowerCase();
  return (Array.isArray(horario) ? horario : [])
    .filter((c) => String(c.dia || '').toLowerCase() === buscado)
    .slice()
    .sort((a, b) => minutosDesdeMedianoche(a.horaInicio) - minutosDesdeMedianoche(b.horaInicio));
}

/** Día de la semana actual en minúscula (lunes…domingo). */
export function diaDeHoy(deso) {
  const d = hoyPorDefecto(deso);
  return DIAS_SEMANA[(d.getDay() + 6) % 7]; // getDay(): 0=domingo
}

/** Clases de hoy, ordenadas por hora. */
export function clasesDeHoy(horario, deso) {
  return clasesDelDia(horario, diaDeHoy(deso));
}

/** Horas totales semanales definidas en el horario. */
export function horasSemanales(horario) {
  const minutos = (Array.isArray(horario) ? horario : []).reduce((t, c) => {
    const ini = minutosDesdeMedianoche(c.horaInicio);
    const fin = c.horaFin ? minutosDesdeMedianoche(c.horaFin) : ini;
    return t + Math.max(0, fin - ini);
  }, 0);
  return redondear(minutos / 60, 2);
}

/** Materias distintas que aparecen en el horario, en orden alfabético. */
export function materiasDelHorario(horario) {
  const vistas = new Set();
  (Array.isArray(horario) ? horario : []).forEach((c) => {
    const m = String(c.materia || '').trim();
    if (m) vistas.add(m);
  });
  return Array.from(vistas).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Hay dos clases del mismo día que se pisan en el horario? */
export function detectarSolapes(horario) {
  const problemas = [];
  const porDia = {};
  (Array.isArray(horario) ? horario : []).forEach((c) => {
    const d = String(c.dia || '').toLowerCase();
    (porDia[d] = porDia[d] || []).push(c);
  });
  Object.keys(porDia).forEach((dia) => {
    const lista = porDia[dia].slice()
      .sort((a, b) => minutosDesdeMedianoche(a.horaInicio) - minutosDesdeMedianoche(b.horaInicio));
    for (let i = 0; i < lista.length - 1; i++) {
      const finActual = lista[i].horaFin
        ? minutosDesdeMedianoche(lista[i].horaFin)
        : minutosDesdeMedianoche(lista[i].horaInicio) + 45;
      const inicioSiguiente = minutosDesdeMedianoche(lista[i + 1].horaInicio);
      if (inicioSiguiente < finActual) {
        problemas.push({
          dia,
          materiaA: lista[i].materia,
          materiaB: lista[i + 1].materia,
          mensaje: 'El ' + dia + ', «' + lista[i].materia + '» y «' + lista[i + 1].materia +
            '» se cruzan de horario.',
        });
      }
    }
  });
  return problemas;
}

/* ------------------------------------------------------------------
   Recordatorios
   ------------------------------------------------------------------ */

/**
 * Qué tareas conviene recordar hoy: las que vencen mañana y las que
 * vencen hoy mismo. Sólo las que todavía no están entregadas.
 *
 * @param {object[]} tareas
 * @param {object}   yaRecordado  mapa idTarea → true (para no repetir)
 * @returns {object[]} [{ id, titulo, fecha, tipo, aviso: 'manana'|'hoy' }]
 */
export function tareasParaRecordar(tareas, yaRecordado, deso) {
  const base = hoyPorDefecto(deso);
  const hechos = yaRecordado || {};
  const salida = [];
  (Array.isArray(tareas) ? tareas : []).forEach((t) => {
    if (!t || typeof t !== 'object') return;
    if (t.estado === 'entregada') return;
    const f = aFecha(t.fecha);
    if (!f) return;
    const dias = diasEntre(base, f);
    if (dias !== 0 && dias !== 1) return;
    const clave = String(t.id) + '_' + claveFecha(f) + '_' + (dias === 0 ? 'hoy' : 'manana');
    if (hechos[clave]) return;
    salida.push({
      id: t.id,
      titulo: t.titulo,
      fecha: t.fecha,
      tipo: t.tipo,
      aviso: dias === 0 ? 'hoy' : 'manana',
      claveRecordatorio: clave,
      mensaje: dias === 0
        ? 'Hoy vence «' + t.titulo + '».'
        : 'Mañana vence «' + t.titulo + '».',
    });
  });
  return salida;
}

/** Agrupa tareas por fecha ('YYYY-MM-DD') para una vista de calendario. */
export function agruparPorFecha(tareas) {
  const grupos = {};
  (Array.isArray(tareas) ? tareas : []).forEach((t) => {
    const k = aFecha(t.fecha) ? claveFecha(t.fecha) : 'sin-fecha';
    (grupos[k] = grupos[k] || []).push(t);
  });
  return grupos;
}
