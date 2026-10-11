/* ===================================================================
   captura-rapida.js — botón flotante + hoja inferior para anotar una
   tarea en menos de 10 segundos: escribir el título, Guardar.
   La tarea es personal y local (se guarda en el dispositivo).
   =================================================================== */

import './estudiante.css';
import { datos } from './datos.js';
import { hoyISO } from './fechas.js';

var MATERIAS = ['', 'Matemática', 'Física', 'Química', 'Biología', 'Literatura', 'Historia', 'Inglés', 'Otra'];

var overlay = null;
var hoja = null;
var campoTitulo = null;
var campoMateria = null;
var campoFecha = null;
var errorEl = null;
var fab = null;
var focoPrevio = null;

function el(tag, clases, texto) {
  var n = document.createElement(tag);
  if (clases) n.className = clases;
  if (texto !== undefined && texto !== null) n.textContent = String(texto);
  return n;
}

function avisar(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 3500);
}

export function montarCapturaRapida() {
  if (fab) return fab;

  fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'fab-captura';
  fab.id = 'fab-captura';
  fab.setAttribute('aria-label', 'Añadir una tarea rápido');
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.setAttribute('aria-controls', 'captura-sheet');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
  fab.addEventListener('click', abrirCapturaRapida);

  construirHoja();
  document.body.appendChild(overlay);
  document.body.appendChild(fab);

  window.abrirCapturaRapida = abrirCapturaRapida;
  return fab;
}

function construirHoja() {
  overlay = el('div', 'captura-overlay');
  overlay.id = 'captura-overlay';

  hoja = el('div', 'captura-sheet');
  hoja.id = 'captura-sheet';
  hoja.setAttribute('role', 'dialog');
  hoja.setAttribute('aria-modal', 'true');
  hoja.setAttribute('aria-labelledby', 'captura-titulo');

  var form = document.createElement('form');
  form.noValidate = true;

  var h2 = el('h2', 'captura-titulo', 'Nueva tarea');
  h2.id = 'captura-titulo';
  form.appendChild(h2);

  // Título (lo único obligatorio)
  var c1 = el('div', 'captura-campo');
  var l1 = el('label', '', '¿Qué tenés que hacer?');
  l1.setAttribute('for', 'captura-titulo-input');
  campoTitulo = document.createElement('input');
  campoTitulo.type = 'text';
  campoTitulo.id = 'captura-titulo-input';
  campoTitulo.placeholder = 'Ej: Terminar el informe de química';
  campoTitulo.maxLength = 160;
  campoTitulo.autocomplete = 'off';
  campoTitulo.setAttribute('aria-describedby', 'captura-error');
  c1.appendChild(l1);
  c1.appendChild(campoTitulo);
  form.appendChild(c1);

  // Materia y fecha en una fila (no estiran el formulario en 360px)
  var fila = el('div', 'captura-fila');

  var c2 = el('div', 'captura-campo');
  var l2 = el('label', '', 'Materia');
  l2.setAttribute('for', 'captura-materia');
  campoMateria = document.createElement('select');
  campoMateria.id = 'captura-materia';
  MATERIAS.forEach(function (m) {
    var op = document.createElement('option');
    op.value = m;
    op.textContent = m || 'Sin materia';
    campoMateria.appendChild(op);
  });
  c2.appendChild(l2);
  c2.appendChild(campoMateria);

  var c3 = el('div', 'captura-campo');
  var l3 = el('label', '', 'Vence');
  l3.setAttribute('for', 'captura-fecha');
  campoFecha = document.createElement('input');
  campoFecha.type = 'date';
  campoFecha.id = 'captura-fecha';
  campoFecha.value = hoyISO();
  c3.appendChild(l3);
  c3.appendChild(campoFecha);

  fila.appendChild(c2);
  fila.appendChild(c3);
  form.appendChild(fila);

  errorEl = el('p', 'hoy-vacio');
  errorEl.id = 'captura-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.hidden = true;
  form.appendChild(errorEl);

  var acciones = el('div', 'captura-acciones');
  var cancelar = el('button', 'btn btn-ghost', 'Cancelar');
  cancelar.type = 'button';
  cancelar.addEventListener('click', cerrarCapturaRapida);
  var guardar = el('button', 'btn btn-primary', 'Guardar');
  guardar.type = 'submit';
  acciones.appendChild(cancelar);
  acciones.appendChild(guardar);
  form.appendChild(acciones);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    guardarTarea();
  });

  hoja.appendChild(form);
  overlay.appendChild(hoja);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) cerrarCapturaRapida();
  });

  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') { cerrarCapturaRapida(); return; }
    if (e.key === 'Tab') atraparFoco(e);
  });
}

function guardarTarea() {
  var creada = datos.agregarMisTarea({
    titulo: campoTitulo.value,
    materia: campoMateria.value,
    fecha: campoFecha.value
  });
  if (!creada) {
    errorEl.textContent = 'Escribí el título de la tarea para guardarla.';
    errorEl.hidden = false;
    campoTitulo.focus();
    return;
  }
  errorEl.hidden = true;
  campoTitulo.value = '';
  campoFecha.value = hoyISO();
  cerrarCapturaRapida();
  avisar('Tarea guardada en este dispositivo.');
  // Avisa a la pantalla Hoy para que repinte
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent('cb:hoy-actualizar'));
  }
}

export function abrirCapturaRapida() {
  if (!overlay) montarCapturaRapida();
  if (!overlay) return;
  focoPrevio = document.activeElement;
  errorEl.hidden = true;
  campoFecha.value = hoyISO();
  overlay.classList.add('open');
  document.body.classList.add('no-scroll');
  campoTitulo.focus();
}

export function cerrarCapturaRapida() {
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.classList.remove('no-scroll');
  if (focoPrevio && focoPrevio.focus) focoPrevio.focus();
  else if (fab) fab.focus();
}

/* Foco atrapado dentro de la hoja mientras esté abierta */
function atraparFoco(e) {
  var foco = hoja.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
  if (!foco.length) return;
  var primero = foco[0];
  var ultimo = foco[foco.length - 1];
  if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
}
