/* ===================================================================
   eventos.js — Modelo único de eventos (localStorage)
   Modelo: {id, titulo, tipo, fecha, materia, estado, prioridad, recordatorio}
   Clave: 'eventos'. Legados migrados: actividades, agendaItems,
   calEventos, bachillerato_tareas (no se borran).
   =================================================================== */
(function () {
  'use strict';

  const EVENTOS_KEY = 'eventos';
  const LEGACY_KEYS = {
    actividad: 'actividades',
    agenda: 'agendaItems',
    calendario: 'calEventos',
    tarea: 'bachillerato_tareas',
  };

  function _load() {
    try { return JSON.parse(localStorage.getItem(EVENTOS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function _save(items) { localStorage.setItem(EVENTOS_KEY, JSON.stringify(items)); }
  function _id() { return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function hashLegacy(s){var h=0;for(var i=0;i<s.length;i++){h=((h<<5)-h+s.charCodeAt(i))|0;}return Math.abs(h).toString(36);}

  function listar(tipo) {
    const items = _load();
    return tipo ? items.filter(function (i) { return i.tipo === tipo; }) : items;
  }
  function agregar(ev) {
    const items = _load();
    ev.id = ev.id || _id();
    ev.tipo = ev.tipo || 'actividad';
    ev.fecha = ev.fecha || '';
    ev.materia = ev.materia || '';
    ev.estado = ev.estado || 'pendiente';
    ev.prioridad = ev.prioridad || 'media';
    ev.recordatorio = ev.recordatorio === undefined ? false : ev.recordatorio;
    items.push(ev);
    _save(items);
    return ev;
  }
  function actualizar(id, upd) {
    const items = _load();
    var found = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        Object.assign(items[i], upd);
        found = items[i];
        break;
      }
    }
    if (found) _save(items);
    return found;
  }
  function borrar(id) {
    var items = _load().filter(function (i) { return i.id !== id; });
    _save(items);
    return true;
  }

  function migrarLegacy() {
    var existentes = _load();
    var idsExist = {};
    existentes.forEach(function (i) { idsExist[i.id] = true; });
    var changed = false;
    Object.keys(LEGACY_KEYS).forEach(function (tipo) {
      var key = LEGACY_KEYS[tipo];
      var legacy = [];
      try { legacy = JSON.parse(localStorage.getItem(key) || '[]'); }
      catch (e) { legacy = []; }
      if (!Array.isArray(legacy)) return;
      legacy.forEach(function (item) {
        var ev = {
          id: 'e' + hashLegacy(item.titulo + '|' + tipo + '|' + (item.fecha || item.hora || '')),
          titulo: item.titulo || '',
          tipo: tipo,
          fecha: item.fecha || item.hora || '',
          materia: item.materia || '',
          estado: item.estado || 'pendiente',
          prioridad: item.prioridad || 'media',
          recordatorio: item.recordatorio === undefined ? false : item.recordatorio
        };
        if (item.desc) ev.desc = item.desc;
        if (item.grupo) ev.grupo = item.grupo;
        if (!idsExist[ev.id]) { existentes.push(ev); idsExist[ev.id] = true; changed = true; }
      });
    });
    if (changed) _save(existentes);
    return existentes;
  }

  window.eventosAPI = { listar: listar, agregar: agregar, actualizar: actualizar, borrar: borrar, migrarLegacy: migrarLegacy };
})();
