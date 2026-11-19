import { getApiBase } from '../../api-base';
import { fetchAlertas, crearAlerta, borrarAlerta } from './sabi-utils.js';

export async function render() {
  const el = document.getElementById('app-sabi');
  if (!el) return;
  const apiBase = getApiBase();
  try {
    const lista = await fetchAlertas(apiBase);
    el.innerHTML = `
      <button id="sabi-nueva">+ Nueva alerta</button>
      <div id="sabi-lista">${lista.map(a => `<div style="border:1px solid var(--border);padding:.5rem;margin:.5rem 0"><strong>${a.titulo}</strong> [${a.nivel}]<br/>${a.mensaje}<br/><button data-id="${a.id}">Eliminar</button></div>`).join('') || '<p>Sin alertas</p>'}</div>
    `;
    document.getElementById('sabi-nueva').onclick = async () => {
      const titulo = prompt('Título');
      if (!titulo) return;
      const mensaje = prompt('Mensaje');
      const nivel = prompt('Nivel (info/alerta/urgente)', 'info');
      await crearAlerta(apiBase, { titulo, mensaje, nivel, destinatarios: [] });
      await render();
    };
    el.querySelectorAll('[data-id]').forEach(btn => btn.onclick = async () => { await borrarAlerta(apiBase, btn.dataset.id); await render(); });
  } catch (e) {
    el.innerHTML = `<p>Error: ${e.message}</p>`;
  }
}
