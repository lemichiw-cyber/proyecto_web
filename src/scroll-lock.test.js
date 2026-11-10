/* @vitest-environment jsdom */
/* ===================================================================
   scroll-lock.test.js — Pruebas del bloqueo de scroll del body.

   Regresión que cubren:
     * Un modal que se cierra SIN llamar a unlockBody() (caso real de
       loginSuccess) ya no deja el body con overflow:hidden pegado.
     * El estilo inline `body.style.overflow='hidden'` (que el delegador
       global aplicaba sin reversa) se limpia al desbloquear.
     * Con dos overlays abiertos, cerrar uno NO desbloquea el body.
   =================================================================== */
import { describe, it, expect, beforeEach, vi } from 'vitest';

function montarDom() {
  document.body.innerHTML =
    '<aside id="sidebar"></aside>' +
    '<div class="modal-overlay" id="modal-login"></div>' +
    '<div class="modal-overlay" id="modal-temas"></div>';
}

/** Recarga el módulo para que reinicie su estado interno. */
async function cargarModulo() {
  vi.resetModules();
  return await import('./scroll-lock.js');
}

describe('scroll-lock — bloqueo del body', () => {
  beforeEach(() => {
    montarDom();
    window.scrollTo = vi.fn();
  });

  it('bloquea el body mientras hay un overlay abierto', async () => {
    const { lockBody, isBodyLocked } = await cargarModulo();
    document.getElementById('modal-login').classList.add('open');
    lockBody();
    expect(isBodyLocked()).toBe(true);
    expect(document.body.classList.contains('no-scroll')).toBe(true);
  });

  it('desbloquea cuando el overlay se cierra (aunque no se llame unlockBody)', async () => {
    const { lockBody, syncBodyLock, isBodyLocked } = await cargarModulo();
    const modal = document.getElementById('modal-login');
    modal.classList.add('open');
    lockBody();
    expect(document.body.classList.contains('no-scroll')).toBe(true);

    // Caso real de loginSuccess(): cierra el modal y solo sincroniza.
    modal.classList.remove('open');
    syncBodyLock();

    expect(isBodyLocked()).toBe(false);
    expect(document.body.classList.contains('no-scroll')).toBe(false);
  });

  it('limpia el estilo inline overflow que dejaba el scroll muerto', async () => {
    const { lockBody, unlockBody } = await cargarModulo();
    document.getElementById('modal-login').classList.add('open');
    lockBody();
    // Estilo inline heredado de la versión anterior del delegador global.
    document.body.style.overflow = 'hidden';
    document.getElementById('modal-login').classList.remove('open');
    unlockBody();
    expect(document.body.style.overflow).toBe('');
    expect(document.body.classList.contains('no-scroll')).toBe(false);
  });

  it('mantiene el bloqueo si queda otro overlay abierto', async () => {
    const { lockBody, unlockBody, isBodyLocked } = await cargarModulo();
    document.getElementById('modal-login').classList.add('open');
    document.getElementById('modal-temas').classList.add('open');
    lockBody();
    document.getElementById('modal-login').classList.remove('open');
    unlockBody();
    expect(isBodyLocked()).toBe(true);
    expect(document.body.classList.contains('no-scroll')).toBe(true);
  });

  it('el sidebar abierto también bloquea el scroll', async () => {
    const { lockBody, unlockBody, isBodyLocked } = await cargarModulo();
    document.getElementById('sidebar').classList.add('open');
    lockBody();
    expect(isBodyLocked()).toBe(true);
    document.getElementById('sidebar').classList.remove('open');
    unlockBody();
    expect(isBodyLocked()).toBe(false);
  });
});
