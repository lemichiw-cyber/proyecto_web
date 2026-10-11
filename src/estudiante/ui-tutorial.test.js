// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { montarTutorial, mostrarTutorial, quizasMostrarTutorial } from './tutorial.js';
import { CLAVES } from './datos.js';

function $(id) { return document.getElementById(id); }

beforeAll(function () {
  document.body.innerHTML =
    '<div id="inicio-hoy" class="hidden"></div>' +
    '<div id="toast" class="toast"></div>' +
    '<button id="btn-ver-tutorial" type="button">Ver tutorial de nuevo</button>';
  window.mostrarApp = function () {};
  montarTutorial();
});

beforeEach(function () {
  localStorage.clear();
  $('tutorial-overlay').classList.remove('open');
  document.body.classList.remove('no-scroll');
});

describe('tutorial de primer uso', () => {
  it('tiene 3 pasos, se salta y no vuelve a aparecer', () => {
    expect(localStorage.getItem(CLAVES.onboarding)).toBe(null);
    mostrarTutorial();
    var overlay = $('tutorial-overlay');
    expect(overlay.classList.contains('open')).toBe(true);
    expect(overlay.querySelector('.tutorial-caja').getAttribute('aria-modal')).toBe('true');
    expect($('tutorial-titulo').textContent).toBe('Esto es "Hoy"');

    var siguiente = overlay.querySelector('.tutorial-acciones .btn');
    expect(siguiente.textContent).toBe('Siguiente');
    siguiente.click();
    expect($('tutorial-titulo').textContent).toBe('Anotá algo en 10 segundos');

    overlay.querySelector('.tutorial-acciones .btn').click();
    expect($('tutorial-titulo').textContent).toBe('Funciona sin datos');
    expect(overlay.querySelector('.tutorial-acciones .btn').textContent).toBe('¡Listo!');

    overlay.querySelector('.tutorial-acciones .btn').click();
    expect(overlay.classList.contains('open')).toBe(false);
    expect(JSON.parse(localStorage.getItem(CLAVES.onboarding)).visto).toBe(true);
  });

  it('el botón Saltar cierra y marca como visto', () => {
    mostrarTutorial();
    $('tutorial-overlay').querySelector('.tutorial-saltar').click();
    expect($('tutorial-overlay').classList.contains('open')).toBe(false);
    expect(JSON.parse(localStorage.getItem(CLAVES.onboarding)).visto).toBe(true);
  });

  it('Esc también lo cierra', () => {
    mostrarTutorial();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('tutorial-overlay').classList.contains('open')).toBe(false);
  });

  it('una vez visto, quizasMostrarTutorial ya no lo abre', () => {
    mostrarTutorial();
    $('tutorial-overlay').querySelector('.tutorial-saltar').click();
    $('tutorial-overlay').classList.remove('open');
    quizasMostrarTutorial();
    expect($('tutorial-overlay').classList.contains('open')).toBe(false);
  });

  it('Ajustes → Ayuda lo vuelve a mostrar', () => {
    mostrarTutorial();
    $('tutorial-overlay').querySelector('.tutorial-saltar').click();
    $('btn-ver-tutorial').click();
    expect($('tutorial-overlay').classList.contains('open')).toBe(true);
  });
});
