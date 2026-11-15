import { crearElemento } from './canva-utils.js';

const STORAGE_KEY = 'canva_diseños';
const TEMPLATES = [
  { id:'tarjeta', nombre:'Tarjeta presentación', elementos:[
    { tipo:'rect', left:200, top:120, width:400, height:360, color:'#4f46e5' },
    { tipo:'texto', left:240, top:200, width:320, height:40, texto:'Tu nombre' },
    { tipo:'texto', left:240, top:260, width:320, height:30, texto:'Tu cargo · Empresa' },
  ]},
  { id:'poster', nombre:'Poster simple', elementos:[
    { tipo:'rect', left:150, top:100, width:500, height:400, color:'#111827' },
    { tipo:'texto', left:200, top:220, width:400, height:60, texto:'Título del evento' },
    { tipo:'texto', left:220, top:300, width:360, height:30, texto:'Fecha · Lugar' },
  ]},
];

export async function render() {
  const el = document.getElementById('app-canva');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:1rem;height:80vh">
      <div style="width:260px;border:1px solid var(--border);padding:.75rem;border-radius:.5rem;display:flex;flex-direction:column;gap:.5rem">
        <h4>Herramientas</h4>
        <button class="btn" id="canva-texto">Texto</button>
        <button class="btn" id="canva-rect">Rectángulo</button>
        <button class="btn" id="canva-img">Imagen</button>
        <hr>
        <h4>Plantillas</h4>
        <div id="canva-plantillas" style="display:flex;flex-direction:column;gap:.4rem"></div>
        <hr>
        <h4>Mis diseños</h4>
        <div id="canva-lista" style="max-height:180px;overflow:auto;font-size:.85rem"></div>
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-outline" id="canva-nuevo">Nuevo</button>
          <button class="btn btn-outline" id="canva-guardar">Guardar</button>
        </div>
        <button class="btn" id="canva-export">Exportar PNG</button>
      </div>
      <div style="flex:1;position:relative;border:1px dashed var(--border);background:#fafafa;border-radius:.5rem;overflow:auto">
        <div id="canva-lona" style="position:relative;width:800px;height:600px;margin:40px auto;background:white;box-shadow:0 4px 20px rgba(0,0,0,.1)"></div>
      </div>
    </div>
  `;
  const lona = document.getElementById('canva-lona');
  let seleccionado = null;
  let diseñoActualNombre = 'Sin título';

  function seleccionar(elem) {
    document.querySelectorAll('.canva-elemento').forEach(e=>e.style.outline='none');
    if (elem) {
      elem.style.outline='2px solid #4f46e5';
      seleccionado = elem;
    } else seleccionado = null;
  }

  function limpiarLona() {
    lona.innerHTML = '';
  }

  function serializar() {
    const elems = [...lona.querySelectorAll('.canva-elemento')];
    return elems.map(el => {
      const tipo = el.contentEditable ? 'texto' : el._img ? 'img' : 'rect';
      const data = {
        tipo,
        left: parseInt(el.style.left)||0,
        top: parseInt(el.style.top)||0,
        width: parseInt(el.style.width)||120,
        height: parseInt(el.style.height)||60,
      };
      if (tipo==='texto') data.texto = el.textContent;
      if (tipo==='rect') data.color = el.style.background || '#4f46e5';
      if (tipo==='img') {
        const src = el._img?.src || '';
        if (src.startsWith('blob:')) data.src = src; // keep blob reference as is; on reload images will be lost
        else data.src = src;
      }
      return data;
    });
  }

  function deserializar(lista) {
    limpiarLona();
    lista.forEach(d => {
      const e = crearElemento(d.tipo, {
        left: d.left,
        top: d.top,
        width: d.width,
        height: d.height,
        texto: d.texto,
        color: d.color
      });
      if (d.tipo==='img' && d.src) {
        e._img.src = d.src;
      }
      lona.appendChild(e);
    });
  }

  function guardarDiseño() {
    const diseños = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    const nombre = prompt('Nombre del diseño', diseñoActualNombre || 'Sin título');
    if (!nombre) return;
    const data = {
      id: Date.now(),
      nombre,
      fecha: new Date().toISOString(),
      elementos: serializar()
    };
    diseños.unshift(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diseños.slice(0,50)));
    diseñoActualNombre = nombre;
    renderLista();
  }

  function renderLista() {
    const lista = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    const el = document.getElementById('canva-lista');
    el.innerHTML = lista.map(d => `<div style="padding:.3rem 0;border-bottom:1px solid var(--border);cursor:pointer" data-id="${d.id}">${d.nombre} <span style="color:var(--gray-500)">${new Date(d.fecha).toLocaleDateString()}</span></div>`).join('') || '<i>Sin diseños</i>';
    el.querySelectorAll('div[data-id]').forEach(div => {
      div.onclick = () => {
        const d = lista.find(x=>x.id==div.dataset.id);
        if (d) {
          deserializar(d.elementos);
          diseñoActualNombre = d.nombre;
        }
      };
    });
  }

  function aplicarPlantilla(tpl) {
    deserializar(tpl.elementos);
    diseñoActualNombre = tpl.nombre;
  }

  // Render plantillas
  const tplEl = document.getElementById('canva-plantillas');
  tplEl.innerHTML = TEMPLATES.map(t => `<button class="btn btn-outline" data-tpl="${t.id}">${t.nombre}</button>`).join('');
  tplEl.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    const t = TEMPLATES.find(x=>x.id===btn.dataset.tpl);
    if (t) aplicarPlantilla(t);
  });

  document.getElementById('canva-nuevo').onclick = () => { limpiarLona(); diseñoActualNombre='Sin título'; };
  document.getElementById('canva-guardar').onclick = guardarDiseño;
  document.getElementById('canva-texto').onclick = () => { const e = crearElemento('texto'); lona.appendChild(e); seleccionar(e); };
  document.getElementById('canva-rect').onclick = () => { const e = crearElemento('rect'); lona.appendChild(e); seleccionar(e); };
  document.getElementById('canva-img').onclick = () => {
    const input = document.createElement('input'); input.type='file'; input.accept='image/*';
    input.onchange = () => {
      const file = input.files[0]; if (!file) return;
      const url = URL.createObjectURL(file);
      const e = crearElemento('img'); e._img.src = url; lona.appendChild(e); seleccionar(e);
    };
    input.click();
  };

  lona.addEventListener('click', (ev) => { if (ev.target.id==='canva-lona' || ev.target===lona) seleccionar(null); });

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
    // Exportación básica: genera PNG en blanco con metadatos
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0,0,800,600);
    ctx.fillStyle = '#666'; ctx.font = '16px sans-serif';
    ctx.fillText('Diseño exportado desde Canva Cherry-Bomb', 40, 40);
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a'); a.href = dataUrl; a.download = (diseñoActualNombre||'diseno')+'.png'; a.click();
  };

  renderLista();
}
