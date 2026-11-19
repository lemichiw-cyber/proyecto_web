import { getApiBase } from '../../api-base';
import { fetchAsistencias } from './asistencias-utils.js';

export async function render() {
  const el = document.getElementById('app-asistencias');
  if (!el) return;
  const apiBase = getApiBase();
  try {
    const data = await fetchAsistencias(apiBase);
    el.innerHTML = `<p>Asistencias cargadas: ${JSON.stringify(data).slice(0,200)}</p>`;
  } catch (e) {
    el.innerHTML = `<p>Modo offline o sin permisos. ${e.message}</p>`;
  }
}
