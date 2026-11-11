/* @vitest-environment jsdom */
/* ===================================================================
   api-client.test.js — normalización de la respuesta de /api/accounts/.

   El backend devuelve las cuentas como un MAPA:
     {count: 2, accounts: {"admin@…": {...}, "profe@…": {...}}}
   y la clave ES el email. Hay cuentas (la semilla admin) cuyo valor no
   trae el campo `email` dentro: si al convertir el mapa a lista se
   descarta la clave, esas cuentas desaparecen y el panel Usuarios las
   muestra incompletas (o vacías) cuando la PWA corre en otro origen
   (GitHub Pages → backend local).
   =================================================================== */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom puede no exponer localStorage (ver api-base.test.js).
if (typeof localStorage === 'undefined' || !localStorage) {
  const _m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_m.has(k) ? _m.get(k) : null),
    setItem: (k, v) => _m.set(k, String(v)),
    removeItem: (k) => _m.delete(k),
    clear: () => _m.clear(),
  };
}

async function cargarApiClient() {
  vi.resetModules();
  return import('./api-client');
}

describe('api-client — apiCuentas()', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('conserva el email de la clave cuando el valor no lo trae', async () => {
    const { apiCuentas } = await cargarApiClient();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        count: 2,
        accounts: {
          'admin@bachillerato.edu': { rol: 'admin', nombre: 'Administrador', activo: true },
          'profe@bachillerato.edu': { email: 'profe@bachillerato.edu', rol: 'coordinador', activo: true },
        },
      }),
    }));
    const r = await apiCuentas();
    expect(r.count).toBe(2);
    expect(r.accounts.length).toBe(2);
    // La cuenta SIN campo email dentro conserva el de la clave.
    const admin = r.accounts.find((a) => a.rol === 'admin');
    expect(admin.email).toBe('admin@bachillerato.edu');
    const profe = r.accounts.find((a) => a.rol === 'coordinador');
    expect(profe.email).toBe('profe@bachillerato.edu');
  });

  it('acepta que el backend devuelva una lista', async () => {
    const { apiCuentas } = await cargarApiClient();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        count: 1,
        accounts: [{ email: 'alu@test.local', rol: 'estudiante', activo: true }],
      }),
    }));
    const r = await apiCuentas();
    expect(r.accounts.length).toBe(1);
    expect(r.accounts[0].email).toBe('alu@test.local');
  });

  it('devuelve una lista vacía si la respuesta no trae cuentas', async () => {
    const { apiCuentas } = await cargarApiClient();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ count: 0 }),
    }));
    const r = await apiCuentas();
    expect(r.accounts).toEqual([]);
    expect(r.count).toBe(0);
  });
});
