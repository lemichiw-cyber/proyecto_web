/* ===================================================================
   notifications.js — Notificaciones push locales (Notification API)
   Notificaciones de "tarea asignada" y "recordatorio 24h antes"
   =================================================================== */
(function () {
  'use strict';

  var PERMISSION_KEY = 'incoaNotifPermission';
  var REMINDER_KEY = 'incoaNotifReminders'; // trackea qué tareas ya se recordaron
  var CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutos
  var timerId = null;

  /* ---- Helpers ---- */
  function $$(id) { return document.getElementById(id); }

  function isSupported() {
    return 'Notification' in window;
  }

  function getPermission() {
    if (!isSupported()) return 'denied';
    return Notification.permission;
  }

  /* ---- Pedir permiso (no invasivo) ---- */
  function requestPermission() {
    if (!isSupported()) return;
    if (Notification.permission !== 'default') return; // ya respondió

    // Pedir permiso silenciosamente (sin prompt molesto)
    Notification.requestPermission().then(function (perm) {
      localStorage.setItem(PERMISSION_KEY, perm);
      if (perm === 'granted') {
        console.log('[Notificaciones] Permiso concedido');
      }
    });
  }

  /* ---- Enviar notificación ---- */
  function send(title, body, tag) {
    if (!isSupported() || Notification.permission !== 'granted') return;
    var opts = {
      body: body,
      icon: '/proyecto_web/icons/icon-192.png',
      badge: '/proyecto_web/icons/icon-72.png',
      silent: false,
      tag: tag || 'incoa-' + Date.now()
    };
    try {
      // Intentar vía service worker (más confiable en PWAs)
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(function (reg) {
          reg.showNotification(title, opts);
        });
      } else {
        new Notification(title, opts);
      }
    } catch (e) {
      new Notification(title, opts);
    }
  }

  /* ---- Notificación: tarea asignada ---- */
  function notifyNewTask(tarea, aulaNombre) {
    send(
      'Nueva tarea asignada',
      '"' + tarea.titulo + '"' + (aulaNombre ? ' en ' + aulaNombre : '') +
        (tarea.fecha ? ' — vence: ' + tarea.fecha : ''),
      'tarea-' + tarea.id
    );
  }

  /* ---- Obtener el estudiante actual desde ESTUDIANTES_DB ---- */
  function getEstudianteActual() {
    if (!window.usuarioActual) return null;
    var email = window.usuarioActual.email;
    var db = JSON.parse(localStorage.getItem('estudiantes_db') || '[]');
    return db.find(function (e) { return e.email === email; }) || null;
  }

  /* ---- Recordatorios: tareas próximas a vencer ---- */
  function checkUpcomingDeadlines() {
    if (!isSupported() || Notification.permission !== 'granted') return;
    if (!window.usuarioActual) return;

    var tareas = JSON.parse(localStorage.getItem('aula_tareas') || '[]');
    var entregas = JSON.parse(localStorage.getItem('aula_entregas') || '[]');
    var aulas = JSON.parse(localStorage.getItem('aulas') || '[]');
    var inscripciones = JSON.parse(localStorage.getItem('aula_inscripciones') || '[]');
    var reminders = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');
    var hoy = new Date();
    var manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    // Encontrar el estudiante actual
    var est = getEstudianteActual();
    var estId = est ? est.id : null;

    // Si es estudiante, buscar sus tareas pendientes con fecha próxima
    if (estId) {
      var misInscripciones = inscripciones.filter(function (i) {
        return i.estudianteId === estId && i.estado === 'aprobado';
      });
      var misAulaIds = misInscripciones.map(function (i) { return i.aulaId; });

      tareas.forEach(function (t) {
        if (!t.fecha || !t.aulaId) return;
        if (misAulaIds.indexOf(t.aulaId) === -1) return;

        // Verificar si ya entregó
        var yaEntrego = entregas.some(function (e) { return e.tareaIdx === tareas.indexOf(t); });
        if (yaEntrego) return;

        // Verificar si la fecha es mañana
        var fechaTarea = new Date(t.fecha + 'T23:59:59');
        var diffMs = fechaTarea - hoy;
        var diffHoras = diffMs / (1000 * 60 * 60);

        if (diffHoras > 0 && diffHoras <= 24) {
          var reminderKey = 'tarea_' + t.id + '_' + t.fecha;
          if (!reminders[reminderKey]) {
            var aulaObj = aulas.find(function (a) { return a.id === t.aulaId; });
            var aulaLabel = aulaObj ? aulaObj.nombre : '';
            send(
              'La tarea vence mañana',
              '"' + t.titulo + '"' + (aulaLabel ? ' en ' + aulaLabel : '') + ' — fecha límite: ' + t.fecha,
              'reminder-' + t.id
            );
            reminders[reminderKey] = Date.now();
            localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders));
          }
        }
      });
    }

    // Si es docente, notificar sobre entregas pendientes en sus aulas
    if (window.usuarioActual && (window.usuarioActual.rol === 'docente' || window.usuarioActual.rol === 'admin' || window.usuarioActual.rol === 'director')) {
      var misAulas = aulas.filter(function (a) {
        return a.owner_id && window.usuarioActual && a.owner_id === window.usuarioActual.id;
      });
      misAulas.forEach(function (aula) {
        var tareasAula = tareas.filter(function (t) { return t.aulaId === aula.id; });
        tareasAula.forEach(function (t) {
          if (!t.fecha) return;
          var fechaTarea = new Date(t.fecha + 'T23:59:59');
          var diffMs = fechaTarea - hoy;
          var diffHoras = diffMs / (1000 * 60 * 60);
          if (diffHoras > 0 && diffHoras <= 24) {
            var totalInscritos = inscripciones.filter(function (i) { return i.aulaId === aula.id && i.estado === 'aprobado'; }).length;
            var totalEntregas = entregas.filter(function (e) { return e.tareaIdx === tareas.indexOf(t); }).length;
            if (totalEntregas < totalInscritos) {
              var reminderKey = 'docente_tarea_' + t.id + '_' + t.fecha;
              if (!reminders[reminderKey]) {
                send(
                  'Entregas pendientes',
                  '"' + t.titulo + '" en ' + aula.nombre + ' — ' + (totalInscritos - totalEntregas) + ' pendientes, vence mañana',
                  'docente-reminder-' + t.id
                );
                reminders[reminderKey] = Date.now();
                localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders));
              }
            }
          }
        });
      });
    }
  }

  /* ---- Iniciar checker periódico ---- */
  function startDeadlineChecker() {
    if (timerId) return;
    // Chequear inmediatamente al iniciar
    checkUpcomingDeadlines();
    // Y cada 30 minutos
    timerId = setInterval(checkUpcomingDeadlines, CHECK_INTERVAL);
  }

  function stopDeadlineChecker() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  /* ---- Mostrar banner de permiso (no invasivo) ---- */
  function showPermissionBanner() {
    if (!isSupported() || Notification.permission !== 'default') return;
    if (localStorage.getItem(PERMISSION_KEY) === 'dismissed') return;
    if ($$('.notif-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'notif-banner';
    banner.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:9999;background:var(--gray-800);color:#fff;padding:.75rem 1rem;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);display:flex;align-items:center;gap:.75rem;max-width:360px;font-size:.85rem;animation:slideUp .3s ease;';
    banner.innerHTML = '<div style="flex:1;">Recibí notificaciones de tareas y entregas.</div>' +
      '<button id="notif-banner-allow" style="background:var(--primary);color:#fff;border:none;padding:.4rem .8rem;border-radius:8px;cursor:pointer;font-weight:600;white-space:nowrap;">Activar</button>' +
      '<button id="notif-banner-dismiss" style="background:none;color:var(--gray-400);border:none;cursor:pointer;font-size:1.1rem;padding:0 .25rem;" title="No mostrar más">&times;</button>';
    document.body.appendChild(banner);

    $('notif-banner-allow').addEventListener('click', function () {
      requestPermission();
      banner.remove();
    });
    $('notif-banner-dismiss').addEventListener('click', function () {
      localStorage.setItem(PERMISSION_KEY, 'dismissed');
      banner.remove();
    });
  }

  /* ---- API pública ---- */
  window.INCOANotifications = {
    requestPermission: requestPermission,
    send: send,
    notifyNewTask: notifyNewTask,
    checkUpcomingDeadlines: checkUpcomingDeadlines,
    startDeadlineChecker: startDeadlineChecker,
    stopDeadlineChecker: stopDeadlineChecker,
    showPermissionBanner: showPermissionBanner,
    isSupported: isSupported,
    getPermission: getPermission,
    getEstudianteActual: getEstudianteActual
  };
})();
