/* @vitest-environment jsdom */
/* ===================================================================
   grupales-app.test.js — Integración DOM del workspace de Actividades
   Grupales con el backend /api/grupales simulado.
   =================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init, estadoGrupales } from './grupales-app.js';

const HTML = `<!doctype html><html><body>
<section id="app-grupales"><div class="container"></div></section>
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
  '/api/grupales/gr-1': {
    ok: true,
    grupo: { id: 'gr-1', nombre: 'Proyecto science', materia: 'Biología', descripcion: 'Fotosíntesis', estado: 'activo' },
    miembros: [{ email: 'alu@colegio.edu', nombre: 'Alumno', rol: 'miembro' }],
    mensajes: [{ id: 'ms-1', email: 'alu@colegio.edu', nombre: 'Alumno', contenido: 'hola equipo', creado: 1700000000 }],
    entregas: [{ id: 'en-1', email: 'alu@colegio.edu', nombre: 'Alumno', texto: 'Primera parte', creado: 1700000000 }],
  },
  '/api/grupales/': {
    ok: true,
    count: 1,
    grupos: [
      {
        id: 'gr-1',
        nombre: 'Proyecto science',
        materia: 'Biología',
        estado: 'activo',
        actualizado: 1700000000,
        miembros: [{ email: 'alu@colegio.edu', nombre: 'Alumno', rol: 'miembro' }],
        total_mensajes: 1,
        total_entregas: 1,
      },
    ],
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
  localStorage.setItem('cherrybombSession', JSON.stringify({ email: 'alu@colegio.edu', rol: 'estudiante', nombre: 'Alumno' }));
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    for (const [path, data] of Object.entries(RUTAS)) {
      if (u.includes(path)) return jsonResponse(data);
    }
    return jsonResponse({ detail: 'sin ruta' }, 404);
  });
  estadoGrupales.grupos = [];
  estadoGrupales.abierto = null;
  estadoGrupales.detalle = null;
  estadoGrupales.error = '';
  estadoGrupales.demo = false;
  await init();
});

describe('grupales-app — carga con backend', () => {
  it('inyecta la UI y lista los grupos', () => {
    expect($('grp-panel')).toBeTruthy();
    expect($('grupo-lista').textContent).toContain('Proyecto science');
  });

  it('muestra el botón de nuevo grupo', () => {
    expect($('btn-grupo-add')).toBeTruthy();
  });

  it('abre el grupo y muestra miembros, chat y entregas', async () => {
    const btn = $('grupo-lista').querySelector('.grp-item');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(estadoGrupales.abierto).toBe('gr-1');
    const panel = $('grp-panel').textContent;
    expect(panel).toContain('Alumno');
    expect(panel).toContain('hola equipo');
    expect(panel).toContain('Primera parte');
  });
});
