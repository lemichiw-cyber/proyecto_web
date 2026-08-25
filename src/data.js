/* ===================================================================
   data.js — Capa de abstracción de datos: 100% localStorage
   Interfaz pública: window.DB { load, save, add, update, remove, query, syncAll }
   =================================================================== */
(function () {
  'use strict';

  var localStorageKey = {
    aulas: 'aulas',
    aula_inscripciones: 'aula_inscripciones',
    aula_tareas: 'incoaAulaTareas',
    aula_entregas: 'incoaAulaEntregas',
    aula_calificaciones: 'aula_calificaciones',
    estudiantes: 'estudiantes_db',
    planificaciones: 'planificaciones',
    actividades: 'actividades',
    mat_solicitudes: 'incoaMatSolicitudes'
  };

  var DB = {};

  DB._lsLoad = function (key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch (e) { return []; }
  };

  /* Load */
  DB.load = function (entity) {
    return Promise.resolve(DB._lsLoad(localStorageKey[entity] || entity));
  };

  /* Save (array completo) */
  DB.save = function (entity, items) {
    localStorage.setItem(localStorageKey[entity] || entity, JSON.stringify(items));
    return Promise.resolve();
  };

  /* Add */
  DB.add = function (entity, item) {
    var key = localStorageKey[entity] || entity;
    if (!item.id) item.id = Date.now();
    var items = DB._lsLoad(key);
    items.push(item);
    localStorage.setItem(key, JSON.stringify(items));
    return Promise.resolve(item);
  };

  /* Update por id */
  DB.update = function (entity, id, updates) {
    var key = localStorageKey[entity] || entity;
    var items = DB._lsLoad(key);
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        Object.assign(items[i], updates);
        localStorage.setItem(key, JSON.stringify(items));
        return Promise.resolve(items[i]);
      }
    }
    return Promise.resolve(null);
  };

  /* Remove por id */
  DB.remove = function (entity, id) {
    var key = localStorageKey[entity] || entity;
    var items = DB._lsLoad(key).filter(function (i) { return i.id !== id; });
    localStorage.setItem(key, JSON.stringify(items));
    return Promise.resolve(true);
  };

  /* Query con filtros {campo: valor} */
  DB.query = function (entity, filters) {
    var items = DB._lsLoad(localStorageKey[entity] || entity);
    if (!filters) return Promise.resolve(items);
    var resultado = items.filter(function (item) {
      return Object.keys(filters).every(function (k) {
        return String(item[k]) === String(filters[k]);
      });
    });
    return Promise.resolve(resultado);
  };

  /* Sync all — sin backend remoto no-op (compatibilidad) */
  DB.syncAll = function () {
    return Promise.resolve();
  };

  window.DB = DB;
})();
