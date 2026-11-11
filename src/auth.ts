/* ===================================================================
   auth.ts — Autenticación contra backend /api/auth con fallback local.
   - Intenta login/register/me/logout contra el backend FastAPI.
   - Si el backend no responde o no está disponible, cae a cuentas
     locales (app-accounts.js / localStorage) para que la app siga
     funcionando sin servidor.
   =================================================================== */
import {
  obtenerCuenta,
  crearCuenta,
  definirPasswordLocal,
  normalizaEmail,
  cuentaActiva,
  verificarPassword,
} from "./app-accounts.js";

const API_BASE = (typeof VITE_API_BASE !== "undefined" ? VITE_API_BASE : "").replace(/\/+$/, "");

const TOKEN_KEY = "cherrybombAuthToken";
const USER_KEY = "cherrybombAuthUser";

let token: string | null = null;
let usuario: { email: string; rol: string; nombre: string } | null = null;

// P1: cookie-only. El token vive SOLO en memoria; la sesión real es la cookie HttpOnly
// del backend (credentials: "include"). Un XSS ya no puede leer el token de localStorage.
// Al cargar, borramos cualquier residuo viejo (cherrybombAuthToken/User) y partimos de null.
function _guardarSesion(t: string | null, u: { email: string; rol: string; nombre: string } | null): void {
  token = t;
  usuario = u;
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) { /* noop */ }
}

function _cargarSesion(): void {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) { /* noop */ }
  token = null;
  usuario = null;
}
_cargarSesion();

function _headersConToken(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = "Bearer " + token;
  return h;
}

function _api(path: string, body: any, method?: string): Promise<Response> {
  return fetch(API_BASE + path, {
    method: method || (body ? "POST" : "GET"),
    headers: _headersConToken(),
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
}

interface AuthResult {
  ok: boolean;
  email: string;
  rol: string;
  nombre: string;
  local: boolean;
}

/* Marcador que usa el backend cuando la cuenta existe pero todavía no
   tiene contraseña (creada por un administrador o la semilla admin). */
export const PASSWORD_PENDIENTE = "PASSWORD_PENDIENTE";

export function esPasswordPendiente(err: unknown): boolean {
  const msg = String((err as any)?.message || err || "");
  return msg.indexOf(PASSWORD_PENDIENTE) !== -1;
}

export function isAuthenticated(): boolean {
  return !!token || !!usuario;
}
export function getToken(): string | null {
  return token;
}
export function getUser(): { email: string; rol: string; nombre: string } | null {
  return usuario;
}
export function setToken(t: string | null): void {
  _guardarSesion(t, usuario);
}
export function setUser(u: { email: string; rol: string; nombre: string } | null): void {
  _guardarSesion(token, u);
}

/* ---------- Login ---------- */
export async function login(email: string, password: string): Promise<AuthResult> {
  const e = normalizaEmail(email);

  // 1) Intentar backend
  try {
    const r = await _api("/api/auth/login", { email: e, password: password });
    if (!r.ok) {
      const detalle = await r.text().catch(() => "Login fallido");
      // 409 PASSWORD_PENDIENTE: la cuenta existe pero no tiene contraseña.
      // No se sigue con el fallback local: hay que crearla primero.
      if (r.status === 409 && detalle.indexOf(PASSWORD_PENDIENTE) !== -1) {
        throw new Error(PASSWORD_PENDIENTE + ": definí tu contraseña para entrar.");
      }
      throw new Error(detalle || "Credenciales inválidas.");
    }
    const data = (await r.json()) as { token: string; rol: string; nombre: string };
    _guardarSesion(data.token, { email: e, rol: data.rol, nombre: data.nombre });
    return { ok: true, email: e, rol: data.rol, nombre: data.nombre, local: false };
  } catch (err) {
    // La cuenta sin contraseña se reporta tal cual (no es "credencial inválida").
    if (esPasswordPendiente(err)) throw err;
    // 2) Fallback local: verificar cuenta y contraseña en localStorage
    const cuenta = obtenerCuenta(e);
    if (!cuenta || !cuentaActiva(cuenta)) {
      throw new Error("Credenciales inválidas.");
    }
    if (!cuenta.passwordHash) {
      // Cuenta creada por el admin (o la semilla admin) sin contraseña.
      throw new Error(PASSWORD_PENDIENTE + ": definí tu contraseña para entrar.");
    }
    if (!verificarPassword(password, cuenta)) {
      throw new Error("Credenciales inválidas.");
    }
    _guardarSesion(null, { email: e, rol: cuenta.rol, nombre: cuenta.nombre });
    return { ok: true, email: e, rol: cuenta.rol, nombre: cuenta.nombre, local: true };
  }
}

/* ---------- Definir contraseña (primer ingreso) ---------- */
export async function definirContrasena(email: string, password: string): Promise<AuthResult> {
  const e = normalizaEmail(email);
  if (!e) throw new Error("Falta el correo.");
  if (!password || password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");

  let r: Response;
  try {
    r = await _api("/api/auth/definir-contrasena", { email: e, password: password });
  } catch (networkErr) {
    // Sin backend: se define localmente (solo si la cuenta existe local).
    const res = definirPasswordLocal(e, password);
    if (!res.ok || !res.cuenta) throw new Error(res.msg || "No se pudo guardar la contraseña.");
    _guardarSesion(null, { email: e, rol: res.cuenta.rol, nombre: res.cuenta.nombre });
    return { ok: true, email: e, rol: res.cuenta.rol, nombre: res.cuenta.nombre, local: true };
  }
  if (!r.ok) {
    const detalle = await r.text().catch(() => "No se pudo guardar la contraseña.");
    throw new Error(detalle || "No se pudo guardar la contraseña.");
  }
  const data = (await r.json()) as { token?: string; rol: string; nombre: string };
  _guardarSesion(data.token || null, { email: e, rol: data.rol, nombre: data.nombre });
  return { ok: true, email: e, rol: data.rol, nombre: data.nombre, local: false };
}

/* ---------- Registro ---------- */
export async function register(
  email: string,
  nombre: string,
  password: string,
  rol?: string,
  grupo_id?: number | null,
): Promise<AuthResult> {
  const e = normalizaEmail(email);

  // Validación previa local (evita llamadas innecesarias al backend)
  if (!e) throw new Error("Falta el correo.");
  if (!password || password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
  if (obtenerCuenta(e)) {
    throw new Error("Ese correo ya está registrado. Iniciá sesión.");
  }

  // 1) Intentar backend
  try {
    const r = await _api("/api/auth/register", {
      email: e,
      nombre: nombre,
      password: password,
      // El registro público es SIEMPRE estudiante: el rango lo asigna un
      // administrador. (El backend también lo fuerza.)
      rol: "estudiante",
      ...(grupo_id != null ? { grupo_id } : {}),
    });
    if (!r.ok) {
      const detalle = await r.text().catch(() => "Registro fallido");
      throw new Error(detalle || "Registro fallido.");
    }
    const data = (await r.json()) as { token: string; rol: string; nombre: string };
    _guardarSesion(data.token, { email: e, rol: data.rol, nombre: data.nombre });
    return { ok: true, email: e, rol: data.rol, nombre: data.nombre, local: false };
  } catch (err) {
    // 2) Fallback local: crear cuenta en localStorage (siempre estudiante)
    const res = crearCuenta(e, nombre, "estudiante", password);
    if (!res.ok || !res.cuenta) throw new Error(res.msg);
    _guardarSesion(null, { email: e, rol: res.cuenta.rol, nombre: res.cuenta.nombre });
    return { ok: true, email: e, rol: res.cuenta.rol, nombre: res.cuenta.nombre, local: true };
  }
}

export async function logout(): Promise<{ ok: boolean }> {
  try {
    // La sesión es una cookie HttpOnly: hay que llamar SIEMPRE al backend
    // para que invalide la cookie (si no, el servidor sigue aceptando la
    // sesión aunque la app ya haya "cerrado" la sesión local).
    // OJO: es POST (un GET devolvía 405 y la cookie seguía viva).
    await _api("/api/auth/logout", null, "POST").catch(() => {
      /* best effort */
    });
  } catch (e) {
    /* ignore */
  }
  _guardarSesion(null, null);
  (window as any).usuarioActual = null;
  return { ok: true };
}

export async function me(): Promise<{ email: string; rol: string; nombre: string } | null> {
  // P1: aunque token sea null (recarga de página), la cookie HttpOnly puede autenticar.
  // No retornamos null aquí: intentamos validador con servidor.
  try {
    const r = await _api("/api/auth/me", null);
    if (!r.ok) return usuario;
    const data = (await r.json()) as { email: string; rol: string; nombre: string; token_nuevo?: string };
    const nt = (data as any).token_nuevo || token;
    _guardarSesion(nt || null, { email: data.email, rol: data.rol, nombre: data.nombre });
    return { email: data.email, rol: data.rol, nombre: data.nombre };
  } catch (err) {
    return usuario;
  }
}

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = "Bearer " + token;
  return h;
}
