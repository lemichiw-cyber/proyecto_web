/* ===================================================================
   padres-app.js — Portal de Padres (backend real /api/padres)
   Vista resumida del progreso de los hijos: tareas, calificaciones y
   asistencia. Sólo las cuentas con rango "padres" pueden consultarla
   (el backend lo valida, no sólo el frontend).
   =================================================================== */

import { escapeHtml } from '../../utils/escape.js';
import {
  apiPadresHijos,
  apiPadresResumen,
  apiPadresContactos,
} from '../../api-client';
import {
  agruparPorMateria,
  construirNotificaciones,
  contarPendientes,
  formatoPorcentaje,
  formatoPromedio,
  iniciales,
  promedio,
  porcentajeAsistencia,
} from './padres-utils.js';

const estado = {
  activo: false,
  hijos: [],
  contactos: [],
  error: '',
  cargando: false,
};

function $(id) { return document.getElementById(id); }

function toast(msg, tipo) {
  if (typeof window.mostrarToast === 'function') {
    window.mostrarToast(msg, tipo || 'success');
    return;
  }
  console.log('[Portal Padres]', msg);
}

/* ------------------------------------------------------------------
   Datos
   ------------------------------------------------------------------ */

async function cargar() {
  estado.cargando = true;
  estado.error = '';
  renderPanel();
  try {
    const res = await apiPadresResumen();
    estado.hijos = Array.isArray(res && res.hijos) ? res.hijos : [];
    try {
      const c = await apiPadresContactos();
      estado.contactos = Array.isArray(c && c.contactos) ? c.contactos : [];
    } catch (e) { /* los contactos son opcionales */ }
  } catch (e) {
    const msg = e && e.message ? e.message : '';
    if (msg.indexOf('403') !== -1) {
      estado.error = 'Esta sección es sólo para cuentas de padres de familia.';
    } else if (msg.indexOf('401') !== -1) {
      estado.error = 'Debés iniciar sesión para ver el Portal Padres.';
    } else {
      estado.error = 'No se pudo conectar con el servidor.';
    }
    estado.hijos = [];
  }
  estado.cargando = false;
  renderPanel();
}

/* ------------------------------------------------------------------
   Render
   ------------------------------------------------------------------ */

function renderPanel() {
  const cont = $('parents-panel');
  if (!cont) return;

  if (estado.cargando && !estado.hijos.length) {
    cont.innerHTML = '<div class="empty-msg">Cargando…</div>';
    return;
  }

  if (estado.error) {
    cont.innerHTML =
      '<div class="empty-msg" data-icon="🔒"><div class="empty-msg-title">Acceso restringido</div>' +
      '<div>' + escapeHtml(estado.error) + '</div></div>';
    return;
  }

  if (!estado.hijos.length) {
    cont.innerHTML =
      '<div class="empty-msg" data-icon="👨‍👩‍👧"><div class="empty-msg-title">Sin hijos vinculados</div>' +
      '<div>Tu cuenta no tiene hijos asociados todavía. Pedile al administración que vincule ' +
      'el email de tu hijo/a a esta cuenta.</div></div>';
    return;
  }

  const notis = construirNotificaciones(estado.hijos);

  cont.innerHTML =
    '<div class="grid-2">' +

      /* --- rendimiento --- */
      '<div class="card">' +
        '<h3>Rendimiento académico</h3>' +
        '<div class="grid-4 mb-4">' +
          '<div class="stat-box"><div class="stat-num" id="parent-promedio">' +
            escapeHtml(formatoPromedio(promedioGLOBAL())) + '</div>' +
            '<div class="stat-label">Promedio general</div></div>' +
          '<div class="stat-box"><div class="stat-num" id="parent-asistencia">' +
            escapeHtml(formatoPorcentaje(asistenciaGLOBAL())) + '</div>' +
            '<div class="stat-label">Asistencia</div></div>' +
          '<div class="stat-box"><div class="stat-num" id="parent-actividades">' +
            estado.hijos.reduce((a, h) => a + ((h.tareas || []).length), 0) + '</div>' +
            '<div class="stat-label">Actividades</div></div>' +
          '<div class="stat-box"><div class="stat-num" id="parent-pendientes">' +
            estado.hijos.reduce((a, h) => a + contarPendientes(h), 0) + '</div>' +
            '<div class="stat-label">Pendientes</div></div>' +
        '</div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' +
          escapeHtml(String(asistenciaGLOBAL() === null ? 0 : asistenciaGLOBAL())) + '%"></div></div>' +
        '<p class="text-82-muted">Progreso del semestre</p>' +
      '</div>' +

      /* --- notificaciones --- */
      '<div class="card">' +
        '<div class="flex-between"><h3>Notificaciones</h3></div>' +
        '<div id="parent-notif">' +
          (notis.length
            ? notis.map((n) =>
                '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .7rem;background:' +
                (n.tipo === 'alerta' ? '#fef2f2' : 'var(--gray-50)') + ';border-radius:8px;margin-bottom:.4rem;' +
                'font-size:.85rem;">' +
                '<span>' + (n.tipo === 'alerta' ? '⚠️' : 'ℹ️') + '</span><span>' +
                escapeHtml(n.texto) + '</span></div>'
              ).join('')
            : '<div class="empty-msg">Sin notificaciones recientes.</div>') +
        '</div>' +
      '</div>' +
    '</div>' +

    /* --- detalle por hijo --- */
    '<div class="card mt-5">' +
      '<h3>Seguimiento por hijo/a</h3>' +
      estado.hijos.map((h) => renderHijo(h)).join('') +
    '</div>' +

    /* --- calificaciones por materia --- */
    '<div class="card mt-5">' +
      '<h3>Calificaciones por materia</h3>' +
      '<div id="parent-calif-grid" class="grid-3">' +
        renderCalificaciones() +
      '</div>' +
    '</div>' +

    /* --- contactos --- */
    (estado.contactos.length
      ? '<div class="card mt-5">' +
          '<h3>Docentes y administración</h3>' +
          '<div style="display:flex;flex-wrap:wrap;gap:.5rem;">' +
          estado.contactos.map((c) =>
            '<span style="display:inline-flex;align-items:center;gap:.35rem;padding:.3rem .6rem;' +
            'background:var(--gray-50);border:1px solid var(--gray-200);border-radius:999px;font-size:.82rem;">' +
            '<span style="width:20px;height:20px;border-radius:50%;background:var(--primary);color:#fff;' +
            'display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:700;">' +
            escapeHtml(iniciales(c.nombre || c.email)) + '</span>' +
            escapeHtml(c.nombre || c.email) + '</span>'
          ).join('') +
          '</div>' +
        '</div>'
      : '');
}

function renderHijo(h) {
  const pct = porcentajeAsistencia(h.asistencia);
  const prom = promedio(h.notas);
  const tareas = Array.isArray(h.tareas) ? h.tareas : [];
  const notas = Array.isArray(h.notas) ? h.notas : [];

  return (
    '<div style="padding:.75rem;border:1px solid var(--gray-200);border-radius:10px;margin-top:.75rem;">' +
      '<div class="flex-between" style="flex-wrap:wrap;gap:.5rem;">' +
        '<div style="display:flex;align-items:center;gap:.6rem;">' +
          '<span style="width:34px;height:34px;border-radius:50%;background:var(--primary);color:#fff;' +
          'display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;">' +
          escapeHtml(iniciales(h.nombre || h.email)) + '</span>' +
          '<div><strong style="font-size:.9rem;">' + escapeHtml(h.nombre || h.email) + '</strong>' +
          (h.semestre ? '<div style="font-size:.75rem;color:var(--gray-500);">' + escapeHtml(h.semestre) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:.5rem;font-size:.78rem;color:var(--gray-600);">' +
          '<span>Promedio: <strong>' + escapeHtml(formatoPromedio(prom)) + '</strong></span>' +
          '<span>Asistencia: <strong>' + escapeHtml(formatoPorcentaje(pct)) + '</strong></span>' +
          '<span>Pendientes: <strong>' + contarPendientes(h) + '</strong></span>' +
        '</div>' +
      '</div>' +

      '<div class="grid-2 mt-4" style="gap:.75rem;">' +
        '<div>' +
          '<h4 style="margin:0 0 .35rem;font-size:.85rem;">Tareas</h4>' +
          (tareas.length
            ? tareas.map((t) =>
                '<div style="display:flex;justify-content:space-between;gap:.5rem;padding:.35rem .55rem;' +
                'background:var(--gray-50);border-radius:6px;margin-bottom:.3rem;font-size:.8rem;">' +
                '<span>' + escapeHtml(t.titulo || '(sin título)') +
                (t.materia ? ' <em style="color:var(--gray-500);font-style:normal;">· ' + escapeHtml(t.materia) + '</em>' : '') +
                '</span>' +
                '<span style="color:' + (t.entregada ? 'var(--green)' : 'var(--amber)') + ';white-space:nowrap;">' +
                (t.entregada ? '✓ Entregada' : 'Pendiente') + '</span></div>'
              ).join('')
            : '<div style="font-size:.8rem;color:var(--gray-500);">Sin tareas registradas.</div>') +
        '</div>' +
        '<div>' +
          '<h4 style="margin:0 0 .35rem;font-size:.85rem;">Calificaciones</h4>' +
          (notas.length
            ? notas.map((n) =>
                '<div style="display:flex;justify-content:space-between;gap:.5rem;padding:.35rem .55rem;' +
                'background:var(--gray-50);border-radius:6px;margin-bottom:.3rem;font-size:.8rem;">' +
                '<span>' + escapeHtml(n.comentario || 'Calificación') + '</span>' +
                '<strong>' + escapeHtml(n.nota === null || n.nota === undefined ? '—' : String(n.nota)) + '</strong></div>'
              ).join('')
            : '<div style="font-size:.8rem;color:var(--gray-500);">Sin calificaciones registradas.</div>') +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function renderCalificaciones() {
  const salida = [];
  estado.hijos.forEach((h) => {
    agruparPorMateria(h).forEach((m) => {
      salida.push(
        '<div style="padding:.6rem .75rem;background:var(--gray-50);border:1px solid var(--gray-200);' +
        'border-radius:10px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<strong style="font-size:.85rem;">' + escapeHtml(m.materia) + '</strong>' +
            '<span style="font-size:.9rem;font-weight:700;color:var(--primary);">' +
              escapeHtml(formatoPromedio(m.promedio)) + '</span>' +
          '</div>' +
          '<div style="font-size:.72rem;color:var(--gray-500);margin-top:.15rem;">' +
            escapeHtml((h.nombre || '') + (m.notas.length ? ' · ' + m.notas.length + ' nota(s)' : ' · sin notas')) +
          '</div>' +
        '</div>'
      );
    });
  });
  if (!salida.length) {
    return '<div class="empty-msg" style="grid-column:1/-1;">Todavía no hay calificaciones para mostrar.</div>';
  }
  return salida.join('');
}

function promedioGLOBAL() {
  const todas = [];
  estado.hijos.forEach((h) => todas.push(...(h.notas || [])));
  return promedio(todas);
}

function asistenciaGLOBAL() {
  let registros = 0;
  let presentes = 0;
  estado.hijos.forEach((h) => {
    const a = h.asistencia || {};
    registros += Number(a.registros || 0);
    presentes += Number(a.presentes || 0);
  });
  if (!registros) return null;
  return Math.round((presentes / registros) * 100);
}

/* ------------------------------------------------------------------
   Montaje
   ------------------------------------------------------------------ */

function inyectarUI() {
  const seccion = $('app-parents');
  if (!seccion) return;
  const cont = seccion.querySelector('.container');
  if (!cont) return;
  if (cont.querySelector('#parents-panel')) return;

  cont.innerHTML =
    '<h2 class="section-title">Portal Padres · Seguimiento del bachillerato</h2>' +
    '<p class="section-sub">Panel de las familias con la información académica de sus hijos.</p>' +
    '<div id="parents-panel"><div class="empty-msg">Cargando…</div></div>';
}

/* ------------------------------------------------------------------
   API pública
   ------------------------------------------------------------------ */

export async function init() {
  inyectarUI();
  await cargar();
}

export function render() {
  renderPanel();
}

export { estado as estadoPadres };
