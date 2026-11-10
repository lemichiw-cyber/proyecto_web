/* @vitest-environment jsdom */
/* ===================================================================
   roles.test.js — Sistema de roles del lado del cliente.

   Regresiones que cubren:
     * `crearCuenta` acepta cuentas SIN contraseña (las crea el admin y la
       persona la define en su primer ingreso). Antes exigía contraseña y el
       panel admin la llamaba sin ella: la cuenta nunca se creaba.
     * `definirPasswordLocal` deja la cuenta lista para entrar.
     * El registro público SIEMPRE es "estudiante" (no se autoasigna un rango).
     * El login local avisa PASSWORD_PENDIENTE si la cuenta no tiene contraseña.
   =================================================================== */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* Node 22+ expone un `localStorage` global sin definir; en jsdom hay que
   garantizarlo (mismo mock que usa el test de foros). */
if (typeof localStorage === 'undefined' || !localStorage) {
  const _m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_m.has(k) ? _m.get(k) : null),
    setItem: (k, v) => _m.set(k, String(v)),
    removeItem: (k) => _m.delete(k),
    clear: () => _m.clear(),
  };
}

async function cargarCuentas() {
  vi.resetModules();
  return await import('./app-accounts.js');
}

describe('cuentas — roles locales', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('crea una cuenta sin contraseña (la define al entrar)', async () => {
    const { crearCuenta, obtenerCuenta } = await cargarCuentas();
    const r = crearCuenta('nuevo@test.local', 'Nuevo', 'docente');
    expect(r.ok).toBe(true);
    const cuenta = obtenerCuenta('nuevo@test.local');
    expect(cuenta.rol).toBe('docente');
    expect(cuenta.passwordHash).toBe('');
  });

  it('rechaza una contraseña demasiado corta si viene informed', async () => {
    const { crearCuenta } = await cargarCuentas();
    const r = crearCuenta('nuevo@test.local', 'Nuevo', 'docente', '123');
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/6 caracteres/);
  });

  it('no deja crear dos veces la misma cuenta', async () => {
    const { crearCuenta } = await cargarCuentas();
    expect(crearCuenta('nuevo@test.local', 'Nuevo', 'docente').ok).toBe(true);
    expect(crearCuenta('nuevo@test.local', 'Nuevo', 'docente').ok).toBe(false);
  });

  it('define la contraseña en el primer ingreso', async () => {
    const { crearCuenta, definirPasswordLocal, verificarPassword, obtenerCuenta } = await cargarCuentas();
    crearCuenta('nuevo@test.local', 'Nuevo', 'coordinador');
    const r = definirPasswordLocal('nuevo@test.local', 'clave-123456');
    expect(r.ok).toBe(true);
    expect(verificarPassword('clave-123456', obtenerCuenta('nuevo@test.local'))).toBe(true);
  });

  it('no define contraseña de una cuenta inexistente', async () => {
    const { definirPasswordLocal } = await cargarCuentas();
    const r = definirPasswordLocal('fantasma@test.local', 'clave-123456');
    expect(r.ok).toBe(false);
  });

  it('cambia el rango y limpia el semestre cuando no es estudiante', async () => {
    const { crearCuenta, cambiarRangoCuenta, obtenerCuenta } = await cargarCuentas();
    crearCuenta('alu@test.local', 'Alumno', 'estudiante');
    const r = cambiarRangoCuenta('alu@test.local', 'docente');
    expect(r.ok).toBe(true);
    expect(obtenerCuenta('alu@test.local').rol).toBe('docente');
    expect(obtenerCuenta('alu@test.local').semestre).toBe('');
  });

  it('rechaza rangos desconocidos', async () => {
    const { crearCuenta, cambiarRangoCuenta } = await cargarCuentas();
    crearCuenta('alu@test.local', 'Alumno', 'estudiante');
    expect(cambiarRangoCuenta('alu@test.local', 'jefe').ok).toBe(false);
  });
});

describe('auth — registro y login con roles', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch'); // sin backend → fallback local
    });
  });

  /* Se recargan los módulos: el caché interno de cuentas (cuentasBackend)
     también tiene que quedar limpio entre pruebas. */
  async function cargarAuth() {
    vi.resetModules();
    const cuentas = await import('./app-accounts.js');
    const auth = await import('./auth.ts');
    return { cuentas, auth };
  }

  it('el registro público siempre crea un estudiante', async () => {
    const { auth } = await cargarAuth();
    const r = await auth.register('nuevo@test.local', 'Nuevo', 'clave-123456', 'admin');
    expect(r.rol).toBe('estudiante');
    expect(r.local).toBe(true);
  });

  it('el login local de una cuenta sin contraseña pide definirla', async () => {
    const { cuentas, auth } = await cargarAuth();
    expect(cuentas.crearCuenta('nuevo@test.local', 'Nuevo', 'docente').ok).toBe(true);
    await expect(auth.login('nuevo@test.local', 'lo-que-sea')).rejects.toThrow(/PASSWORD_PENDIENTE/);
  });

  it('define la contraseña y después deja entrar', async () => {
    const { cuentas, auth } = await cargarAuth();
    cuentas.crearCuenta('nuevo@test.local', 'Nuevo', 'docente');
    const d = await auth.definirContrasena('nuevo@test.local', 'clave-123456');
    expect(d.ok).toBe(true);
    expect(d.rol).toBe('docente');
    const l = await auth.login('nuevo@test.local', 'clave-123456');
    expect(l.ok).toBe(true);
    expect(l.rol).toBe('docente');
  });
});
