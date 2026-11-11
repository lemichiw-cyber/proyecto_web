/* ===================================================================
   foro-utils.js — Lógica pura del foro tipo Reddit
   Sin DOM ni localStorage: se puede probar de forma aislada.
   =================================================================== */

import { escapeHtml } from '../../utils/escape.js';

/* Comunidades (equivalente a "subreddits" del foro académico). */
export const COMUNIDADES = [
  { id: 'general', nombre: 'General', icono: '💬', color: '#8b5cf6', desc: 'Conversación abierta de la comunidad.' },
  { id: 'matematicas', nombre: 'Matemáticas', icono: '📐', color: '#2563eb', desc: 'Álgebra, geometría, cálculo y lógica.' },
  { id: 'fisica', nombre: 'Física', icono: '🧪', color: '#0ea5e9', desc: 'Mecánica, energía, ondas y electricidad.' },
  { id: 'quimica', nombre: 'Química', icono: '⚗️', color: '#14b8a6', desc: 'Materia, reacciones y laboratorio.' },
  { id: 'biologia', nombre: 'Biología', icono: '🧬', color: '#22c55e', desc: 'Seres vivos, salud y medio ambiente.' },
  { id: 'literatura', nombre: 'Literatura', icono: '📖', color: '#ec4899', desc: 'Lectura, escritura y análisis de textos.' },
  { id: 'historia', nombre: 'Historia', icono: '🏛️', color: '#f59e0b', desc: 'Pasado, sociedad y patrimonio.' },
  { id: 'ingles', nombre: 'Inglés', icono: '🌎', color: '#f97316', desc: 'Grammar, vocabulary and conversation.' },
  { id: 'tecnologia', nombre: 'Tecnología', icono: '💻', color: '#64748b', desc: 'Programación, robótica y herramientas digitales.' },
  { id: 'ayuda', nombre: 'Ayuda y estudio', icono: '🤝', color: '#06b6d4', desc: 'Consejos, apuntes y apoyo entre compañeros.' },
];

export const TIPOS = {
  discusion: { id: 'discusion', nombre: 'Discusión', icono: '💬', clase: 'fr-tipo-discusion' },
  pregunta: { id: 'pregunta', nombre: 'Pregunta', icono: '❓', clase: 'fr-tipo-pregunta' },
  recurso: { id: 'recurso', nombre: 'Recurso', icono: '📚', clase: 'fr-tipo-recurso' },
  anuncio: { id: 'anuncio', nombre: 'Anuncio', icono: '📢', clase: 'fr-tipo-anuncio' },
};

export const ESTADOS = {
  abierto: { id: 'abierto', nombre: 'Abierto', clase: 'fr-estado-abierto' },
  resuelto: { id: 'resuelto', nombre: 'Resuelto', clase: 'fr-estado-resuelto' },
  cerrado: { id: 'cerrado', nombre: 'Cerrado', clase: 'fr-estado-cerrado' },
};

export const ORDENES = [
  { id: 'hot', nombre: '🔥 Popular', desc: 'Lo que está despegando ahora' },
  { id: 'nuevo', nombre: '🕐 Nuevo', desc: 'Lo más reciente primero' },
  { id: 'top', nombre: '🏆 Mejor', desc: 'Los temas con más votos' },
  { id: 'controversial', nombre: '⚡ Polémico', desc: 'Opiniones divididas' },
];

export const FILTROS = [
  { id: 'todos', nombre: 'Todo', icono: '🏠' },
  { id: 'guardados', nombre: 'Guardados', icono: '🔖' },
  { id: 'mios', nombre: 'Mis temas', icono: '👤' },
  { id: 'sinresponder', nombre: 'Sin responder', icono: '🫥' },
  { id: 'resueltos', nombre: 'Resueltos', icono: '✅' },
  { id: 'reportados', nombre: 'Reportados', icono: '⚠️', soloModerador: true },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ---------- Identidad y votos ---------- */

export function uid(prefijo) {
  return String(prefijo || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function normalizaEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function claveUsuario(usuario) {
  if (!usuario) return '';
  return normalizaEmail(usuario.email) || normalizaEmail(usuario.nombre);
}

/** Convierte votos viejos/parciales a un mapa { usuario: 1 | -1 }. */
export function normalizarVotos(votos) {
  var mapa = {};
  if (!votos || typeof votos !== 'object' || Array.isArray(votos)) return mapa;
  Object.keys(votos).forEach(function (clave) {
    var v = votos[clave];
    if (v === 1 || v === 'up' || v === true) mapa[clave] = 1;
    else if (v === -1 || v === 'down') mapa[clave] = -1;
  });
  return mapa;
}

export function votoUsuario(votos, usuario) {
  var clave = claveUsuario(usuario);
  if (!clave) return 0;
  var mapa = normalizarVotos(votos);
  return mapa[clave] || 0;
}

export function puntajeVotos(votos) {
  var mapa = normalizarVotos(votos);
  return Object.keys(mapa).reduce(function (total, clave) { return total + mapa[clave]; }, 0);
}

export function conteoVotos(votos) {
  var mapa = normalizarVotos(votos);
  var up = 0;
  var down = 0;
  Object.keys(mapa).forEach(function (clave) {
    if (mapa[clave] > 0) up++;
    else if (mapa[clave] < 0) down++;
  });
  return { up: up, down: down, total: up + down, puntaje: up - down };
}

/**
 * Aplica/retira un voto. Devuelve un mapa nuevo (no muta el original).
 * @param {object} votos
 * @param {object} usuario
 * @param {1|-1} valor
 */
export function alternarVoto(votos, usuario, valor) {
  var clave = claveUsuario(usuario);
  var mapa = normalizarVotos(votos);
  if (!clave) return mapa;
  if (mapa[clave] === valor) delete mapa[clave];
  else mapa[clave] = valor;
  return mapa;
}

export function controversiaVotos(votos) {
  var c = conteoVotos(votos);
  if (c.total < 2) return 0;
  return c.total / (Math.abs(c.up - c.down) + 1);
}

/* ---------- Comentarios (árbol recursivo) ---------- */

export function contarComentarios(lista) {
  if (!Array.isArray(lista)) return 0;
  return lista.reduce(function (total, comentario) {
    return total + 1 + contarComentarios(comentario && comentario.respuestas);
  }, 0);
}

export function contarAceptadas(lista) {
  if (!Array.isArray(lista)) return 0;
  return lista.reduce(function (total, comentario) {
    return total + (comentario && comentario.aceptada ? 1 : 0) + contarAceptadas(comentario && comentario.respuestas);
  }, 0);
}

export function buscarComentario(lista, id) {
  if (!Array.isArray(lista) || !id) return null;
  for (var i = 0; i < lista.length; i++) {
    var c = lista[i];
    if (!c) continue;
    if (c.id === id) return c;
    var encontrado = buscarComentario(c.respuestas, id);
    if (encontrado) return encontrado;
  }
  return null;
}

export function eliminarComentario(lista, id) {
  if (!Array.isArray(lista) || !id) return false;
  for (var i = 0; i < lista.length; i++) {
    if (lista[i] && lista[i].id === id) {
      lista.splice(i, 1);
      return true;
    }
    if (lista[i] && eliminarComentario(lista[i].respuestas, id)) return true;
  }
  return false;
}

export function todosLosComentarios(lista, salida) {
  var resultado = salida || [];
  if (!Array.isArray(lista)) return resultado;
  lista.forEach(function (c) {
    if (!c) return;
    resultado.push(c);
    todosLosComentarios(c.respuestas, resultado);
  });
  return resultado;
}

function fechaMs(valor) {
  var ms = new Date(valor || 0).getTime();
  return isNaN(ms) ? 0 : ms;
}

/** Ordena comentarios sin mutar el árbol original. */
export function ordenarComentarios(lista, modo) {
  if (!Array.isArray(lista)) return [];
  var copia = lista.slice();
  copia.sort(function (a, b) {
    if (!a || !b) return 0;
    if (modo === 'nuevo') return fechaMs(b.fecha) - fechaMs(a.fecha);
    if (modo === 'viejo') return fechaMs(a.fecha) - fechaMs(b.fecha);
    if (modo === 'controversial') {
      var diferencia = controversiaVotos(b.votos) - controversiaVotos(a.votos);
      if (diferencia !== 0) return diferencia;
    }
    var aceptada = (b.aceptada ? 1 : 0) - (a.aceptada ? 1 : 0);
    if (aceptada !== 0) return aceptada;
    var puntos = puntajeVotos(b.votos) - puntajeVotos(a.votos);
    if (puntos !== 0) return puntos;
    return fechaMs(a.fecha) - fechaMs(b.fecha);
  });
  copia.forEach(function (c) {
    if (c && Array.isArray(c.respuestas)) c.respuestas = ordenarComentarios(c.respuestas, modo);
  });
  return copia;
}

/* ---------- Publicaciones ---------- */

export function comunidadPorId(id) {
  var buscado = String(id || 'general').toLowerCase();
  return COMUNIDADES.find(function (c) { return c.id === buscado; }) || COMUNIDADES[0];
}

export function tipoPorId(id) {
  return TIPOS[id] || TIPOS.discusion;
}

export function estadoPorId(id) {
  return ESTADOS[id] || ESTADOS.abierto;
}

export function puntajePost(post) {
  var puntos = puntajeVotos(post && post.votos);
  if (post && post.estado === 'resuelto') puntos += 1;
  return puntos;
}

/** Puntuación tipo "hot" de Reddit: puntos y comentarios con decaimiento temporal. */
export function hotScore(post, ahoraMs) {
  var ahora = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
  var puntos = puntajePost(post) + contarComentarios(post && post.mensajes) * 1.7;
  var horas = Math.max(0, (ahora - fechaMs(post && post.creada)) / 3600000);
  return puntos / Math.pow(horas + 2, 1.35);
}

export function ordenarForos(lista, modo, ahoraMs) {
  var copia = Array.isArray(lista) ? lista.slice() : [];
  copia.sort(function (a, b) {
    if (!a || !b) return 0;
    if (Boolean(a.fijado) !== Boolean(b.fijado)) return a.fijado ? -1 : 1;
    if (modo === 'nuevo') return fechaMs(b.creada) - fechaMs(a.creada);
    if (modo === 'top' || modo === 'mejor') {
      var top = puntajePost(b) - puntajePost(a);
      if (top !== 0) return top;
      return fechaMs(b.creada) - fechaMs(a.creada);
    }
    if (modo === 'controversial') {
      var contro = controversiaVotos(b.votos) - controversiaVotos(a.votos);
      if (contro !== 0) return contro;
      return fechaMs(b.creada) - fechaMs(a.creada);
    }
    var caliente = hotScore(b, ahoraMs) - hotScore(a, ahoraMs);
    if (caliente !== 0) return caliente;
    return fechaMs(b.creada) - fechaMs(a.creada);
  });
  return copia;
}

export function foroTieneReportes(post) {
  if (!post) return false;
  if (Array.isArray(post.reportes) && post.reportes.length > 0) return true;
  return todosLosComentarios(post.mensajes).some(function (c) {
    return Array.isArray(c.reportes) && c.reportes.length > 0;
  });
}

/* ---------- Búsqueda y formato ---------- */

function textoComentarios(lista, trozos) {
  if (!Array.isArray(lista)) return trozos;
  lista.forEach(function (c) {
    if (!c) return;
    trozos.push(String(c.texto || ''));
    textoComentarios(c.respuestas, trozos);
  });
  return trozos;
}

export function buscarForo(post, consulta) {
  var q = String(consulta || '').trim().toLowerCase();
  if (!q || !post) return true;
  var autor = post.autor || {};
  var comunidad = comunidadPorId(post.materia);
  var campos = [
    post.titulo,
    post.desc,
    autor.nombre,
    autor.email,
    comunidad.nombre,
    post.materia,
    (TIPOS[post.tipo] || TIPOS.discusion).nombre,
  ].concat(textoComentarios(post.mensajes, []));
  return campos.some(function (valor) {
    return String(valor || '').toLowerCase().indexOf(q) !== -1;
  });
}

export function formatearNumero(numero) {
  var n = Number(numero) || 0;
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n);
}

export function formatearTiempo(iso, ahoraMs) {
  if (!iso) return '';
  var fecha = new Date(iso);
  var ms = fecha.getTime();
  if (isNaN(ms)) return '';
  var ahora = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
  var segundos = Math.max(0, Math.floor((ahora - ms) / 1000));
  if (segundos < 45) return 'ahora';
  if (segundos < 3600) return 'hace ' + Math.floor(segundos / 60) + ' min';
  if (segundos < 86400) return 'hace ' + Math.floor(segundos / 3600) + ' h';
  if (segundos < 172800) return 'ayer';
  if (segundos < 604800) return 'hace ' + Math.floor(segundos / 86400) + ' d';
  var dia = fecha.getDate();
  var mes = MESES[fecha.getMonth()];
  var anio = fecha.getFullYear() !== new Date(ahora).getFullYear() ? ' ' + fecha.getFullYear() : '';
  return dia + ' ' + mes + anio;
}

export function fechaCompleta(iso) {
  if (!iso) return '';
  var fecha = new Date(iso);
  if (isNaN(fecha.getTime())) return '';
  try {
    return fecha.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return fecha.toLocaleString();
  }
}

export function extraerMenciones(texto) {
  var menciones = [];
  var matches = String(texto || '').match(/(^|[\s(])@([a-zA-Z0-9._-]{2,32})/g) || [];
  matches.forEach(function (m) {
    var nombre = m.replace(/^[\s(]/, '').slice(1);
    if (menciones.indexOf(nombre) < 0) menciones.push(nombre);
  });
  return menciones;
}

function formatoInline(texto) {
  var s = texto;
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/(https?:\/\/[^\s<]+)/g, function (url) {
    var limpia = url.replace(/[.,;:!?)]+$/, '');
    var sufijo = url.slice(limpia.length);
    var visible = limpia.length > 54 ? limpia.slice(0, 51) + '…' : limpia;
    return '<a href="' + limpia + '" target="_blank" rel="noopener noreferrer nofollow">' + visible + '</a>' + sufijo;
  });
  s = s.replace(/(^|[\s(])@([a-zA-Z0-9._-]{2,32})/g, '$1<span class="fr-mencion">@$2</span>');
  return s;
}

/**
 * Markdown mínimo y seguro: escapa primero, luego aplica formato.
 * Soporta **negrita**, *cursiva*, ~~tachado~~, `código`, enlaces,
 * @menciones, citas (>) y viñetas (-).
 */
export function renderizarTexto(texto) {
  if (texto === null || texto === undefined || texto === '') return '';
  var seguro = escapeHtml(String(texto));
  return seguro.split(/\r?\n/).map(function (linea) {
    var limpia = linea.replace(/\s+$/, '');
    if (/^&gt;\s?/.test(limpia)) {
      return '<span class="fr-cita">' + formatoInline(limpia.replace(/^&gt;\s?/, '')) + '</span>';
    }
    if (/^[-•]\s+/.test(limpia)) {
      return '<span class="fr-vineta">• ' + formatoInline(limpia.replace(/^[-•]\s+/, '')) + '</span>';
    }
    return formatoInline(limpia);
  }).join('<br>');
}

/* ---------- Migración de datos ---------- */

function votosNecesitanNormalizacion(votos) {
  if (!votos || typeof votos !== 'object' || Array.isArray(votos)) return true;
  return Object.keys(votos).some(function (clave) {
    var v = votos[clave];
    return !(v === 1 || v === -1);
  });
}

function normalizarComentario(c) {
  var cambios = false;
  if (!c || typeof c !== 'object') return { comentario: null, cambios: true };
  if (!c.id) { c.id = uid('c'); cambios = true; }
  if (!Array.isArray(c.respuestas)) { c.respuestas = []; cambios = true; }
  if (votosNecesitanNormalizacion(c.votos)) { c.votos = normalizarVotos(c.votos); cambios = true; }
  if (!Array.isArray(c.reportes)) { c.reportes = []; cambios = true; }
  if (!Array.isArray(c.archivos)) { c.archivos = []; cambios = true; }
  if (!c.fecha) { c.fecha = new Date().toISOString(); cambios = true; }
  if (!c.autor || typeof c.autor !== 'object') { c.autor = { nombre: 'Anónimo', email: '', rol: '' }; cambios = true; }
  var hijos = [];
  (c.respuestas || []).forEach(function (hijo) {
    var normalizado = normalizarComentario(hijo);
    if (normalizado.comentario) hijos.push(normalizado.comentario);
    if (normalizado.cambios) cambios = true;
  });
  if (hijos.length !== c.respuestas.length) cambios = true;
  c.respuestas = hijos;
  return { comentario: c, cambios: cambios };
}

export function normalizarForo(f) {
  var cambios = false;
  if (!f || typeof f !== 'object') return { foro: null, cambios: true };
  if (!f.id) { f.id = uid('f'); cambios = true; }
  if (!f.titulo) { f.titulo = 'Tema sin título'; cambios = true; }
  if (f.desc === undefined || f.desc === null) { f.desc = f.descripcion || ''; cambios = true; }
  if (!f.materia) { f.materia = 'general'; cambios = true; }
  if (!f.tipo || !TIPOS[f.tipo]) { f.tipo = f.estado === 'resuelto' ? 'pregunta' : 'discusion'; cambios = true; }
  if (!f.estado || !ESTADOS[f.estado]) { f.estado = 'abierto'; cambios = true; }
  if (f.fijado === undefined) { f.fijado = false; cambios = true; }
  if (!f.creada) { f.creada = new Date().toISOString(); cambios = true; }
  if (!f.actualizada) { f.actualizada = f.creada; cambios = true; }
  if (!f.autor || typeof f.autor !== 'object') { f.autor = { nombre: 'Anónimo', email: '', rol: '' }; cambios = true; }
  if (votosNecesitanNormalizacion(f.votos)) { f.votos = normalizarVotos(f.votos); cambios = true; }
  if (!Array.isArray(f.guardados)) { f.guardados = []; cambios = true; }
  if (!Array.isArray(f.reportes)) { f.reportes = []; cambios = true; }
  if (!Array.isArray(f.vistas)) { f.vistas = []; cambios = true; }
  if (!Array.isArray(f.mensajes)) { f.mensajes = []; cambios = true; }
  var mensajes = [];
  (f.mensajes || []).forEach(function (m) {
    var normalizado = normalizarComentario(m);
    if (normalizado.comentario) mensajes.push(normalizado.comentario);
    if (normalizado.cambios) cambios = true;
  });
  if (mensajes.length !== f.mensajes.length) cambios = true;
  f.mensajes = mensajes;
  return { foro: f, cambios: cambios };
}

/** Normaliza un arreglo completo. Devuelve true si hubo cambios que guardar. */
export function migrarForos(lista) {
  if (!Array.isArray(lista)) return false;
  var cambios = false;
  for (var i = lista.length - 1; i >= 0; i--) {
    var normalizado = normalizarForo(lista[i]);
    if (!normalizado.foro) { lista.splice(i, 1); cambios = true; continue; }
    lista[i] = normalizado.foro;
    if (normalizado.cambios) cambios = true;
  }
  return cambios;
}
