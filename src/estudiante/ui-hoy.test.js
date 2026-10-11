// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { montarHoy, renderHoy } from './hoy.js';
import { CLAVES } from './datos.js';
import { hoyISO } from './fechas.js';

function $(id) { return document.getElementById(id); }

beforeAll(function () {
  document.body.innerHTML = '<div id="inicio-hoy" class="hidden"></div><div id="toast" class="toast"></div>';
  window.mostrarApp = function () {};
  montarHoy();
});

beforeEach(function () { localStorage.clear(); });

describe('pantalla Hoy en el DOM', () => {
  it('se monta dentro de #inicio-hoy y quita la clase hidden', () => {
    expect($('inicio-hoy').classList.contains('hidden')).toBe(false);
    expect($('inicio-hoy').querySelector('.hoy-panel')).toBeTruthy();
  });

  it('pinta las tareas como TEXTO, nunca como HTML', () => {
    localStorage.setItem(CLAVES.misTareas, JSON.stringify([
      { id: 'm1', titulo: '<img src=x onerror=alert(1)>', fecha: hoyISO(), hecha: false }
    ]));
    renderHoy();
    var panel = $('inicio-hoy');
    expect(panel.querySelector('img')).toBe(null);
    expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');
    // Aparece escapado en el HTML, no como etiqueta real
    expect(panel.innerHTML).toContain('&lt;img src=x');
  });

  it('muestra la próxima evaluación y el aviso de privacidad', () => {
    var hoy = hoyISO();
    localStorage.setItem(CLAVES.horario, JSON.stringify([{ hora: '07:00', Lunes: 'Matemática', Martes: 'Física' }]));
    localStorage.setItem(CLAVES.examenes, JSON.stringify([{ titulo: 'Examen de Química', fecha: hoy, tiempo: 45 }]));
    renderHoy();
    var panel = $('inicio-hoy');
    expect(panel.textContent).toContain('Próxima evaluación');
    expect(panel.textContent).toContain('Examen de Química');
    expect(panel.textContent).toContain('Hoy');
    expect(panel.textContent).toContain('Todo se guarda en este dispositivo');
    expect(panel.querySelector('[aria-labelledby="hoy-titulo"]')).toBeTruthy();
  });

  it('la casilla de una tarea personal la marca como hecha y se queda visible', () => {
    var hoy = hoyISO();
    localStorage.setItem(CLAVES.misTareas, JSON.stringify([
      { id: 'm9', titulo: 'Practicar inglés', fecha: hoy, hecha: false }
    ]));
    renderHoy();
    var casilla = $('inicio-hoy').querySelector('input[type="checkbox"]');
    expect(casilla).toBeTruthy();
    expect(casilla.id).toBe('hoy-t-m9');
    casilla.checked = true;
    casilla.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(JSON.parse(localStorage.getItem(CLAVES.misTareas))[0].hecha).toBe(true);
    // No desaparece de la pantalla: queda tachada
    var nueva = $('inicio-hoy').querySelector('input[type="checkbox"]');
    expect(nueva.checked).toBe(true);
    expect(nueva.closest('.hoy-fila').className).toContain('is-hecha');
  });
});
