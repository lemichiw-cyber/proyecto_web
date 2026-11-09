// P3: Sentry frontend opcional — solo si el host carga @sentry/browser vía CDN global (window.Sentry).
// Evita dependencia de npm y no bloquea el bundle (no hay import dinámico que Rollup deba resolver).
try {
  const _env: any = (import.meta as any).env || {};
  const _dsn = typeof _env.VITE_SENTRY_DSN === "string" ? _env.VITE_SENTRY_DSN : "";
  const _sentry = (window as any).Sentry;
  if (typeof _dsn === "string" && _dsn && _sentry && typeof _sentry.init === "function") {
    try { _sentry.init({ dsn: _dsn }); } catch (e) { /* noop */ }
  }
} catch (e) { /* noop */ }

import './styles.css';
import './data.js';
import './data/eventos.js';
import './notifications.js';
import './global-delegator.js';
import './offline-sync.js';
import './app.js';

/* ------------------------------------------------------------------
   CSP Report-Only: escuchar violations y loggearlas a consola.
   Útil durante desarrollo/staging antes de pasar a enforce.
   ------------------------------------------------------------------ */
if (typeof document !== 'undefined') {
  document.addEventListener('securitypolicyviolation', (e) => {
    console.warn('[CSP Violation]', {
      directive: e.violatedDirective,
      blocked: e.blockedURI,
      source: e.sourceFile,
      line: e.lineNumber,
      col: e.columnNumber,
      disposition: e.disposition, // 'report' en Report-Only
    });
  });
}

/* ------------------------------------------------------------------
   PWA: con registerType "autoUpdate" el service worker nuevo se
   activa solo, pero la pestaña abierta sigue corriendo el bundle
   viejo hasta que alguien recargue. Si esta pestaña ya estaba
   controlada por un SW, escuchamos "controllerchange" y recargamos
   para servir la versión nueva (así nadie queda con una build
   vieja de por vida — el reproductor o el login podían "no
   funcionar" por eso). En la primera visita no hay controller, así
   que no se dispara ninguna recarga.
   ------------------------------------------------------------------ */
if ('serviceWorker' in navigator) {
  if (navigator.serviceWorker.controller) {
    let refrescando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refrescando) return;
      refrescando = true;
      window.location.reload();
    });
  }

  const pedirActualizacion = (): void => {
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (reg) return reg.update();
        return undefined;
      })
      .catch(() => { /* sin red o sin registro: se reintenta después */ });
  };

  // Comprobar versión nueva al despertar la pestaña y cada hora.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pedirActualizacion();
  });
  window.setInterval(pedirActualizacion, 60 * 60 * 1000);
}

/* ------------------------------------------------------------------
   Estado de conexión visible en todo el sitio.
   La app funciona con datos locales; avisar que YouTube Music no está
   disponible evita que el usuario piense que la app se rompió.
   ------------------------------------------------------------------ */
function actualizarEstadoConexion(): void {
  const banner = document.getElementById('app-offline-banner');
  if (!banner) return;
  banner.classList.toggle('hidden', navigator.onLine);
}
window.addEventListener('online', actualizarEstadoConexion);
window.addEventListener('offline', actualizarEstadoConexion);
actualizarEstadoConexion();

/* ------------------------------------------------------------------
   PWA: botón de instalación. El navegador dispara beforeinstallprompt
   solo cuando la app cumple los requisitos y aún no está instalada.
   En iOS no existe el evento: el botón queda oculto y se usa
   Compartir → Añadir a pantalla de inicio.
   ------------------------------------------------------------------ */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let installPrompt: InstallPromptEvent | null = null;
const installBtn = document.getElementById('btn-install-app') as HTMLButtonElement | null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
  installBtn?.classList.remove('hidden');
});

installBtn?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installBtn.disabled = true;
  try {
    await installPrompt.prompt();
    await installPrompt.userChoice;
  } catch {
    /* el usuario canceló o el navegador invalidó el prompt */
  } finally {
    installPrompt = null;
    installBtn.disabled = false;
    installBtn.classList.add('hidden');
  }
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installBtn?.classList.add('hidden');
});

// P3: drenar cola offline al volver online
try {
  window.addEventListener('online', async () => {
    try {
      const m: any = await import('./offline-sync.js');
      const apiBase = (import.meta as any).env?.VITE_API_BASE || "";
      await m.flush?.(async (a: any) => {
        const r = await fetch(apiBase + (a.path || ""), { method: a.body ? "POST" : "GET", credentials: "include", headers: { "Content-Type": "application/json" }, body: a.body ? JSON.stringify(a.body) : undefined });
        if (!r.ok) throw new Error("sync " + r.status);
      });
    } catch (e) { /* noop */ }
  });
} catch (e) { /* noop */ }
// P4-A: Accesibilidad — escala de letra (A-/A+), alto contraste, Esc y resize
try {
  const scales = [0.9, 1, 1.15];
  let idx = Math.max(0, Math.min(scales.length - 1, parseInt(localStorage.getItem("cb-scale") || "1", 10)));
  const applyScale = () => {
    const v = scales[idx];
    document.documentElement.style.fontSize = (16 * v) + "px";
    try { localStorage.setItem("cb-scale", String(idx)); } catch (e) { /* noop */ }
  };
  applyScale();
  document.getElementById("btn-font-inc")?.addEventListener("click", () => { idx = Math.min(scales.length - 1, idx + 1); applyScale(); });
  document.getElementById("btn-font-dec")?.addEventListener("click", () => { idx = Math.max(0, idx - 1); applyScale(); });
  document.getElementById("btn-contrast")?.addEventListener("click", () => {
    const on = document.body.classList.toggle("alto-contraste");
    try { localStorage.setItem("cb-contrast", on ? "1" : "0"); } catch (e) { /* noop */ }
  });
  try { if (localStorage.getItem("cb-contrast") === "1") document.body.classList.add("alto-contraste"); } catch (e) { /* noop */ }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      (window as any).closeSidebar?.();
      document.querySelectorAll(".modal-overlay.open").forEach((m) => { (m as HTMLElement).classList.remove("open"); });
      document.body.classList.remove("no-scroll");
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024 && document.getElementById("sidebar")?.classList.contains("open")) {
      (window as any).closeSidebar?.();
    }
  });
} catch (e) { /* noop */ }
