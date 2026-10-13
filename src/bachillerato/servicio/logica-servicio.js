// Servicio social y proyecto de grado (Fase 3).
// Lógica pura, sin DOM: se puede probar y más adelante mover a Supabase.
//
// Importante: los requisitos de servicio social y de proyecto de grado varían
// según el centro y la carrera. Por eso la meta es configurable y aquí no se
// asume ningún número oficial.

import { redondear } from '../utils.js';

/**
 * Saldo de horas de servicio social.
 * @param {Array<{fecha:string, actividad:string, horas:number}>} registros
 * @param {number} metaHoras meta configurable (por defecto 200, NO es oficial)
 */
export function resumenServicio(registros, metaHoras) {
  const lista = Array.isArray(registros) ? registros : [];
  const meta = Number(metaHoras) > 0 ? Number(metaHoras) : 200;
  const horas = redondear(lista.reduce((suma, r) => suma + (Number(r.horas) || 0), 0), 2);
  const faltan = redondear(Math.max(meta - horas, 0), 2);
  const avance = meta > 0 ? Math.min(100, redondear((horas / meta) * 100, 1)) : 0;
  return { horas, meta, faltan, avance, completo: horas >= meta };
}

/**
 * Validación de un registro de horas de servicio social.
 * Devuelve `{ok:true}` o `{ok:false, motivo}`.
 */
export function validarRegistroServicio(registro, registrosPrevios) {
  if (!registro) return { ok: false, motivo: 'Registro vacío.' };
  const actividad = (registro.actividad || '').trim();
  if (!actividad) return { ok: false, motivo: 'Indica qué actividad realizaste.' };
  if (actividad.length > 100) return { ok: false, motivo: 'La actividad es muy larga (máx. 100 caracteres).' };
  const horas = Number(registro.horas);
  if (!Number.isFinite(horas) || horas <= 0) return { ok: false, motivo: 'Las horas deben ser un número mayor que cero.' };
  if (horas > 24) return { ok: false, motivo: 'Una actividad no puede durar más de 24 horas seguidas.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(registro.fecha || '')) return { ok: false, motivo: 'La fecha no es válida.' };
  // Tope por actividad para detectar errores de captura.
  const previas = Array.isArray(registrosPrevios) ? registrosPrevios : [];
  const mismoDia = previas
    .filter((r) => r.fecha === registro.fecha)
    .reduce((suma, r) => suma + (Number(r.horas) || 0), 0);
  if (mismoDia + horas > 24) {
    return { ok: false, motivo: 'Con esas horas serían más de 24 en un solo día. Revisa la captura.' };
  }
  return { ok: true };
}

/**
 * Registro de una actividad de servicio social.
 * @param {Array} registros
 * @param {{fecha:string, actividad:string, horas:number, lugar?:string, comprobante?:string}} registro
 * @param {{id?:function, hoy?:string}} opciones
 */
export function agregarRegistroServicio(registros, registro, opciones = {}) {
  const validacion = validarRegistroServicio(registro, registros);
  if (!validacion.ok) return { ok: false, motivo: validacion.motivo };
  const lista = Array.isArray(registros) ? registros.slice() : [];
  const id = typeof opciones.id === 'function'
    ? String(opciones.id())
    : String(lista.length + 1) + '-' + Date.now();
  lista.push({
    id,
    fecha: registro.fecha,
    actividad: registro.actividad.trim(),
    horas: Number(registro.horas),
    lugar: (registro.lugar || '').trim(),
    comprobante: (registro.comprobante || '').trim(),
  });
  return { ok: true, registros: lista };
}

export function editarRegistroServicio(registros, id, cambios) {
  const lista = Array.isArray(registros) ? registros : [];
  const indice = lista.findIndex((r) => r.id === id);
  if (indice === -1) return { ok: false, motivo: 'No existe ese registro.' };
  const otro = lista.map((r) => (r.id === id ? { ...r, ...cambios } : r));
  const validacion = validarRegistroServicio(otro[indice], otro.filter((_, i) => i !== indice));
  if (!validacion.ok) return { ok: false, motivo: validacion.motivo };
  return { ok: true, registros: otro };
}

export function eliminarRegistroServicio(registros, id) {
  const lista = Array.isArray(registros) ? registros : [];
  const existe = lista.some((r) => r.id === id);
  if (!existe) return { ok: false, motivo: 'No existe ese registro.' };
  return { ok: true, registros: lista.filter((r) => r.id !== id) };
}

/** Actividades ordenadas de la más reciente a la más antigua. */
export function historialServicio(registros) {
  const lista = Array.isArray(registros) ? registros.slice() : [];
  return lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

// ---------------------------------------------------------------
// Proyecto de grado (checklist de hitos configurable)
// ---------------------------------------------------------------

/** Plantilla editable: NO es el reglamento de ningún centro. */
export const HITOS_EJEMPLO = [
  { titulo: 'Elegir tema y asesor', fecha: '', hecho: false },
  { titulo: 'Anteproyecto', fecha: '', hecho: false },
  { titulo: 'Investigación y recopilación de información', fecha: '', hecho: false },
  { titulo: 'Redacción del documento', fecha: '', hecho: false },
  { titulo: 'Revisión y correcciones', fecha: '', hecho: false },
  { titulo: 'Presentación y defensa', fecha: '', hecho: false },
];

/** Avance del proyecto de grado según los hitos marcados. */
export function avanceProyecto(hitos) {
  const lista = Array.isArray(hitos) ? hitos : [];
  const total = lista.length;
  const hechos = lista.filter((h) => h && h.hecho).length;
  return {
    total,
    hechos,
    faltan: Math.max(total - hechos, 0),
    avance: total > 0 ? redondear((hechos / total) * 100, 1) : 0,
    completo: total > 0 && hechos === total,
  };
}

/**
 * Hitos con su estado respecto a la fecha de hoy:
 * 'hecho' | 'vencido' (pasó la fecha y no está hecho) | 'pendiente'.
 * Se recibe `hoy` como texto 'YYYY-MM-DD' para no depender del reloj en pruebas.
 */
export function estadosHitos(hitos, hoy) {
  const lista = Array.isArray(hitos) ? hitos : [];
  return lista.map((h, indice) => {
    const base = { ...h, indice };
    if (h.hecho) return { ...base, estado: 'hecho' };
    if (h.fecha && hoy && h.fecha < hoy) return { ...base, estado: 'vencido' };
    return { ...base, estado: 'pendiente' };
  });
}

/**
 * Siguiente hito a trabajar (el primero no hecho con fecha, si no, el primero no hecho).
 */
export function siguienteHito(hitos, hoy) {
  const conEstado = estadosHitos(hitos, hoy);
  const pendientes = conEstado.filter((h) => !h.hecho);
  if (pendientes.length === 0) return null;
  const vencidos = pendientes.filter((h) => h.estado === 'vencido');
  const lista = vencidos.length > 0 ? vencidos : pendientes.filter((h) => h.fecha);
  if (lista.length > 0) return lista.reduce((min, h) => (h.fecha < min.fecha ? h : min));
  return pendientes[0];
}

export function agregarHito(hitos, hito) {
  const titulo = (hito.titulo || '').trim();
  if (!titulo) return { ok: false, motivo: 'Indica el nombre del hito.' };
  if (hito.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(hito.fecha)) {
    return { ok: false, motivo: 'La fecha no es válida.' };
  }
  const lista = Array.isArray(hitos) ? hitos.slice() : [];
  lista.push({ titulo, fecha: hito.fecha || '', hecho: false });
  return { ok: true, hitos: lista };
}

export function alternarHito(hitos, indice) {
  const lista = Array.isArray(hitos) ? hitos.slice() : [];
  if (!lista[indice]) return { ok: false, motivo: 'No existe ese hito.' };
  lista[indice] = { ...lista[indice], hecho: !lista[indice].hecho };
  return { ok: true, hitos: lista };
}

export function editarHito(hitos, indice, cambios) {
  const lista = Array.isArray(hitos) ? hitos.slice() : [];
  if (!lista[indice]) return { ok: false, motivo: 'No existe ese hito.' };
  lista[indice] = { ...lista[indice], ...cambios, titulo: (cambios.titulo || '').trim() };
  if (lista[indice].fecha && !/^\d{4}-\d{2}-\d{2}$/.test(lista[indice].fecha)) {
    return { ok: false, motivo: 'La fecha no es válida.' };
  }
  return { ok: true, hitos: lista };
}

export function eliminarHito(hitos, indice) {
  const lista = Array.isArray(hitos) ? hitos.slice() : [];
  if (!lista[indice]) return { ok: false, motivo: 'No existe ese hito.' };
  lista.splice(indice, 1);
  return { ok: true, hitos: lista };
}
