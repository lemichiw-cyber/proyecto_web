/* ===================================================================
   mensajes-app.js — Bandeja de mensajes con backend real (/api/mensajes).

   Antes los mensajes se guardaban sólo en el dispositivo (localStorage):
   el docente escribía desde su teléfono y el estudiante nunca lo veía.
   Ahora hay backend con autenticación (cookie de sesión).

   Vista: lista de conversaciones a la izquierda + conversación abierta a la
   derecha. Si el backend no responde, la sección avisa y sigue mostrando
   el respaldo local del dispositivo.

   La lógica pura vive en mensajes-utils.js (probable con vitest).
   =================================================================== */

import { escapeHtml } from '../../utils/escape.js';
import {
  apiMensajesBandeja,
  apiMensajesConversacion,
  apiMensajesContactos,
  apiMensajeEnviar,
  apiMensajeBorrar,
} from '../../api-client';
import {
  agruparPorConversacion,
  contarNoLeidos,
  esPropio,
  etiquetaRol,
  fechaCorta,
  filtrarContactos,
  horaCorta,
  iniciales,
  resumen,
  validarMensaje,
} from './mensajes-utils.js';

const CLAVE_LOCAL = 'mensajesItems';

const estado = {
  activo: false,
  conversaciones: [],
  contactos: [],
  abierto: null,        // email del contacto abierto
  mensajes: [],
  cargando: false,
  error: '',
  demo: false,
};

function $(id) {
  return document.getElementById(id);
}

function miEmail() {
  try {
    const s = JSON.parse(localStorage.getItem('cherrybombSession') || 'null');
    if (s && s.email) return String(s.email).trim().toLowerCase();
  } catch (e) { /* storage no disponible */ }
  const w = window.usuarioActual;
  if (w && w.email) return String(w.email).trim().toLowerCase();
  return '';
}

function toast(msg, tipo) {
  if (typeof window.mostrarToast === 'function') {
    window.mostrarToast(msg, tipo || 'success');
    return;
  }
  console.log('[Mensajes]', msg);
}

/* ------------------------------------------------------------------
   Datos
   ------------------------------------------------------------------ */

async function cargarBandeja() {
  estado.cargando = true;
  estado.error = '';
  try {
    const res = await apiMensajesBandeja();
    estado.conversaciones = Array.isArray(res && res.conversaciones) ? res.conversaciones : [];
    estado.demo = false;
    if (estado.abierto) {
      const sigue = estado.conversaciones.some((c) => c.email === estado.abierto);
      if (!sigue) {
        estado.abierto = null;
        estado.mensajes = [];
      }
    }
  } catch (e) {
    estado.error = 'No se pudo conectar con el servidor de mensajes.';
    estado.demo = true;
    estado.conversaciones = conversacionesLocales();
  }
  estado.cargando = false;
  render();
}

async function cargarContactos() {
  try {
    const res = await apiMensajesContactos();
    estado.contactos = Array.isArray(res && res.contactos) ? res.contactos : [];
  } catch (e) {
    estado.contactos = [];
  }
}

async function abrirConversacion(email) {
  estado.abierto = email;
  estado.mensajes = [];
  render();
  try {
    const res = await apiMensajesConversacion(email);
    estado.mensajes = Array.isArray(res && res.mensajes) ? res.mensajes : [];
  } catch (e) {
    estado.mensajes = mensajesLocalesDe(email);
    estado.demo = true;
  }
  render();
  const chat = $('msg-chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

/* Respaldo local (sin backend): los mensajes que el dispositivo tenga. */
function mensajesLocales() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function conversacionesLocales() {
  const mi = miEmail();
  const items = mensajesLocales().map((m, i) => ({
    id: m.id || 'loc-' + i,
    remitente: m.remitente || '',
    destinatario: m.destinatario || '',
    asunto: m.asunto || '(sin asunto)',
    contenido: m.contenido || '',
    creado: m.creado || 0,
    leido: !!m.leido,
  }));
  return agruparPorConversacion(items, mi).map((c) => ({
    email: c.email,
    nombre: c.email,
    rol: '',
    ultimo: c.ultimo,
    no_leidos: c.noLeidos,
    total: c.mensajes.length,
  }));
}

function mensajesLocalesDe(email) {
  const mi = miEmail();
  return agruparPorConversacion(mensajesLocales(), mi)
    .filter((c) => c.email === email)
    .flatMap((c) => c.mensajes);
}

/* ------------------------------------------------------------------
   Render
   ------------------------------------------------------------------ */

function render() {
  const lista = $('msg-lista');
  if (!lista) return;

  if (!estado.conversaciones.length) {
    lista.innerHTML = estado.cargando
      ? '<div class="empty-msg">Cargando…</div>'
      : '<div class="empty-msg" data-icon="✉️"><div class="empty-msg-title">Bandeja vacía</div>' +
        '<div>No tenés conversaciones todavía.</div>' +
        '<div class="empty-msg-desc">Usá “+ Nuevo mensaje” para escribirle a un docente.</div></div>';
  } else {
    lista.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:.4rem;">' +
      estado.conversaciones
        .map((c) => {
          const u = c.ultimo || {};
          const badge = c.no_leidos
            ? '<span class="badge" style="background:var(--primary);color:#fff;margin-left:auto;">' + c.no_leidos + '</span>'
            : '';
          return (
            '<button type="button" class="msg-conv' + (estado.abierto === c.email ? ' active' : '') + '" ' +
            'data-email="' + escapeHtml(c.email) + '" ' +
            'style="display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;padding:.55rem .65rem;background:' +
            (estado.abierto === c.email ? 'var(--gray-100)' : 'var(--gray-50)') + ';border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;">' +
            '<span style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;">' +
            escapeHtml(iniciales(c.nombre || c.email)) +
            '</span>' +
            '<span style="flex:1;min-width:0;">' +
            '<span style="display:flex;align-items:center;gap:.4rem;">' +
            '<strong style="font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(c.nombre || c.email) + '</strong>' +
            '<span style="font-size:.7rem;color:var(--gray-500);margin-left:auto;">' + escapeHtml(fechaCorta(u.creado)) + '</span>' +
            '</span>' +
            '<span style="display:block;font-size:.78rem;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            escapeHtml(resumen(u.contenido || u.asunto || '')) +
            '</span>' +
            '</span>' + badge +
            '</button>'
          );
        })
        .join('') +
      '</div>';
    lista.querySelectorAll('.msg-conv').forEach((btn) => {
      btn.addEventListener('click', () => abrirConversacion(btn.dataset.email));
    });
  }

  renderChat();
  renderForm();
}

function renderChat() {
  const chat = $('msg-chat');
  const titulo = $('msg-chat-titulo');
  if (!chat) return;

  if (!estado.abierto) {
    titulo.textContent = 'Conversación';
    chat.innerHTML =
      '<div class="empty-msg" data-icon="💬"><div class="empty-msg-title">Elegí una conversación</div>' +
      '<div>Seleccioná un contacto de la lista para ver los mensajes.</div></div>';
    return;
  }

  const conv = estado.conversaciones.find((c) => c.email === estado.abierto);
  const nombre = conv ? conv.nombre : estado.abierto;
  const rol = conv ? conv.rol : '';
  titulo.innerHTML =
    escapeHtml(nombre || estado.abierto) +
    (rol ? ' <span style="font-size:.75rem;color:var(--gray-500);font-weight:400;">· ' + escapeHtml(etiquetaRol(rol)) + '</span>' : '');

  if (!estado.mensajes.length) {
    chat.innerHTML = '<div class="empty-msg">Todavía no hay mensajes en esta conversación.</div>';
    return;
  }

  const mi = miEmail();
  chat.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:.5rem;">' +
    estado.mensajes
      .map((m) => {
        const propio = esPropio(m, mi);
        return (
          '<div style="align-self:' + (propio ? 'flex-end' : 'flex-start') + ';max-width:82%;">' +
          '<div style="padding:.5rem .7rem;border-radius:10px;background:' + (propio ? 'var(--primary)' : 'var(--gray-100)') + ';color:' + (propio ? '#fff' : 'var(--gray-800)') + ';">' +
          '<div style="font-weight:600;font-size:.82rem;opacity:.85;">' + escapeHtml(m.asunto || '(sin asunto)') + '</div>' +
          '<div style="font-size:.88rem;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(m.contenido || '') + '</div>' +
          '</div>' +
          '<div style="font-size:.68rem;color:var(--gray-500);text-align:' + (propio ? 'right' : 'left') + ';margin-top:.15rem;">' +
          escapeHtml(horaCorta(m.creado)) + (propio && m.leido ? ' · leído' : '') +
          '</div>' +
          '</div>'
        );
      })
      .join('') +
    '</div>';
}

function renderForm() {
  const form = $('msg-form');
  if (!form) return;
  if (!estado.abierto) {
    form.classList.add('hidden');
    return;
  }
  form.classList.remove('hidden');
  const sel = $('msg-destinatario');
  const asunto = $('msg-asunto');
  const cuerpo = $('msg-cuerpo');
  if (sel && sel.value !== estado.abierto) sel.value = estado.abierto;
  if (cuerpo && document.activeElement !== cuerpo) cuerpo.value = cuerpo.value || '';
  if (asunto && document.activeElement !== asunto) asunto.value = asunto.value || '';
}

/* ------------------------------------------------------------------
   Acciones
   ------------------------------------------------------------------ */

async function enviar() {
  const sel = $('msg-destinatario');
  const asunto = $('msg-asunto');
  const cuerpo = $('msg-cuerpo');
  const destinatario = sel ? sel.value : '';
  const textoAsunto = asunto ? asunto.value : '';
  const textoCuerpo = cuerpo ? cuerpo.value : '';

  const err = validarMensaje({ destinatario, asunto: textoAsunto, contenido: textoCuerpo });
  if (err) {
    toast(err, 'error');
    return;
  }

  try {
    await apiMensajeEnviar(destinatario, textoAsunto, textoCuerpo);
    if (cuerpo) cuerpo.value = '';
    if (asunto) asunto.value = '';
    await cargarBandeja();
    await abrirConversacion(destinatario);
    toast('Mensaje enviado.', 'success');
  } catch (e) {
    // Sin backend: se guarda en el dispositivo (respaldo local).
    const lista = mensajesLocales();
    lista.push({
      id: 'loc-' + Date.now().toString(36),
      remitente: miEmail(),
      remitente_nombre: '',
      destinatario,
      asunto: textoAsunto || '(sin asunto)',
      contenido: textoCuerpo,
      creado: Math.floor(Date.now() / 1000),
      leido: false,
    });
    try {
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify(lista));
    } catch (err2) { /* storage lleno o no disponible */ }
    estado.abierto = destinatario;
    await cargarBandeja();
    toast('Mensaje guardado en el dispositivo (sin conexión).', 'error');
  }
}

async function borrarMensaje(id) {
  if (!estado.abierto) return;
  try {
    await apiMensajeBorrar(id);
  } catch (e) {
    // Sin backend: se quita del respaldo local.
    try {
      const lista = mensajesLocales().filter((m) => m.id !== id);
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify(lista));
    } catch (err2) { /* noop */ }
  }
  await abrirConversacion(estado.abierto);
  await cargarBandeja();
  toast('Mensaje eliminado.', 'success');
}

function nuevoMensaje() {
  const sel = $('msg-destinatario');
  if (!sel) return;
  sel.value = '';
  const cuerpo = $('msg-cuerpo');
  if (cuerpo) cuerpo.focus();
  const chat = $('msg-chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

/* ------------------------------------------------------------------
   Montaje
   ------------------------------------------------------------------ */

function inyectarUI() {
  const seccion = $('app-mensajes');
  if (!seccion) return;
  const cont = seccion.querySelector('.container');
  if (!cont) return;
  if (cont.querySelector('#msg-panel')) return; // ya montada

  const aviso = $('msg-aviso');
  if (aviso) {
    aviso.innerHTML = estado.demo
      ? '<div style="margin-bottom:.75rem;padding:.6rem .8rem;background:var(--amber-light, #fff7ed);border:1px solid var(--amber);border-radius:8px;font-size:.82rem;">' +
        '⚠️ Sin conexión con el servidor: se muestran los mensajes guardados en este dispositivo.</div>'
      : '';
  }

  cont.innerHTML =
    '<h2 class="section-title">Mensajes · Bandeja de entrada</h2>' +
    '<p class="section-sub">Comunicación directa con docentes, compañeros y la familia.</p>' +
    '<div id="msg-aviso"></div>' +
    '<div id="msg-panel" style="display:grid;grid-template-columns:minmax(220px,320px) 1fr;gap:1rem;align-items:start;">' +
      '<div class="card" style="margin:0;">' +
        '<div class="flex-between" style="margin-bottom:.5rem;gap:.5rem;">' +
          '<h3 style="margin:0;font-size:1rem;">Conversaciones</h3>' +
          '<button type="button" id="btn-msg-add" class="btn btn-primary btn-sm">+ Nuevo mensaje</button>' +
        '</div>' +
        '<div id="msg-lista"><div class="empty-msg">Cargando…</div></div>' +
      '</div>' +
      '<div class="card" style="margin:0;">' +
        '<h3 id="msg-chat-titulo" style="margin:0 0 .5rem;font-size:1rem;">Conversación</h3>' +
        '<div id="msg-chat" style="min-height:220px;max-height:46vh;overflow-y:auto;padding:.25rem;">' +
          '<div class="empty-msg">Elegí una conversación.</div>' +
        '</div>' +
        '<div id="msg-form" class="hidden" style="margin-top:.75rem;display:flex;flex-direction:column;gap:.5rem;">' +
          '<div style="display:flex;gap:.5rem;flex-wrap:wrap;">' +
            '<select id="msg-destinatario" style="flex:1;min-width:160px;"></select>' +
            '<input id="msg-asunto" placeholder="Asunto (opcional)" style="flex:1;min-width:140px;">' +
          '</div>' +
          '<textarea id="msg-cuerpo" class="field-ta" rows="3" placeholder="Escribí tu mensaje…"></textarea>' +
          '<div style="display:flex;justify-content:flex-end;gap:.5rem;">' +
            '<button id="msg-enviar" class="btn btn-primary">Enviar</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  const sel = $('msg-destinatario');
  if (sel) {
    sel.innerHTML = '<option value="">— Elegí un destinatario —</option>';
    sel.addEventListener('change', () => {
      if (sel.value) abrirConversacion(sel.value);
    });
  }
  // El botón "+ Nuevo mensaje" lo maneja el módulo (el de app.js queda
  // desconectado al reemplazarse el markup de la sección).
  const btnNuevo = $('btn-msg-add');
  if (btnNuevo) btnNuevo.addEventListener('click', nuevoMensaje);
  const btn = $('msg-enviar');
  if (btn) btn.addEventListener('click', enviar);
  const cuerpo = $('msg-cuerpo');
  if (cuerpo) {
    cuerpo.addEventListener('keydown', (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') enviar();
    });
  }
}

async function rellenarContactos() {
  await cargarContactos();
  const sel = $('msg-destinatario');
  if (!sel) return;
  const actual = sel.value;
  const filtrados = filtrarContactos(estado.contactos, '');
  sel.innerHTML =
    '<option value="">— Elegí un destinatario —</option>' +
    filtrados
      .map(
        (c) =>
          '<option value="' + escapeHtml(c.email) + '">' +
          escapeHtml((c.nombre || c.email) + ' · ' + etiquetaRol(c.rol)) +
          '</option>',
      )
      .join('');
  if (actual) sel.value = actual;
}

/* ------------------------------------------------------------------
   API pública (la usa app.js)
   ------------------------------------------------------------------ */

export async function init() {
  inyectarUI();
  if (estado.activo) {
    await cargarBandeja();
    await rellenarContactos();
    return;
  }
  estado.activo = true;
  await rellenarContactos();
  await cargarBandeja();
}

/* app.js llama a `render()` (repintar la lista) y a `nuevoMensaje()`
   (botón "+ Nuevo mensaje"). Se re-exportan las funciones internas. */
export { render, nuevoMensaje, estado as estadoMensajes };
