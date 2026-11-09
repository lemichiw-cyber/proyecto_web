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

function _api(path: string, body: any): Promise<Response> {
  return fetch(API_BASE + path, {
    method: body ? "POST" : "GET",
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
      throw new Error(detalle || "Credenciales inválidas.");
    }
    const data = (await r.json()) as { token: string; rol: string; nombre: string };
    _guardarSesion(data.token, { email: e, rol: data.rol, nombre: data.nombre });
    return { ok: true, email: e, rol: data.rol, nombre: data.nombre, local: false };
  } catch (err) {
    // 2) Fallback local: verificar cuenta y contraseña en localStorage
    const cuenta = obtenerCuenta(e);
    if (!cuenta || !cuentaActiva(cuenta)) {
      throw new Error("Credenciales inválidas.");
    }
    if (!verificarPassword(password, cuenta)) {
      throw new Error("Credenciales inválidas.");
    }
    _guardarSesion(null, { email: e, rol: cuenta.rol, nombre: cuenta.nombre });
    return { ok: true, email: e, rol: cuenta.rol, nombre: cuenta.nombre, local: true };
  }
}

/* ---------- Registro ---------- */
export async function register(
  email: string,
  nombre: string,
  password: string,
  rol?: string,
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
      rol: rol || "estudiante",
    });
    if (!r.ok) {
      const detalle = await r.text().catch(() => "Registro fallido");
      throw new Error(detalle || "Registro fallido.");
    }
    const data = (await r.json()) as { token: string; rol: string; nombre: string };
    _guardarSesion(data.token, { email: e, rol: data.rol, nombre: data.nombre });
    return { ok: true, email: e, rol: data.rol, nombre: data.nombre, local: false };
  } catch (err) {
    // 2) Fallback local: crear cuenta en localStorage
    const res = crearCuenta(e, nombre, rol || "estudiante", password);
    if (!res.ok || !res.cuenta) throw new Error(res.msg);
    _guardarSesion(null, { email: e, rol: res.cuenta.rol, nombre: res.cuenta.nombre });
    return { ok: true, email: e, rol: res.cuenta.rol, nombre: res.cuenta.nombre, local: true };
  }
}

export async function logout(): Promise<{ ok: boolean }> {
  const t = token;
  try {
    if (t) await _api("/api/auth/logout", null).catch(() => {
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
    const data = (await r.json()) as { email: string; rol: string; nombre: string };
    _guardarSesion(token, { email: data.email, rol: data.rol, nombre: data.nombre });
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
