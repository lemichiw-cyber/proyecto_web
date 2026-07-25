/* ===================================================================
   data.js — Capa de abstracción de datos: Supabase + fallback localStorage
   =================================================================== */
(function () {
  'use strict';

  function sbAvailable() {
    return !!(window.sb && window.sbReady && window.sbReady());
  }

  /* ---------- Helpers genéricos ---------- */
  var TABLE_MAP = {
    aulas: 'aulas',
    aula_inscripciones: 'aula_inscripciones',
    aula_tareas: 'aula_tareas',
    aula_entregas: 'aula_entregas',
    aula_calificaciones: 'aula_calificaciones',
    estudiantes: 'estudiantes',
    planificaciones: 'planificaciones',
    actividades: 'actividades',
    mat_solicitudes: 'mat_solicitudes'
  };

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

  /* ---- Load: intenta Supabase, fallback a localStorage ---- */
  DB.load = function (entity) {
    var table = TABLE_MAP[entity];
    var lsKey = localStorageKey[entity];
    if (sbAvailable()) {
      return window.sb.from(table).select('*').then(function (res) {
        if (res.error) { console.warn('DB.load(' + entity + ') error:', res.error); return DB._lsLoad(lsKey); }
        var data = res.data || [];
        localStorage.setItem(lsKey, JSON.stringify(data));
        return data;
      }).catch(function () { return DB._lsLoad(lsKey); });
    }
    return Promise.resolve(DB._lsLoad(lsKey));
  };

  DB._lsLoad = function (key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch (e) { return []; }
  };

  /* ---- Save: escribe a Supabase + localStorage ---- */
  DB.save = function (entity, items) {
    var lsKey = localStorageKey[entity];
    localStorage.setItem(lsKey, JSON.stringify(items));
    // No subimos arrays completos a Supabase — se usa add/update/remove
    return Promise.resolve();
  };

  /* ---- Add: inserta un registro ---- */
  DB.add = function (entity, item) {
    var table = TABLE_MAP[entity];
    var lsKey = localStorageKey[entity];
    if (sbAvailable()) {
      return window.sb.from(table).insert(item).select().then(function (res) {
        if (res.error) { console.warn('DB.add(' + entity + ') error:', res.error); return DB._lsAdd(lsKey, item); }
        var inserted = res.data[0];
        var items = DB._lsLoad(lsKey);
        items.push(inserted);
        localStorage.setItem(lsKey, JSON.stringify(items));
        return inserted;
      }).catch(function () { return DB._lsAdd(lsKey, item); });
    }
    return Promise.resolve(DB._lsAdd(lsKey, item));
  };

  DB._lsAdd = function (key, item) {
    if (!item.id) item.id = Date.now();
    var items = DB._lsLoad(key);
    items.push(item);
    localStorage.setItem(key, JSON.stringify(items));
    return item;
  };

  /* ---- Update: actualiza por id ---- */
  DB.update = function (entity, id, updates) {
    var table = TABLE_MAP[entity];
    var lsKey = localStorageKey[entity];
    if (sbAvailable()) {
      return window.sb.from(table).update(updates).eq('id', id).select().then(function (res) {
        if (res.error) { console.warn('DB.update(' + entity + ') error:', res.error); return DB._lsUpdate(lsKey, id, updates); }
        var updated = res.data[0];
        var items = DB._lsLoad(lsKey);
        for (var i = 0; i < items.length; i++) {
          if (items[i].id === id) { Object.assign(items[i], updated); break; }
        }
        localStorage.setItem(lsKey, JSON.stringify(items));
        return updated;
      }).catch(function () { return DB._lsUpdate(lsKey, id, updates); });
    }
    return Promise.resolve(DB._lsUpdate(lsKey, id, updates));
  };

  DB._lsUpdate = function (key, id, updates) {
    var items = DB._lsLoad(key);
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { Object.assign(items[i], updates); localStorage.setItem(key, JSON.stringify(items)); return items[i]; }
    }
    return null;
  };

  /* ---- Remove: elimina por id ---- */
  DB.remove = function (entity, id) {
    var table = TABLE_MAP[entity];
    var lsKey = localStorageKey[entity];
    if (sbAvailable()) {
      return window.sb.from(table).delete().eq('id', id).then(function (res) {
        if (res.error) { console.warn('DB.remove(' + entity + ') error:', res.error); }
        var items = DB._lsLoad(lsKey).filter(function (i) { return i.id !== id; });
        localStorage.setItem(lsKey, JSON.stringify(items));
        return true;
      }).catch(function () {
        var items = DB._lsLoad(lsKey).filter(function (i) { return i.id !== id; });
        localStorage.setItem(lsKey, JSON.stringify(items));
        return true;
      });
    }
    var items = DB._lsLoad(lsKey).filter(function (i) { return i.id !== id; });
    localStorage.setItem(lsKey, JSON.stringify(items));
    return Promise.resolve(true);
  };

  /* ---- Query: select con filtros (solo Supabase) ---- */
  DB.query = function (entity, filters) {
    if (!sbAvailable()) return Promise.resolve(DB._lsLoad(localStorageKey[entity]));
    var table = TABLE_MAP[entity];
    var q = window.sb.from(table).select('*');
    if (filters) {
      Object.keys(filters).forEach(function (k) { q = q.eq(k, filters[k]); });
    }
    return q.then(function (res) {
      if (res.error) { console.warn('DB.query(' + entity + ') error:', res.error); return DB._lsLoad(localStorageKey[entity]); }
      return res.data || [];
    }).catch(function () { return DB._lsLoad(localStorageKey[entity]); });
  };

  /* ---- Sync all: carga todo desde Supabase al inicio ---- */
  DB.syncAll = function () {
    if (!sbAvailable()) return Promise.resolve();
    var entities = Object.keys(TABLE_MAP);
    return Promise.all(entities.map(function (e) { return DB.load(e); })).then(function () {
      console.log('DB.syncAll: datos sincronizados desde Supabase');
    });
  };

  window.DB = DB;
})();
