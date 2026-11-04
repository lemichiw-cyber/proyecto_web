import { escapeHtml } from "./utils/escape.js";

const API_BASE = (typeof VITE_API_BASE !== "undefined" ? VITE_API_BASE : "").replace(/\/+$/, "");
const API_EMAIL =
  (typeof VITE_API_EMAIL !== "undefined" ? VITE_API_EMAIL : "") ||
  localStorage.getItem("cherrybombSessionEmail") ||
  "";

interface Grupo {
  id: number;
  anio?: string;
  seccion?: string;
  ciclo_escolar?: string;
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
  tiempo: number;
  preguntas: any[];
  notamin: number;
  intentos: number;
  barajar: boolean;
  grupo_ids: number[];
}

function apiHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_EMAIL) h["X-User-Email"] = API_EMAIL;
  return h;
}

export function apiFetch<T>(path: string, body?: any): Promise<T> {
  return fetch(API_BASE + path, {
    method: body ? "POST" : "GET",
    headers: apiHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  }).then((r) => {
    if (!r.ok) throw new Error("API " + r.status);
    return r.json() as Promise<T>;
  });
}

export function apiGrupos(): Promise<Grupo[]> {
  return apiFetch<Grupo[]>("/api/matricula/grupos").catch(() => []);
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

export function apiGuardarExamen(e: ExamenIn): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/items/examenes", {
    titulo: e.titulo,
    tiempo: e.tiempo,
    preguntas: e.preguntas || [],
    notamin: e.notamin,
    intentos: e.intentos,
    barajar: !!e.barajar,
    grupo_ids: Array.isArray(e.grupo_ids) ? e.grupo_ids : [],
  }).catch(() => ({ ok: false }));
}

let _gruposCache: Grupo[] | null = null;

export function renderGrupoCheckboxes(containerId: string, preselected?: number[]): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (container.dataset.rendered === "1") return;
  if (!_gruposCache) {
    apiGrupos().then((gs) => {
      _gruposCache = gs;
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
