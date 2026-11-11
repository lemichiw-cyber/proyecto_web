/* ===================================================================
   foro-app.js — Controlador del foro tipo Reddit de Cherry-Bomb
   - Feed con votos, comunidades, orden, filtros y paginación
   - Hilos con comentarios anidados, respuestas aceptadas y reacciones
   - Compositor con borrador, vista previa y adjuntos persistentes
   - Enlaces compartibles (#foro=id), atajos y diseño multiplataforma
   =================================================================== */

import { escapeHtml } from '../../utils/escape.js';
import {
  COMUNIDADES,
  TIPOS,
  ORDENES,
  FILTROS,
  uid,
  claveUsuario,
  votoUsuario,
  puntajeVotos,
  conteoVotos,
  alternarVoto,
  contarComentarios,
  contarAceptadas,
  buscarComentario,
  eliminarComentario,
  todosLosComentarios,
  ordenarComentarios,
  comunidadPorId,
  tipoPorId,
  estadoPorId,
  puntajePost,
  ordenarForos,
  foroTieneReportes,
  buscarForo,
  formatearNumero,
  formatearTiempo,
  fechaCompleta,
  extraerMenciones,
  renderizarTexto,
  migrarForos,
} from './foro-utils.js';

const CLAVE_FOROS = 'foros';
const CLAVE_PREFERENCIAS = 'foroPreferencias';
const CLAVE_BORRADOR = 'foroBorrador';
const MAX_IMAGEN = 1.2 * 1024 * 1024;
const MAX_ADJUNTOS = 4;

function leerJson(clave, porDefecto) {
  try {
    var valor = JSON.parse(localStorage.getItem(clave) || 'null');
    return valor === null ? porDefecto : valor;
  } catch (e) {
    return porDefecto;
  }
}

function guardarJson(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (e) {
    return false;
  }
}

function textoLimpio(valor) {
  return String(valor || '').trim();
}

function mismoEmail(a, b) {
  return Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function initForos(deps) {
  deps = deps || {};
  var root = document.getElementById('app-foros');
  if (!root) return null;

  var $ = function (id) { return document.getElementById(id); };
  var listaEl = $('foro-lista');
  var detalleEl = $('foro-detalle');
  var comunidadesEl = $('foro-comunidades');
  var lateralEl = $('foro-lateral');
  var tabsEl = $('foro-orden-tabs');
  var filtrosEl = $('foro-filtros');
  var compositorEl = $('foro-compositor');
  if (!listaEl || !detalleEl) return null;

  var toast = deps.toast || function () {};
  var confirmar = deps.confirmar || function () { return Promise.resolve(true); };
  var preguntar = deps.prompt || function () { return Promise.resolve(null); };
  var getUsuario = deps.getUsuario || function () { return null; };
  var puedeEditar = deps.puedeEditar || function () { return false; };
  var puedeBorrar = deps.puedeBorrar || function () { return false; };
  var puedeModerar = deps.puedeModerar || function () { return false; };
  var rolBadge = deps.rolBadge || function () { return ''; };
  var exigirPermiso = deps.exigirPermiso || function () { return true; };

  var foros = leerJson(CLAVE_FOROS, []);
  if (!Array.isArray(foros)) foros = [];
  if (migrarForos(foros)) guardarForos();

  var prefs = leerJson(CLAVE_PREFERENCIAS, {}) || {};
  var estado = {
    vista: 'lista',
    abierto: null,
    orden: ORDENES.some(function (o) { return o.id === prefs.orden; }) ? prefs.orden : 'hot',
    comunidad: prefs.comunidad || '',
    filtro: 'todos',
    busqueda: '',
    pagina: 1,
    porPagina: prefs.porPagina || 7,
    comentarioOrden: ['best', 'nuevo', 'viejo', 'controversial'].indexOf(prefs.comentarioOrden) >= 0 ? prefs.comentarioOrden : 'best',
    compacto: Boolean(prefs.compacto),
    responderA: null,
    editandoComentario: null,
    compositor: false,
    editandoPost: null,
    colapsados: {},
  };
  var archivosComentario = [];
  var archivosCompositor = [];
  var temporizadorBusqueda = null;
  var temporizadorBorrador = null;

  /* ---------------- Utilidades internas ---------------- */

  function yo() { return getUsuario(); }
  function emailActual() {
    var usuario = yo();
    return usuario ? claveUsuario(usuario) : '';
  }
  function esMio(autor) {
    return Boolean(emailActual()) && mismoEmail(autor && autor.email, emailActual());
  }
  function findPost(id) {
    return foros.find(function (f) { return f.id === id; }) || null;
  }
  function postAbierto() { return findPost(estado.abierto); }
  function usuarioSeguro(autor) {
    var a = autor || {};
    return {
      nombre: textoLimpio(a.nombre) || 'Anónimo',
      email: textoLimpio(a.email),
      rol: textoLimpio(a.rol),
    };
  }
  function nombreUsuario(autor) {
    var nombre = usuarioSeguro(autor).nombre;
    return nombre.indexOf('@') > 0 ? nombre.split('@')[0] : nombre;
  }
  function guardarForos() {
    if (!guardarJson(CLAVE_FOROS, foros)) {
      toast('No hay espacio para guardar el foro. Eliminá adjuntos o exportá tus datos.', 'error');
    }
  }
  function guardarPreferencias() {
    guardarJson(CLAVE_PREFERENCIAS, {
      orden: estado.orden,
      comunidad: estado.comunidad,
      comentarioOrden: estado.comentarioOrden,
      compacto: estado.compacto,
      porPagina: estado.porPagina,
    });
  }
  function guardarBorrador() {
    clearTimeout(temporizadorBorrador);
    temporizadorBorrador = setTimeout(function () {
      if (estado.editandoPost) return;
      guardarJson(CLAVE_BORRADOR, {
        titulo: textoLimpio($('foro-form-titulo') && $('foro-form-titulo').value),
        texto: $('foro-form-texto') ? $('foro-form-texto').value : '',
        materia: $('foro-form-comunidad') ? $('foro-form-comunidad').value : 'general',
        tipo: $('foro-form-tipo') ? $('foro-form-tipo').value : 'discusion',
      });
    }, 260);
  }
  function limpiarBorrador() {
    clearTimeout(temporizadorBorrador);
    try { localStorage.removeItem(CLAVE_BORRADOR); } catch (e) { /* sin storage */ }
  }
  function fechaAhora() { return new Date().toISOString(); }
  function totalParticipaciones(post) {
    return contarComentarios(post && post.mensajes);
  }
  function marcarVista(post) {
    var email = emailActual();
    if (!email) return;
    if (!Array.isArray(post.vistas)) post.vistas = [];
    if (post.vistas.indexOf(email) < 0) {
      post.vistas.push(email);
      guardarForos();
    }
  }
  function estaGuardado(post) {
    var email = emailActual();
    if (!email || !Array.isArray(post.guardados)) return false;
    return post.guardados.indexOf(email) >= 0;
  }
  function alternarGuardado(post) {
    var email = emailActual();
    if (!email) { toast('Iniciá sesión para guardar publicaciones.', 'error'); return; }
    if (!Array.isArray(post.guardados)) post.guardados = [];
    var idx = post.guardados.indexOf(email);
    if (idx >= 0) post.guardados.splice(idx, 1);
    else post.guardados.push(email);
    guardarForos();
  }

  /* ---------------- Filtros, orden y estadísticas ---------------- */

  function listaFiltrada() {
    var email = emailActual();
    return foros.filter(function (post) {
      if (estado.comunidad && post.materia !== estado.comunidad) return false;
      if (estado.filtro === 'guardados') {
        if (!email || !Array.isArray(post.guardados) || post.guardados.indexOf(email) < 0) return false;
      } else if (estado.filtro === 'mios') {
        if (!esMio(post.autor)) return false;
      } else if (estado.filtro === 'sinresponder') {
        if (totalParticipaciones(post) > 0) return false;
      } else if (estado.filtro === 'resueltos') {
        if (post.estado !== 'resuelto') return false;
      } else if (estado.filtro === 'reportados') {
        if (!puedeModerar() || !foroTieneReportes(post)) return false;
      }
      return buscarForo(post, estado.busqueda);
    });
  }

  function contarPorComunidad() {
    var mapa = {};
    foros.forEach(function (post) {
      mapa[post.materia] = (mapa[post.materia] || 0) + 1;
    });
    return mapa;
  }

  function contarFiltro(id) {
    var email = emailActual();
    return foros.filter(function (post) {
      if (estado.comunidad && post.materia !== estado.comunidad) return false;
      if (id === 'guardados') return Boolean(email) && Array.isArray(post.guardados) && post.guardados.indexOf(email) >= 0;
      if (id === 'mios') return esMio(post.autor);
      if (id === 'sinresponder') return totalParticipaciones(post) === 0;
      if (id === 'resueltos') return post.estado === 'resuelto';
      if (id === 'reportados') return foroTieneReportes(post);
      return true;
    }).length;
  }

  function calcularEstadisticas() {
    var comentarios = 0;
    var votos = 0;
    var participantes = {};
    var aportes = {};
    var ahora = Date.now();
    var recientes = 0;

    function registrar(autor, puntos, tipo) {
      var a = usuarioSeguro(autor);
      var clave = claveUsuario(a) || a.nombre;
      if (!clave) return;
      if (!participantes[clave]) {
        participantes[clave] = { nombre: a.nombre, rol: a.rol, email: a.email, puntos: 0, aportes: 0 };
      }
      participantes[clave].puntos += puntos;
      participantes[clave].aportes += 1;
      aportes[tipo] = (aportes[tipo] || 0) + 1;
    }

    foros.forEach(function (post) {
      comentarios += contarComentarios(post.mensajes);
      var votosPost = conteoVotos(post.votos);
      votos += votosPost.total;
      registrar(post.autor, puntajePost(post), 'temas');
      if (ahora - new Date(post.creada || 0).getTime() < 7 * 86400000) recientes++;
      todosLosComentarios(post.mensajes).forEach(function (c) {
        var votosComentario = conteoVotos(c.votos);
        votos += votosComentario.total;
        registrar(c.autor, puntajeVotos(c.votos) + (c.aceptada ? 5 : 0), 'comentarios');
      });
    });

    return {
      publicaciones: foros.length,
      comentarios: comentarios,
      personas: Object.keys(participantes).length,
      votos: votos,
      recientes: recientes,
      participantes: participantes,
    };
  }

  function karmaActual(estadisticas) {
    var email = emailActual();
    if (!email) return { puntos: 0, aportes: 0, temas: 0, comentarios: 0 };
    var datos = estadisticas.participantes[email];
    if (!datos) return { puntos: 0, aportes: 0, temas: 0, comentarios: 0 };
    var temas = foros.filter(function (p) { return esMio(p.autor); }).length;
    return { puntos: datos.puntos, aportes: datos.aportes, temas: temas, comentarios: datos.aportes - temas };
  }

  /* ---------------- Pintado: navegación lateral ---------------- */

  function renderComunidades() {
    if (!comunidadesEl) return;
    var conteo = contarPorComunidad();
    var total = foros.length;
    var email = emailActual();
    var html = '';
    html += '<div class="fr-nav-grupo">Explorar</div>';
    html += '<button type="button" class="fr-nav-item' + (!estado.comunidad && estado.filtro === 'todos' ? ' active' : '') + '" data-accion="comunidad" data-comunidad="" aria-pressed="' + (!estado.comunidad && estado.filtro === 'todos') + '">' +
      '<span class="fr-nav-icono" aria-hidden="true">🏠</span><span class="fr-nav-texto">Inicio</span><span class="fr-nav-cuenta">' + formatearNumero(total) + '</span></button>';

    html += '<div class="fr-nav-grupo">Comunidades</div>';
    html += '<div class="fr-comunidades-lista">';
    COMUNIDADES.forEach(function (comunidad) {
      var activa = estado.comunidad === comunidad.id;
      var cantidad = conteo[comunidad.id] || 0;
      html += '<button type="button" class="fr-nav-item fr-nav-comunidad' + (activa ? ' active' : '') + '" data-accion="comunidad" data-comunidad="' + escapeHtml(comunidad.id) + '" aria-pressed="' + activa + '" title="' + escapeHtml(comunidad.desc) + '">' +
        '<span class="fr-comunidad-icono" style="--fr-comunidad:' + comunidad.color + '">' + comunidad.icono + '</span>' +
        '<span class="fr-nav-texto">' + escapeHtml(comunidad.nombre) + '</span>' +
        '<span class="fr-nav-cuenta">' + formatearNumero(cantidad) + '</span></button>';
    });
    html += '</div>';

    html += '<div class="fr-nav-grupo">Mi actividad</div>';
    FILTROS.forEach(function (filtro) {
      if (filtro.soloModerador && !puedeModerar()) return;
      if (filtro.id === 'todos') return;
      var activo = estado.filtro === filtro.id;
      var cantidad = contarFiltro(filtro.id);
      html += '<button type="button" class="fr-nav-item' + (activo ? ' active' : '') + '" data-accion="filtrar" data-filtro="' + filtro.id + '" aria-pressed="' + activo + '">' +
        '<span class="fr-nav-icono" aria-hidden="true">' + filtro.icono + '</span>' +
        '<span class="fr-nav-texto">' + escapeHtml(filtro.nombre) + '</span>' +
        '<span class="fr-nav-cuenta">' + formatearNumero(cantidad) + '</span></button>';
    });
    if (!email) {
      html += '<div class="fr-nav-nota">Iniciá sesión para guardar temas y votar.</div>';
    }
    comunidadesEl.innerHTML = html;
  }

  /* ---------------- Pintado: pestañas y filtros del feed ---------------- */

  function renderTabs() {
    if (!tabsEl) return;
    tabsEl.innerHTML = ORDENES.map(function (orden) {
      var activo = estado.orden === orden.id;
      return '<button type="button" class="fr-tab' + (activo ? ' active' : '') + '" role="tab" aria-selected="' + activo + '" data-accion="orden" data-orden="' + orden.id + '" title="' + escapeHtml(orden.desc) + '">' +
        escapeHtml(orden.nombre) + '</button>';
    }).join('');
  }

  function renderFiltros() {
    if (!filtrosEl) return;
    filtrosEl.innerHTML = FILTROS.filter(function (filtro) {
      return !(filtro.soloModerador && !puedeModerar());
    }).map(function (filtro) {
      var activo = estado.filtro === filtro.id && (!estado.comunidad || filtro.id !== 'todos');
      var cantidad = contarFiltro(filtro.id);
      return '<button type="button" class="fr-chip' + (activo ? ' active' : '') + '" data-accion="filtrar" data-filtro="' + filtro.id + '" aria-pressed="' + activo + '">' +
        '<span aria-hidden="true">' + filtro.icono + '</span> ' + escapeHtml(filtro.nombre) +
        '<span class="fr-chip-cuenta">' + formatearNumero(cantidad) + '</span></button>';
    }).join('');
  }

  function renderLateral() {
    if (!lateralEl) return;
    var stats = calcularEstadisticas();
    var karma = karmaActual(stats);
    var tendencias = ordenarForos(foros, 'hot').slice(0, 5);
    var top = Object.keys(stats.participantes).map(function (clave) {
      return stats.participantes[clave];
    }).sort(function (a, b) { return b.puntos - a.puntos; }).slice(0, 5);

    var html = '';
    html += '<section class="fr-panel">' +
      '<h3 class="fr-panel-titulo">📈 La comunidad</h3>' +
      '<div class="fr-mini-stats">' +
        '<div><strong>' + formatearNumero(stats.publicaciones) + '</strong><span>publicaciones</span></div>' +
        '<div><strong>' + formatearNumero(stats.comentarios) + '</strong><span>comentarios</span></div>' +
        '<div><strong>' + formatearNumero(stats.personas) + '</strong><span>personas</span></div>' +
        '<div><strong>' + formatearNumero(stats.votos) + '</strong><span>votos</span></div>' +
      '</div>' +
      (stats.recientes ? '<p class="fr-panel-nota">+' + stats.recientes + ' tema' + (stats.recientes === 1 ? '' : 's') + ' esta semana.</p>' : '') +
      '</section>';

    if (karma.aportes > 0) {
      html += '<section class="fr-panel fr-panel-karma">' +
        '<h3 class="fr-panel-titulo">✨ Tu actividad</h3>' +
        '<div class="fr-karma-linea"><span>Karma</span><strong>' + formatearNumero(karma.puntos) + '</strong></div>' +
        '<div class="fr-karma-linea"><span>Temas</span><strong>' + formatearNumero(karma.temas) + '</strong></div>' +
        '<div class="fr-karma-linea"><span>Comentarios</span><strong>' + formatearNumero(Math.max(0, karma.comentarios)) + '</strong></div>' +
        '<button type="button" class="btn btn-outline btn-sm btn-block" data-accion="filtrar" data-filtro="mios">Ver mis temas</button>' +
        '</section>';
    }

    if (tendencias.length) {
      html += '<section class="fr-panel"><h3 class="fr-panel-titulo">🔥 Tendencias</h3><div class="fr-tendencias">' +
        tendencias.map(function (post, indice) {
          return '<button type="button" class="fr-tendencia" data-accion="abrir" data-post-id="' + escapeHtml(post.id) + '">' +
            '<span class="fr-tendencia-num">' + (indice + 1) + '</span>' +
            '<span class="fr-tendencia-texto">' + escapeHtml(post.titulo) + '</span>' +
            '<span class="fr-tendencia-meta">' + formatearNumero(puntajePost(post)) + ' pts</span></button>';
        }).join('') + '</div></section>';
    }

    if (top.length) {
      html += '<section class="fr-panel"><h3 class="fr-panel-titulo">🏅 Top colaboradores</h3><ol class="fr-top">' +
        top.map(function (persona) {
          return '<li><span class="fr-top-avatar" aria-hidden="true">' + escapeHtml(persona.nombre.slice(0, 1).toUpperCase() || '?') + '</span>' +
            '<span class="fr-top-nombre">' + escapeHtml(persona.nombre) + '</span>' +
            '<span class="fr-top-puntos">' + formatearNumero(persona.puntos) + '</span></li>';
        }).join('') + '</ol></section>';
    }

    html += '<section class="fr-panel"><h3 class="fr-panel-titulo">📜 Reglas del foro</h3>' +
      '<ol class="fr-reglas">' +
        '<li>Sé respetuoso: debatí ideas, no personas.</li>' +
        '<li>Publicá en la comunidad correcta y con un título claro.</li>' +
        '<li>Buscá antes de preguntar; usá la lupa.</li>' +
        '<li>Marcá la respuesta que resolvió tu duda.</li>' +
        '<li>No compartas datos personales ni archivos con derechos de autor.</li>' +
      '</ol>' +
      '<div class="fr-panel-acciones">' +
        '<button type="button" class="btn btn-outline btn-sm btn-block" data-accion="exportar">⬇ Exportar CSV</button>' +
        '<span class="fr-atajos">Atajos: <kbd>/</kbd> buscar · <kbd>n</kbd> nuevo</span>' +
      '</div>' +
      '</section>';

    lateralEl.innerHTML = html;
  }

  /* ---------------- Pintado: publicaciones ---------------- */

  function htmlArchivos(archivos) {
    if (!Array.isArray(archivos) || !archivos.length) return '';
    return '<div class="fr-adjuntos">' + archivos.map(function (archivo) {
      var a = archivo || {};
      var nombre = textoLimpio(a.nombre) || 'archivo';
      var tipo = textoLimpio(a.tipo);
      var esImagen = tipo.indexOf('image/') === 0 && /^data:image\//.test(String(a.url || ''));
      if (esImagen) {
        return '<a class="fr-adjunto-img" href="' + escapeHtml(a.url) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(nombre) + '">' +
          '<img src="' + escapeHtml(a.url) + '" alt="' + escapeHtml(nombre) + '" loading="lazy">' +
          '</a>';
      }
      var kb = a.tamano ? Math.max(1, Math.round(a.tamano / 1024)) + ' KB' : '';
      return '<span class="fr-adjunto-chip">📎 ' + escapeHtml(nombre) + (kb ? ' · ' + kb : '') + '</span>';
    }).join('') + '</div>';
  }

  function htmlVotoRail(elemento, tipo, opciones) {
    opciones = opciones || {};
    var usuario = yo();
    var miVoto = votoUsuario(elemento.votos, usuario);
    var puntaje = opciones.puntaje !== undefined ? opciones.puntaje : puntajeVotos(elemento.votos);
    var accion = tipo === 'comentario' ? 'votar-comentario' : 'votar';
    var datos = 'data-accion="' + accion + '" data-post-id="' + escapeHtml(opciones.postId || '') + '"' +
      (opciones.comentarioId ? ' data-cid="' + escapeHtml(opciones.comentarioId) + '"' : '');
    return '<div class="fr-voto-rail' + (opciones.pequeno ? ' fr-voto-rail-sm' : '') + '" role="group" aria-label="Votar">' +
      '<button type="button" class="fr-voto fr-voto-up' + (miVoto === 1 ? ' active' : '') + '" ' + datos + ' data-valor="1" aria-pressed="' + (miVoto === 1) + '" aria-label="Votar a favor" title="Votar a favor">▲</button>' +
      '<span class="fr-score' + (puntaje > 0 ? ' positivo' : (puntaje < 0 ? ' negativo' : '')) + '" title="' + puntaje + ' votos">' + formatearNumero(puntaje) + '</span>' +
      '<button type="button" class="fr-voto fr-voto-down' + (miVoto === -1 ? ' active' : '') + '" ' + datos + ' data-valor="-1" aria-pressed="' + (miVoto === -1) + '" aria-label="Votar en contra" title="Votar en contra">▼</button>' +
      '</div>';
  }

  function htmlPost(post, detalle) {
    var comunidad = comunidadPorId(post.materia);
    var tipo = tipoPorId(post.tipo);
    var estadoPost = estadoPorId(post.estado);
    var autor = usuarioSeguro(post.autor);
    var comentarios = contarComentarios(post.mensajes);
    var reportes = foroTieneReportes(post);
    var moderador = puedeModerar();
    var tituloId = 'foro-titulo-' + post.id;
    var acciones = '';

    acciones += '<button type="button" class="fr-accion" data-accion="abrir" data-post-id="' + escapeHtml(post.id) + '" aria-label="Ver ' + comentarios + ' comentarios">' +
      '💬 ' + formatearNumero(comentarios) + ' comentario' + (comentarios === 1 ? '' : 's') + '</button>';
    acciones += '<button type="button" class="fr-accion' + (estaGuardado(post) ? ' active' : '') + '" data-accion="guardar" data-post-id="' + escapeHtml(post.id) + '" aria-pressed="' + estaGuardado(post) + '">🔖 ' + (estaGuardado(post) ? 'Guardado' : 'Guardar') + '</button>';
    acciones += '<button type="button" class="fr-accion" data-accion="compartir" data-post-id="' + escapeHtml(post.id) + '">🔗 Compartir</button>';
    if (!esMio(autor)) {
      acciones += '<button type="button" class="fr-accion" data-accion="reportar" data-post-id="' + escapeHtml(post.id) + '">⚠ Reportar</button>';
    }
    if (puedeEditar(autor) || esMio(autor)) {
      acciones += '<button type="button" class="fr-accion" data-accion="editar" data-post-id="' + escapeHtml(post.id) + '">✏ Editar</button>';
    }
    if (puedeBorrar(autor) || esMio(autor)) {
      acciones += '<button type="button" class="fr-accion fr-accion-peligro" data-accion="borrar" data-post-id="' + escapeHtml(post.id) + '">🗑 Borrar</button>';
    }
    if (moderador) {
      acciones += '<button type="button" class="fr-accion" data-accion="fijar" data-post-id="' + escapeHtml(post.id) + '">' + (post.fijado ? '📌 Quitar fijado' : '📌 Fijar') + '</button>';
      acciones += '<button type="button" class="fr-accion" data-accion="resolver" data-post-id="' + escapeHtml(post.id) + '">' + (post.estado === 'resuelto' ? '↩ Reabrir' : '✔ Resolver') + '</button>';
      acciones += '<button type="button" class="fr-accion" data-accion="cerrar-post" data-post-id="' + escapeHtml(post.id) + '">' + (post.estado === 'cerrado' ? '🔓 Abrir tema' : '🔒 Cerrar tema') + '</button>';
      if (reportes) acciones += '<span class="fr-reporte-badge">⚠ Con reportes</span>';
    }

    var titulo = detalle
      ? '<h3 class="fr-post-titulo" id="' + escapeHtml(tituloId) + '">' + escapeHtml(post.titulo) + '</h3>'
      : '<h3 class="fr-post-titulo" id="' + escapeHtml(tituloId) + '"><a href="#foro=' + encodeURIComponent(post.id) + '" data-accion="abrir" data-post-id="' + escapeHtml(post.id) + '">' + escapeHtml(post.titulo) + '</a></h3>';

    return '<article class="fr-post' + (detalle ? ' fr-post-detalle' : '') + '" data-post-id="' + escapeHtml(post.id) + '" aria-labelledby="' + escapeHtml(tituloId) + '">' +
      htmlVotoRail(post, 'post', { postId: post.id }) +
      '<div class="fr-post-cuerpo">' +
        '<div class="fr-post-meta">' +
          '<span class="fr-comunidad-punto" style="--fr-comunidad:' + comunidad.color + '"></span>' +
          '<span class="fr-comunidad-nombre">c/' + escapeHtml(comunidad.nombre) + '</span>' +
          '<span class="fr-meta-sep">·</span>' +
          '<span class="fr-post-autor">u/' + escapeHtml(nombreUsuario(autor)) + '</span>' +
          rolBadge(autor.rol) +
          '<span class="fr-meta-sep">·</span>' +
          '<time datetime="' + escapeHtml(post.creada) + '" title="' + escapeHtml(fechaCompleta(post.creada)) + '">' + escapeHtml(formatearTiempo(post.creada)) + '</time>' +
          (post.fijado ? '<span class="fr-pin">📌 Fijado</span>' : '') +
          (post.estado !== 'abierto' ? '<span class="fr-estado ' + estadoPost.clase + '">' + escapeHtml(estadoPost.nombre) + '</span>' : '') +
          '<span class="fr-tipo ' + tipo.clase + '">' + tipo.icono + ' ' + escapeHtml(tipo.nombre) + '</span>' +
        '</div>' +
        titulo +
        (post.desc ? '<div class="fr-post-texto">' + renderizarTexto(post.desc) + '</div>' : '') +
        htmlArchivos(post.archivos) +
        '<div class="fr-post-acciones">' + acciones + '</div>' +
      '</div>' +
    '</article>';
  }

  function renderLista() {
    estado.vista = 'lista';
    estado.abierto = null;
    listaEl.classList.remove('hidden');
    detalleEl.classList.add('hidden');
    detalleEl.innerHTML = '';

    var visibles = listaFiltrada();
    var ordenados = ordenarForos(visibles, estado.orden);
    var total = ordenados.length;
    var totalPaginas = Math.max(1, Math.ceil(total / estado.porPagina));
    if (estado.pagina > totalPaginas) estado.pagina = totalPaginas;
    if (estado.pagina < 1) estado.pagina = 1;
    var inicio = (estado.pagina - 1) * estado.porPagina;
    var pagina = ordenados.slice(inicio, inicio + estado.porPagina);
    var comunidad = estado.comunidad ? comunidadPorId(estado.comunidad) : null;
    var filtro = FILTROS.find(function (f) { return f.id === estado.filtro; }) || FILTROS[0];

    var info = '<div class="fr-feed-info" aria-live="polite">' +
      '<div><span class="fr-feed-titulo">' + (comunidad ? comunidad.icono + ' c/' + escapeHtml(comunidad.nombre) : '🏠 Inicio') + '</span>' +
      '<span class="fr-feed-sub">' + (estado.busqueda ? 'Resultados para «' + escapeHtml(estado.busqueda) + '»' : escapeHtml(filtro.nombre)) + ' · ' + formatearNumero(total) + ' publicación' + (total === 1 ? '' : 'es') + '</span></div>' +
      '<div class="fr-feed-vista">' +
        '<button type="button" class="fr-vista-boton' + (!estado.compacto ? ' active' : '') + '" data-accion="vista" data-compacto="0" aria-pressed="' + (!estado.compacto) + '" aria-label="Vista de tarjetas" title="Vista de tarjetas">▦</button>' +
        '<button type="button" class="fr-vista-boton' + (estado.compacto ? ' active' : '') + '" data-accion="vista" data-compacto="1" aria-pressed="' + (estado.compacto) + '" aria-label="Vista compacta" title="Vista compacta">☰</button>' +
      '</div>' +
      (estado.comunidad || estado.filtro !== 'todos' || estado.busqueda ? '<button type="button" class="fr-limpiar" data-accion="limpiar">✕ Limpiar filtros</button>' : '') +
      '</div>';

    if (!pagina.length) {
      var vacio = '';
      if (foros.length === 0) {
        vacio = '<div class="fr-vacio">' +
          '<div class="fr-vacio-icono" aria-hidden="true">💬</div>' +
          '<h3>Todavía no hay conversaciones</h3>' +
          '<p>Creá la primera publicación o cargá ejemplos para explorar cómo funciona el foro.</p>' +
          '<div class="fr-vacio-acciones">' +
            '<button type="button" class="btn btn-primary btn-sm" data-accion="nuevo">+ Crear publicación</button>' +
            '<button type="button" class="btn btn-outline btn-sm" data-accion="demo">✨ Cargar ejemplos</button>' +
          '</div>' +
          '<p class="fr-vacio-nota">Todo se guarda en este dispositivo. Podés exportar el foro a CSV desde la barra lateral.</p>' +
          '</div>';
      } else {
        vacio = '<div class="fr-vacio">' +
          '<div class="fr-vacio-icono" aria-hidden="true">🔍</div>' +
          '<h3>Sin resultados</h3>' +
          '<p>Ninguna publicación coincide con los filtros activos.</p>' +
          '<div class="fr-vacio-acciones">' +
            '<button type="button" class="btn btn-outline btn-sm" data-accion="limpiar">✕ Limpiar filtros</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-accion="nuevo">+ Crear publicación</button>' +
          '</div>' +
          '</div>';
      }
      listaEl.innerHTML = info + vacio;
      return;
    }

    var paginacion = '';
    if (totalPaginas > 1) {
      paginacion = '<nav class="fr-paginacion" aria-label="Paginación del foro">' +
        '<button type="button" class="btn btn-outline btn-sm" data-accion="pagina" data-pagina="' + (estado.pagina - 1) + '"' + (estado.pagina === 1 ? ' disabled' : '') + '>◄ Anterior</button>' +
        '<span>Página <strong>' + estado.pagina + '</strong> de ' + totalPaginas + '</span>' +
        '<button type="button" class="btn btn-outline btn-sm" data-accion="pagina" data-pagina="' + (estado.pagina + 1) + '"' + (estado.pagina === totalPaginas ? ' disabled' : '') + '>Siguiente ►</button>' +
        '</nav>';
    }

    listaEl.innerHTML = info +
      '<div class="fr-posts' + (estado.compacto ? ' fr-posts-compacto' : '') + '">' +
      pagina.map(function (post) { return htmlPost(post, false); }).join('') +
      '</div>' +
      '<div class="fr-feed-pie">' +
        '<span class="fr-feed-rango">' + (inicio + 1) + '–' + Math.min(inicio + estado.porPagina, total) + ' de ' + total + '</span>' +
        '<button type="button" class="fr-cargar-mas" data-accion="mas">Cargar más publicaciones</button>' +
      '</div>' +
      paginacion;
  }

  /* ---------------- Pintado: detalle del hilo ---------------- */

  function htmlComentario(comentario, post, profundidad) {
    var autor = usuarioSeguro(comentario.autor);
    var colapsado = Boolean(estado.colapsados[comentario.id]);
    var editando = estado.editandoComentario === comentario.id;
    var puedeAceptar = post.tipo === 'pregunta' && (esMio(post.autor) || puedeModerar());
    var esCerrado = post.estado === 'cerrado';
    var respuestas = ordenarComentarios(comentario.respuestas || [], estado.comentarioOrden);
    var acciones = '';

    if (editando) {
      acciones = '<div class="fr-editor-comentario">' +
        '<textarea id="foro-edit-comentario" data-cid="' + escapeHtml(comentario.id) + '" rows="4" aria-label="Editar comentario">' + escapeHtml(comentario.texto || '') + '</textarea>' +
        '<div class="fr-editor-acciones">' +
          '<button type="button" class="btn btn-outline btn-sm" data-accion="cancelar-edicion-comentario">Cancelar</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-accion="guardar-edicion-comentario" data-cid="' + escapeHtml(comentario.id) + '">Guardar cambios</button>' +
        '</div>' +
      '</div>';
    } else {
      if (!esCerrado) {
        acciones += '<button type="button" class="fr-accion fr-accion-mini" data-accion="responder-comentario" data-post-id="' + escapeHtml(post.id) + '" data-cid="' + escapeHtml(comentario.id) + '">↩ Responder</button>';
      }
      acciones += '<button type="button" class="fr-accion fr-accion-mini" data-accion="colapsar" data-cid="' + escapeHtml(comentario.id) + '" aria-expanded="' + !colapsado + '">' + (colapsado ? '＋ Expandir' : '－ Colapsar') + '</button>';
      if (puedeAceptar && !comentario.aceptada) {
        acciones += '<button type="button" class="fr-accion fr-accion-mini fr-accion-ok" data-accion="aceptar" data-post-id="' + escapeHtml(post.id) + '" data-cid="' + escapeHtml(comentario.id) + '">✔ Aceptar respuesta</button>';
      }
      if (comentario.aceptada) {
        acciones += '<button type="button" class="fr-accion fr-accion-mini fr-accion-ok" data-accion="aceptar" data-post-id="' + escapeHtml(post.id) + '" data-cid="' + escapeHtml(comentario.id) + '" title="Quitar marca de respuesta aceptada">✓ Aceptada</button>';
      }
      if (puedeEditar(autor) || esMio(autor)) {
        acciones += '<button type="button" class="fr-accion fr-accion-mini" data-accion="editar-comentario" data-cid="' + escapeHtml(comentario.id) + '">✏ Editar</button>';
      }
      if (puedeBorrar(autor) || esMio(autor)) {
        acciones += '<button type="button" class="fr-accion fr-accion-mini fr-accion-peligro" data-accion="borrar-comentario" data-post-id="' + escapeHtml(post.id) + '" data-cid="' + escapeHtml(comentario.id) + '">🗑 Borrar</button>';
      }
      if (!esMio(autor)) {
        acciones += '<button type="button" class="fr-accion fr-accion-mini" data-accion="reportar-comentario" data-post-id="' + escapeHtml(post.id) + '" data-cid="' + escapeHtml(comentario.id) + '">⚠</button>';
      }
    }

    var hijos = respuestas.map(function (hijo) {
      return htmlComentario(hijo, post, profundidad + 1);
    }).join('');

    return '<div class="fr-comentario' + (colapsado ? ' fr-colapsado' : '') + (comentario.aceptada ? ' fr-aceptada' : '') + '" data-comentario-id="' + escapeHtml(comentario.id) + '" style="--fr-profundidad:' + Math.min(profundidad, 8) + '">' +
      htmlVotoRail(comentario, 'comentario', { postId: post.id, comentarioId: comentario.id, pequeno: true }) +
      '<div class="fr-comentario-cuerpo">' +
        '<div class="fr-comentario-meta">' +
          '<span class="fr-comentario-autor">u/' + escapeHtml(nombreUsuario(autor)) + '</span>' +
          rolBadge(autor.rol) +
          '<span class="fr-meta-sep">·</span>' +
          '<time datetime="' + escapeHtml(comentario.fecha) + '" title="' + escapeHtml(fechaCompleta(comentario.fecha)) + '">' + escapeHtml(formatearTiempo(comentario.fecha)) + '</time>' +
          (comentario.editado ? '<span class="fr-editado" title="' + escapeHtml(fechaCompleta(comentario.editadoFecha)) + '">editado</span>' : '') +
          (comentario.aceptada ? '<span class="fr-aceptada-badge">✓ Respuesta aceptada</span>' : '') +
          (foroTieneReportes({ mensajes: [comentario] }) && puedeModerar() ? '<span class="fr-reporte-badge">⚠ reportado</span>' : '') +
        '</div>' +
        (colapsado
          ? '<button type="button" class="fr-colapsado-resumen" data-accion="colapsar" data-cid="' + escapeHtml(comentario.id) + '">Comentario colapsado · ' + (contarComentarios(comentario.respuestas) + 1) + ' mensaje' + (contarComentarios(comentario.respuestas) === 0 ? '' : 's') + ' · mostrar</button>'
          : '<div class="fr-comentario-texto">' + renderizarTexto(comentario.texto) + '</div>' +
            htmlArchivos(comentario.archivos) +
            '<div class="fr-comentario-acciones">' + acciones + '</div>' +
            (hijos ? '<div class="fr-comentario-hijos">' + hijos + '</div>' : '')) +
      '</div>' +
    '</div>';
  }

  function renderDetalle() {
    var post = postAbierto();
    if (!post) {
      estado.vista = 'lista';
      estado.abierto = null;
      renderLista();
      return;
    }
    marcarVista(post);
    listaEl.classList.add('hidden');
    detalleEl.classList.remove('hidden');

    var comentarios = ordenarComentarios(post.mensajes || [], estado.comentarioOrden);
    var totalComentarios = contarComentarios(post.mensajes);
    var aceptadas = contarAceptadas(post.mensajes);
    var usuario = yo();
    var cerrado = post.estado === 'cerrado';
    var respondiendo = estado.responderA && estado.responderA.postId === post.id
      ? buscarComentario(post.mensajes, estado.responderA.comentarioId)
      : null;

    var selectorOrden = '<label class="fr-orden-comentarios">Ordenar por ' +
      '<select id="foro-comentario-orden" aria-label="Ordenar comentarios">' +
        '<option value="best"' + (estado.comentarioOrden === 'best' ? ' selected' : '') + '>Mejor</option>' +
        '<option value="nuevo"' + (estado.comentarioOrden === 'nuevo' ? ' selected' : '') + '>Nuevo</option>' +
        '<option value="viejo"' + (estado.comentarioOrden === 'viejo' ? ' selected' : '') + '>Viejo</option>' +
        '<option value="controversial"' + (estado.comentarioOrden === 'controversial' ? ' selected' : '') + '>Polémico</option>' +
      '</select></label>';

    var arbol = comentarios.length
      ? comentarios.map(function (c) { return htmlComentario(c, post, 0); }).join('')
      : '<div class="fr-sin-comentarios">Todavía no hay comentarios. Sé el primero en participar.</div>';

    var compositorComentario = '';
    if (cerrado) {
      compositorComentario = '<div class="fr-cerrado-aviso">🔒 Este tema está cerrado. Podés leerlo, pero no agregar comentarios.</div>';
    } else if (!usuario) {
      compositorComentario = '<div class="fr-cerrado-aviso">Iniciá sesión para responder en el foro.</div>';
    } else {
      compositorComentario = '<div class="fr-comentar" id="foro-comentar">' +
        '<div class="fr-comentar-cab">' +
          '<strong>Tu comentario</strong>' +
          (respondiendo ? '<span class="fr-respondiendo" id="foro-respondiendo">Respondiendo a u/' + escapeHtml(nombreUsuario(respondiendo.autor)) + ' <button type="button" class="fr-cancelar-respuesta" data-accion="cancelar-respuesta" aria-label="Cancelar respuesta">✕</button></span>' : '') +
        '</div>' +
        '<textarea id="foro-texto" rows="4" maxlength="5000" placeholder="Aportá algo útil. Podés usar **negrita**, *cursiva*, `código`, > citas, - viñetas y @menciones." aria-label="Tu comentario"></textarea>' +
        '<div class="fr-comentar-adjuntos" id="foro-archivos"></div>' +
        '<div class="fr-comentar-pie">' +
          '<label class="fr-adjuntar" title="Adjuntar imágenes (máx. 1,2 MB c/u)">📎 Adjuntar<input type="file" id="foro-archivo" accept="image/*,.pdf,.doc,.docx,.txt" multiple></label>' +
          '<span class="fr-contador" id="foro-contador-comentario">0/5000</span>' +
          '<button type="button" class="btn btn-primary btn-sm" id="foro-publicar" data-accion="publicar-comentario">Publicar comentario</button>' +
        '</div>' +
      '</div>';
    }

    detalleEl.innerHTML =
      '<div class="fr-detalle-barra">' +
        '<button type="button" class="btn btn-outline btn-sm" data-accion="volver">← Volver al feed</button>' +
        '<div class="fr-detalle-acciones">' +
          '<button type="button" class="fr-accion" data-accion="guardar" data-post-id="' + escapeHtml(post.id) + '">🔖 ' + (estaGuardado(post) ? 'Guardado' : 'Guardar') + '</button>' +
          '<button type="button" class="fr-accion" data-accion="compartir" data-post-id="' + escapeHtml(post.id) + '">🔗 Compartir</button>' +
        '</div>' +
      '</div>' +
      htmlPost(post, true) +
      '<section class="fr-hilo" aria-label="Comentarios">' +
        '<div class="fr-hilo-cab">' +
          '<h3>' + formatearNumero(totalComentarios) + ' comentario' + (totalComentarios === 1 ? '' : 's') + (aceptadas ? ' · ' + aceptadas + ' aceptado' + (aceptadas === 1 ? '' : 's') : '') + '</h3>' +
          selectorOrden +
        '</div>' +
        '<div class="fr-comentarios">' + arbol + '</div>' +
        compositorComentario +
      '</section>';

    if (usuario) {
      var texto = $('foro-texto');
      if (texto) {
        texto.addEventListener('input', function () { actualizarContadorComentario(this); });
        actualizarContadorComentario(texto);
      }
    }
    renderArchivosComentario();
  }

  function actualizarContadorComentario(textarea) {
    var contador = $('foro-contador-comentario');
    if (!contador || !textarea) return;
    contador.textContent = String(textarea.value.length) + '/5000';
    contador.classList.toggle('fr-contador-alto', textarea.value.length > 4800);
  }

  function renderArchivosComentario() {
    var contenedor = $('foro-archivos');
    if (!contenedor) return;
    if (!archivosComentario.length) {
      contenedor.innerHTML = '';
      return;
    }
    contenedor.innerHTML = archivosComentario.map(function (archivo, indice) {
      var esImagen = String(archivo.tipo || '').indexOf('image/') === 0 && archivo.url;
      return '<span class="fr-adjunto-pendiente" title="' + escapeHtml(archivo.nombre) + '">' +
        (esImagen ? '<img src="' + escapeHtml(archivo.url) + '" alt="" loading="lazy">' : '📎') +
        '<span class="fr-adjunto-nombre">' + escapeHtml(archivo.nombre) + '</span>' +
        '<button type="button" data-accion="quitar-archivo-comentario" data-indice="' + indice + '" aria-label="Quitar ' + escapeHtml(archivo.nombre) + '">✕</button>' +
        '</span>';
    }).join('');
  }

  /* ---------------- Compositor de publicaciones ---------------- */

  function llenarSelect(select, opciones, valor) {
    if (!select) return;
    select.innerHTML = opciones.map(function (opcion) {
      return '<option value="' + escapeHtml(opcion.id) + '"' + (opcion.id === valor ? ' selected' : '') + '>' +
        (opcion.icono ? opcion.icono + ' ' : '') + escapeHtml(opcion.nombre) + '</option>';
    }).join('');
  }

  function renderArchivosCompositor() {
    var contenedor = $('foro-form-archivos');
    if (!contenedor) return;
    if (!archivosCompositor.length) {
      contenedor.innerHTML = '<span class="fr-form-ayuda">Sin adjuntos. Las imágenes se guardan en el dispositivo (máx. 1,2 MB).</span>';
      return;
    }
    contenedor.innerHTML = archivosCompositor.map(function (archivo, indice) {
      var esImagen = String(archivo.tipo || '').indexOf('image/') === 0 && archivo.url;
      return '<span class="fr-adjunto-pendiente" title="' + escapeHtml(archivo.nombre) + '">' +
        (esImagen ? '<img src="' + escapeHtml(archivo.url) + '" alt="" loading="lazy">' : '📎') +
        '<span class="fr-adjunto-nombre">' + escapeHtml(archivo.nombre) + '</span>' +
        '<button type="button" data-accion="quitar-archivo-compositor" data-indice="' + indice + '" aria-label="Quitar ' + escapeHtml(archivo.nombre) + '">✕</button>' +
        '</span>';
    }).join('');
  }

  function actualizarContadorPost() {
    var texto = $('foro-form-texto');
    var contador = $('foro-form-contador');
    if (!texto || !contador) return;
    contador.textContent = String(texto.value.length) + '/5000';
    contador.classList.toggle('fr-contador-alto', texto.value.length > 4800);
  }

  function abrirCompositor(editandoId) {
    if (!yo()) {
      toast('Iniciá sesión para publicar en el foro.', 'error');
      return;
    }
    var post = editandoId ? findPost(editandoId) : null;
    if (editandoId && !post) return;
    if (editandoId && !(puedeEditar(post.autor) || esMio(post.autor))) {
      toast('No podés editar esta publicación.', 'error');
      return;
    }

    estado.compositor = true;
    estado.editandoPost = post ? post.id : null;
    if (compositorEl) compositorEl.classList.remove('hidden');
    var titulo = $('foro-form-titulo');
    var cuerpo = $('foro-form-texto');
    var boton = $('foro-form-publicar');
    var cabecera = $('foro-compositor-titulo');

    llenarSelect($('foro-form-comunidad'), COMUNIDADES.map(function (c) { return { id: c.id, nombre: c.nombre, icono: c.icono }; }), post ? post.materia : 'general');
    llenarSelect($('foro-form-tipo'), Object.keys(TIPOS).map(function (k) { return TIPOS[k]; }), post ? post.tipo : 'discusion');

    if (post) {
      archivosCompositor = Array.isArray(post.archivos) ? post.archivos.slice() : [];
      if (titulo) titulo.value = post.titulo || '';
      if (cuerpo) cuerpo.value = post.desc || '';
      if (cabecera) cabecera.textContent = 'Editar publicación';
      if (boton) boton.textContent = 'Guardar cambios';
    } else {
      var borrador = leerJson(CLAVE_BORRADOR, null) || {};
      archivosCompositor = [];
      if (titulo) titulo.value = borrador.titulo || '';
      if (cuerpo) cuerpo.value = borrador.texto || '';
      if (cabecera) cabecera.textContent = 'Crear publicación';
      if (boton) boton.textContent = 'Publicar';
      if (borrador.materia) {
        var selectComunidad = $('foro-form-comunidad');
        if (selectComunidad) selectComunidad.value = borrador.materia;
      }
      if (borrador.tipo) {
        var selectTipo = $('foro-form-tipo');
        if (selectTipo) selectTipo.value = borrador.tipo;
      }
    }
    var preview = $('foro-form-preview');
    if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
    var botonPreview = $('foro-form-preview-btn');
    if (botonPreview) botonPreview.textContent = '👁 Vista previa';

    renderArchivosCompositor();
    actualizarContadorPost();
    if (compositorEl) compositorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (titulo) setTimeout(function () { titulo.focus(); }, 120);
  }

  function cerrarCompositor() {
    estado.compositor = false;
    estado.editandoPost = null;
    if (compositorEl) compositorEl.classList.add('hidden');
    archivosCompositor = [];
  }

  function alternarPreview() {
    var preview = $('foro-form-preview');
    var boton = $('foro-form-preview-btn');
    var cuerpo = $('foro-form-texto');
    if (!preview || !cuerpo) return;
    if (preview.classList.contains('hidden')) {
      var texto = cuerpo.value.trim();
      preview.innerHTML = texto ? renderizarTexto(texto) : '<em class="fr-preview-vacio">Nada que previsualizar todavía.</em>';
      preview.classList.remove('hidden');
      if (boton) boton.textContent = '✏ Seguir editando';
    } else {
      preview.classList.add('hidden');
      preview.innerHTML = '';
      if (boton) boton.textContent = '👁 Vista previa';
    }
  }

  /* ---------------- Archivos ---------------- */

  function leerArchivos(files, maximo, alTerminar) {
    var lista = Array.prototype.slice.call(files || []).slice(0, maximo);
    if (!lista.length) { alTerminar([]); return; }
    var salida = new Array(lista.length);
    var pendientes = lista.length;
    var errores = [];

    function terminar() {
      pendientes--;
      if (pendientes > 0) return;
      var limpios = salida.filter(Boolean);
      alTerminar(limpios);
      if (errores.length) toast(errores[0], 'error');
    }

    lista.forEach(function (file, indice) {
      var esImagen = String(file.type || '').indexOf('image/') === 0;
      if (esImagen && file.size > MAX_IMAGEN) {
        errores.push('«' + file.name + '» supera 1,2 MB. Comprimila antes de subirla.');
        terminar();
        return;
      }
      if (esImagen) {
        var lector = new FileReader();
        lector.onload = function () {
          salida[indice] = { nombre: file.name, tipo: file.type, tamano: file.size, url: String(lector.result) };
          terminar();
        };
        lector.onerror = function () {
          errores.push('No se pudo leer «' + file.name + '».');
          terminar();
        };
        lector.readAsDataURL(file);
      } else {
        salida[indice] = { nombre: file.name, tipo: file.type, tamano: file.size };
        terminar();
      }
    });
  }

  function quitarArchivo(lista, indice) {
    if (indice < 0 || indice >= lista.length) return;
    lista.splice(indice, 1);
  }

  /* ---------------- Acciones sobre publicaciones ---------------- */

  async function reportarPost(post) {
    var usuario = yo();
    if (!usuario) { toast('Iniciá sesión para reportar.', 'error'); return; }
    var email = claveUsuario(usuario);
    if (!Array.isArray(post.reportes)) post.reportes = [];
    if (post.reportes.some(function (r) { return mismoEmail(r.email, email); })) {
      toast('Ya reportaste esta publicación.', 'info');
      return;
    }
    var motivo = await preguntar('Motivo del reporte (opcional):', 'Reportar publicación', 'Contenido inapropiado');
    if (motivo === null) return;
    post.reportes.push({ email: email, nombre: usuarioSeguro(usuario).nombre, fecha: fechaAhora(), motivo: textoLimpio(motivo) });
    guardarForos();
    render();
    toast('Publicación reportada. Un moderador la revisará.', 'success');
  }

  async function reportarComentario(post, comentario) {
    var usuario = yo();
    if (!usuario) { toast('Iniciá sesión para reportar.', 'error'); return; }
    var email = claveUsuario(usuario);
    if (!Array.isArray(comentario.reportes)) comentario.reportes = [];
    if (comentario.reportes.some(function (r) { return mismoEmail(r.email, email); })) {
      toast('Ya reportaste este comentario.', 'info');
      return;
    }
    var motivo = await preguntar('Motivo del reporte (opcional):', 'Reportar comentario', 'Contenido inapropiado');
    if (motivo === null) return;
    comentario.reportes.push({ email: email, nombre: usuarioSeguro(usuario).nombre, fecha: fechaAhora(), motivo: textoLimpio(motivo) });
    guardarForos();
    render();
    toast('Comentario reportado. Un moderador lo revisará.', 'success');
  }

  function enlaceCompartir(post) {
    return location.origin + location.pathname + location.search + '#foro=' + encodeURIComponent(post.id);
  }

  async function compartirPost(post) {
    var url = enlaceCompartir(post);
    try {
      if (navigator.share) {
        await navigator.share({ title: post.titulo, text: 'Mirá esta publicación en el foro de Cherry-Bomb', url: url });
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast('Enlace copiado al portapapeles.', 'success');
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    var temporal = document.createElement('textarea');
    temporal.value = url;
    temporal.setAttribute('readonly', '');
    temporal.style.position = 'fixed';
    temporal.style.opacity = '0';
    document.body.appendChild(temporal);
    temporal.select();
    try { document.execCommand('copy'); toast('Enlace copiado al portapapeles.', 'success'); }
    catch (e2) { toast('No se pudo copiar. El enlace es: ' + url, 'info'); }
    document.body.removeChild(temporal);
  }

  async function borrarPost(post) {
    if (!(puedeBorrar(post.autor) || esMio(post.autor))) {
      toast('No podés borrar esta publicación.', 'error');
      return;
    }
    var confirmado = await confirmar('¿Borrar «' + post.titulo + '» y todos sus comentarios? Esta acción no se puede deshacer.', 'Borrar publicación');
    if (!confirmado) return;
    var indice = foros.findIndex(function (f) { return f.id === post.id; });
    if (indice < 0) return;
    foros.splice(indice, 1);
    guardarForos();
    estado.vista = 'lista';
    estado.abierto = null;
    estado.responderA = null;
    limpiarHash();
    render();
    toast('Publicación eliminada.', 'success');
  }

  /* ---------------- Exportación ---------------- */

  function campoCsv(valor) {
    return '"' + String(valor === null || valor === undefined ? '' : valor).replace(/"/g, '""') + '"';
  }

  function exportarCsv() {
    var filas = [['Título', 'Comunidad', 'Tipo', 'Estado', 'Autor', 'Fecha', 'Puntos', 'Comentarios', 'Guardados', 'Reportes']];
    listaFiltrada().forEach(function (post) {
      filas.push([
        post.titulo,
        comunidadPorId(post.materia).nombre,
        tipoPorId(post.tipo).nombre,
        estadoPorId(post.estado).nombre,
        usuarioSeguro(post.autor).nombre,
        post.creada,
        puntajePost(post),
        contarComentarios(post.mensajes),
        (post.guardados || []).length,
        (post.reportes || []).length,
      ]);
    });
    var csv = '\ufeff' + filas.map(function (fila) { return fila.map(campoCsv).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'foro_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
    toast('Foro exportado a CSV.', 'success');
  }

  /* ---------------- Datos de ejemplo ---------------- */

  function votosDemo(positivos, negativos) {
    var mapa = {};
    var i;
    for (i = 0; i < positivos; i++) mapa['demo' + i + '@foro.local'] = 1;
    for (i = 0; i < negativos; i++) mapa['demo_neg' + i + '@foro.local'] = -1;
    return mapa;
  }

  function horasAtras(horas) {
    return new Date(Date.now() - horas * 3600000).toISOString();
  }

  function cargarDemo() {
    if (foros.length) return;
    var ana = { nombre: 'Ana Martínez', email: 'ana@demo.local', rol: 'estudiante' };
    var luis = { nombre: 'Luis Rivera', email: 'luis@demo.local', rol: 'estudiante' };
    var profe = { nombre: 'Profa. Carmen', email: 'carmen@demo.local', rol: 'docente' };
    var sofia = { nombre: 'Sofía López', email: 'sofia@demo.local', rol: 'estudiante' };

    var comentarioAceptado = {
      id: uid('c'), autor: luis, texto: 'Probá factorizar por agrupación: agrupá los dos primeros términos y los dos últimos. **El factor común aparece solo.** 😉', fecha: horasAtras(8), votos: votosDemo(7, 0), respuestas: [], reportes: [], archivos: [], aceptada: true,
    };
    var pregunta = {
      id: uid('f'), titulo: '¿Cómo resuelvo una ecuación cuadrática cuando no factoriza fácil?', desc: 'Estoy practicando para el examen y me trabé con x² - 5x + 3 = 0. ¿Cuál es la forma más rápida de resolverla sin calculadora?',
      materia: 'matematicas', tipo: 'pregunta', estado: 'resuelto', fijado: true, creada: horasAtras(26), actualizada: horasAtras(8),
      autor: ana, votos: votosDemo(12, 1), reportes: [], vistas: ['ana@demo.local', 'luis@demo.local'], guardados: [],
      mensajes: [
        comentarioAceptado,
        {
          id: uid('c'), autor: sofia, texto: 'La fórmula general siempre funciona:\n> x = (-b ± √(b² - 4ac)) / 2a\nSolo tenés que identificar a, b y c con cuidado.',
          fecha: horasAtras(18), votos: votosDemo(5, 0), reportes: [], archivos: [],
          respuestas: [{ id: uid('c'), autor: ana, texto: '¡Gracias! Me sirvió para verificar el resultado. 🙌', fecha: horasAtras(16), votos: votosDemo(2, 0), respuestas: [], reportes: [], archivos: [] }],
        },
      ],
      archivos: [],
    };

    var discusion = {
      id: uid('f'), titulo: '¿Qué libro de literatura recomiendan para empezar?', desc: 'Quiero leer algo que enganche desde el principio y que no sea demasiado largo. Acepto recomendaciones de cualquier género.',
      materia: 'literatura', tipo: 'discusion', estado: 'abierto', fijado: false, creada: horasAtras(6), actualizada: horasAtras(2),
      autor: sofia, votos: votosDemo(9, 2), reportes: [], vistas: [], guardados: [],
      mensajes: [
        { id: uid('c'), autor: luis, texto: '**Crónica de una muerte anunciada** de García Márquez. Es corto, atrapa y da muchísimo para analizar.', fecha: horasAtras(3), votos: votosDemo(6, 0), respuestas: [], reportes: [], archivos: [] },
        { id: uid('c'), autor: profe, texto: 'Depende de lo que busques:\n- Si querés misterio: *El nombre de la rosa*.\n- Si querés algo breve: *El principito*.\n- Si querés realismo mágico: *Pedro Páramo*.\n\n¿Te interesa algún género en particular?', fecha: horasAtras(2), votos: votosDemo(4, 0), respuestas: [], reportes: [], archivos: [] },
      ],
      archivos: [],
    };

    var recurso = {
      id: uid('f'), titulo: 'Guía rápida: cómo citar páginas web sin perder la calma', desc: 'Armé una guía de 5 pasos para citar en formato APA 7.\n1. Autor o institución.\n2. Año de publicación.\n3. Título en cursiva.\n4. URL.\n5. Fecha de consulta.\n\n> Consejo: guardá siempre la URL completa y la fecha en que la visitaste.',
      materia: 'ayuda', tipo: 'recurso', estado: 'abierto', fijado: false, creada: horasAtras(13), actualizada: horasAtras(13),
      autor: profe, votos: votosDemo(15, 0), reportes: [], vistas: [], guardados: [],
      mensajes: [{ id: uid('c'), autor: ana, texto: 'La parte de la fecha de consulta me salvó en el último trabajo. ¡Gracias por compartir!', fecha: horasAtras(10), votos: votosDemo(3, 0), respuestas: [], reportes: [], archivos: [] }],
      archivos: [],
    };

    var anuncio = {
      id: uid('f'), titulo: 'Recordatorio: la feria de ciencias es el próximo viernes', desc: 'Los proyectos se presentan en el gimnasio a las 9:00. Cada equipo debe llevar su cartel y una copia impresa del resumen. Si tienen dudas, pregunten en el grupo de Ayuda y estudio.',
      materia: 'general', tipo: 'anuncio', estado: 'abierto', fijado: false, creada: horasAtras(1), actualizada: horasAtras(1),
      autor: profe, votos: votosDemo(4, 0), reportes: [], vistas: [], guardados: [],
      mensajes: [], archivos: [],
    };

    foros.push(anuncio, pregunta, discusion, recurso);
    guardarForos();
    render();
    toast('Se cargaron 4 publicaciones de ejemplo. Podés borrarlas cuando quieras.', 'success');
  }

  /* ---------------- Hash / enlaces compartibles ---------------- */

  function idDesdeHash() {
    var match = /^#foro=(.+)$/.exec(location.hash || '');
    if (!match) return '';
    try { return decodeURIComponent(match[1]); } catch (e) { return ''; }
  }

  function actualizarHash(id) {
    try {
      if (id) history.replaceState(null, '', '#foro=' + encodeURIComponent(id));
      else history.replaceState(null, '', location.pathname + location.search);
    } catch (e) { /* navegador sin history */ }
  }

  function limpiarHash() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* sin history */ }
  }

  function abrirPorId(id, opciones) {
    opciones = opciones || {};
    var post = findPost(id);
    if (!post) return false;
    estado.vista = 'detalle';
    estado.abierto = post.id;
    estado.responderA = null;
    estado.editandoComentario = null;
    estado.colapsados = {};
    archivosComentario = [];
    if (opciones.hash !== false) actualizarHash(post.id);
    render();
    if (compositorEl && estado.compositor) cerrarCompositor();
    return true;
  }

  function cerrarDetalle() {
    estado.vista = 'lista';
    estado.abierto = null;
    estado.responderA = null;
    estado.editandoComentario = null;
    limpiarHash();
    render();
  }

  /* ---------------- Render principal ---------------- */

  function render() {
    // Conservar el borrador del comentario mientras se repinta la vista.
    var textoComentario = null;
    var textareaActual = $('foro-texto');
    if (textareaActual) textoComentario = textareaActual.value;

    renderComunidades();
    renderTabs();
    renderFiltros();
    renderLateral();
    if (estado.vista === 'detalle' && estado.abierto && findPost(estado.abierto)) {
      renderDetalle();
    } else {
      renderLista();
    }

    if (textoComentario !== null) {
      var nuevoTextarea = $('foro-texto');
      if (nuevoTextarea) {
        nuevoTextarea.value = textoComentario;
        actualizarContadorComentario(nuevoTextarea);
      }
    }
    if (tabsEl) {
      tabsEl.setAttribute('aria-label', 'Ordenar publicaciones');
    }
  }

  /* ---------------- Eventos ---------------- */

  function manejarClick(evento) {
    var objetivo = evento.target.closest('[data-accion]');
    if (!objetivo || !root.contains(objetivo)) return;
    var accion = objetivo.getAttribute('data-accion');
    var postId = objetivo.getAttribute('data-post-id') || '';
    var cid = objetivo.getAttribute('data-cid') || '';
    var post = postId ? findPost(postId) : postAbierto();
    var usuario = yo();

    if (accion === 'abrir') {
      evento.preventDefault();
      if (post) abrirPorId(post.id);
      return;
    }
    if (accion === 'volver') { evento.preventDefault(); cerrarDetalle(); return; }
    if (accion === 'comunidad') {
      estado.comunidad = objetivo.getAttribute('data-comunidad') || '';
      estado.filtro = 'todos';
      estado.pagina = 1;
      guardarPreferencias();
      render();
      return;
    }
    if (accion === 'filtrar') {
      estado.filtro = objetivo.getAttribute('data-filtro') || 'todos';
      estado.pagina = 1;
      render();
      return;
    }
    if (accion === 'orden') {
      estado.orden = objetivo.getAttribute('data-orden') || 'hot';
      estado.pagina = 1;
      guardarPreferencias();
      render();
      return;
    }
    if (accion === 'vista') {
      estado.compacto = objetivo.getAttribute('data-compacto') === '1';
      guardarPreferencias();
      render();
      return;
    }
    if (accion === 'limpiar') {
      estado.comunidad = '';
      estado.filtro = 'todos';
      estado.busqueda = '';
      estado.pagina = 1;
      var buscador = $('foro-buscar');
      if (buscador) buscador.value = '';
      guardarPreferencias();
      render();
      return;
    }
    if (accion === 'pagina') {
      var pagina = parseInt(objetivo.getAttribute('data-pagina'), 10);
      if (pagina > 0) { estado.pagina = pagina; render(); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
    if (accion === 'mas') {
      estado.porPagina += 7;
      guardarPreferencias();
      render();
      return;
    }
    if (accion === 'nuevo') { abrirCompositor(); return; }
    if (accion === 'demo') { cargarDemo(); return; }
    if (accion === 'exportar') { exportarCsv(); return; }
    if (accion === 'cerrar-compositor') { cerrarCompositor(); return; }
    if (accion === 'preview') { alternarPreview(); return; }
    if (accion === 'quitar-archivo-compositor') {
      quitarArchivo(archivosCompositor, parseInt(objetivo.getAttribute('data-indice'), 10));
      renderArchivosCompositor();
      return;
    }
    if (accion === 'quitar-archivo-comentario') {
      quitarArchivo(archivosComentario, parseInt(objetivo.getAttribute('data-indice'), 10));
      renderArchivosComentario();
      return;
    }

    if (!post && accion !== 'volver') return;

    if (accion === 'votar') {
      if (!usuario) { toast('Iniciá sesión para votar.', 'error'); return; }
      post.votos = alternarVoto(post.votos, usuario, parseInt(objetivo.getAttribute('data-valor'), 10));
      guardarForos();
      render();
      return;
    }
    if (accion === 'votar-comentario') {
      if (!usuario) { toast('Iniciá sesión para votar.', 'error'); return; }
      var comentarioVoto = buscarComentario(post.mensajes, cid);
      if (!comentarioVoto) return;
      comentarioVoto.votos = alternarVoto(comentarioVoto.votos, usuario, parseInt(objetivo.getAttribute('data-valor'), 10));
      guardarForos();
      render();
      return;
    }
    if (accion === 'guardar') {
      alternarGuardado(post);
      render();
      return;
    }
    if (accion === 'compartir') { compartirPost(post); return; }
    if (accion === 'reportar') { reportarPost(post); return; }
    if (accion === 'reportar-comentario') {
      var comentarioReporte = buscarComentario(post.mensajes, cid);
      if (comentarioReporte) reportarComentario(post, comentarioReporte);
      return;
    }
    if (accion === 'editar') { abrirCompositor(post.id); return; }
    if (accion === 'borrar') { borrarPost(post); return; }
    if (accion === 'fijar') {
      if (!exigirPermiso('editar')) return;
      post.fijado = !post.fijado;
      guardarForos();
      render();
      toast(post.fijado ? 'Publicación fijada.' : 'Publicación desfijada.', 'success');
      return;
    }
    if (accion === 'resolver') {
      if (!exigirPermiso('editar')) return;
      post.estado = post.estado === 'resuelto' ? 'abierto' : 'resuelto';
      guardarForos();
      render();
      toast(post.estado === 'resuelto' ? 'Tema marcado como resuelto.' : 'Tema reabierto.', 'success');
      return;
    }
    if (accion === 'cerrar-post') {
      if (!exigirPermiso('editar')) return;
      post.estado = post.estado === 'cerrado' ? 'abierto' : 'cerrado';
      guardarForos();
      render();
      toast(post.estado === 'cerrado' ? 'Tema cerrado.' : 'Tema reabierto.', 'success');
      return;
    }
    if (accion === 'responder-comentario') {
      estado.responderA = { postId: post.id, comentarioId: cid };
      render();
      var caja = $('foro-texto');
      if (caja) { caja.focus(); caja.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    if (accion === 'cancelar-respuesta') {
      estado.responderA = null;
      render();
      return;
    }
    if (accion === 'colapsar') {
      if (estado.colapsados[cid]) delete estado.colapsados[cid];
      else estado.colapsados[cid] = true;
      render();
      return;
    }
    if (accion === 'aceptar') {
      var comentarioAceptar = buscarComentario(post.mensajes, cid);
      if (!comentarioAceptar) return;
      if (!(esMio(post.autor) || puedeModerar())) {
        toast('Solo el autor del tema o un moderador puede aceptar respuestas.', 'error');
        return;
      }
      comentarioAceptar.aceptada = !comentarioAceptar.aceptada;
      if (comentarioAceptar.aceptada) post.estado = 'resuelto';
      guardarForos();
      render();
      toast(comentarioAceptar.aceptada ? 'Respuesta aceptada.' : 'Marca de respuesta aceptada retirada.', 'success');
      return;
    }
    if (accion === 'editar-comentario') {
      var comentarioEditar = buscarComentario(post.mensajes, cid);
      if (!comentarioEditar) return;
      if (!(puedeEditar(comentarioEditar.autor) || esMio(comentarioEditar.autor))) {
        toast('No podés editar este comentario.', 'error');
        return;
      }
      estado.editandoComentario = cid;
      render();
      var editor = $('foro-edit-comentario');
      if (editor) { editor.focus(); editor.setSelectionRange(editor.value.length, editor.value.length); }
      return;
    }
    if (accion === 'cancelar-edicion-comentario') {
      estado.editandoComentario = null;
      render();
      return;
    }
    if (accion === 'guardar-edicion-comentario') {
      var comentarioGuardar = buscarComentario(post.mensajes, cid);
      var editorGuardar = $('foro-edit-comentario');
      if (!comentarioGuardar || !editorGuardar) return;
      if (!(puedeEditar(comentarioGuardar.autor) || esMio(comentarioGuardar.autor))) {
        toast('No podés editar este comentario.', 'error');
        return;
      }
      var nuevoTexto = editorGuardar.value.trim();
      if (!nuevoTexto) { toast('El comentario no puede quedar vacío.', 'error'); return; }
      comentarioGuardar.texto = nuevoTexto;
      comentarioGuardar.editado = true;
      comentarioGuardar.editadoFecha = fechaAhora();
      comentarioGuardar.mencionados = extraerMenciones(nuevoTexto);
      estado.editandoComentario = null;
      guardarForos();
      render();
      toast('Comentario actualizado.', 'success');
      return;
    }
    if (accion === 'borrar-comentario') {
      var comentarioBorrar = buscarComentario(post.mensajes, cid);
      if (!comentarioBorrar) return;
      if (!(puedeBorrar(comentarioBorrar.autor) || esMio(comentarioBorrar.autor))) {
        toast('No podés borrar este comentario.', 'error');
        return;
      }
      confirmar('¿Borrar este comentario y todas sus respuestas?', 'Borrar comentario').then(function (si) {
        if (!si) return;
        eliminarComentario(post.mensajes, cid);
        guardarForos();
        render();
        toast('Comentario eliminado.', 'success');
      });
      return;
    }
    if (accion === 'publicar-comentario') { publicarComentario(); return; }
  }

  function publicarComentario() {
    var post = postAbierto();
    var usuario = yo();
    if (!post || !usuario) { toast('Iniciá sesión para comentar.', 'error'); return; }
    if (post.estado === 'cerrado') { toast('Este tema está cerrado.', 'error'); return; }
    var caja = $('foro-texto');
    var texto = caja ? caja.value.trim() : '';
    if (!texto && !archivosComentario.length) {
      toast('Escribí un comentario o adjuntá una imagen.', 'error');
      if (caja) caja.focus();
      return;
    }
    var ahora = fechaAhora();
    var nuevo = {
      id: uid('c'),
      autor: usuarioSeguro(usuario),
      texto: texto,
      fecha: ahora,
      votos: {},
      respuestas: [],
      reportes: [],
      archivos: archivosComentario.slice(),
      mencionados: extraerMenciones(texto),
    };
    if (estado.responderA && estado.responderA.postId === post.id) {
      var destino = buscarComentario(post.mensajes, estado.responderA.comentarioId);
      if (destino) {
        if (!Array.isArray(destino.respuestas)) destino.respuestas = [];
        destino.respuestas.push(nuevo);
      } else {
        post.mensajes.push(nuevo);
      }
    } else {
      post.mensajes.push(nuevo);
    }
    post.actualizada = ahora;
    estado.responderA = null;
    archivosComentario = [];
    if (caja) caja.value = '';
    guardarForos();
    render();
    toast('Comentario publicado.', 'success');
    var nuevoComentario = document.querySelector('[data-accion="abrir"][data-post-id="' + post.id + '"]');
    if (nuevoComentario) nuevoComentario.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function manejarSubmit(evento) {
    if (!evento.target || evento.target.id !== 'foro-form') return;
    evento.preventDefault();
    var usuario = yo();
    if (!usuario) { toast('Iniciá sesión para publicar.', 'error'); return; }
    var titulo = textoLimpio($('foro-form-titulo') && $('foro-form-titulo').value);
    var cuerpo = $('foro-form-texto') ? $('foro-form-texto').value.trim() : '';
    var materia = $('foro-form-comunidad') ? $('foro-form-comunidad').value : 'general';
    var tipo = $('foro-form-tipo') ? $('foro-form-tipo').value : 'discusion';
    if (titulo.length < 3) { toast('El título debe tener al menos 3 caracteres.', 'error'); $('foro-form-titulo') && $('foro-form-titulo').focus(); return; }
    if (titulo.length > 140) { toast('El título no puede superar 140 caracteres.', 'error'); return; }
    if (cuerpo.length > 5000) { toast('El texto no puede superar 5000 caracteres.', 'error'); return; }
    if (!COMUNIDADES.some(function (c) { return c.id === materia; })) materia = 'general';
    if (!TIPOS[tipo]) tipo = 'discusion';
    var ahora = fechaAhora();

    if (estado.editandoPost) {
      var postEditar = findPost(estado.editandoPost);
      if (!postEditar) return;
      if (!(puedeEditar(postEditar.autor) || esMio(postEditar.autor))) {
        toast('No podés editar esta publicación.', 'error');
        return;
      }
      postEditar.titulo = titulo;
      postEditar.desc = cuerpo;
      postEditar.materia = materia;
      postEditar.tipo = tipo;
      postEditar.actualizada = ahora;
      postEditar.editado = true;
      postEditar.editadoFecha = ahora;
      postEditar.archivos = archivosCompositor.slice();
      guardarForos();
      cerrarCompositor();
      render();
      toast('Publicación actualizada.', 'success');
      return;
    }

    var nueva = {
      id: uid('f'),
      titulo: titulo,
      desc: cuerpo,
      materia: materia,
      tipo: tipo,
      estado: 'abierto',
      fijado: false,
      creada: ahora,
      actualizada: ahora,
      autor: usuarioSeguro(usuario),
      votos: {},
      guardados: [],
      reportes: [],
      vistas: [],
      mensajes: [],
      archivos: archivosCompositor.slice(),
    };
    var clave = claveUsuario(usuario);
    if (clave) nueva.votos[clave] = 1;
    foros.push(nueva);
    guardarForos();
    limpiarBorrador();
    cerrarCompositor();
    estado.filtro = 'todos';
    estado.busqueda = '';
    var buscador = $('foro-buscar');
    if (buscador) buscador.value = '';
    actualizarHash(nueva.id);
    abrirPorId(nueva.id, { hash: false });
    toast('Publicación creada.', 'success');
  }

  function manejarInput(evento) {
    var objetivo = evento.target;
    if (!objetivo) return;
    if (objetivo.id === 'foro-buscar') {
      clearTimeout(temporizadorBusqueda);
      temporizadorBusqueda = setTimeout(function () {
        estado.busqueda = objetivo.value;
        estado.pagina = 1;
        render();
      }, 170);
      return;
    }
    if (objetivo.id === 'foro-form-texto') {
      actualizarContadorPost();
      guardarBorrador();
      return;
    }
    if (objetivo.id === 'foro-form-titulo') { guardarBorrador(); return; }
    if (objetivo.id === 'foro-texto') { actualizarContadorComentario(objetivo); return; }
  }

  function manejarChange(evento) {
    var objetivo = evento.target;
    if (!objetivo) return;
    if (objetivo.id === 'foro-comentario-orden') {
      estado.comentarioOrden = objetivo.value;
      guardarPreferencias();
      render();
      return;
    }
    if (objetivo.id === 'foro-form-comunidad' || objetivo.id === 'foro-form-tipo') {
      guardarBorrador();
      return;
    }
    if (objetivo.id === 'foro-form-archivo') {
      leerArchivos(objetivo.files, MAX_ADJUNTOS, function (archivos) {
        archivosCompositor = archivosCompositor.concat(archivos).slice(0, MAX_ADJUNTOS);
        renderArchivosCompositor();
      });
      objetivo.value = '';
      return;
    }
    if (objetivo.id === 'foro-archivo') {
      leerArchivos(objetivo.files, 3, function (archivos) {
        archivosComentario = archivosComentario.concat(archivos).slice(0, 3);
        renderArchivosComentario();
      });
      objetivo.value = '';
    }
  }

  function manejarTeclado(evento) {
    if (root.classList.contains('hidden')) return;
    var objetivo = evento.target;
    var escribiendo = objetivo && (objetivo.tagName === 'INPUT' || objetivo.tagName === 'TEXTAREA' || objetivo.tagName === 'SELECT' || objetivo.isContentEditable);
    if (evento.key === 'Escape') {
      if (estado.compositor) { evento.preventDefault(); cerrarCompositor(); return; }
      if (estado.editandoComentario) { evento.preventDefault(); estado.editandoComentario = null; render(); return; }
      if (estado.vista === 'detalle') { evento.preventDefault(); cerrarDetalle(); return; }
    }
    if (escribiendo || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (evento.key === '/') {
      evento.preventDefault();
      var buscador = $('foro-buscar');
      if (buscador) buscador.focus();
    } else if (evento.key === 'n' || evento.key === 'N') {
      evento.preventDefault();
      abrirCompositor();
    }
  }

  /* ---------------- Arranque ---------------- */

  var botonNuevo = $('foro-btn-nuevo');
  if (botonNuevo) {
    botonNuevo.addEventListener('click', function () { abrirCompositor(); });
  }
  var botonNuevoCabecera = $('btn-foro-add');
  if (botonNuevoCabecera) {
    botonNuevoCabecera.addEventListener('click', function () { abrirCompositor(); });
  }
  var botonCompacto = $('foro-btn-compacto');
  if (botonCompacto) {
    botonCompacto.addEventListener('click', function () {
      estado.compacto = !estado.compacto;
      guardarPreferencias();
      render();
    });
  }

  root.addEventListener('click', manejarClick);
  root.addEventListener('submit', manejarSubmit);
  root.addEventListener('input', manejarInput);
  root.addEventListener('change', manejarChange);
  document.addEventListener('keydown', manejarTeclado);
  window.addEventListener('storage', function (evento) {
    if (evento.key !== CLAVE_FOROS) return;
    var nuevos = leerJson(CLAVE_FOROS, []);
    if (!Array.isArray(nuevos)) return;
    foros = nuevos;
    migrarForos(foros);
    render();
  });

  render();

  var idInicial = idDesdeHash();
  return {
    idInicial: idInicial && findPost(idInicial) ? idInicial : '',
    abrirPorId: abrirPorId,
    refrescar: render,
    irAlFeed: cerrarDetalle,
    abrirCompositor: abrirCompositor,
    idDesdeHash: idDesdeHash,
  };
}
