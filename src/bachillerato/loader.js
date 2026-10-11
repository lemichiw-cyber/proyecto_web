/* ===================================================================
   loader.js — Carga diferida de las funciones de bachillerato.

   El teléfono de gama baja con datos limitados no debería bajar el
   código de «Mis notas» ni del simulacro PAES si el estudiante nunca
   los abre. Por eso cada sección es un módulo aparte que se pide con
   import() sólo en el momento de entrar.

   Este archivo es el único que se carga siempre, y pesa muy poco.
   =================================================================== */

/* Registro: id de la sección → fábrica que importa su módulo.
   Sólo se registran las secciones que ya existen, para que el build
   no trate de empaquetar módulos que todavía no están. */
const MODULOS = {
  notas: () => import('./notas/notas-ui.js'),
  planificador: () => import('./agenda/agenda-ui.js'),
  paes: () => import('./paes/paes-ui.js'),
  servicio: () => import('./servicio/servicio-ui.js'),
  miCentro: () => import('./centro/centro-ui.js'),
};

/** Módulos ya cargados, para no volver a descargarlos. */
const yaCargados = new Set();
/** Promesas en vuelo, para que dos clics seguidos no carguen dos veces. */
const enVuelo = new Map();

/**
 * Carga e inicializa la sección pedida. Si no existe, no hace nada.
 * @param {string} app id de la sección (ej. 'notas')
 * @returns {Promise<boolean>} true si se cargó
 */
export async function cargar(app) {
  const fabrica = MODULOS[app];
  if (!fabrica) return false;

  try {
    let promesa = enVuelo.get(app);
    if (!promesa) {
      promesa = fabrica();
      enVuelo.set(app, promesa);
    }
    const modulo = await promesa;
    yaCargados.add(app);
    const montar = modulo.montar || (modulo.default && modulo.default.montar);
    if (typeof montar === 'function') await montar();
    return true;
  } catch (error) {
    // No rompemos la app entera si una sección falla (por ejemplo sin red
    // y sin caché del SW). Avisamos y listo.
    console.error('[Bachillerato] No se pudo cargar «' + app + '»:', error);
    if (typeof window !== 'undefined' && typeof window.mostrarToast === 'function') {
      window.mostrarToast('No se pudo abrir esta sección. Probá de nuevo.', 'error');
    }
    return false;
  }
}

/** Para agregar una sección sin tocar este archivo (pruebas, extensiones). */
export function registrar(id, fabrica) {
  if (typeof fabrica !== 'function') throw new Error('La fábrica debe ser una función.');
  MODULOS[id] = fabrica;
}

/** Cuáles ya se cargaron en esta sesión (para diagnóstico). */
export function cargados() {
  return Array.from(yaCargados);
}

/** Secciones registradas. */
export function registradas() {
  return Object.keys(MODULOS);
}

// API pública para que app.js (que es un IIFE sin módulos) la use.
if (typeof window !== 'undefined') {
  window.CherryBombBachillerato = { cargar, registrar, cargados, registradas };
}
