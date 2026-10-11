// Respaldo (export/import) y modo ahorro de datos (Fase 5).
// Lógica pura, sin DOM.

import { redondear } from '../utils.js';

/** Versión del formato de respaldo. Se documenta en docs/RESPALDO.md. */
export const VERSION_RESPALDO = 1;

/**
 * Claves que se exportan y su tipo esperado. Sirve también para validar el
 * archivo al importarlo: lo que no coincida se ignora en vez de romper todo.
 */
export const ESQUEMA_RESPALDO = {
  'notas.config': 'objeto',
  'notas.materias': 'lista',
  'horario.clases': 'lista',
  'agenda.tareas': 'lista',
  'paes.banco': 'objeto',
  'paes.historial': 'lista',
  'paes.metas': 'objeto',
  'paes.tarjetas': 'lista',
  'paes.simulacro-en-curso': 'objeto',
  'servicio.horas': 'lista',
  'servicio.meta': 'numero',
  'proyecto.hitos': 'lista',
  'centro.comunicados': 'lista',
  'orientacion.registros': 'lista',
  'apoyo.contactos': 'lista',
  'apoyo.consejos': 'lista',
  'estudio.sesiones': 'lista',
  'estudio.metas': 'numero',
  'estudio.rachas': 'objeto',
  'sistema.ahorro': 'objeto',
};

/** Claves que NO deben viajar en un respaldo (siempre se reconstruyen). */
export const CLAVES_EXCLUIDAS = ['sistema.ahorro'];

/**
 * Construye el archivo de respaldo.
 * @param {Object<string,any>} almacenamiento clave → valor ya leído
 * @param {{fecha?:string}} opciones
 */
export function construirRespaldo(almacenamiento, opciones = {}) {
  const datos = {};
  const excluidas = [];
  const fuente = almacenamiento && typeof almacenamiento === 'object' ? almacenamiento : {};
  Object.keys(ESQUEMA_RESPALDO).forEach((clave) => {
    if (CLAVES_EXCLUIDAS.includes(clave)) {
      if (fuente[clave] !== undefined) excluidas.push(clave);
      return;
    }
    if (fuente[clave] !== undefined) datos[clave] = fuente[clave];
  });
  return {
    version: VERSION_RESPALDO,
    fecha: opciones.fecha || '',
    cantidad: Object.keys(datos).length,
    excluidas,
    datos,
  };
}

/** Comprueba si un valor coincide con el tipo del esquema. */
function coincideTipo(valor, tipo) {
  switch (tipo) {
    case 'lista': return Array.isArray(valor);
    case 'numero': return typeof valor === 'number' && Number.isFinite(valor);
    case 'objeto': return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
    default: return true;
  }
}

/**
 * Valida un archivo de respaldo ya parseado.
 * Devuelve {ok, motivo, clavesValidas, clavesIgnoradas}.
 */
export function validarRespaldo(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, motivo: 'El archivo no parece un respaldo válido.', clavesValidas: [], clavesIgnoradas: [] };
  }
  if (typeof obj.version !== 'number' || obj.version < 1) {
    return { ok: false, motivo: 'El respaldo no indica su versión.', clavesValidas: [], clavesIgnoradas: [] };
  }
  if (obj.version > VERSION_RESPALDO) {
    return {
      ok: false,
      motivo: `Este respaldo fue creado con una versión más nueva de la app (v${obj.version}). Actualizá la plataforma antes de restaurarlo.`,
      clavesValidas: [],
      clavesIgnoradas: [],
    };
  }
  const datos = obj.datos;
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return { ok: false, motivo: 'El respaldo no contiene datos.', clavesValidas: [], clavesIgnoradas: [] };
  }

  const clavesValidas = [];
  const clavesIgnoradas = [];
  Object.keys(datos).forEach((clave) => {
    const esperado = ESQUEMA_RESPALDO[clave];
    if (!esperado) { clavesIgnoradas.push(clave); return; } // clave desconocida: se ignora
    if (CLAVES_EXCLUIDAS.includes(clave)) { clavesIgnoradas.push(clave); return; }
    if (!coincideTipo(datos[clave], esperado)) { clavesIgnoradas.push(clave); return; }
    clavesValidas.push(clave);
  });

  if (clavesValidas.length === 0) {
    return { ok: false, motivo: 'El respaldo no tiene datos reconocibles.', clavesValidas, clavesIgnoradas };
  }
  return { ok: true, motivo: '', clavesValidas, clavesIgnoradas };
}

/** Extrae sólo las claves válidas de un respaldo validado. */
export function datosAImportar(respaldo) {
  const validacion = validarRespaldo(respaldo);
  if (!validacion.ok) return { ok: false, motivo: validacion.motivo, datos: {} };
  const datos = {};
  validacion.clavesValidas.forEach((clave) => { datos[clave] = respaldo.datos[clave]; });
  return { ok: true, motivo: '', datos, ignoradas: validacion.clavesIgnoradas };
}

/**
 * Resumen legible de lo que contiene un respaldo (para mostrar antes de
 * restaurar, así el estudiante decide con información).
 */
export function resumenRespaldo(respaldo) {
  const validacion = validarRespaldo(respaldo);
  if (!validacion.ok) return { ok: false, motivo: validacion.motivo, lineas: [] };
  const lineas = validacion.clavesValidas.map((clave) => ({
    clave,
    tipo: ESQUEMA_RESPALDO[clave],
    detalle: describirClave(clave, respaldo.datos[clave]),
  }));
  return {
    ok: true,
    fecha: respaldo.fecha || '',
    version: respaldo.version,
    lineas,
    ignoradas: validacion.clavesIgnoradas,
  };
}

function describirClave(clave, valor) {
  if (Array.isArray(valor)) {
    if (valor.length === 0) return 'vacío';
    return `${valor.length} elemento${valor.length === 1 ? '' : 's'}`;
  }
  if (typeof valor === 'number') return `${redondear(valor, 2)}`;
  if (valor && typeof valor === 'object') {
    const n = Object.keys(valor).length;
    return n === 0 ? 'vacío' : `${n} entrada${n === 1 ? '' : 's'}`;
  }
  return '';
}

/** Nombres legibles para mostrar en la interfaz. */
export const NOMBRES_CLAVES = {
  'notas.config': 'Ajustes de Mis notas',
  'notas.materias': 'Mis materias y notas',
  'horario.clases': 'Horario semanal',
  'agenda.tareas': 'Tareas y exámenes de la agenda',
  'paes.banco': 'Banco de preguntas PAES',
  'paes.historial': 'Historial de simulacros PAES',
  'paes.metas': 'Metas PAES',
  'paes.tarjetas': 'Tarjetas de repaso (Leitner)',
  'paes.simulacro-en-curso': 'Simulacro sin terminar',
  'servicio.horas': 'Horas de servicio social',
  'servicio.meta': 'Meta de horas de servicio social',
  'proyecto.hitos': 'Hitos del proyecto de grado',
  'centro.comunicados': 'Comunicados y eventos del centro',
  'orientacion.registros': 'Registros de orientación vocacional',
  'apoyo.contactos': 'Contactos de apoyo',
  'apoyo.consejos': 'Consejos guardados',
  'estudio.sesiones': 'Sesiones de estudio (Pomodoro)',
  'estudio.metas': 'Meta semanal de estudio',
  'estudio.rachas': 'Rachas de estudio',
  'sistema.ahorro': 'Modo ahorro de datos',
};

// ---------------------------------------------------------------
// Modo ahorro de datos y batería
// ---------------------------------------------------------------

/**
 * Decide si conviene activar el modo ahorro.
 * @param {{saveData?:boolean, efectivo?:string, guardado?:{activo?:boolean}}} entrada
 *   `saveData`: lo reporta navigator.connection.
 *   `efectivo`: tipo de red (2g, slow-2g, 3g…).
 *   `guardado`: lo que el estudiante eligió a mano ('auto' | true | false).
 */
export function decidirModoAhorro(entrada = {}) {
  const guardado = entrada.guardado;
  // El estudiante lo apagó a mano: se respeta siempre.
  if (guardado === false || (guardado && guardado.activo === false)) {
    return { activo: false, motivo: 'Lo apagaste manualmente.' };
  }
  // Lo encendió a mano: se respeta siempre.
  if (guardado === true || (guardado && guardado.activo === true)) {
    return { activo: true, motivo: 'Lo encendiste manualmente.' };
  }
  // Automático.
  if (entrada.saveData === true) return { activo: true, motivo: 'Tu navegador avisa que estás usando datos móviles.' };
  const redesLentas = ['slow-2g', '2g'];
  if (redesLentas.includes(entrada.efectivo)) return { activo: true, motivo: 'Tu conexión es lenta.' };
  return { activo: false, motivo: 'Conexión normal.' };
}

/** Lee la conexión del navegador sin romper si el objeto no existe. */
export function conexionDelNavegador() {
  if (typeof navigator === 'undefined') return { saveData: false, efectivo: '' };
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return { saveData: false, efectivo: '' };
  return { saveData: c.saveData === true, efectivo: typeof c.effectiveType === 'string' ? c.effectiveType : '' };
}

/**
 * Aplica el resultado al <html> (data-ahorro="on") y devuelve el motivo.
 * Sólo toca el atributo si cambia, para no re-renderizar de más.
 */
export function aplicarModoAhorro(documento, activo) {
  if (!documento || !documento.documentElement) return false;
  const raiz = documento.documentElement;
  const actual = raiz.getAttribute('data-ahorro');
  const nuevo = activo ? 'on' : 'off';
  if (actual === nuevo) return false;
  raiz.setAttribute('data-ahorro', nuevo);
  return true;
}

/** Tamaño aproximado en texto de un respaldo (para avisar si pesa mucho). */
export function pesoRespaldo(respaldo) {
  try {
    const s = JSON.stringify(respaldo || {});
    return { bytes: s.length, kb: redondear(s.length / 1024, 1) };
  } catch (e) {
    return { bytes: 0, kb: 0 };
  }
}
