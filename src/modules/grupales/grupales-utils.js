/* ===================================================================
   grupales-utils.js — Lógica pura del módulo de Actividades Grupales.
   Sin DOM ni fetch.
   =================================================================== */

export function normalizarId(v) {
  return String(v == null ? '' : v).trim();
}

export function iniciales(nombre) {
  const partes = String(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0,2).toUpperCase();
  return (partes[0][0] + partes[partes.length-1][0]).toUpperCase();
}

export function fechaCorta(ts) {
  const t = Number(ts);
  if (!t) return '';
  const d = new Date(t * 1000);
  if (isNaN(d.getTime())) return '';
  const pad = n => (n<10?'0'+n:''+n);
  return pad(d.getDate())+'/'+pad(d.getMonth()+1) + (d.getFullYear()!==new Date().getFullYear()?'/'+d.getFullYear():'' );
}

export function horaCorta(ts) {
  const t = Number(ts);
  if (!t) return '';
  const d = new Date(t * 1000);
  if (isNaN(d.getTime())) return '';
  const pad = n => (n<10?'0'+n:''+n);
  return pad(d.getHours())+':'+pad(d.getMinutes());
}

export function etiquetaEstado(estado) {
  const e = String(estado||'').toLowerCase();
  return e==='archivado' ? 'Archivado' : 'Activo';
}

export function validarGrupo(nombre) {
  if (!String(nombre||'').trim()) return 'El nombre del grupo es obligatorio.';
  if (String(nombre).length > 120) return 'El nombre es demasiado largo.';
  return '';
}

export function resumen(texto, tope=90) {
  const t = String(texto||'').replace(/\s+/g,' ').trim();
  if (t.length <= tope) return t;
  return t.slice(0,tope)+'…';
}

export function filtrarGrupos(grupos, texto) {
  const q = String(texto||'').trim().toLowerCase();
  if (!q) return Array.isArray(grupos)?grupos.slice():[];
  return (Array.isArray(grupos)?grupos:[]).filter(g => {
    const nombre = String(g.nombre||'').toLowerCase();
    const materia = String(g.materia||'').toLowerCase();
    const desc = String(g.descripcion||'').toLowerCase();
    return nombre.includes(q) || materia.includes(q) || desc.includes(q);
  });
}
