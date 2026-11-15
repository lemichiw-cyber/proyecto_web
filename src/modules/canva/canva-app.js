import { crearElemento } from './canva-utils.js';

export async function render() {
  const el = document.getElementById('app-canva');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:1rem;height:70vh">
      <div style="width:220px;border:1px solid var(--border);padding:.75rem;border-radius:.5rem">
        <h4>Herramientas</h4>
        <button id="canva-texto">Texto</button>
        <button id="canva-rect">Rectángulo</button>
        <button id="canva-img">Imagen</button>
        <hr>
        <button id="canva-export">Exportar PNG</button>
      </div>
      <div style="flex:1;position:relative;border:1px dashed var(--border);background:#fafafa;border-radius:.5rem;overflow:auto">
        <div id="canva-lona" style="position:relative;width:800px;height:600px;margin:40px auto;background:white;box-shadow:0 4px 20px rgba(0,0,0,.1)"></div>
      </div>
    </div>
  `;
  const lona = document.getElementById('canva-lona');
  let seleccionado = null;

  function seleccionar(elem) {
    document.querySelectorAll('.canva-elemento').forEach(e=>e.style.outline='none');
    elem.style.outline='2px solid #4f46e5';
    seleccionado = elem;
  }

  document.getElementById('canva-texto').onclick = () => {
    const e = crearElemento('texto');
    lona.appendChild(e);
    seleccionar(e);
  };
  document.getElementById('canva-rect').onclick = () => {
    const e = crearElemento('rect');
    lona.appendChild(e);
    seleccionar(e);
  };
  document.getElementById('canva-img').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const e = crearElemento('img');
      e._img.src = url;
      lona.appendChild(e);
      seleccionar(e);
    };
    input.click();
  };

  lona.addEventListener('click', (ev) => {
    if (ev.target.id === 'canva-lona') seleccionar(null);
  });

  // Drag simple
  let offsetX, offsetY, dragging = false;
  lona.addEventListener('mousedown', (ev) => {
    const target = ev.target.closest('.canva-elemento');
    if (!target) return;
    seleccionar(target);
    dragging = true;
    const rect = target.getBoundingClientRect();
    const lonaRect = lona.getBoundingClientRect();
    offsetX = ev.clientX - rect.left + lonaRect.left;
    offsetY = ev.clientY - rect.top + lonaRect.top;
    ev.preventDefault();
  });
  window.addEventListener('mousemove', (ev) => {
    if (!dragging || !seleccionado) return;
    const lonaRect = lona.getBoundingClientRect();
    const x = ev.clientX - lonaRect.left - offsetX + parseInt(seleccionado.style.left);
    const y = ev.clientY - lonaRect.top - offsetY + parseInt(seleccionado.style.top);
    seleccionado.style.left = Math.max(0, x) + 'px';
    seleccionado.style.top = Math.max(0, y) + 'px';
  });
  window.addEventListener('mouseup', () => dragging = false);

  document.getElementById('canva-export').onclick = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0,0,800,600);
    // Simulación simple: no renderiza DOM a canvas aquí
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'diseno.png';
    a.click();
  };
}
