/* ===================================================================
   aulas-sync.js — lógica de "Aulas Virtuales" (local-first).

   Antes esta sección guardaba TODO en el dispositivo (localStorage) y su
   feature flag estaba apagado: sin backend un aula no llegaba a nadie (el
   docente creaba un aula y el estudiante nunca la veía).

   Ahora hay backend real (FastAPI, `backend/api/aulas.py`) y este módulo
   maneja la mezcla de las dos fuentes:

     * servidor   → la verdad (lo ve el docente y sus estudiantes),
     * dispositivo → espejo local (la app sigue funcionando sin red).

   Reglas (las mismas que el backend y que los permisos del frontend):
     * crear/editar → admin, director, subdirector, coordinador, docente,
     * eliminar      → admin, director, subdirector,
     * ver          → el docente ve todo; el estudiante ve las aulas donde
                     está inscrito, sus tareas, entregas y calificaciones.

   Este archivo NO habla con la red: son funciones puras para que la
   sincronización se pueda probar sin backend ni navegador.
   =================================================================== */

/** Rangos que gestionan aulas (crear/editar). */
export const ROLES_GESTION = ['admin', 'director', 'subdirector', 'coordinador', 'docente'];

/** Rangos que además pueden borrar. */
export const ROLES_ELIMINAR = ['admin', 'director', 'subdirector'];

/** ¿Este rango gestiona aulas? */
export function esGestion(rol) {
  return ROLES_GESTION.indexOf(String(rol || '').trim().toLowerCase()) !== -1;
}

/** ¿Este rango puede borrar? */
export function esEliminar(rol) {
  return ROLES_ELIMINAR.indexOf(String(rol || '').trim().toLowerCase()) !== -1;
}

/**
 * El id del aula es numérico en la app (Date.now()) y texto en el
 * servidor. Se conserva el tipo que usa la interfaz.
 */
export function idComoNumero(v) {
  if (v === null || v === undefined || v === '') return v;
  const n = Number(v);
  if (Number.isFinite(n) && String(n) === String(v)) return n;
  return v;
}

function texto(v, max) {
  return String(v === null || v === undefined ? '' : v).trim().slice(0, max);
}

/* ----------------ulas ---------------- */

export function aRemotoAula(aula) {
  return {
    id: String(aula.id),
    nombre: texto(aula.nombre, 120),
    capacidad: Number(aula.capacidad) || 0,
    ubicacion: texto(aula.ubicacion, 120),
    tipo: texto(aula.tipo, 40),
    equipamiento: texto(aula.equipamiento, 40),
    desc: texto(aula.desc, 4000),
    especialidad: texto(aula.especialidad, 60),
    anio: texto(aula.anio, 10),
    seccion: texto(aula.seccion, 10),
  };
}

export function aLocalAula(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idComoNumero(raw.id);
  if (id === null || id === undefined || id === '') return null;
  return {
    id: id,
    nombre: texto(raw.nombre, 120),
    capacidad: Number(raw.capacidad) || 0,
    ubicacion: texto(raw.ubicacion, 120),
    tipo: texto(raw.tipo, 40),
    equipamiento: texto(raw.equipamiento, 40),
    desc: texto(raw.desc !== undefined ? raw.desc : raw.descripcion, 4000),
    especialidad: texto(raw.especialidad, 60),
    anio: texto(raw.anio, 10),
    seccion: texto(raw.seccion, 10),
    remoto: true,
  };
}

/* ---------------- inscripciones ---------------- */

export function aRemotoInscripcion(insc) {
  return {
    id: String(insc.id || insc.aulaId + '-' + insc.estudianteId),
    aula_id: String(insc.aulaId),
    estudiante_id: String(insc.estudianteId === undefined ? '' : insc.estudianteId),
    estudiante_email: texto(insc.estudianteEmail, 160).toLowerCase(),
    estudiante_nombre: texto(insc.estudiante, 120),
    estado: texto(insc.estado, 30) || 'aprobado',
    fecha: texto(insc.fecha, 40),
  };
}

export function aLocalInscripcion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const aulaId = idComoNumero(raw.aula_id);
  if (aulaId === null || aulaId === undefined || aulaId === '') return null;
  return {
    id: idComoNumero(raw.id),
    aulaId: aulaId,
    estudianteId: idComoNumero(raw.estudiante_id),
    estudianteEmail: texto(raw.estudiante_email, 160).toLowerCase(),
    estudiante: texto(raw.estudiante_nombre, 120),
    estado: texto(raw.estado, 30) || 'aprobado',
    fecha: texto(raw.fecha, 40),
    remoto: true,
  };
}

/* ---------------- tareas ---------------- */

export function aRemotoTarea(tarea) {
  return {
    id: String(tarea.id),
    aula_id: String(tarea.aulaId),
    titulo: texto(tarea.titulo, 200),
    descripcion: texto(tarea.desc !== undefined ? tarea.desc : tarea.descripcion, 4000),
    materia: texto(tarea.materia, 80),
    grupo: texto(tarea.grupo, 80),
    fecha: texto(tarea.fecha, 40),
  };
}

export function aLocalTarea(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idComoNumero(raw.id);
  const aulaId = idComoNumero(raw.aula_id);
  if (id === null || id === undefined || id === '') return null;
  return {
    id: id,
    aulaId: aulaId,
    titulo: texto(raw.titulo, 200),
    desc: texto(raw.descripcion, 4000),
    materia: texto(raw.materia, 80),
    grupo: texto(raw.grupo, 80),
    fecha: texto(raw.fecha, 40),
    remoto: true,
  };
}

/* ---------------- entregas ---------------- */

/**
 * La interfaz guarda la entrega con el ÍNDICE de la tarea (`tareaIdx`),
 * que no sirve para compartir: el índice cambia si la lista se reordena.
 * En el servidor la entrega apunta a la tarea por id; al volver, se
 * traduce el id al índice que usa la interfaz.
 */
export function aRemotoEntrega(entrega, tareas) {
  const tarea = (tareas || [])[entrega.tareaIdx];
  const remoto = {
    id: String(entrega.id || 'ent-' + (entrega.tareaIdx || 0) + '-' + (entrega.estudianteEmail || entrega.estudiante || '')),
    tarea_id: String(entrega.tareaId !== undefined ? entrega.tareaId : (tarea ? tarea.id : '')),
    estudiante_id: String(entrega.estudianteId === undefined ? '' : entrega.estudianteId),
    estudiante_email: texto(entrega.estudianteEmail, 160).toLowerCase(),
    estudiante_nombre: texto(entrega.estudiante, 120),
    respuesta: texto(entrega.respuesta, 4000),
    archivo_nombre: texto(entrega.archivoNombre, 120),
    fecha: texto(entrega.fecha, 40),
  };
  // El archivo adjunto viaja como data URL, pero sólo si es manejable:
  // un móvil con internet intermitente no debe subir 2 MB por tarea.
  if (entrega.archivo && String(entrega.archivo).length <= 400000) {
    remoto.archivo = String(entrega.archivo);
  }
  return remoto;
}

/** Índice de la tarea con ese id (o -1). */
export function indiceDeTarea(tareas, id) {
  const lista = Array.isArray(tareas) ? tareas : [];
  for (let i = 0; i < lista.length; i++) {
    if (String(lista[i].id) === String(id)) return i;
  }
  return -1;
}

export function aLocalEntrega(raw, tareas) {
  if (!raw || typeof raw !== 'object') return null;
  const tareaIdx = indiceDeTarea(tareas, raw.tarea_id);
  if (tareaIdx < 0) return null; // la tarea no está (todavía) en el dispositivo
  const local = {
    id: idComoNumero(raw.id),
    tareaIdx: tareaIdx,
    tareaId: idComoNumero(raw.tarea_id),
    estudianteId: idComoNumero(raw.estudiante_id),
    estudianteEmail: texto(raw.estudiante_email, 160).toLowerCase(),
    estudiante: texto(raw.estudiante_nombre, 120),
    respuesta: texto(raw.respuesta, 4000),
    archivoNombre: texto(raw.archivo_nombre, 120),
    fecha: texto(raw.fecha, 40),
    remoto: true,
  };
  // El archivo adjunto sólo viene si el servidor lo tiene: si no, se deja
  // la copia local (no se pisa un data URL con una cadena vacía).
  if (raw.archivo) local.archivo = raw.archivo;
  return local;
}

/* ---------------- calificaciones ---------------- */

export function aRemotoCalificacion(cal, entregas, tareas) {
  const entrega = (entregas || [])[cal.entregaIdx];
  const tarea = entrega ? (tareas || [])[entrega.tareaIdx] : null;
  return {
    id: String(cal.id || 'cal-' + (cal.entregaIdx || 0)),
    entrega_id: String(entrega ? entrega.id : ''),
    tarea_id: String(cal.tareaId !== undefined ? cal.tareaId : (tarea ? tarea.id : '')),
    estudiante_id: String(entrega && entrega.estudianteId !== undefined ? entrega.estudianteId : ''),
    estudiante_email: texto(entrega ? entrega.estudianteEmail : '', 160).toLowerCase(),
    nota: Number(cal.nota) || 0,
    retroealimentacion: texto(cal.retroealimentacion, 4000),
    fecha: texto(cal.fechaCalificacion, 40),
  };
}

export function aLocalCalificacion(raw, entregas, tareas) {
  if (!raw || typeof raw !== 'object') return null;
  const listaEntregas = Array.isArray(entregas) ? entregas : [];
  let entregaIdx = -1;
  for (let i = 0; i < listaEntregas.length; i++) {
    if (raw.entrega_id && String(listaEntregas[i].id) === String(raw.entrega_id)) { entregaIdx = i; break; }
  }
  if (entregaIdx < 0) return null;
  const tareaIdx = indiceDeTarea(tareas, raw.tarea_id);
  return {
    id: idComoNumero(raw.id),
    entregaIdx: entregaIdx,
    tareaIdx: tareaIdx,
    nota: Number(raw.nota) || 0,
    retroealimentacion: texto(raw.retroealimentacion, 4000),
    fechaCalificacion: texto(raw.fecha, 40),
    remoto: true,
  };
}

/* ---------------- asistencia ---------------- */

export function aRemotoAsistencia(asi) {
  return {
    id: String(asi.id || 'asi-' + asi.aulaId + '-' + asi.fecha),
    aula_id: String(asi.aulaId),
    fecha: texto(asi.fecha, 40),
    registros: (asi.registros || []).map(function (r) {
      return { nombre: texto(r.nombre, 120), estado: texto(r.estado, 20) || 'presente' };
    }),
  };
}

export function aLocalAsistencia(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const aulaId = idComoNumero(raw.aula_id);
  if (aulaId === null || aulaId === undefined || aulaId === '') return null;
  return {
    id: idComoNumero(raw.id),
    aulaId: aulaId,
    fecha: texto(raw.fecha, 40),
    registros: (raw.registros || []).map(function (r) {
      return { nombre: texto(r.nombre, 120), estado: texto(r.estado, 20) || 'presente' };
    }),
    remoto: true,
  };
}

/* ---------------- mezcla local ↔ servidor ---------------- */

/**
 * Mezcla la lista local con la del servidor.
 *
 * - El servidor manda: si el elemento ya está arriba, se usa su versión.
 * - Los locales que todavía no se subieron se conservan (local-first).
 * - Los locales que estaban en el servidor y ya no aparecen (los borró
 *   otra persona) se descartan: el servidor manda.
 * - Los remotos nuevos (creados por otra persona) se agregan.
 */
export function fusionar(locales, remotos, opciones) {
  const op = opciones || {};
  const clave = op.clave || 'id';
  const aLocal = op.aLocal || function (x) { return x; };
  const rem = (Array.isArray(remotos) ? remotos : []).map(aLocal).filter(Boolean);
  const loc = Array.isArray(locales) ? locales : [];

  const porId = {};
  rem.forEach(function (r) { porId[String(r[clave])] = r; });

  const salida = [];
  const vistos = {};
  loc.forEach(function (l) {
    const id = String(l[clave]);
    if (porId[id]) {
      // El servidor manda, pero se conservan los campos locales que el
      // servidor no conoce (p.ej. el archivo adjunto de una entrega).
      const merged = {};
      Object.keys(l).forEach(function (k) { merged[k] = l[k]; });
      Object.keys(porId[id]).forEach(function (k) { merged[k] = porId[id][k]; });
      merged.remoto = true;
      salida.push(merged);
      vistos[id] = true;
    } else if (l.remoto) {
      // Estaba en el servidor y ya no está: lo quitó otra persona.
    } else {
      // Todavía no llegó al servidor: se conserva (local-first).
      salida.push(l);
    }
  });
  rem.forEach(function (r) {
    const id = String(r[clave]);
    if (!vistos[id]) salida.push(r);
  });
  return salida;
}

/**
 * Fusiona el estado completo (las seis colecciones).
 * El orden importa: las entregas apuntan a las tareas y las
 * calificaciones a las entregas, así que se resuelven en cascada.
 */
export function fusionarEstado(local, remoto) {
  const loc = local || {};
  const rem = remoto || {};
  const tareas = fusionar(loc.tareas, rem.tareas, { clave: 'id', aLocal: aLocalTarea });
  const entregas = fusionar(loc.entregas, rem.entregas, {
    clave: 'id',
    aLocal: function (r) { return aLocalEntrega(r, tareas); },
  });
  return {
    aulas: fusionar(loc.aulas, rem.aulas, { clave: 'id', aLocal: aLocalAula }),
    inscripciones: fusionar(loc.inscripciones, rem.inscripciones, { clave: 'id', aLocal: aLocalInscripcion }),
    tareas: tareas,
    entregas: entregas,
    calificaciones: fusionar(loc.calificaciones, rem.calificaciones, {
      clave: 'id',
      aLocal: function (r) { return aLocalCalificacion(r, entregas, tareas); },
    }),
    asistencia: fusionar(loc.asistencia, rem.asistencia, { clave: 'id', aLocal: aLocalAsistencia }),
  };
}

/** ¿La entrega es del usuario indicado? (para la vista del estudiante) */
export function esEntregaMia(entrega, email) {
  if (!entrega || !email) return false;
  const mio = String(email).trim().toLowerCase();
  if (entrega.estudianteEmail) return String(entrega.estudianteEmail).trim().toLowerCase() === mio;
  // Entregas viejas (sin email): se consideran propias si no hay email
  // de ningún lado en la colección.
  return true;
}
