// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { montarCapturaRapida, abrirCapturaRapida, cerrarCapturaRapida } from './captura-rapida.js';
import { CLAVES } from './datos.js';

function $(id) { return document.getElementById(id); }

beforeAll(function () {
  document.body.innerHTML = '<div id="inicio-hoy" class="hidden"></div><div id="toast" class="toast"></div>';
  window.mostrarApp = function () {};
  montarCapturaRapida();
});

beforeEach(function () {
  localStorage.clear();
  $('toast').textContent = '';
  $('toast').classList.remove('show');
});

function enviarFormulario() {
  $('captura-sheet').querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

describe('captura rápida (FAB)', () => {
  it('el botón flotante existe, está al alcance del pulgar y abre la hoja', () => {
    var fab = $('fab-captura');
    expect(fab).toBeTruthy();
    expect(fab.getAttribute('aria-label')).toBe('Añadir una tarea rápido');
    expect(fab.getAttribute('aria-haspopup')).toBe('dialog');
    fab.click();
    expect($('captura-overlay').classList.contains('open')).toBe(true);
    expect($('captura-sheet').getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement.id).toBe('captura-titulo-input');
  });

  it('guarda la tarea en el dispositivo y cierra la hoja', () => {
    var recibido = 0;
    window.addEventListener('cb:hoy-actualizar', function () { recibido++; });

    abrirCapturaRapida();
    $('captura-titulo-input').value = 'Terminar el informe';
    $('captura-materia').value = 'Química';
    $('captura-fecha').value = '2026-10-13';
    enviarFormulario();

    var guardadas = JSON.parse(localStorage.getItem(CLAVES.misTareas) || '[]');
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].titulo).toBe('Terminar el informe');
    expect(guardadas[0].materia).toBe('Química');
    expect(guardadas[0].fecha).toBe('2026-10-13');
    expect(guardadas[0].hecha).toBe(false);

    expect($('captura-overlay').classList.contains('open')).toBe(false);
    expect($('toast').textContent).toContain('Tarea guardada');
    expect(recibido).toBe(1);
  });

  it('si el título está vacío no guarda nada y avisa', () => {
    abrirCapturaRapida();
    $('captura-titulo-input').value = '   ';
    enviarFormulario();
    expect(localStorage.getItem(CLAVES.misTareas)).toBe(null);
    expect($('captura-error').hidden).toBe(false);
    expect($('captura-error').textContent).toContain('Escribí el título');
    expect($('captura-overlay').classList.contains('open')).toBe(true);
    expect(document.activeElement.id).toBe('captura-titulo-input');
  });

  it('Esc cierra la hoja y devuelve el foco', () => {
    abrirCapturaRapida();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('captura-overlay').classList.contains('open')).toBe(false);
    expect(document.body.classList.contains('no-scroll')).toBe(false);
  });

  it('al reabrir vuelve a poner la fecha de hoy', () => {
    abrirCapturaRapida();
    $('captura-fecha').value = '2020-01-01';
    cerrarCapturaRapida();
    abrirCapturaRapida();
    var hoy = new Date();
    var esperada = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
    expect($('captura-fecha').value).toBe(esperada);
    cerrarCapturaRapida();
  });
});
