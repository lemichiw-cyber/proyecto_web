/* @vitest-environment jsdom */
/* ===================================================================
   foro-app.test.js — Prueba de integración DOM del controlador del foro
   Cubre el flujo principal: demo, apertura, voto, comentario, respuesta
   anidada, aceptar respuesta, volver, crear publicación y filtrar.
   =================================================================== */

import { describe, it, expect, beforeAll } from 'vitest';
import { initForos } from './foro-app.js';

const HTML = `<!doctype html><html><body>
<section id="app-foros">
  <input id="foro-buscar">
  <button id="foro-btn-nuevo"></button>
  <button id="foro-btn-compacto"></button>
  <aside id="foro-comunidades"></aside>
  <div id="foro-orden-tabs"></div>
  <div id="foro-filtros"></div>
  <div id="foro-compositor" class="hidden">
    <h3 id="foro-compositor-titulo"></h3>
    <form id="foro-form">
      <input id="foro-form-titulo">
      <select id="foro-form-comunidad"></select>
      <select id="foro-form-tipo"></select>
      <textarea id="foro-form-texto"></textarea>
      <input type="file" id="foro-form-archivo">
      <div id="foro-form-archivos"></div>
      <div id="foro-form-preview" class="hidden"></div>
      <button type="button" id="foro-form-preview-btn" data-accion="preview"></button>
      <span id="foro-form-contador"></span>
      <button type="submit" id="foro-form-publicar"></button>
    </form>
  </div>
  <div id="foro-lista"></div>
  <div id="foro-detalle" class="hidden"></div>
  <aside id="foro-lateral"></aside>
</section>
</body></html>`;

const usuario = { nombre: 'Ana', email: 'ana@test.com', rol: 'docente' };
let app;
let toasts;

const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const leerForos = () => JSON.parse(localStorage.getItem('foros') || '[]');

beforeAll(() => {
  document.body.innerHTML = HTML;
  HTMLElement.prototype.scrollIntoView = function () {};
  URL.createObjectURL = () => 'blob:foro-test';
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function () {};
  if (typeof localStorage === 'undefined' || !localStorage) { const _m = new Map(); globalThis.localStorage = { getItem: (k) => (_m.has(k) ? _m.get(k) : null), setItem: (k, v) => _m.set(k, String(v)), removeItem: (k) => _m.delete(k), clear: () => _m.clear() }; } else { try { localStorage.clear(); } catch (e) { /* noop */ } }
  toasts = [];
  app = initForos({
    getUsuario: () => usuario,
    toast: (mensaje, tipo) => toasts.push([mensaje, tipo]),
    confirmar: async () => true,
    prompt: async () => 'motivo',
    exigirPermiso: () => true,
    puedeEditar: () => true,
    puedeBorrar: () => true,
    puedeModerar: () => true,
    rolBadge: () => '<b>rol</b>',
  });
});

describe('foro-app — flujo principal', () => {
  it('inicializa y muestra el estado vacío', () => {
    expect(app).toBeTruthy();
    expect(typeof app.abrirPorId).toBe('function');
    expect(typeof app.idDesdeHash).toBe('function');
    expect($('foro-lista').textContent).toContain('Todavía no hay conversaciones');
  });

  it('carga publicaciones de ejemplo', () => {
    click($('foro-lista').querySelector('[data-accion="demo"]'));
    expect(leerForos()).toHaveLength(4);
    expect($('foro-lista').textContent).toContain('¿Cómo resuelvo');
  });

  it('abre un hilo y actualiza el hash compartible', () => {
    click($('foro-lista').querySelector('[data-accion="abrir"]'));
    expect($('foro-detalle').classList.contains('hidden')).toBe(false);
    expect(window.location.hash).toMatch(/^#foro=/);
    expect(app.idDesdeHash()).toBeTruthy();
  });

  it('vota una publicación y persiste el voto', () => {
    const postId = $('foro-detalle').querySelector('.fr-post').getAttribute('data-post-id');
    const antes = JSON.stringify(leerForos().find((p) => p.id === postId).votos);
    click($('foro-detalle').querySelector('.fr-post [data-accion="votar"][data-valor="1"]'));
    const despues = JSON.stringify(leerForos().find((p) => p.id === postId).votos);
    expect(despues).not.toBe(antes);
  });

  it('publica un comentario con Markdown seguro', () => {
    const postId = $('foro-detalle').querySelector('.fr-post').getAttribute('data-post-id');
    $('foro-texto').value = 'Mi comentario **nuevo** <script>alert(1)</script>';
    click($('foro-publicar'));
    const post = leerForos().find((p) => p.id === postId);
    expect(post.mensajes.some((m) => m.texto.includes('Mi comentario'))).toBe(true);
    expect($('foro-detalle').innerHTML).not.toContain('<script>alert(1)</script>');
  });

  it('responde a un comentario y guarda la respuesta anidada', () => {
    const postId = $('foro-detalle').querySelector('.fr-post').getAttribute('data-post-id');
    click($('foro-detalle').querySelector('[data-accion="responder-comentario"]'));
    expect($('foro-respondiendo')).toBeTruthy();
    $('foro-texto').value = 'Respuesta anidada';
    click($('foro-publicar'));
    const post = leerForos().find((p) => p.id === postId);
    expect(JSON.stringify(post.mensajes)).toContain('Respuesta anidada');
  });

  it('acepta una respuesta y marca el tema como resuelto', () => {
    const postId = $('foro-detalle').querySelector('.fr-post').getAttribute('data-post-id');
    const aceptar = Array.from($('foro-detalle').querySelectorAll('[data-accion="aceptar"]'))
      .find((b) => b.textContent.includes('Aceptar respuesta'));
    expect(aceptar).toBeTruthy();
    click(aceptar);
    const post = leerForos().find((p) => p.id === postId);
    expect(JSON.stringify(post.mensajes)).toContain('"aceptada":true');
    expect(post.estado).toBe('resuelto');
  });

  it('vuelve al feed y limpia el hash', () => {
    click($('foro-detalle').querySelector('[data-accion="volver"]'));
    expect($('foro-detalle').classList.contains('hidden')).toBe(true);
    expect(window.location.hash).toBe('');
  });

  it('crea una publicación desde el compositor', () => {
    app.abrirCompositor();
    $('foro-form-titulo').value = 'Nuevo tema de prueba';
    $('foro-form-texto').value = 'Contenido con `código`';
    $('foro-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(leerForos().some((p) => p.titulo === 'Nuevo tema de prueba')).toBe(true);
    expect($('foro-detalle').classList.contains('hidden')).toBe(false);
  });

  it('filtra por comunidad y cambia el orden', () => {
    app.irAlFeed();
    click($('foro-orden-tabs').querySelector('[data-orden="nuevo"]'));
    click($('foro-comunidades').querySelector('[data-comunidad="matematicas"]'));
    expect($('foro-lista').textContent).toContain('Matemáticas');
    expect($('foro-lista').textContent).toContain('¿Cómo resuelvo');
  });

  it('exporta sin lanzar errores y registra toasts', () => {
    expect(() => click($('foro-lateral').querySelector('[data-accion="exportar"]'))).not.toThrow();
    expect(toasts.length).toBeGreaterThan(0);
  });
});
