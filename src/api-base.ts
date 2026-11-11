/* ===================================================================
   api-base.ts — URL base del backend, resoluble en tiempo de ejecución.

   Antes la URL venía SOLO de la variable de build (VITE_API_BASE) y
   quedaba congelada al importar el módulo. Eso impedía que una PWA
   servida desde GitHub Pages (`https://...github.io/proyecto_web/`)
   apuntara a otro backend sin volver a compilar y republicar.

   Ahora la prioridad es:
     1) localStorage.cherrybombApiBase  → override manual (Ajustes → Backend)
     2) VITE_API_BASE                   → valor por defecto del build
     3) ""                              → mismo origen (rutas /api/... relativas)

   La clave `cherrybombApiBase` está en EXCLUDED_KEYS del módulo de
   respaldos: no se copia al JSON de exportación (es configuración del
   dispositivo, no datos del usuario).
   =================================================================== */

export const LS_API_BASE = "cherrybombApiBase";

/** Quita barras finales y espacios. */
function _normaliza(url: string | null | undefined): string {
  return String(url || "").trim().replace(/\/+$/, "");
}

/** URL base configurada en el build (puede estar vacía → mismo origen). */
export function apiBaseBuild(): string {
  // OJO 1: Vite solo reemplaza la expresión LITERAL `import.meta.env` por el
  // objeto de variables del build. Con optional chaining (`import.meta?.env`)
  // el reemplazo no ocurre y el valor se pierde en silencio.
  // OJO 2: Vite tampoco reemplaza un identificador global suelto
  // (`typeof VITE_API_BASE !== "undefined"`), así que tampoco sirve.
  try {
    const v = import.meta.env.VITE_API_BASE;
    if (typeof v === "string" && v.trim()) return _normaliza(v);
  } catch (e) {
    /* import.meta.env no disponible */
  }
  // Fallback: compilaciones que sí definan la constante global.
  try {
    if (typeof VITE_API_BASE !== "undefined" && VITE_API_BASE) return _normaliza(VITE_API_BASE);
  } catch (e) {
    /* noop */
  }
  return "";
}

/** URL base efectiva: override en tiempo de ejecución > valor del build. */
export function getApiBase(): string {
  try {
    const saved = localStorage.getItem(LS_API_BASE);
    if (saved && saved.trim()) return _normaliza(saved);
  } catch (e) {
    /* localStorage no disponible (modo privado, SSR, tests) */
  }
  return apiBaseBuild();
}

/** Override manual guardado ("" si no hay). */
export function apiBaseOverride(): string {
  try {
    const saved = localStorage.getItem(LS_API_BASE);
    return saved ? _normaliza(saved) : "";
  } catch (e) {
    return "";
  }
}

/**
 * Guarda el override manual. Con url vacío/vacío se borra el override y
 * vuelve a mandar el valor del build.
 */
export function setApiBase(url: string | null | undefined): void {
  try {
    const clean = _normaliza(url);
    if (clean) localStorage.setItem(LS_API_BASE, clean);
    else localStorage.removeItem(LS_API_BASE);
  } catch (e) {
    /* localStorage no disponible */
  }
}

/**
 * Comprueba que el backend responda. Devuelve { ok, status, detalle }.
 * Nunca lanza: la UI solo necesita saber si reached.
 */
export async function testApiBase(
  base?: string,
  timeoutMs = 4000,
): Promise<{ ok: boolean; status: number; detalle: string; url: string }> {
  const url = (_normaliza(base === undefined ? getApiBase() : base) || "") + "/api/health";
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(url, {
      method: "GET",
      credentials: "include",
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    let detalle = "";
    try {
      detalle = (await r.text()).slice(0, 160);
    } catch (e) {
      /* cuerpo no legible */
    }
    return { ok: r.ok, status: r.status, detalle, url };
  } catch (e: any) {
    if (timer) clearTimeout(timer);
    const nombre = e && e.name === "AbortError" ? "tiempo de espera agotado" : String((e && e.message) || e);
    return { ok: false, status: 0, detalle: nombre, url };
  }
}
