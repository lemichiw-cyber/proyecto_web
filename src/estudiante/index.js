/* ===================================================================
   index.js — orquestador de la experiencia del estudiante.
   Se carga en diferido desde main.ts (import dinámico) para que nada
   de esto pese en el arranque de la app. Cada pieza es su propio
   módulo con su propia carga diferida.
   =================================================================== */

import { datos } from './datos.js';

export async function iniciarExperienciaEstudiante() {
  var piezas = await Promise.all([import('./hoy.js'), import('./captura-rapida.js')]);
  var hoy = piezas[0];
  var captura = piezas[1];

  // Pantalla "Hoy" dentro de la sección INICIO (ya visible por defecto)
  hoy.montarHoy();

  // Botón flotante de captura rápida (tarea personal en <10 segundos)
  captura.montarCapturaRapida();

  // Repintar "Hoy" cada vez que se entra a la sección inicio, sin
  // tocar el resto de la navegación existente.
  engancharMostrarApp(hoy.renderHoy);

  window.refrescarHoy = hoy.renderHoy;
  window.abrirCapturaRapida = captura.abrirCapturaRapida;

  // El Pomodoro avisa por evento cuánto estudiaste: eso se suma al
  // registro del día (y hoy.js repinta el total).
  if (!window.__cbEstudioEscuchado) {
    window.__cbEstudioEscuchado = true;
    window.addEventListener('cb:estudio', function (e) {
      var min = e && e.detail ? e.detail.minutos : 0;
      datos.registrarMinutosEstudio(min);
    });
  }

  return { datos: datos };
}

function engancharMostrarApp(renderHoy) {
  if (window.__cbHoyEnganchado) return;
  var original = window.mostrarApp;
  if (typeof original !== 'function') return;
  window.__cbHoyEnganchado = true;
  window.mostrarApp = function (app) {
    var r = original.apply(this, arguments);
    if (!app || app === 'inicio') renderHoy();
    return r;
  };
}
