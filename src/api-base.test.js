/* @vitest-environment jsdom */
/* ===================================================================
   api-base.test.js — Resolución de la URL del backend.

   Regresiones que cubre:
     * El override manual (localStorage.cherrybombApiBase) tiene prioridad
       sobre el valor de compilación (VITE_API_BASE). Antes la URL quedaba
       congelada al importar el módulo y no se podía cambiar sin recompilar.
     * Sin override se usa el valor del build.
     * Un override vacío se ignora (no rompe las llamadas).
     * Las barras finales se normalizan (para no duplicar "/api/...").
     * La clave está en EXCLUDED_KEYS del módulo de respaldos: es
       configuración del dispositivo, no datos del usuario.
   =================================================================== */
import { describe, it, expect, beforeEach, vi } from 'vitest';

if (typeof localStorage === 'undefined' || !localStorage) {
  const _m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_m.has(k) ? _m.get(k) : null),
    setItem: (k, v) => _m.set(k, String(v)),
    removeItem: (k) => _m.delete(k),
    clear: () => _m.clear(),
  };
}

async function cargar(build = 'https://backend.ejemplo.test') {
  vi.resetModules();
  // vi.stubEnv parchea import.meta.env (que es lo que lee el código) y
  // process.env.
  vi.stubEnv('VITE_API_BASE', build);
  return await import('./api-base.ts');
}

describe('api-base — URL del backend', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('usa el valor de compilación cuando no hay override', async () => {
    const { getApiBase, apiBaseBuild } = await cargar();
    expect(apiBaseBuild()).toBe('https://backend.ejemplo.test');
    expect(getApiBase()).toBe('https://backend.ejemplo.test');
  });

  it('el override manual tiene prioridad sobre el build', async () => {
    const { getApiBase, setApiBase } = await cargar();
    setApiBase('http://127.0.0.1:8000');
    expect(localStorage.getItem('cherrybombApiBase')).toBe('http://127.0.0.1:8000');
    expect(getApiBase()).toBe('http://127.0.0.1:8000');
  });

  it('normaliza barras finales y espacios', async () => {
    const { getApiBase, setApiBase } = await cargar();
    setApiBase('  http://127.0.0.1:8000///  ');
    expect(getApiBase()).toBe('http://127.0.0.1:8000');
  });

  it('un override vacío se borra y vuelve el valor del build', async () => {
    const { getApiBase, setApiBase } = await cargar();
    setApiBase('http://127.0.0.1:8000');
    setApiBase('');
    expect(localStorage.getItem('cherrybombApiBase')).toBeNull();
    expect(getApiBase()).toBe('https://backend.ejemplo.test');
  });

  it('sin build ni override queda en modo "mismo origen" (string vacío)', async () => {
    const { getApiBase, apiBaseBuild } = await cargar('');
    expect(apiBaseBuild()).toBe('');
    expect(getApiBase()).toBe('');
  });

  it('testApiBase informa cuando el backend responde', async () => {
    const { testApiBase } = await cargar();
    globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const r = await testApiBase('http://127.0.0.1:8000');
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.url).toBe('http://127.0.0.1:8000/api/health');
  });

  it('testApiBase no lanza si el backend no responde', async () => {
    const { testApiBase } = await cargar();
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const r = await testApiBase('http://127.0.0.1:8000');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
  });

  it('la clave NO se exporta en los respaldos', async () => {
    const { EXCLUDED_KEYS } = await import('./backup/backup.js');
    expect(EXCLUDED_KEYS.has('cherrybombApiBase')).toBe(true);
  });
});
