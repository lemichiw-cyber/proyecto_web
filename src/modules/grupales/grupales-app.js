/* ===================================================================
   grupales-app.js — Actividades grupales (workspace colaborativo)
   Backend real: /api/grupales. Antes los grupos se guardaban sólo en
   el dispositivo (localStorage) y nadie más los veía.
   =================================================================== */

import { escapeHtml } from '../../utils/escape.js';
import {
  apiGrupalesLista,
  apiGrupalesDetalle,
  apiGrupoCrear,
  apiGrupoMensaje,
  apiGrupoInvitar,
  apiGrupoEntregar,
  apiGrupoBorrar,
} from '../../api-client';
import {
  filtrarGrupos,
  fechaCorta,
  horaCorta,
  etiquetaEstado,
  iniciales,
  resumen,
  validarGrupo,
} from './grupales-utils.js';

const CLAVE_LOCAL = 'gruposItems';

const estado = {
  activo: false,
  grupos: [],
  abierto: null,
  detalle: null,
  cargando: false,
  error: '',
  demo: false,
};

function $(id) { return document.getElementById(id); }

function miEmail() {
  try {
    const s = JSON.parse(localStorage.getItem('cherrybombSession') || 'null');
    if (s && s.email) return String(s.email).trim().toLowerCase();
  } catch (e) { /* noop */ }
  const w = window.usuarioActual;
  if (w && w.email) return String(w.email).trim().toLowerCase();
  return '';
}

function miRol() {
  try {
    const s = JSON.parse(localStorage.getItem('cherrybombSession') || 'null');
    if (s && s.rol) return String(s.rol).trim().toLowerCase();
  } catch (e) { /* noop */ }
  const w = window.usuarioActual;
  if (w && w.rol) return String(w.rol).trim().toLowerCase();
  return '';
}

function toast(msg, tipo) {
  if (typeof window.mostrarToast === 'function') {
    window.mostrarToast(msg, tipo || 'success');
    return;
  }
  console.log('[Grupales]', msg);
}

/* ------------------------------------------------------------------
   Datos
   ------------------------------------------------------------------ */

async function cargarGrupos() {
  estado.cargando = true;
  estado.error = '';
  renderLista();
  try {
    const res = await apiGrupalesLista();
    estado.grupos = Array.isArray(res && res.grupos) ? res.grupos : [];
    estado.demo = false;
  } catch (e) {
    estado.error = 'No se pudo conectar con el servidor.';
    estado.demo = true;
    estado.grupos = gruposLocales();
  }
  estado.cargando = false;
  renderLista();
}

async function abrirGrupo(id) {
  estado.abierto = id;
  estado.detalle = null;
  renderDetalle();
  try {
    const res = await apiGrupalesDetalle(id);
    estado.detalle = res || null;
    estado.demo = false;
  } catch (e) {
    estado.demo = true;
    estado.detalle = detalleLocal(id);
  }
  renderDetalle();
  const chat = $('grp-chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

/* Respaldo local: los grupos que el dispositivo tenga. */
function gruposLocales() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '[]');
    return Array.isArray(raw)
      ? raw.map((g, i) => ({
          id: 'loc-' + i,
          nombre: g.nombre || '(sin nombre)',
          descripcion: g.desc || '',
          materia: '',
          owner_id: miEmail(),
          estado: 'activo',
          actualizado: 0,
          miembros: [],
        }))
      : [];
  } catch (e) {
    return [];
  }
}

function detalleLocal(id) {
  const g = gruposLocales().find((x) => x.id === id);
  return g ? { ok: true, grupo: g, miembros: [], mensajes: [], entregas: [] } : null;
}

function guardarLocal(g) {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '[]');
    const lista = Array.isArray(raw) ? raw : [];
    lista.push({ nombre: g.nombre, desc: g.descripcion || g.desc || '' });
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(lista));
  } catch (e) { /* noop */ }
}

/* ------------------------------------------------------------------
   Render
   ------------------------------------------------------------------ */

function renderLista() {
  const lista = $('grupo-lista');
  if (!lista) return;

  if (!estado.grupos.length) {
    lista.innerHTML = estado.cargando
      ? '<div class="empty-msg">Cargando…</div>'
      : '<div class="empty-msg" data-icon="👥"><div class="empty-msg-title">No hay grupos</div>' +
        '<div>Creá un grupo para trabajar en equipo.</div></div>';
    return;
  }

  lista.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:.4rem;">' +
    estado.grupos
      .map((g) =>
        '<button type="button" class="grp-item' + (estado.abierto === g.id ? ' active' : '') + '" ' +
        'data-id="' + escapeHtml(g.id) + '" ' +
        'style="display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;padding:.55rem .65rem;' +
        'background:' + (estado.abierto === g.id ? 'var(--gray-100)' : 'var(--gray-50)') + ';' +
        'border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;">' +
        '<span style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:var(--primary);color:#fff;' +
        'display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;">' +
        escapeHtml(iniciales(g.nombre)) + '</span>' +
        '<span style="flex:1;min-width:0;">' +
        '<span style="display:flex;align-items:center;gap:.4rem;">' +
        '<strong style="font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
        escapeHtml(g.nombre || '(sin nombre)') + '</strong>' +
        '<span style="font-size:.7rem;color:var(--gray-500);margin-left:auto;">' +
        escapeHtml(fechaCorta(g.actualizado)) + '</span></span>' +
        '<span style="display:block;font-size:.78rem;color:var(--gray-500);white-space:nowrap;overflow:hidden;' +
        'text-overflow:ellipsis;">' +
        escapeHtml(g.materia || resumen(g.descripcion || '', 60) || etiquetaEstado(g.estado)) + '</span>' +
        '</span></button>'
      )
      .join('') +
    '</div>';

  lista.querySelectorAll('.grp-item').forEach((btn) => {
    btn.addEventListener('click', () => abrirGrupo(btn.dataset.id));
  });
}

function renderDetalle() {
  const cont = $('grp-panel');
  const titulo = $('grp-panel-titulo');
  if (!cont || !titulo) return;

  if (!estado.abierto) {
    titulo.textContent = 'Workspace';
    cont.innerHTML =
      '<div class="empty-msg" data-icon="🧩"><div class="empty-msg-title">Elegí un grupo</div>' +
      '<div>Seleccioná un grupo de la lista para ver miembros, chat y entregas.</div></div>';
    return;
  }

  const d = estado.detalle;
  if (!d) {
    titulo.textContent = 'Cargando…';
    cont.innerHTML = '<div class="empty-msg">Cargando el grupo…</div>';
    return;
  }

  const g = d.grupo || {};
  const miembros = Array.isArray(d.miembros) ? d.miembros : [];
  const mensajes = Array.isArray(d.mensajes) ? d.mensajes : [];
  const entregas = Array.isArray(d.entregas) ? d.entregas : [];
  const mi = miEmail();

  titulo.innerHTML =
    escapeHtml(g.nombre || '(sin nombre)') +
    (g.materia ? ' <span style="font-size:.75rem;color:var(--gray-500);font-weight:400;">· ' + escapeHtml(g.materia) + '</span>' : '');

  cont.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr;gap:1rem;">' +

      /* --- descripción y acciones --- */
      '<div class="card" style="margin:0;">' +
        (g.descripcion ? '<p style="margin:0 0 .5rem;font-size:.88rem;">' + escapeHtml(g.descripcion) + '</p>' : '') +
        '<div class="flex-between" style="flex-wrap:wrap;gap:.5rem;">' +
          '<span class="badge" style="background:var(--gray-100);color:var(--gray-700);">' +
            escapeHtml(etiquetaEstado(g.estado)) + ' · ' + miembros.length + ' integrante(s)</span>' +
          '<div style="display:flex;gap:.5rem;">' +
            '<button id="grp-invitar" class="btn btn-sm">+ Invitar</button>' +
            '<button id="grp-entregar" class="btn btn-sm btn-primary">Entregar</button>' +
            '<button id="grp-borrar" class="btn btn-sm" style="background:var(--red);color:#fff;">Borrar</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* --- miembros --- */
      '<div class="card" style="margin:0;">' +
        '<h4 style="margin:0 0 .5rem;font-size:.92rem;">Integrantes</h4>' +
        '<div id="grp-miembros" style="display:flex;flex-wrap:wrap;gap:.4rem;">' +
        (miembros.length
          ? miembros.map((m) =>
              '<span style="display:inline-flex;align-items:center;gap:.35rem;padding:.25rem .5rem;' +
              'background:var(--gray-50);border:1px solid var(--gray-200);border-radius:999px;font-size:.8rem;">' +
              '<span style="width:18px;height:18px;border-radius:50%;background:var(--primary);color:#fff;' +
              'display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;">' +
              escapeHtml(iniciales(m.nombre || m.email)) + '</span>' +
              escapeHtml(m.nombre || m.email) +
              (m.email === mi ? ' <em style="color:var(--gray-500);font-size:.7rem;">(vos)</em>' : '') +
              '</span>'
            ).join('')
          : '<span style="color:var(--gray-500);font-size:.82rem;">Sin integres registrados.</span>') +
        '</div>' +
      '</div>' +

      /* --- chat interno --- */
      '<div class="card" style="margin:0;">' +
        '<h4 style="margin:0 0 .5rem;font-size:.92rem;">Chat del grupo</h4>' +
        '<div id="grp-chat" style="min-height:160px;max-height:36vh;overflow-y:auto;padding:.25rem;display:flex;' +
        'flex-direction:column;gap:.5rem;">' +
        (mensajes.length
          ? mensajes.map((m) => {
              const propio = m.email === mi;
              return (
                '<div style="align-self:' + (propio ? 'flex-end' : 'flex-start') + ';max-width:82%;">' +
                '<div style="padding:.45rem .65rem;border-radius:10px;background:' +
                (propio ? 'var(--primary)' : 'var(--gray-100)') + ';color:' +
                (propio ? '#fff' : 'var(--gray-800)') + ';font-size:.86rem;white-space:pre-wrap;word-break:break-word;">' +
                '<div style="font-size:.7rem;opacity:.8;margin-bottom:.15rem;">' +
                escapeHtml(propio ? 'Vos' : (m.nombre || m.email)) + '</div>' +
                escapeHtml(m.contenido || '') + '</div>' +
                '<div style="font-size:.66rem;color:var(--gray-500);text-align:' + (propio ? 'right' : 'left') + ';margin-top:.1rem;">' +
                escapeHtml(horaCorta(m.creado)) + '</div></div>'
              );
            }).join('')
          : '<div class="empty-msg">Todavía no hay mensajes en el grupo.</div>') +
        '</div>' +
        '<div style="margin-top:.5rem;display:flex;gap:.5rem;">' +
          '<input id="grp-chat-input" placeholder="Escribí en el chat del grupo…" style="flex:1;">' +
          '<button id="grp-chat-enviar" class="btn btn-sm btn-primary">Enviar</button>' +
        '</div>' +
      '</div>' +

      /* --- entregas --- */
      '<div class="card" style="margin:0;">' +
        '<h4 style="margin:0 0 .5rem;font-size:.92rem;">Entregas compartidas</h4>' +
        (entregas.length
          ? entregas.map((e) =>
              '<div style="padding:.5rem .65rem;background:var(--gray-50);border:1px solid var(--gray-200);' +
              'border-radius:8px;margin-bottom:.4rem;">' +
              '<div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--gray-500);">' +
              '<strong>' + escapeHtml(e.nombre || e.email) + '</strong>' +
              '<span>' + escapeHtml(fechaCorta(e.creado)) + '</span></div>' +
              (e.texto ? '<div style="font-size:.86rem;white-space:pre-wrap;margin-top:.2rem;">' + escapeHtml(e.texto) + '</div>' : '') +
              (e.archivo ? '<div style="font-size:.8rem;margin-top:.2rem;"><a href="' + escapeHtml(e.archivo) +
                '" download="entrega-' + escapeHtml(e.id) + '">📎 Descargar archivo adjunto</a></div>' : '') +
              '</div>'
            ).join('')
          : '<div class="empty-msg">Sin entregas todavía.</div>') +
      '</div>' +

    '</div>';

  /* --- manejadores --- */
  const btnInvitar = $('grp-invitar');
  if (btnInvitar) btnInvitar.addEventListener('click', invitar);
  const btnEntregar = $('grp-entregar');
  if (btnEntregar) btnEntregar.addEventListener('click', entregar);
  const btnBorrar = $('grp-borrar');
  if (btnBorrar) btnBorrar.addEventListener('click', borrarGrupo);
  const btnChat = $('grp-chat-enviar');
  if (btnChat) btnChat.addEventListener('click', enviarChat);
  const inputChat = $('grp-chat-input');
  if (inputChat) {
    inputChat.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') enviarChat();
    });
  }
}

/* ------------------------------------------------------------------
   Acciones
   ------------------------------------------------------------------ */

export async function nuevoGrupo() {
  const nombre = typeof window.dialogPrompt === 'function'
    ? await window.dialogPrompt('Nombre del grupo:', 'Nuevo grupo')
    : (typeof window.prompt === 'function' ? window.prompt('Nombre del grupo:') : '');
  if (!nombre || !nombre.trim()) return;
  const desc = typeof window.dialogPrompt === 'function'
    ? await window.dialogPrompt('Descripción (opcional):', 'Descripción')
    : '';
  const materia = typeof window.dialogPrompt === 'function'
    ? await window.dialogPrompt('Materia (opcional):', 'Materia')
    : '';

  const err = validarGrupo(nombre);
  if (err) { toast(err, 'error'); return; }

  try {
    const res = await apiGrupoCrear({ nombre: nombre.trim(), descripcion: (desc || '').trim(), materia: (materia || '').trim() });
    toast('Grupo creado.', 'success');
    await cargarGrupos();
    if (res && res.id) abrirGrupo(res.id);
  } catch (e) {
    // Respaldo local si el backend no responde.
    guardarLocal({ nombre: nombre.trim(), descripcion: desc });
    await cargarGrupos();
    toast('Grupo guardado en este dispositivo (sin conexión).', 'error');
  }
}

async function invitar() {
  if (!estado.abierto) return;
  const email = typeof window.dialogPrompt === 'function'
    ? await window.dialogPrompt('Email de la persona a invitar:', 'Invitar al grupo')
    : '';
  if (!email || !email.trim()) return;
  try {
    await apiGrupoInvitar(estado.abierto, email.trim());
    await abrirGrupo(estado.abierto);
    await cargarGrupos();
    toast('Invitación enviada.', 'success');
  } catch (e) {
    toast('No se pudo invitar: ' + (e && e.message ? e.message : 'error del servidor'), 'error');
  }
}

async function entregar() {
  if (!estado.abierto) return;
  const texto = typeof window.dialogPrompt === 'function'
    ? await window.dialogPrompt('Contenido de la entrega compartida:', 'Entregar')
    : '';
  if (texto === null) return;
  if (!texto.trim()) { toast('La entrega está vacía.', 'error'); return; }
  try {
    await apiGrupoEntregar(estado.abierto, texto.trim());
    await abrirGrupo(estado.abierto);
    await cargarGrupos();
    toast('Entrega registrada.', 'success');
  } catch (e) {
    toast('No se pudo registrar la entrega.', 'error');
  }
}

async function borrarGrupo() {
  if (!estado.abierto) return;
  const ok = typeof window.dialogConfirm === 'function'
    ? await window.dialogConfirm('¿Borrar este grupo y todo su contenido?', 'Borrar grupo')
    : false;
  if (!ok) return;
  try {
    await apiGrupoBorrar(estado.abierto);
    toast('Grupo borrado.', 'success');
  } catch (e) {
    // Respaldo local.
    try {
      const raw = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '[]');
      const idx = estado.abierto.indexOf('loc-') === 0 ? parseInt(estado.abierto.slice(4), 10) : -1;
      if (idx >= 0 && Array.isArray(raw)) {
        raw.splice(idx, 1);
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(raw));
      }
    } catch (e2) { /* noop */ }
    toast('Grupo borrado del dispositivo.', 'success');
  }
  estado.abierto = null;
  estado.detalle = null;
  await cargarGrupos();
  renderDetalle();
}

async function enviarChat() {
  const input = $('grp-chat-input');
  if (!input || !estado.abierto) return;
  const texto = input.value.trim();
  if (!texto) return;
  try {
    await apiGrupoMensaje(estado.abierto, texto);
    input.value = '';
    await abrirGrupo(estado.abierto);
  } catch (e) {
    toast('No se pudo enviar el mensaje.', 'error');
  }
}

/* ------------------------------------------------------------------
   Montaje
   ------------------------------------------------------------------ */

function inyectarUI() {
  const seccion = $('app-grupales');
  if (!seccion) return;
  const cont = seccion.querySelector('.container');
  if (!cont) return;
  if (cont.querySelector('#grp-panel')) return;

  cont.innerHTML =
    '<h2 class="section-title">Actividades grupales · Workspace</h2>' +
    '<p class="section-sub">Trabajo en equipo: integrantes, chat interno y entregas compartidas.</p>' +
    '<div id="grp-panel-wrap" style="display:grid;grid-template-columns:minmax(220px,320px) 1fr;gap:1rem;align-items:start;">' +
      '<div class="card" style="margin:0;">' +
        '<div class="flex-between" style="margin-bottom:.5rem;gap:.5rem;">' +
          '<h3 style="margin:0;font-size:1rem;">Mis grupos</h3>' +
          '<button type="button" id="btn-grupo-add" class="btn btn-primary btn-sm">+ Nuevo grupo</button>' +
        '</div>' +
        '<input id="grp-buscar" placeholder="Buscar…" style="width:100%;padding:.3rem .5rem;font-size:.8rem;margin-bottom:.5rem;">' +
        '<div id="grupo-lista"><div class="empty-msg">Cargando…</div></div>' +
      '</div>' +
      '<div class="card" style="margin:0;">' +
        '<h3 id="grp-panel-titulo" style="margin:0 0 .5rem;font-size:1rem;">Workspace</h3>' +
        '<div id="grp-panel">' +
          '<div class="empty-msg">Elegí un grupo de la lista.</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // El botón "+ Nuevo grupo" lo maneja el módulo (el de app.js queda
  // desconectado al reemplazarse el markup de la sección).
  const btnNuevo = $('btn-grupo-add');
  if (btnNuevo) btnNuevo.addEventListener('click', nuevoGrupo);

  const buscar = $('grp-buscar');
  if (buscar) {
    buscar.addEventListener('input', () => {
      const q = buscar.value;
      const filtrados = filtrarGrupos(estado.grupos, q);
      const lista = $('grupo-lista');
      if (!lista) return;
      if (!filtrados.length) {
        lista.innerHTML = '<div class="empty-msg">Sin resultados.</div>';
        return;
      }
      const prev = estado.grupos;
      estado.grupos = filtrados;
      renderLista();
      estado.grupos = prev;
    });
  }
}

/* ------------------------------------------------------------------
   API pública (la usa app.js)
   ------------------------------------------------------------------ */

export async function init() {
  inyectarUI();
  await cargarGrupos();
}

export function render() {
  renderLista();
}

/** Alias: app.js llama a `nuevoGrupo()`. */
export function nuevoGrupoUI() {
  nuevoGrupo();
}

export { estado as estadoGrupales };