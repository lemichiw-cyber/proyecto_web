// Comunicados, eventos y orientación vocacional (Fase 3).
// Lógica pura, sin DOM.

import { redondear } from '../utils.js';

/**
 * Comunicados y eventos del centro, ordenados por fecha.
 * `tipo`: 'comunicado' | 'evento' | 'tarea' | 'examen' | 'otro'.
 */
export function ordenarComunicados(lista) {
  const l = Array.isArray(lista) ? lista.slice() : [];
  return l.sort((a, b) => {
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    if (a.fecha === b.fecha) return String(a.id).localeCompare(String(b.id));
    return a.fecha < b.fecha ? -1 : 1;
  });
}

export function validarComunicado(c) {
  if (!c) return { ok: false, motivo: 'Comunicado vacío.' };
  const titulo = (c.titulo || '').trim();
  if (!titulo) return { ok: false, motivo: 'Indica un título.' };
  if (titulo.length > 120) return { ok: false, motivo: 'El título es muy largo (máx. 120 caracteres).' };
  if ((c.detalle || '').length > 800) return { ok: false, motivo: 'El detalle es muy largo (máx. 800 caracteres).' };
  if (c.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) return { ok: false, motivo: 'La fecha no es válida.' };
  const tiposValidos = ['comunicado', 'evento', 'tarea', 'examen', 'otro'];
  if (c.tipo && !tiposValidos.includes(c.tipo)) return { ok: false, motivo: 'Tipo de comunicado no válido.' };
  return { ok: true };
}

export function agregarComunicado(lista, c, opciones = {}) {
  const v = validarComunicado(c);
  if (!v.ok) return v;
  const l = Array.isArray(lista) ? lista.slice() : [];
  const id = typeof opciones.id === 'function' ? String(opciones.id()) : `cm-${Date.now()}`;
  l.push({
    id,
    tipo: c.tipo || 'comunicado',
    titulo: c.titulo.trim(),
    detalle: (c.detalle || '').trim(),
    fecha: c.fecha || '',
    enlace: (c.enlace || '').trim(),
  });
  return { ok: true, lista: ordenarComunicados(l) };
}

export function editarComunicado(lista, id, cambios) {
  const l = Array.isArray(lista) ? lista : [];
  const indice = l.findIndex((c) => c.id === id);
  if (indice === -1) return { ok: false, motivo: 'No existe ese comunicado.' };
  const otro = l.map((c) => (c.id === id ? { ...c, ...cambios } : c));
  const v = validarComunicado(otro[indice]);
  if (!v.ok) return v;
  return { ok: true, lista: ordenarComunicados(otro) };
}

export function eliminarComunicado(lista, id) {
  const l = Array.isArray(lista) ? lista : [];
  if (!l.some((c) => c.id === id)) return { ok: false, motivo: 'No existe ese comunicado.' };
  return { ok: true, lista: l.filter((c) => c.id !== id) };
}

/** Comunicados con fecha igual o posterior a `desde` (texto 'YYYY-MM-DD'). */
export function proximosComunicados(lista, desde) {
  return ordenarComunicados(lista).filter((c) => c.fecha && c.fecha >= desde);
}

/** Comunicados cuya fecha ya pasó. */
export function comunicadosVencidos(lista, desde) {
  return ordenarComunicados(lista).filter((c) => c.fecha && c.fecha < desde);
}

/**
 * Días restantes hasta un evento. Devuelve `null` si no tiene fecha.
 */
export function diasRestantes(fecha, desde) {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${fecha}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Filtrado simple de comunicados por texto y tipo.
 */
export function filtrarComunicados(lista, { texto = '', tipo = '' } = {}) {
  const t = texto.trim().toLowerCase();
  return ordenarComunicados(lista).filter((c) => {
    if (tipo && c.tipo !== tipo) return false;
    if (!t) return true;
    return `${c.titulo} ${c.detalle}`.toLowerCase().includes(t);
  });
}

// ---------------------------------------------------------------
// Orientación vocacional
// ---------------------------------------------------------------

/**
 * Catálogo de ejemplo con enlaces oficiales para VERIFICAR.
 * Los requisitos, duración y modalidades pueden cambiar: siempre hay que
 * confirmarlos en la fuente oficial antes de decidir.
 */
export const CARRERAS_EJEMPLO = [
  {
    area: 'Ciencias de la salud',
    carreras: [
      { nombre: 'Medicina', donde: 'Universidad de El Salvador (Facultad de Medicina)', url: 'https://www.ues.edu.sv' },
      { nombre: 'Enfermería', donde: 'Universidad de El Salvador (Facultad de Medicina)', url: 'https://www.ues.edu.sv' },
    ],
  },
  {
    area: 'Ingeniería y tecnología',
    carreras: [
      { nombre: 'Ingeniería de Sistemas', donde: 'Universidad de El Salvador (Ingeniería)', url: 'https://www.ues.edu.sv' },
      { nombre: 'Ingeniería Industrial', donde: 'Universidad Nacional (FMP)', url: 'https://www.una.edu.sv' },
    ],
  },
  {
    area: 'Ciencias económicas',
    carreras: [
      { nombre: 'Administración de Empresas', donde: 'Universidad Nacional (FMO)', url: 'https://www.una.edu.sv' },
      { nombre: 'Contaduría', donde: 'Universidad de El Salvador (Facultad de Ciencias Económicas)', url: 'https://www.ues.edu.sv' },
    ],
  },
  {
    area: 'Derecho y ciencias sociales',
    carreras: [
      { nombre: 'Derecho', donde: 'Universidad de El Salvador (Facultad de Jurisprudencia)', url: 'https://www.ues.edu.sv' },
      { nombre: 'Trabajo Social', donde: 'Universidad Nacional (FACSO)', url: 'https://www.una.edu.sv' },
    ],
  },
  {
    area: 'Educación',
    carreras: [
      { nombre: 'Licenciatura en Educación', donde: 'Universidad Nacional (FMP)', url: 'https://www.una.edu.sv' },
      { nombre: 'Educación Parvularia', donde: 'Universidad de El Salvador', url: 'https://www.ues.edu.sv' },
    ],
  },
];

/** Fuentes oficiales generales para verificar requisitos, becas y admisiones. */
export const FUENTES_OFICIALES = [
  { nombre: 'Ministerio de Educación de El Salvador (MINED)', url: 'https://www.mined.gob.sv' },
  { nombre: 'Universidad de El Salvador', url: 'https://www.ues.edu.sv' },
  { nombre: 'Universidad Nacional de El Salvador', url: 'https://www.una.edu.sv' },
  { nombre: 'Consejo Nacional de Educación Superior (CONES)', url: 'https://www.cones.gob.sv' },
];

/** Búsqueda simple en el catálogo de carreras. */
export function buscarCarreras(catalogo, texto) {
  const t = (texto || '').trim().toLowerCase();
  const lista = Array.isArray(catalogo) ? catalogo : [];
  if (!t) return lista;
  return lista
    .map((grupo) => ({
      ...grupo,
      carreras: grupo.carreras.filter((c) => `${c.nombre} ${grupo.area}`.toLowerCase().includes(t)),
    }))
    .filter((grupo) => grupo.carreras.length > 0);
}

/** Puntuación simple de afinidad entre intereses y áreas (sólo una guía, no un diagnóstico). */
export function areasAfinas(intereses = []) {
  const lista = Array.isArray(intereses) ? intereses.filter(Boolean) : [];
  if (lista.length === 0) return [];
  // Normaliza sin acentos para comparar «computadoras» con «cómputo», etc.
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pre = (s) => norm(s).slice(0, 4);
  // Peso por coincidencia con palabras clave de cada área.
  const claves = {
    'Ciencias de la salud': ['salud', 'medicina', 'cuerpo', 'ayudar', 'personas', 'biología'],
    'Ingeniería y tecnología': ['tecnología', 'cómputo', 'máquinas', 'construir', 'programación', 'matemática', 'números'],
    'Ciencias económicas': ['negocios', 'dinero', 'empresa', 'administración', 'contaduría', 'economía'],
    'Derecho y ciencias sociales': ['leyes', 'justicia', 'sociedad', 'política', 'derechos', 'gente'],
    'Educación': ['enseñar', 'educación', 'niños', 'escuela', 'docencia'],
  };
  const palabras = lista.join(' ').toLowerCase().split(/[\s,;.]+/).filter((p) => p.length >= 3).map(norm);
  const puntuadas = Object.entries(claves).map(([area, ks]) => ({
    area,
    puntos: ks.reduce((n, k) => {
      const nk = norm(k);
      const coincide = palabras.some((p) => p.includes(nk) || nk.includes(p) || pre(p) === pre(nk));
      return n + (coincide ? 1 : 0);
    }, 0),
  }));
  const max = Math.max(...puntuadas.map((p) => p.puntos), 1);
  return puntuadas
    .filter((p) => p.puntos > 0)
    .map((p) => ({ area: p.area, afinidad: redondear((p.puntos / max) * 100, 0) }))
    .sort((a, b) => b.afinidad - a.afinidad);
}
