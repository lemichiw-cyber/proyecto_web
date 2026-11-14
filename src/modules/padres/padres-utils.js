/* ===================================================================
   padres-utils.js — Lógica pura del Portal de Padres.
   Sin DOM ni fetch: se puede probar de forma aislada (vitest).
   =================================================================== */

/** Normaliza un email. */
export function normalizarEmail(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

/** Etiqueta legible de un rango. */
export function etiquetaRol(rol) {
  const r = String(rol || '').trim().toLowerCase();
  return (
    {
      admin: 'Administración',
      director: 'Dirección',
      subdirector: 'Subdirección',
      coordinador: 'Coordinación',
      docente: 'Docente',
      estudiante: 'Estudiante',
      padres: 'Padre / madre',
    }[r] || 'Colegio'
  );
}

/** Iniciales para el avatar (máx. 2 letras). */
export function iniciales(nombre) {
  const partes = String(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Calcula el promedio de notas (0-10) a partir de una lista.
 * @param {Array<{nota?: number|string|null}>} notas
 * @returns {number|null}
 */
export function promedio(notas) {
  const vals = (Array.isArray(notas) ? notas : [])
    .map((n) => Number(n && n.nota !== undefined ? n.nota : n))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

/**
 * Porcentaje de asistencia.
 * @returns {number|null}
 */
export function porcentajeAsistencia(asistencia) {
  const a = asistencia || {};
  const registros = Number(a.registros || 0);
  const presentes = Number(a.presentes || 0);
  if (!registros) return null;
  return Math.round((presentes / registros) * 100);
}

/**
 * Cuenta las tareas pendientes (no entregadas) de un hijo.
 */
export function contarPendientes(hijo) {
  const tareas = Array.isArray(hijo && hijo.tareas) ? hijo.tareas : [];
  return tareas.filter((t) => !t.entregada).length;
}

/**
 * Agrupa las calificaciones por materia.
 * @returns {Array<{materia: string, notas: number[], promedio: number|null}>}
 */
export function agruparPorMateria(hijo) {
  const tareas = Array.isArray(hijo && hijo.tareas) ? hijo.tareas : [];
  const notas = Array.isArray(hijo && hijo.notas) ? hijo.notas : [];
  const porMateria = new Map();

  const ensure = (materia) => {
    const key = String(materia || 'General');
    if (!porMateria.has(key)) porMateria.set(key, { materia: key, notas: [], promedio: null });
    return porMateria.get(key);
  };

  tareas.forEach((t) => ensure(t.materia));
  notas.forEach((n) => {
    // La nota apunta a una tarea: se busca su materia.
    const tarea = tareas.find((t) => String(t.id || '') === String(n.tarea_id || ''));
    ensure(tarea ? tarea.materia : 'General').notas.push(n);
  });

  const salida = Array.from(porMateria.values()).map((m) => ({
    materia: m.materia,
    notas: m.notas,
    promedio: promedio(m.notas),
  }));
  salida.sort((a, b) => String(a.materia).localeCompare(String(b.materia)));
  return salida;
}

/**
 * Devuelve las notificaciones a mostrar (tareas nuevas, notas nuevas, alertas).
 */
export function construirNotificaciones(hijos) {
  const lista = Array.isArray(hijos) ? hijos : [];
  const out = [];
  lista.forEach((h) => {
    const tareas = Array.isArray(h.tareas) ? h.tareas : [];
    const pendientes = tareas.filter((t) => !t.entregada);
    if (pendientes.length) {
      out.push({
        tipo: 'alerta',
        texto: `${pendientes.length} tarea(s) pendiente(s) de ${h.nombre || 'tu hijo/a'}`,
      });
    }
    const notas = Array.isArray(h.notas) ? h.notas : [];
    if (notas.length) {
      out.push({
        tipo: 'info',
        texto: `${notas.length} calificación(es) registradas para ${h.nombre || 'tu hijo/a'}`,
      });
    }
    const asis = h.asistencia || {};
    const pct = porcentajeAsistencia(asis);
    if (pct !== null && pct < 80) {
      out.push({
        tipo: 'alerta',
        texto: `Asistencia de ${h.nombre || 'tu hijo/a'}: ${pct}%`,
      });
    }
  });
  return out;
}

/** Formatea un porcentaje para mostrar ("—" si no hay datos). */
export function formatoPorcentaje(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return '—';
  return `${Math.round(Number(pct))}%`;
}

/** Formatea un promedio ("—" si no hay notas). */
export function formatoPromedio(prom) {
  if (prom === null || prom === undefined || Number.isNaN(Number(prom))) return '—';
  return String(prom);
}
