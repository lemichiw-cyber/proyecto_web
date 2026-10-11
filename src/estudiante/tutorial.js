/* ===================================================================
   tutorial.js — guía de 3 pasos para el primer uso.
   Se muestra una sola vez; vuelve a aparecer solo si alguien lo pide
   desde Ajustes (Configuración → "Ver tutorial de nuevo").
   =================================================================== */

import './estudiante.css';
import { datos } from './datos.js';

var PASOS = [
  {
    icono: '🌅',
    titulo: 'Esto es "Hoy"',
    texto: 'Tu día en una pantalla: las clases de ahora, lo que tenés que entregar hoy y mañana, y cuánto llevás estudiado.'
  },
  {
    icono: '⚡',
    titulo: 'Anotá algo en 10 segundos',
    texto: 'Tocá el botón + de abajo a la derecha, escribí la tarea y guardá. No necesitás cuenta ni contraseña.'
  },
  {
    icono: '📶',
    titulo: 'Funciona sin datos',
    texto: 'Todo se guarda en tu celular, así que anda sin internet. Si algún día querés, iniciás sesión desde el menú.'
  }
];

var overlay = null;
var caja = null;
var indice = 0;

function el(tag, clases, texto) {
  var n = document.createElement(tag);
  if (clases) n.className = clases;
  if (texto !== undefined && texto !== null) n.textContent = String(texto);
  return n;
}

export function montarTutorial() {
  if (overlay) return overlay;
  overlay = el('div', 'tutorial-overlay');
  overlay.id = 'tutorial-overlay';

  caja = el('div', 'tutorial-caja');
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  caja.setAttribute('aria-labelledby', 'tutorial-titulo');
  overlay.appendChild(caja);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) terminar();
  });

  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') terminar();
  });

  document.body.appendChild(overlay);

  // Ajustes → Ayuda: "Ver tutorial de nuevo" (única forma de volver a
  // verlo después del primer uso)
  var btnAyuda = document.getElementById('btn-ver-tutorial');
  if (btnAyuda) {
    btnAyuda.addEventListener('click', function () {
      datos.reiniciarOnboarding();
      mostrarTutorial();
    });
  }

  return overlay;
}

function pintar() {
  while (caja.firstChild) caja.removeChild(caja.firstChild);
  var paso = PASOS[indice];

  var dots = el('div', 'tutorial-pasos');
  dots.setAttribute('aria-hidden', 'true');
  PASOS.forEach(function (_, i) {
    dots.appendChild(el('span', 'tutorial-paso-dot' + (i === indice ? ' is-activo' : '')));
  });
  caja.appendChild(dots);

  caja.appendChild(el('div', 'tutorial-icono', paso.icono));
  var h2 = el('h2', 'tutorial-titulo', paso.titulo);
  h2.id = 'tutorial-titulo';
  caja.appendChild(h2);
  caja.appendChild(el('p', 'tutorial-texto', paso.texto));

  var acciones = el('div', 'tutorial-acciones');

  var saltar = el('button', 'tutorial-saltar', 'Saltar');
  saltar.type = 'button';
  saltar.addEventListener('click', terminar);
  acciones.appendChild(saltar);

  var ultimo = indice === PASOS.length - 1;
  var siguiente = el('button', 'btn btn-primary', ultimo ? '¡Listo!' : 'Siguiente');
  siguiente.type = 'button';
  siguiente.addEventListener('click', function () {
    if (ultimo) { terminar(); return; }
    indice += 1;
    pintar();
    var foco = caja.querySelector('.tutorial-acciones .btn');
    if (foco) foco.focus();
  });
  acciones.appendChild(siguiente);

  caja.appendChild(acciones);
}

export function mostrarTutorial() {
  if (!overlay) montarTutorial();
  indice = 0;
  pintar();
  overlay.classList.add('open');
  document.body.classList.add('no-scroll');
  var foco = caja.querySelector('.tutorial-acciones .btn');
  if (foco) foco.focus();
}

function terminar() {
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.classList.remove('no-scroll');
  datos.marcarOnboardingVisto();
}

/* Se muestra solo la primera vez */
export function quizasMostrarTutorial() {
  if (datos.onboardingVisto()) return;
  setTimeout(mostrarTutorial, 500);
}

/* Punto de entrada desde Ajustes (Configuración) */
if (typeof window !== 'undefined') {
  window.reiniciarTutorial = function () {
    datos.reiniciarOnboarding();
    mostrarTutorial();
  };
}
