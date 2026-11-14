/* ===================================================================
   mensajes-utils.js — Lógica pura del módulo de Mensajes.
   Sin DOM ni fetch: se puede probar de forma aislada (vitest).
   =================================================================== */

/** Normaliza un email (minúsculas, sin espacios). */
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

/** Iniciales para el avatar de la conversación (máx. 2 letras). */
export function iniciales(nombre) {
  const partes = String(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Fecha corta dd/mm para el listado de conversaciones. */
export function fechaCorta(ts) {
  const t = Number(ts);
  if (!t) return '';
  const d = new Date(t * 1000);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + (d.getFullYear() !== new Date().getFullYear() ? '/' + d.getFullYear() : '');
}

/** Hora hh:mm de un timestamp (segundos). */
export function horaCorta(ts) {
  const t = Number(ts);
  if (!t) return '';
  const d = new Date(t * 1000);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** Resumen de un mensaje para el listado (recorta y quita saltos de línea). */
export function resumen(contenido, tope = 90) {
  const t = String(contenido || '').replace(/\s+/g, ' ').trim();
  if (t.length <= tope) return t;
  return t.slice(0, tope) + '…';
}

/** ¿Es un mensaje propio (enviado por el usuario)? */
export function esPropio(mensaje, miEmail) {
  return normalizarEmail(mensaje && mensaje.remitente) === normalizarEmail(miEmail);
}

/** Ordena los mensajes de una conversación por fecha (antiguo → nuevo). */
export function ordenarPorFecha(mensajes) {
  return (Array.isArray(mensajes) ? mensajes.slice() : []).sort(
    (a, b) => Number(a && a.creado || 0) - Number(b && b.creado || 0),
  );
}

/**
 * Cuenta los mensajes no leídos recibidos por el usuario.
 * @returns {number}
 */
export function contarNoLeidos(mensajes, miEmail) {
  const mi = normalizarEmail(miEmail);
  return (Array.isArray(mensajes) ? mensajes : []).filter(
    (m) => normalizarEmail(m && m.destinatario) === mi && !m.leido,
  ).length;
}

/**
 * Agrupa los mensajes por conversación (la otra persona).
 * @returns {Array<{email, mensajes, noLeidos, ultimo}>}
 */
export function agruparPorConversacion(mensajes, miEmail) {
  const mi = normalizarEmail(miEmail);
  const mapa = new Map();
  (Array.isArray(mensajes) ? mensajes : []).forEach((m) => {
    if (!m) return;
    const de = normalizarEmail(m.remitente);
    const a = normalizarEmail(m.destinatario);
    if (mi !== de && mi !== a) return;
    const otro = de === mi ? a : de;
    if (!otro) return;
    if (!mapa.has(otro)) mapa.set(otro, []);
    mapa.get(otro).push(m);
  });
  return Array.from(mapa.entries())
    .map(([email, items]) => {
      const ordenados = ordenarPorFecha(items);
      const ultimo = ordenados[ordenados.length - 1] || null;
      return {
        email,
        mensajes: ordenados,
        noLeidos: ordenados.filter((m) => normalizarEmail(m.destinatario) === mi && !m.leido).length,
        ultimo,
      };
    })
    .sort((a, b) => Number(b.ultimo && b.ultimo.creado || 0) - Number(a.ultimo && a.ultimo.creado || 0));
}

/** Valida el formulario de envío. Devuelve un texto de error o ''. */
export function validarMensaje({ destinatario, asunto, contenido }) {
  if (!normalizarEmail(destinatario)) return 'Elegí a quién enviar el mensaje.';
  if (!String(contenido || '').trim()) return 'El mensaje está vacío.';
  if (String(contenido || '').length > 4000) return 'El mensaje es demasiado largo (máx. 4000 caracteres).';
  if (String(asunto || '').length > 160) return 'El asunto es demasiado largo (máx. 160 caracteres).';
  return '';
}

/** Filtra contactos por texto (nombre o email). */
export function filtrarContactos(contactos, texto) {
  const q = String(texto || '').trim().toLowerCase();
  if (!q) return Array.isArray(contactos) ? contactos.slice() : [];
  return (Array.isArray(contactos) ? contactos : []).filter(
    (c) =>
      String(c && c.nombre || '').toLowerCase().includes(q) ||
      String(c && c.email || '').toLowerCase().includes(q),
  );
}
