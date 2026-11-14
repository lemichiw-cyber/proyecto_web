/* @vitest-environment jsdom */
/* ===================================================================
   mensajes-app.test.js — Integración DOM del módulo de Mensajes con
   el backend /api/mensajes simulado.
   =================================================================== */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init, estadoMensajes } from './mensajes-app.js';

const HTML = `<!doctype html><html><body>
<section id="app-mensajes"><div class="container"></div></section>
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
  '/api/mensajes/contactos': {
    ok: true,
    count: 1,
    contactos: [{ email: 'doc@colegio.edu', nombre: 'Docente Uno', rol: 'docente' }],
  },
  '/api/mensajes/bandeja': {
    ok: true,
    count: 1,
    conversaciones: [
      {
        email: 'doc@colegio.edu',
        nombre: 'Docente Uno',
        rol: 'docente',
        ultimo: { id: 'm1', asunto: 'Consulta', contenido: 'Hola', creado: 1700000000, de: 'alu@colegio.edu' },
        no_leidos: 1,
        total: 2,
      },
    ],
  },
  // Ojo: el email va con encodeURIComponent → "doc%40colegio.edu".
  '/api/mensajes/conversacion/': {
    ok: true,
    contacto: { email: 'doc@colegio.edu', nombre: 'Docente Uno', rol: 'docente' },
    mensajes: [
      { id: 'm1', remitente: 'alu@colegio.edu', destinatario: 'doc@colegio.edu', asunto: 'Consulta', contenido: '¿Me pasás la consigna?', creado: 1700000000, leido: false },
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
  estadoMensajes.conversaciones = [];
  estadoMensajes.mensajes = [];
  estadoMensajes.abierto = null;
  estadoMensajes.error = '';
  estadoMensajes.demo = false;
  await init();
});

describe('mensajes-app — carga con backend', () => {
  it('inyecta la UI y lista las conversaciones', () => {
    expect($('msg-panel')).toBeTruthy();
    expect($('msg-lista').textContent).toContain('Docente Uno');
  });

  it('muestra el botón de nuevo mensaje', () => {
    expect($('btn-msg-add')).toBeTruthy();
  });

  it('abre la conversación y muestra los mensajes', async () => {
    const btn = $('msg-lista').querySelector('.msg-conv');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(estadoMensajes.abierto).toBe('doc@colegio.edu');
    expect($('msg-chat').textContent).toContain('¿Me pasás la consigna?');
    expect($('msg-chat-titulo').textContent).toContain('Docente Uno');
  });

  it('carga los contactos para el selector', () => {
    const sel = $('msg-destinatario');
    expect(sel).toBeTruthy();
    expect(sel.innerHTML).toContain('doc@colegio.edu');
  });
});
