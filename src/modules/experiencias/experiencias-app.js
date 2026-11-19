import { getApiBase } from '../../api-base';
import { fetchExperiencias, crearExperiencia, borrarExperiencia } from './experiencias-utils.js';

export async function render() {
  const el = document.getElementById('app-experiencias');
  if (!el) return;
  const apiBase = getApiBase();
  try {
    const lista = await fetchExperiencias(apiBase);
    el.innerHTML = `
      <button id="exp-nueva">+ Nueva experiencia</button>
      <div id="exp-lista">${lista.map(e => `<div style="border:1px solid var(--border);padding:.5rem;margin:.5rem 0"><strong>${e.titulo}</strong><br/>${e.descripcion}<br/><button data-id="${e.id}">Eliminar</button></div>`).join('') || '<p>Sin experiencias</p>'}</div>
    `;
    document.getElementById('exp-nueva').onclick = async () => {
      const titulo = prompt('Título');
      if (!titulo) return;
      const descripcion = prompt('Descripción');
      await crearExperiencia(apiBase, { titulo, descripcion, objetivo:'', fecha_inicio:new Date().toISOString().slice(0,10) });
      await render();
    };
    el.querySelectorAll('[data-id]').forEach(btn => btn.onclick = async () => { await borrarExperiencia(apiBase, btn.dataset.id); await render(); });
  } catch (e) {
    el.innerHTML = `<p>Error: ${e.message}</p>`;
  }
}
