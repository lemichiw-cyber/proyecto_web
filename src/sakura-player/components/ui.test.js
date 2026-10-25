/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { errorState, bindRetry, emptyState, escapeHtml } from './ui.js';

describe('Estados de error del reproductor', () => {
  it('escapa texto dinámico para no inyectar HTML', () => {
    expect(escapeHtml('<img onerror="x">')).toBe('&lt;img onerror=&quot;x&quot;&gt;');
  });

  it('errorState muestra título, detalle y acción de reintento', () => {
    const html = errorState('wifiOff', 'Sin conexión', 'YouTube Music no está disponible', {
      retryLabel: 'Volver a intentar',
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Sin conexión');
    expect(html).toContain('YouTube Music no está disponible');
    expect(html).toContain('data-sp-retry');
    expect(html).toContain('Volver a intentar');
  });

  it('errorState puede omitir el botón de reintento', () => {
    const html = errorState('alert', 'Error', 'Detalle', { retry: false });
    expect(html).not.toContain('data-sp-retry');
  });

  it('bindRetry ejecuta el callback y desactiva el botón', () => {
    document.body.innerHTML = errorState('alert', 'Error', 'Detalle');
    const fn = vi.fn();
    bindRetry(document.body, fn);
    document.querySelector('[data-sp-retry]').click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-sp-retry]').disabled).toBe(true);
    expect(document.querySelector('[data-sp-retry]').textContent).toBe('Reintentando…');
  });

  it('emptyState mantiene el marcado accesible básico', () => {
    const html = emptyState('music', 'Sin canciones', 'Cargá un archivo');
    expect(html).toContain('sp-empty');
    expect(html).toContain('Sin canciones');
    expect(html).toContain('Cargá un archivo');
  });
});
