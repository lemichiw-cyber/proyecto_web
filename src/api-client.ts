import { escapeHtml } from "./utils/escape.js";
import { getApiBase } from "./api-base";

/**
 * Email de la sesión actual.
 *
 * Antes se leía de `localStorage.getItem("cherrybombSessionEmail")`, una clave
 * que NUNCA se escribía: la sesión real vive en `cherrybombSession` (JSON).
 * Como la constante se calculaba al importar el módulo, además quedaba
 * congelada en "" y los endpoints /api/items/* respondían 401.
 */
function _emailSesion(): string {
  // `import.meta.env` literal: es lo único que Vite reemplaza en el bundle.
  const env = import.meta.env.VITE_API_EMAIL || "";
  if (env) return env.trim().toLowerCase();
  try {
    const raw = localStorage.getItem("cherrybombSession");
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.email === "string" && s.email) return s.email.trim().toLowerCase();
    }
  } catch (e) {
    /* storage no disponible o JSON inválido */
  }
  const w = (window as any).usuarioActual;
  if (w && typeof w.email === "string" && w.email) return w.email.trim().toLowerCase();
  return "";
}

interface Grupo {
  id: number;
  anio?: string;
  seccion?: string;
  ciclo_escolar?: string;
  especialidad?: string;
}

interface MiGrupo {
  grupo: Grupo | null;
}

interface TareaIn {
  titulo: string;
  desc?: string;
  materia?: string;
  fecha?: string;
  grupo_ids?: number[];
}

interface ExamenIn {
  titulo: string;
  materia: string;
  tiempo: number;
  preguntas: any[];
  notamin: number;
  intentos: number;
  barajar: boolean;
  grupo_ids: number[];
}

interface GenerarExamenIn {
  tema: string;
  fuente?: string;
  numero_preguntas: number;
  tipo: string;
  materia: string;
  grado: string;
}

interface PreguntaIA {
  tipo: string;
  enunciado: string;
  opciones?: string[];
  respuesta_correcta: string;
  justificacion?: string;
}

interface ExamenGenerado {
  titulo: string;
  materia: string;
  tiempo_minutos: number;
  nota_minima: number;
  intentos: number;
  preguntas: PreguntaIA[];
}

interface AcomodarExamenIn {
  examen_id: string;
  tiempo_extra: boolean;
  reducir_opciones: boolean;
  fuente_dislexia: boolean;
  leer_en_voz_alta: boolean;
}

interface ExamenAcomodado {
  examen_id: string;
  tiempo_minutos: number;
  preguntas: PreguntaIA[];
  acomodaciones_aplicadas: string[];
}

function apiHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const email = _emailSesion();
  if (email) h["X-User-Email"] = email;
  // La sesión se autentica con la cookie HttpOnly `cherrybomb_session`
  // (credentials: "include"). El token NO se guarda en localStorage (P1) ni se
  // expone en window, así que no se manda cabecera Authorization.
  return h;
}

/** Extrae el detalle de una respuesta de error del backend. */
async function _detalleError(r: Response): Promise<string> {
  try {
    const txt = await r.text();
    if (!txt) return "";
    try {
      const data = JSON.parse(txt);
      if (data && typeof data.detail === "string") return data.detail;
      if (data && Array.isArray(data.detail) && data.detail[0] && typeof data.detail[0].msg === "string") {
        return data.detail[0].msg;
      }
    } catch (e) {
      /* respuesta no-JSON (p.ej. HTML del SPA fallback) */
    }
    return txt.slice(0, 120);
  } catch (e) {
    return "";
  }
}

/** Tiempo máximo de espera de una llamada al backend (ms). */
const TIMEOUT_API_MS = 15000;

/**
 * fetch con timeout: si el backend está apagado o bloqueado (p.ej. por el
 * permiso de "acceso a la red local"), la petición no queda colgada para
 * siempre.
 */
function _fetchConTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_API_MS) : null;
  return fetch(url, { ...init, signal: ctrl ? ctrl.signal : init.signal }).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function apiFetch<T>(path: string, body?: any): Promise<T> {
  const call = () =>
    _fetchConTimeout(getApiBase() + path, {
      method: body ? "POST" : "GET",
      headers: apiHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    }).then(async (r) => {
      if (!r.ok) {
        const detalle = await _detalleError(r);
        throw new Error("API " + r.status + (detalle ? ": " + detalle : ""));
      }
      return r.json() as Promise<T>;
    });
  return call().catch(async (e) => {
    // P2: sin red (TypeError) → encola para reintentar al volver online
    if (e instanceof TypeError || (e as any)?.name === "AbortError") {
      try {
        const mod: any = await import("./offline-sync.js");
        mod.enqueue?.({ path, body: body ?? null });
      } catch (_ignored) { /* noop */ }
      return { ok: false, queued: true } as unknown as T;
    }
    throw e;
  });
}

export function apiGrupos(): Promise<Grupo[]> {
  return apiFetch<Grupo[]>("/api/matricula/grupos").catch(() => []);
}

export function apiGruposPublicos(): Promise<Grupo[]> {
  return fetch(getApiBase() + "/api/matricula/grupos-publicos", { credentials: "include" }).then((r) => (r.ok ? (r.json() as Promise<Grupo[]>) : [])).catch(() => []);
}

export function apiMiGrupo(): Promise<MiGrupo> {
  return apiFetch<MiGrupo>("/api/matricula/mi-grupo").catch(() => ({ grupo: null }));
}

export function apiGuardarTarea(t: TareaIn): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/items/tareas", {
    titulo: t.titulo,
    descripcion: t.desc || "",
    materia: t.materia || "",
    fecha: t.fecha || "",
    grupo_ids: Array.isArray(t.grupo_ids) ? t.grupo_ids : [],
  }).catch(() => ({ ok: false }));
}

export function apiGuardarExamen(e: ExamenIn): Promise<{ ok: boolean; queued?: boolean }> {
  // NO se silencia el error: el caller necesita saber si se sincronizó con el
  // backend o si falló, para informar al usuario sin mentir.
  return apiFetch<{ ok: boolean; queued?: boolean }>("/api/items/examenes", {
    titulo: e.titulo,
    materia: e.materia || "",
    tiempo: e.tiempo,
    preguntas: e.preguntas || [],
    notamin: e.notamin,
    intentos: e.intentos,
    barajar: !!e.barajar,
    grupo_ids: Array.isArray(e.grupo_ids) ? e.grupo_ids : [],
  });
}

let _gruposCache: Grupo[] | null = null;

export function renderGrupoCheckboxes(containerId: string, preselected?: number[]): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (container.dataset.rendered === "1") return;
  if (!_gruposCache) {
    apiGrupos().then((gs) => {
      // Fallback local (INCOA) si no hay backend/grupos creados: siempre hay checkboxes para no bloquear crear exámenes
      _gruposCache = gs && gs.length ? gs : [
        { id: 1, anio: "1", seccion: "B", especialidad: "general", ciclo_escolar: "" },
        { id: 2, anio: "1", seccion: "C", especialidad: "software", ciclo_escolar: "" },
        { id: 3, anio: "1", seccion: "C", especialidad: "contaduria", ciclo_escolar: "" },
      ];
      renderGrupoCheckboxes(containerId, preselected);
    });
    return;
  }
  container.innerHTML = _gruposCache
    .map((g) => {
      const checked = preselected && preselected.indexOf(g.id) !== -1 ? " checked" : "";
      const lbl = (g.anio || "") + "° " + (g.seccion || "") + " (" + (g.ciclo_escolar || "") + ")";
      return (
        '<label style="display:flex;align-items:center;gap:.3rem;cursor:pointer;"><input type="checkbox" name="grupo-chk" value="' +
        g.id +
        '"' +
        checked +
        "> " +
        escapeHtml(lbl) +
        "</label>"
      );
    })
    .join("");
  container.dataset.rendered = "1";
}

export function gruposSeleccionados(): number[] {
  const boxes = document.querySelectorAll('input[name="grupo-chk"]:checked');
  const ids: number[] = [];
  boxes.forEach((b) => {
    const input = b as HTMLInputElement;
    ids.push(parseInt(input.value, 10));
  });
  return ids;
}

export function apiIA(payload: GenerarExamenIn): Promise<ExamenGenerado> {
  return apiFetch<ExamenGenerado>("/api/ia/generar-examen", payload);
}

export function apiAcomodarExamen(payload: AcomodarExamenIn): Promise<ExamenAcomodado> {
  return apiFetch<ExamenAcomodado>("/api/ia/acomodar-examen", payload);
}

/* ===================================================================
   Cuentas y roles — /api/accounts (gestión del panel de usuarios)
   =================================================================== */

export interface CuentaBackend {
  email: string;
  rol: string;
  nombre: string;
  activo: boolean;
  semestre?: string | null;
  creado?: string | null;
}

export interface CuentaCrear {
  email: string;
  nombre: string;
  rol: string;
  /** Opcional: si no viene, la persona la define en su primer ingreso. */
  password?: string | null;
  semestre?: string | null;
}

export interface CuentaActualizar {
  rol?: string | null;
  activo?: boolean | null;
  nombre?: string | null;
  semestre?: string | null;
}

/** fetch + JSON con método libre (apiFetch solo hace GET/POST). */
async function _apiJson<T>(method: string, path: string, body?: any): Promise<T> {
  const r = await _fetchConTimeout(getApiBase() + path, {
    method,
    headers: apiHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (!r.ok) {
    const detalle = await _detalleError(r);
    throw new Error("API " + r.status + (detalle ? ": " + detalle : ""));
  }
  if (r.status === 204) return { ok: true } as unknown as T;
  return (await r.json()) as T;
}

export function apiCuentas(): Promise<{ count: number; accounts: CuentaBackend[] }> {
  // El backend devuelve {count, accounts:{email: {...}}} (un mapa); se
  // normaliza a lista para que el caller no tenga que saber la forma.
  // OJO: la CLAVE del mapa es el email. Hay cuentas (p.ej. la semilla admin)
  // cuyo valor NO trae el campo `email` dentro: si se pierde la clave, esas
  // cuentas desaparecen de la lista.
  return _apiJson<{ count?: number; accounts: CuentaBackend[] | Record<string, CuentaBackend> }>(
    "GET",
    "/api/accounts/",
  ).then((r) => {
    const raw: any = r && r.accounts;
    let lista: CuentaBackend[];
    if (Array.isArray(raw)) {
      lista = raw;
    } else if (raw && typeof raw === "object") {
      lista = Object.keys(raw).map((k) => {
        const v = (raw[k] || {}) as CuentaBackend;
        // Se conserva el email de la clave si el valor no lo trae.
        return v.email ? v : ({ ...v, email: k } as CuentaBackend);
      });
    } else {
      lista = [];
    }
    return { count: typeof r?.count === "number" ? r.count : lista.length, accounts: lista };
  });
}

export function apiCrearCuenta(cuenta: CuentaCrear): Promise<{ ok: boolean; account: CuentaBackend }> {
  return _apiJson<{ ok: boolean; account: CuentaBackend }>("POST", "/api/accounts/", cuenta);
}

export function apiActualizarCuenta(
  email: string,
  cambios: CuentaActualizar,
): Promise<{ ok: boolean; account: CuentaBackend }> {
  return _apiJson<{ ok: boolean; account: CuentaBackend }>(
    "PUT",
    "/api/accounts/" + encodeURIComponent(email),
    cambios,
  );
}

export function apiBorrarCuenta(email: string): Promise<{ ok: boolean }> {
  return _apiJson<{ ok: boolean }>("DELETE", "/api/accounts/" + encodeURIComponent(email));
}

/* ===================================================================
   Colegio Protegido — reportes de incidentes de seguridad escolar.
   =================================================================== */

export interface Incidente {
  id: string;
  tipo: string;
  desc: string;
  urgente: boolean;
  autor: string;
  autor_rol?: string;
  estado: "pendiente" | "resuelto";
  creado: number;
  resuelto?: number | null;
  resuelto_por?: string;
}

export function apiIncidentes(): Promise<{
  ok: boolean;
  count: number;
  incidentes: Incidente[];
  gestion: boolean;
}> {
  return _apiJson("GET", "/api/protegido/incidentes");
}

export function apiReportarIncidente(
  tipo: string,
  desc: string,
  urgente = false,
): Promise<{ ok: boolean; id: string; incidente?: Incidente }> {
  return _apiJson("POST", "/api/protegido/incidentes", { tipo, desc, urgente });
}

export function apiBorrarIncidente(id: string): Promise<{ ok: boolean }> {
  return _apiJson("DELETE", "/api/protegido/incidentes/" + encodeURIComponent(id));
}

export function apiResolverIncidente(id: string): Promise<{ ok: boolean; incidente?: Incidente }> {
  return _apiJson("POST", "/api/protegido/incidentes/" + encodeURIComponent(id) + "/resolver");
}

