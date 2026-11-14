/* @vitest-environment jsdom */
/* ===================================================================
   padres-app.test.js — Integración DOM del Portal de Padres con el
   backend /api/padres simulado.
   =================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init, estadoPadres } from './padres-app.js';

const HTML = `<!doctype html><html><body>
<section id="app-parents"><div class="container"></div></section>
</body></html>`;

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

const RUTAS = {
  '/api/padres/contactos': {
    ok: true,
    count: 1,
    contactos: [{ email: 'doc@colegio.edu', nombre: 'Docente Uno', rol: 'docente' }],
  },
  '/api/padres/resumen': {
    ok: true,
    count: 1,
    hijos: [
      {
        email: 'hijo@colegio.edu',
        nombre: 'Ana Hija',
        semestre: '2026-1',
        tareas: [
          { titulo: 'Ensayo de química', materia: 'Química', fecha: '2026-03-01', entregada: false },
          { titulo: 'Historia', materia: 'Historia', fecha: '2026-03-02', entregada: true },
        ],
        notas: [{ tarea_id: 't1', nota: 9, comentario: 'Muy bien' }],
        promedio: 9,
        asistencia: { registros: 10, presentes: 9, porcentaje: 90 },
      },
    ],
    totales: { tareas: 2, entregas: 1, calificaciones: 1 },
  },
};

const $ = (id) => document.getElementById(id);

// En este entorno `localStorage` puede no existir (Node sin --localstorage-file).
if (typeof localStorage === 'undefined' || !localStorage) {
  const _m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_m.has(k) ? _m.get(k) : null),
    setItem: (k, v) => _m.set(k, String(v)),
    removeItem: (k) => _m.delete(k),
    clear: () => _m.clear(),
  };
}

beforeEach(async () => {
  document.body.innerHTML = HTML;
  try { localStorage.clear(); } catch (e) { /* noop */ }
  localStorage.setItem('cherrybombSession', JSON.stringify({ email: 'padre@colegio.edu', rol: 'padres', nombre: 'Padre' }));
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    for (const [path, data] of Object.entries(RUTAS)) {
      if (u.includes(path)) return jsonResponse(data);
    }
    return jsonResponse({ detail: 'sin ruta' }, 404);
  });
  estadoPadres.hijos = [];
  estadoPadres.contactos = [];
  estadoPadres.error = '';
  estadoPadres.cargando = false;
  await init();
});

describe('padres-app — carga con backend', () => {
  it('inyecta el panel y muestra el hijo vinculado', () => {
    expect($('parents-panel')).toBeTruthy();
    expect($('parents-panel').textContent).toContain('Ana Hija');
  });

  it('muestra tareas, calificaciones y asistencia', () => {
    const txt = $('parents-panel').textContent;
    expect(txt).toContain('Ensayo de química');
    expect(txt).toContain('Muy bien');
    expect(txt).toContain('90%');
  });

  it('calcula el promedio general', () => {
    expect($('parent-promedio').textContent).toBe('9');
    expect($('parent-pendientes').textContent).toBe('1');
  });

  it('lista los contactos docentes', () => {
    expect($('parents-panel').textContent).toContain('Docente Uno');
  });
});
