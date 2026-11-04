/* ===================================================================
   evaluador.js — Lógica pura de calificación y formato de preguntas
   de exámenes (sin dependencias directas del DOM).
   =================================================================== */

/**
 * Formatea la respuesta dada por el estudiante para presentación.
 * @param {Object} q Objeto de la pregunta
 * @param {any} valor Respuesta dada por el estudiante
 * @returns {string}
 */
export function textoRespuesta(q, valor) {
  if (valor === null || valor === undefined || valor === '') return 'Sin responder';
  if (q.tipo === 'vf_justificacion') {
    if (!valor || typeof valor !== 'object' || valor.vf === null || valor.vf === undefined) return 'Sin responder';
    const estado = Number(valor.vf) === 1 ? 'Verdadero' : 'Falso';
    return valor.justificacion ? `${estado} (Justificación: ${valor.justificacion})` : estado;
  }
  if (q.tipo === 'rango') {
    return (valor !== null && valor !== undefined && valor !== '') ? String(valor) : 'Sin responder';
  }
  if (q.tipo === 'cloze') {
    return Array.isArray(valor) ? (valor.filter(Boolean).length ? valor.join(', ') : 'Sin responder') : String(valor);
  }
  if (q.tipo === 'completar' || q.tipo === 'texto_largo' || q.tipo === 'abierta') {
    return String(valor);
  }
  if (q.tipo === 'codigo') {
    if (valor === null || valor === undefined || valor === '') return 'Sin responder';
    return `(${q.lenguaje}) ${String(valor).slice(0, 60)}${String(valor).length > 60 ? '...' : ''}`;
  }
  if (q.tipo === 'video' || q.tipo === 'imagen') {
    return valor ? 'Archivo adjunto' : 'Sin responder';
  }
  if (q.tipo === 'vf') {
    return Number(valor) === 1 ? 'Verdadero' : 'Falso';
  }
  if (q.tipo === 'multiple') {
    return String.fromCharCode(65 + Number(valor)) + ') ' + ((q.opciones || [])[Number(valor)] || '');
  }
  if (q.tipo === 'casilla') {
    const idxs = Array.isArray(valor) ? valor : [valor];
    return idxs.map((n) => String.fromCharCode(65 + n) + ') ' + ((q.opciones || [])[n] || '')).join(', ');
  }
  if (q.tipo === 'ordenar' || q.tipo === 'emparejar') {
    return Array.isArray(valor) ? valor.join(' → ') : String(valor);
  }
  return String(valor);
}

/**
 * Devuelve el texto legible de la respuesta correcta esperada.
 * @param {Object} q Objeto de la pregunta
 * @returns {string}
 */
export function textoCorrecta(q) {
  if (q.tipo === 'vf_justificacion') {
    const estado = Number(q.correcta) === 1 ? 'Verdadero' : 'Falso';
    return q.justificacion ? `${estado} (Explicación: ${q.justificacion})` : estado;
  }
  if (q.tipo === 'rango') {
    return String(q.respuesta) + (q.tolerancia ? ` (± ${q.tolerancia})` : '');
  }
  if (q.tipo === 'cloze') {
    return (q.respuestas || []).join(', ');
  }
  if (q.tipo === 'completar' || q.tipo === 'texto_largo') {
    return q.respuesta || '—';
  }
  if (q.tipo === 'codigo') {
    return q.salida_esperada ? `salida esperada: ${q.salida_esperada}` : 'calificación manual';
  }
  if (q.tipo === 'video' || q.tipo === 'imagen') {
    return q.url || '—';
  }
  if (q.tipo === 'vf') {
    return Number(q.correcta) === 1 ? 'Verdadero' : 'Falso';
  }
  if (q.tipo === 'multiple') {
    return String.fromCharCode(65 + Number(q.correcta)) + ') ' + ((q.opciones || [])[Number(q.correcta)] || '');
  }
  if (q.tipo === 'casilla') {
    const idxs = Array.isArray(q.correctas) ? q.correctas : [];
    return idxs.map((n) => String.fromCharCode(65 + n) + ') ' + ((q.opciones || [])[n] || '')).join(', ');
  }
  if (q.tipo === 'ordenar') {
    return (q.opciones || []).join(' → ');
  }
  if (q.tipo === 'emparejar') {
    return (q.pares || []).map((par) => `${par[0]} ↔ ${par[1]}`).join('; ');
  }
  return '—';
}

/**
 * Evalúa una respuesta individual para una pregunta dada.
 * @param {Object} q Objeto de la pregunta
 * @param {any} dada Respuesta enviada por el estudiante
 * @returns {boolean | null} true si es correcto, false si es incorrecto, null si requiere calificación manual
 */
export function evaluarRespuesta(q, dada) {
  if (dada === null || dada === undefined || dada === '') {
    return false;
  }
  if (q.tipo === 'completar' || q.tipo === 'texto_largo') {
    return String(dada || '').trim().toLowerCase() === String(q.respuesta || '').trim().toLowerCase();
  }
  if (q.tipo === 'rango') {
    const nDada = parseFloat(dada);
    if (isNaN(nDada)) return false;
    const centro = Number(q.respuesta);
    const tol = Number(q.tolerancia) || 0;
    return Math.abs(nDada - centro) <= tol;
  }
  if (q.tipo === 'cloze') {
    const rEsperadas = (q.respuestas || []).map((r) => String(r).trim().toLowerCase());
    const rDadas = (Array.isArray(dada) ? dada : []).map((r) => String(r).trim().toLowerCase());
    return rEsperadas.length > 0 &&
      rEsperadas.length === rDadas.length &&
      rEsperadas.every((exp, ri) => exp === rDadas[ri]);
  }
  if (q.tipo === 'vf_justificacion') {
    return typeof dada === 'object' && dada !== null && Number(dada.vf) === Number(q.correcta);
  }
  if (q.tipo === 'casilla') {
    const correctasArr = (q.correctas || []).slice().map(Number).sort();
    const dadasArr = (Array.isArray(dada) ? dada : []).slice().map(Number).sort();
    return correctasArr.length > 0 &&
      correctasArr.length === dadasArr.length &&
      correctasArr.every((val, vi) => val === dadasArr[vi]);
  }
  if (q.tipo === 'abierta' || q.tipo === 'ordenar' || q.tipo === 'emparejar') {
    return null; // pendiente de calificación docente
  }
  if (q.tipo === 'video' || q.tipo === 'imagen') {
    return null; // calificación manual (multimedia)
  }
  if (q.tipo === 'codigo') {
    if (!q.salida_esperada) return null; // calificación manual si no hay salida esperada
    return String(dada || '').trim() === String(q.salida_esperada).trim();
  }
  return Number(dada) === Number(q.correcta);
}

/**
 * Calcula el resultado total del examen.
 * @param {Array} preguntas Lista de preguntas del examen
 * @param {Array} respuestas Lista de respuestas del estudiante
 * @param {number} notaMin Calificación mínima de aprobación (por defecto 60)
 * @returns {Object}
 */
export function calcularResultadoExamen(preguntas, respuestas, notaMin = 60) {
  let correctas = 0;
  const detalle = preguntas.map((q, i) => {
    const dada = respuestas[i];
    const ok = evaluarRespuesta(q, dada);
    if (ok === true) correctas++;
    return { ok, dada, q };
  });

  const totalCerradas = preguntas.filter(
    (q) => q.tipo !== 'abierta' && q.tipo !== 'ordenar' && q.tipo !== 'emparejar'
      && q.tipo !== 'video' && q.tipo !== 'imagen'
      && !(q.tipo === 'codigo' && !q.salida_esperada)
  ).length;

  const total = totalCerradas > 0 ? totalCerradas : preguntas.length;
  const porcentaje = total > 0 ? Math.round((correctas / total) * 100) : 0;
  const aprobado = porcentaje >= notaMin;

  return {
    correctas,
    total,
    porcentaje,
    aprobado,
    notaMin,
    detalle,
  };
}
