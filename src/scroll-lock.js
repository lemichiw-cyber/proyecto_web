/* ===================================================================
   scroll-lock.js — ÚNICA fuente de verdad para bloquear el scroll del body.

   Por qué existe:
   El bloqueo estaba repartido en tres lugares (app.js, global-delegator.js
   y main.ts) y cada uno lo manejaba a su manera:

     * app.js añadía la clase `no-scroll` (overflow:hidden) y al quitar el
       modal hacía `window.scrollTo(0, scrollPos)` con una posición VIEJA.
     * global-delegator.js ponía `document.body.style.overflow = 'hidden'`
       (estilo inline) sin ninguna función que lo revirtiese: una vez
       aplicado, el scroll de la página quedaba MUERTO para siempre.
     * main.ts (tecla Escape) quitaba la clase `no-scroll` a pelo.

   Y el bug que reportaba el usuario: `loginSuccess()` cerraba el modal
   login con `classList.remove('open')` pero NUNCA llamaba a `unlockBody()`,
   así que el body quedaba con overflow:hidden → la página no scrolleaba
   más (típicamente justo después de iniciar sesión, que es cuando se
   prueba a crear un examen).

   Solución: el estado se DERIVA del DOM. Si hay algún `.modal-overlay.open`
   o el sidebar abierto, el body queda bloqueado; si no, se desbloquea.
   Un MutationObserver vigila los cambios de clase, de modo que cualquier
   código que abra o cierre un modal (incluido el que no llama a unlock)
   deja el body en el estado correcto.
   =================================================================== */

let bloqueado = false;
let scrollPos = 0;
let observer = null;

/** ¿Hay algún overlay (modal) abierto? */
function hayOverlayAbierto() {
  return !!document.querySelector('.modal-overlay.open');
}

/** ¿Está el sidebar (drawer) abierto? */
function haySidebarAbierto() {
  var sb = document.getElementById('sidebar');
  return !!(sb && sb.classList.contains('open'));
}

/** Aplica el bloqueo real (clase + restauración de scroll). */
function aplicarBloqueo() {
  if (bloqueado) return;
  bloqueado = true;
  scrollPos = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add('no-scroll');
  // Limpia restos de estilos inline de versiones anteriores del bloque
  // (esto era lo que dejaba la página sin scroll para siempre).
  document.body.style.overflow = '';
}

/** Quita el bloqueo real y devuelve la página a la posición que tenía. */
function quitarBloqueo() {
  if (!bloqueado) {
    // Aun así limpiamos estilos inline que puedan quedar de otros módulos.
    document.body.style.overflow = '';
    return;
  }
  bloqueado = false;
  document.body.classList.remove('no-scroll');
  document.body.style.overflow = '';
  // Restaura la posición REAL del momento en que se bloqueó (no una vieja).
  window.scrollTo(0, scrollPos);
}

/**
 * Recalcula el estado a partir del DOM. Es idempotente y es la función que
 * llama el MutationObserver, así que corrige cualquier código que abra o
 * cierre un modal sin pasar por lockBody()/unlockBody().
 */
export function syncBodyLock() {
  if (hayOverlayAbierto() || haySidebarAbierto()) aplicarBloqueo();
  else quitarBloqueo();
}

/** Bloquea el scroll (p. ej. al abrir un modal). */
export function lockBody() {
  aplicarBloqueo();
  syncBodyLock();
}

/**
 * Desbloquea el scroll. En lugar de forzar el desbloqueo (que rompería si
 * otro modal sigue abierto), recalcula el estado real del DOM.
 */
export function unlockBody() {
  syncBodyLock();
}

/** ¿Está el body bloqueado ahora mismo? */
export function isBodyLocked() {
  return bloqueado;
}

/** Instala el MutationObserver que mantiene el estado sincronizado. */
function instalarObserver() {
  if (observer || typeof MutationObserver === 'undefined' || !document.body) return;
  observer = new MutationObserver(function (mutaciones) {
    for (var i = 0; i < mutaciones.length; i++) {
      var t = mutaciones[i].target;
      // Solo nos interesan los cambios de clase de overlays y del sidebar.
      if (t && t.nodeType === 1 && t.matches && t.matches('.modal-overlay, #sidebar')) {
        syncBodyLock();
        return;
      }
    }
  });
  observer.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['class'],
  });
}

if (typeof document !== 'undefined') {
  if (document.body) instalarObserver();
  else if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', instalarObserver, { once: true });
  }
}
