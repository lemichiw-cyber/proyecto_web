import { getApiBase } from '../../api-base.js';
import { fetchSolicitudes, crearSolicitud, actualizarSolicitud, borrarSolicitud } from './matricula-utils.js';

let cargado = false;

export async function render() {
  const el = document.getElementById('app-matricula');
  if (!el) return;
  const apiBase = getApiBase();
  try {
    const solicitudes = await fetchSolicitudes(apiBase);
    el.innerHTML = `
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
        <button id="mat-nueva">+ Nueva solicitud</button>
      </div>
      <div id="mat-lista">${renderLista(solicitudes)}</div>
    `;
    document.getElementById('mat-nueva').onclick = () => promptNueva(apiBase);
    bindLista(apiBase);
  } catch (e) {
    el.innerHTML = `<p>Error cargando solicitudes: ${e.message}</p>`;
  }
  cargado = true;
}

function renderLista(solicitudes) {
  if (!solicitudes.length) return '<p>No hay solicitudes.</p>';
  return solicitudes.map(s => `
    <div style="border:1px solid var(--border);padding:.75rem;border-radius:.5rem">
      <strong>${s.nombres} ${s.apellidos}</strong> – ${s.especialidad} ${s.anio}° ${s.seccion}
      <div>Estado: ${s.estado}</div>
      <div style="margin-top:.5rem">
        <button data-act="aprobar" data-id="${s.id}">Aprobar</button>
        <button data-act="rechazar" data-id="${s.id}">Rechazar</button>
        <button data-act="eliminar" data-id="${s.id}">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function bindLista(apiBase) {
  document.querySelectorAll('#mat-lista [data-act]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      try {
        if (act === 'eliminar') await borrarSolicitud(apiBase, id);
        else await actualizarSolicitud(apiBase, id, act === 'aprobar' ? 'aprobado' : 'rechazado');
        await render();
      } catch (e) { alert(e.message); }
    };
  });
}

function promptNueva(apiBase) {
  const nombres = prompt('Nombres');
  if (!nombres) return;
  const apellidos = prompt('Apellidos');
  const email = prompt('Email');
  const anio = prompt('Año');
  const especialidad = prompt('Especialidad');
  const seccion = prompt('Sección');
  crearSolicitud(apiBase, { nombres, apellidos, email, anio, especialidad, seccion }).then(() => render()).catch(e => alert(e.message));
}
