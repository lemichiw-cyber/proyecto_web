/* ===================================================================
   protegido-sync.js — lógica de "Colegio Protegido" (local-first).

   La sección antes guardaba los reportes SOLO en el dispositivo
   (localStorage) y su feature flag estaba apagado: sin backend un
   reporte no llegaba a nadie. Ahora hay backend real (FastAPI) y esta
   módulo maneja la mezcla de las dos fuentes:

     * servidor  → la verdad (lo ve el personal docente),
     * dispositivo → espejo local (la app sigue funcionando sin red).

   Reglas (las mismas que el backend, `backend/api/protegido.py`):

     * reportar  → cualquier usuario autenticado,
     * ver       → el autor ve los suyos; el personal docente ve TODOS,
     * borrar    → el autor o el personal docente,
     * resolver  → sólo el personal docente.

   Este archivo NO habla con la red: son funciones puras para que la
   sincronización se pueda probar sin backend ni navegador.
   =================================================================== */

/** Rangos que atienden los reportes (idéntico a ROLES_GESTION del backend). */
export const ROLES_GESTION = ['admin', 'director', 'subdirector', 'coordinador', 'docente'];

/** Longitud máxima de la descripción (la impone el backend). */
export const MAX_DESC = 2000;

/** Longitud máxima del tipo de incidente. */
export const MAX_TIPO = 80;

/** ¿Este rango atiende los reportes? */
export function esGestor(rol) {
  return ROLES_GESTION.indexOf(String(rol || '').trim().toLowerCase()) !== -1;
}

/**
 * Normaliza un incidente que viene del backend.
 * Devuelve null si no es utilizable (sin tipo o sin id).
 */
export function normalizarRemoto(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tipo = String(raw.tipo || '').trim();
  const id = String(raw.id || '').trim();
  if (!tipo || !id) return null;
  return {
    id: id,
    tipo: tipo.slice(0, MAX_TIPO),
    desc: String(raw.desc || '').slice(0, MAX_DESC),
    urgente: raw.urgente === true,
    autor: String(raw.autor || '').trim().toLowerCase(),
    autorRol: String(raw.autor_rol || '').trim(),
    estado: raw.estado === 'resuelto' ? 'resuelto' : 'pendiente',
    creado: Number(raw.creado) || 0,
    resuelto: raw.resuelto == null ? null : Number(raw.resuelto),
    resueltoPor: String(raw.resuelto_por || '').trim(),
    local: false,
    pendiente: false,
    borrar: false,
    remoto: id,
  };
}

/**
 * Normaliza un incidente guardado en el dispositivo.
 * `pendiente` = todavía no llegó al servidor; `borrar` = marcado para
 * borrarse en el servidor en la próxima sincronización.
 */
export function normalizarLocal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tipo = String(raw.tipo || '').trim();
  if (!tipo) return null;
  const remoto = raw.remoto ? String(raw.remoto).trim() : '';
  return {
    id: String(raw.id || remoto || ''),
    tipo: tipo.slice(0, MAX_TIPO),
    desc: String(raw.desc || '').slice(0, MAX_DESC),
    urgente: raw.urgente === true,
    autor: String(raw.autor || '').trim().toLowerCase(),
    autorRol: String(raw.autorRol || raw.autor_rol || '').trim(),
    estado: raw.estado === 'resuelto' ? 'resuelto' : 'pendiente',
    creado: Number(raw.creado) || Date.now(),
    resuelto: raw.resuelto == null ? null : Number(raw.resuelto),
    resueltoPor: String(raw.resueltoPor || raw.resuelto_por || '').trim(),
    local: true,
    pendiente: raw.pendiente === undefined ? !remoto : raw.pendiente === true,
    borrar: raw.borrar === true,
    remoto: remoto,
  };
}

/**
 * Mezcla la lista local con la del servidor.
 *
 * - El servidor manda: si un incidente ya está arriba, se usa su versión.
 * - Los locales que aún no se subieron (`pendiente`) se muestran igual:
 *   el estudiante no tiene que esperar a que haya red.
 * - Los locales marcados para borrar no se muestran.
 * - Un local que ya estaba en el servidor y ya no aparece (lo borró otro)
 *   se descarta: el servidor manda.
 */
export function fusionar(locales, remotos) {
  const rem = (Array.isArray(remotos) ? remotos : []).map(normalizarRemoto).filter(Boolean);
  const loc = (Array.isArray(locales) ? locales : []).map(normalizarLocal).filter(Boolean);

  const salida = rem.slice();
  loc.forEach(function (l) {
    if (l.borrar) return;                      // pendiente de borrar: no se muestra
    if (l.remoto) return;                      // ya está en el servidor (o lo borraron)
    if (!l.pendiente) return;                  // sincronizado y ausente del servidor
    salida.push(l);
  });
  salida.sort(function (a, b) { return (b.creado || 0) - (a.creado || 0); });
  return salida;
}

/** Incidentes locales que hay que subir al servidor. */
export function pendientesDeSubir(locales) {
  return (Array.isArray(locales) ? locales : [])
    .map(normalizarLocal)
    .filter(Boolean)
    .filter(function (i) { return i.pendiente && !i.borrar; });
}

/** Incidentes locales que hay que borrar en el servidor. */
export function pendientesDeBorrar(locales) {
  return (Array.isArray(locales) ? locales : [])
    .map(normalizarLocal)
    .filter(Boolean)
    .filter(function (i) { return i.borrar && !!i.remoto; });
}

/**
 * ¿Este usuario puede borrar este incidente?
 * El autor sí; el personal docente también.
 */
export function puedeBorrar(incidente, usuario) {
  if (!incidente || !usuario) return false;
  if (esGestor(usuario.rol)) return true;
  return String(incidente.autor || '').toLowerCase() === String(usuario.email || '').toLowerCase();
}

/** ¿Este usuario puede marcar el incidente como atendido? */
export function puedeResolver(incidente, usuario) {
  if (!incidente || !usuario) return false;
  return esGestor(usuario.rol);
}

/** Fecha corta en español (o "hace un momento" si es muy reciente). */
export function formatearFecha(ts) {
  const ms = Number(ts) || 0;
  if (!ms) return '';
  const fecha = new Date(ms);
  if (isNaN(fecha.getTime())) return '';
  const diff = Date.now() - ms;
  if (diff < 60 * 1000) return 'hace un momento';
  if (diff < 60 * 60 * 1000) return 'hace ' + Math.floor(diff / 60000) + ' min';
  if (diff < 24 * 60 * 60 * 1000) return 'hace ' + Math.floor(diff / 3600000) + ' h';
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Etiqueta legible del estado. */
export function etiquetaEstado(estado) {
  return estado === 'resuelto' ? 'Atendido' : 'Pendiente';
}
