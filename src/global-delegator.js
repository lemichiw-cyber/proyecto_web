// global-delegator.js - Entry point for global click handler
// This runs in global scope, not module scope
// P0: allowlist estricta — nunca ejecutar window[fnName] arbitrario (XSS)

import { lockBody } from "./scroll-lock.js";

function _global$(id) { return document.getElementById(id); }

window.clickLogin = function clickLogin() {
  var modalLogin = _global$('modal-login');
  if (modalLogin) { modalLogin.classList.add('open'); lockBody(); }
};

// Acciones permitidas desde index.html data-onclick="accion+arg1+arg2"
// Solo pueden invocar funciones de la UI que ya conoce el DOM, nunca cualquier window.*
// Para añadir una nueva, agregarla aquí y exponerla en window desde app.js.
var ALLOWED_ACTIONS = {
  mostrarApp: true, mostrarAppClose: true, closeSidebar: true,
  abrirTemas: true, seleccionarTema: true, abrirEditar: true, cerrarEditar: true,
  abrirModalTexto: true, cerrarModalTexto: true, cerrarModal: true,
  abrirGuia: true, cerrarGuia: true, abrirPerfil: true, cerrarPerfil: true,
  abrirCompartir: true, cerrarCompartir: true, compartirEnlace: true,
  abrirAuth: true, cerrarAuth: true, mostrarModoRegistro: true,
  abrirHabitos: true, cerrarHabitos: true, tokenCompartir: true,
  clickLogin: true,
};
try { window.__ALLOWED_ACTIONS__ = ALLOWED_ACTIONS; } catch (e) { /* noop */ }

document.addEventListener('click', function (e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-onclick]') : null;
  if (!el) return;
  var spec = el.getAttribute('data-onclick');
  if (!spec) return;
  var parts = spec.split('+');
  var fnName = parts[0];
  if (!fnName || !Object.prototype.hasOwnProperty.call(ALLOWED_ACTIONS, fnName)) {
    try { console.warn('[delegator] acción no permitida:', fnName); } catch (e2) { /* noop */ }
    return;
  }
  var args = parts.slice(1).map(function (a) {
    if (a === 'null') return null;
    if (a === 'true') return true;
    if (a === 'false') return false;
    if (a === '') return '';
    return a;
  }).map(function (a) {
    // Defensa extra: args son strings del HTML, nunca objetos/propiedades
    if (typeof a === 'string' && (a.indexOf('[') !== -1 || a.indexOf('__proto__') !== -1 || a.indexOf('constructor') !== -1)) return '';
    return a;
  });
  var fn = window[fnName];
  if (typeof fn === 'function') {
    e.preventDefault();
    e.stopPropagation();
    fn.apply(window, args);
  } else {
    try { console.warn('[delegator] función no disponible:', fnName); } catch (e3) { /* noop */ }
    return;
  }
}, true);