import './styles.css';
import './data.js';
import './data/eventos.js';
import './notifications.js';
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
