import './styles.css';
import './data.js';
import './notifications.js';
import './app.js';
import './sakura-player/sakura-player.js';

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
