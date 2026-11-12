/* ===================================================================
   dialog-ui.js — lógica de las ventanas emergentes (Material moderno).

   Un solo motor para los tres tipos de diálogo de la app:

     * dialogAlert   → información / error
     * dialogConfirm → confirmación (sí / no)
     * dialogPrompt  → pedir un dato

   Este módulo NO dibuja nada: sólo decide el "tono" (color e ícono), el
   texto de los botones y la etiqueta del campo. Así se puede probar sin
   navegador y el HTML queda en un solo lugar.

   Tonos:
     info    → azul   (información, pedir un dato)
     warn    → ámbar  (confirmación)
     danger  → rojo   (borrar, acciones destructivas)
     success → verde  (salió bien)
     help    → violeta (ayuda, duda)
   =================================================================== */

/** Tonos disponibles: ícono + textos por defecto. */
export const DIALOG_TONES = {
  info: { icono: 'info-circle', textoOk: 'Aceptar', textoCancelar: 'Cancelar' },
  warn: { icono: 'alert-triangle', textoOk: 'Aceptar', textoCancelar: 'Cancelar' },
  danger: { icono: 'alert-circle', textoOk: 'Eliminar', textoCancelar: 'Cancelar' },
  success: { icono: 'circle-check', textoOk: 'Aceptar', textoCancelar: 'Cerrar' },
  help: { icono: 'help-circle', textoOk: 'Entendido', textoCancelar: 'Cerrar' },
};

/** Tono por defecto de cada tipo de diálogo. */
export const TONO_ALERT = 'info';
export const TONO_CONFIRM = 'warn';
export const TONO_PROMPT = 'info';

/** Devuelve la definición del tono (o la de 'info' si no existe). */
export function definicionTono(tone) {
  const t = String(tone || '').trim().toLowerCase();
  return DIALOG_TONES[t] || DIALOG_TONES.info;
}

/** ¿Es un tono válido? */
export function esTonoValido(tone) {
  return Object.prototype.hasOwnProperty.call(DIALOG_TONES, String(tone || '').trim().toLowerCase());
}

/**
 * Separa un mensaje largo en la etiqueta del campo y la ayuda.
 *
 *   "Tipo de incidente (ej: Acoso, Robo, Emergencia):"
 *     → etiqueta: "Tipo de incidente"
 *     → ayuda:   "ej: Acoso, Robo, Emergencia"
 *
 *   "Describe lo sucedido:"
 *     → etiqueta: "Describe lo sucedido"
 *     → ayuda:   ""
 */
export function descomponerMensaje(mensaje) {
  const m = String(mensaje || '').trim();
  if (!m) return { etiqueta: '', ayuda: '' };
  const i = m.indexOf('(');
  if (i > 0) {
    const fin = m.lastIndexOf(')');
    if (fin > i) {
      return {
        etiqueta: m.slice(0, i).replace(/[:：]\s*$/, '').trim(),
        ayuda: m.slice(i + 1, fin).trim(),
      };
    }
  }
  return { etiqueta: m.replace(/[:：]\s*$/, '').trim(), ayuda: '' };
}

/**
 * Etiqueta corta del campo de texto.
 * Si no se puede derivar nada útil, se usa el título.
 */
export function etiquetaCampo(mensaje, titulo) {
  const d = descomponerMensaje(mensaje);
  let e = d.etiqueta;
  if (!e) e = String(titulo || '').trim();
  if (!e) e = 'Escribí aquí';
  if (e.length > 34) e = e.slice(0, 34).trim() + '…';
  return e;
}

/** ¿Dos textos dicen basically lo mismo? (para no repetir el título) */
export function mismoTexto(a, b) {
  const na = String(a || '').trim().toLowerCase().replace(/[:：.]\s*$/, '');
  const nb = String(b || '').trim().toLowerCase().replace(/[:：.]\s*$/, '');
  return !!na && na === nb;
}

/**
 * Texto del botón principal.
 * Si no se pasa uno explícito, usa el del tono.
 */
export function textoBotonOk(tone, texto) {
  const t = String(texto || '').trim();
  if (t) return t;
  return definicionTono(tone).textoOk;
}

/**
 * Texto del botón secundario.
 * Si no se pasa uno explícito, usa el del tono.
 */
export function textoBotonCancelar(tone, texto) {
  const t = String(texto || '').trim();
  if (t) return t;
  return definicionTono(tone).textoCancelar;
}

/**
 * ¿El mensaje pide un dato? ( heurística para el tono por defecto)
 * Un mensaje con "eliminar", "borrar" o "reiniciar" es destructivo.
 */
export function esDestructivo(mensaje) {
  const m = String(mensaje || '').toLowerCase();
  return /eliminar|borrar|reiniciar|descartar|permanente/.test(m);
}
