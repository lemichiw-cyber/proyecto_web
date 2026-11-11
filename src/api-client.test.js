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

/* ===================================================================
   api-client — Colegio Protegido (/api/protegido/incidentes)
   =================================================================== */
describe('api-client — incidentes de Colegio Protegido', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('apiIncidentes() consulta la lista', async () => {
    const { apiIncidentes } = await cargarApiClient();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, count: 1, incidentes: [{ id: 'x1', tipo: 'Robo' }], gestion: false }),
    }));
    const r = await apiIncidentes();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(String(url)).toContain('/api/protegido/incidentes');
    expect(init.method).toBe('GET');
    expect(r.count).toBe(1);
    expect(r.incidentes[0].tipo).toBe('Robo');
  });

  it('apiReportarIncidente() manda tipo, descripción y urgente', async () => {
    const { apiReportarIncidente } = await cargarApiClient();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, id: 'n1' }),
    }));
    const r = await apiReportarIncidente('Acoso', 'en el patio', true);
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ tipo: 'Acoso', desc: 'en el patio', urgente: true });
    expect(r.id).toBe('n1');
  });

  it('apiBorrarIncidente() borra por id', async () => {
    const { apiBorrarIncidente } = await cargarApiClient();
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
    await apiBorrarIncidente('a b/c');
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(String(url)).toContain('/api/protegido/incidentes/a%20b%2Fc');
    expect(init.method).toBe('DELETE');
  });

  it('apiResolverIncidente() marca el reporte como atendido', async () => {
    const { apiResolverIncidente } = await cargarApiClient();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, incidente: { id: 'n1', estado: 'resuelto' } }),
    }));
    const r = await apiResolverIncidente('n1');
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(String(url)).toContain('/api/protegido/incidentes/n1/resolver');
    expect(init.method).toBe('POST');
    expect(r.incidente.estado).toBe('resuelto');
  });

  it('un 401 del backend se reporta como error (no como red)', async () => {
    const { apiIncidentes } = await cargarApiClient();
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: 'No autenticado' }),
    }));
    await expect(apiIncidentes()).rejects.toThrow(/API 401/);
  });
});
