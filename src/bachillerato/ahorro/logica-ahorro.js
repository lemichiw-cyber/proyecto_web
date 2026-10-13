// Modo ahorro de datos y batería (Fase 5). Lógica pura, sin DOM.

/**
 * Decide si conviene activar el modo ahorro.
 *
 * El orden importa: primero se mira lo que la persona eligió a mano y
 * recién después lo que diga la red, para que una preferencia explícita
 * nunca sea anulada por un detalle de conexión.
 *
 * @param {{saveData?:boolean, efectivo?:string, guardado?:{modo?:string, activo?:boolean}|boolean}} entrada
 *   `saveData`: lo reporta navigator.connection.
 *   `efectivo`: tipo de red (2g, slow-2g, 3g…).
 *   `guardado`: lo que el estudiante eligió a mano ('auto' | true | false).
 * @returns {{activo: boolean, motivo: string}}
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

/**
 * Lee la conexión del navegador sin romper si el objeto no existe.
 * `navigator.connection` no está en todos los navegadores (Safari, Firefox
 * viejo), así que hace falta poder responder "no sé" en vez de fallar.
 * @returns {{saveData: boolean, efectivo: string}}
 */
export function conexionDelNavegador() {
  if (typeof navigator === 'undefined') return { saveData: false, efectivo: '' };
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return { saveData: false, efectivo: '' };
  return { saveData: c.saveData === true, efectivo: typeof c.effectiveType === 'string' ? c.effectiveType : '' };
}

/**
 * Traduce lo guardado en el almacenamiento a una de las tres opciones del
 * control (auto / siempre / nunca), tolerando el formato viejo
 * `{activo: true}` y el guardado ausente.
 * @param {{modo?:string, activo?:boolean}|null|undefined} estado
 * @returns {'auto'|'siempre'|'nunca'}
 */
export function normalizarModo(estado) {
  if (!estado || estado.modo === 'auto' || (!estado.modo && estado.activo === undefined)) return 'auto';
  if (estado.modo === 'siempre' || estado.activo === true) return 'siempre';
  return 'nunca';
}

/**
 * Aplica el resultado al <html> (data-ahorro="on") y devuelve si cambió.
 * Sólo toca el atributo si cambia, para no repintar de más.
 * @param {Document} documento
 * @param {boolean} activo
 * @returns {boolean} true si el atributo realmente cambió
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
