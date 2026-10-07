/* ===================================================================
   Sakura Player — Sesión del modo administrador

   El token firmado por el backend se guarda en localStorage para que
   la sesión sobreviva a recargar la página (24 h). Si el backend lo
   rechaza (expirado/inválido) se limpia y se vuelve al formulario.

   Toda lectura/escritura de storage va con try/catch: hay entornos
   (Safari privado, tests) donde localStorage lanza.
   =================================================================== */

import { api, friendlyError } from './client.js';

const LS_TOKEN = 'sakuraAdminToken';
const LS_EMAIL = 'sakuraAdminEmail';

function read(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function write(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* sin storage */ }
}

function drop(key) {
  try { localStorage.removeItem(key); } catch (e) { /* sin storage */ }
}

/** Token guardado o null. */
export function adminToken() {
  const t = read(LS_TOKEN);
  return t && t.trim() ? t.trim() : null;
}

/** Correo con el que se inició sesión (o null). */
export function adminEmail() {
  return read(LS_EMAIL);
}

/** ¿Hay sesión activa guardada? (la valida el backend al restaurar) */
export function isAdmin() {
  return !!adminToken();
}

/** Guarda la respuesta de /api/admin/login. */
export function storeSession(res) {
  if (!res || !res.token) return false;
  write(LS_TOKEN, String(res.token));
  write(LS_EMAIL, String(res.email || ''));
  return true;
}

/** Borra la sesión local. */
export function clearSession() {
  drop(LS_TOKEN);
  drop(LS_EMAIL);
}

/**
 * Inicia sesión. Lanza PlayerError con código 'auth' si las
 * credenciales son incorrectas (friendlyError ya lo traduce).
 */
export async function loginAdmin(email, password) {
  const res = await api.adminLogin(email, password);
  if (!storeSession(res)) {
    const err = new Error('Respuesta inválida del servidor');
    err.code = 'api';
    throw err;
  }
  return res;
}

/**
 * Restaura/valida la sesión guardada. Devuelve el correo o null (y
 * limpia el token si el backend lo rechazó).
 */
export async function restoreSession() {
  const token = adminToken();
  if (!token) return null;
  try {
    const me = await api.adminMe(token);
    if (!me || !me.ok) throw new Error('sin sesión');
    if (me.email) write(LS_EMAIL, String(me.email));
    return me.email || adminEmail();
  } catch (err) {
    // Token expirado o backend caído: no dejamos un token muerto.
    if (err && err.code === 'auth') clearSession();
    return null;
  }
}

/** Info del backend reservada al admin (null si la sesión no sirve). */
export async function adminStats() {
  const token = adminToken();
  if (!token) return null;
  try {
    return await api.adminStats(token);
  } catch (err) {
    if (err && err.code === 'auth') clearSession();
    throw err;
  }
}

/**
 * Mensaje amigable para el panel admin. `friendlyError` traduce 'auth'
 * como "Sesión de YouTube Music…", que acá sería mentira: en el login
 * el detalle del backend (credenciales incorrectas / token expirado)
 * es exactamente lo que hay que mostrar.
 */
export function adminError(err) {
  if (err && (err.code === 'auth' || err.code === 'api')) {
    return err.message || 'No se pudo completar la operación';
  }
  return friendlyError(err);
}
