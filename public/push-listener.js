/* ===================================================================
   push-listener.js — importado en el Service Worker (workbox importScripts).
   Escucha 'push' y 'notificationclick' para notificaciones con app cerrada.
   =================================================================== */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* ignore */ }
  var title = data.title || 'Cherry-Bomb';
  var options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'cherrybomb',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if (client.url.indexOf(url) !== -1) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
