import { crearElemento } from './canva-utils.js';

const STORAGE_KEY = 'canva_diseños';
const DESIGN_TYPES = [
  { id:'presentacion', nombre:'Presentación', w:1280, h:720, icon:'📊' },
  { id:'redes', nombre:'Redes', w:1080, h:1080, icon:'💬' },
  { id:'video', nombre:'Vídeo', w:1920, h:1080, icon:'🎬' },
  { id:'impresion', nombre:'Impresión', w:2480, h:3508, icon:'🖨️' },
  { id:'doc', nombre:'Doc', w:800, h:1000, icon:'📄' },
  { id:'pizarra', nombre:'Pizarra', w:1280, h:720, icon:'📞' },
  { id:'hoja', nombre:'Hoja de cálculo', w:1200, h:800, icon:'📊' },
];
const TEMPLATES = {
  presentacion: [
    { id:'tarjeta', nombre:'Tarjeta presentación', elementos:[
      { tipo:'rect', left:200, top:120, width:400, height:360, color:'#4f46e5' },
      { tipo:'texto', left:240, top:200, width:320, height:40, texto:'Tu nombre' },
      { tipo:'texto', left:240, top:260, width:320, height:30, texto:'Tu cargo · Empresa' },
    ]},
  ],
  redes: [
    { id:'post', nombre:'Post cuadrado', elementos:[
      { tipo:'rect', left:140, top:140, width:600, height:600, color:'#111827' },
      { tipo:'texto', left:200, top:300, width:400, height:60, texto:'Título' },
    ]},
  ],
  doc: [
    { id:'resume', nombre:'Currículum', elementos:[
      { tipo:'rect', left:80, top:80, width:640, height:80, color:'#111827' },
      { tipo:'texto', left:100, top:100, width:600, height:40, texto:'Nombre Apellido' },
    ]},
  ],
};

export async function render() {
  const el = document.getElementById('app-canva');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;height:90vh">
      <div style="display:flex;align-items:center;gap:.5rem;padding:.5rem 1rem;border-bottom:1px solid var(--border);background:linear-gradient(90deg,#22d3ee,#a78bfa)">
        <button class="btn btn-outline" id="canva-archivo">Archivo</button>
        <button class="btn btn-outline" id="canva-redimensionar">Redimensionar</button>
        <div style="display:flex;align-items:center;gap:.3rem;margin-left:auto">
          <span id="canva-titulo" style="font-weight:600">Diseño sin título</span>
          <button class="btn" id="canva-compartir">Compartir</button>
        </div>
      </div>
      <div style="display:flex;flex:1;overflow:hidden">
        <div style="width:220px;border-right:1px solid var(--border);background:#fafafa;padding:.5rem;overflow:auto">
          <div id="canva-sidebar-tabs">
            <button class="tab active" data-tab="plantillas">Plantillas</button>
            <button class="tab" data-tab="elementos">Elementos</button>
            <button class="tab" data-tab="texto">Texto</button>
            <button class="tab" data-tab="marca">Marca</button>
            <button class="tab" data-tab="subidos">Subidos</button>
            <button class="tab" data-tab="proyectos">Proyectos</button>
          </div>
          <div id="canva-sidebar-content" style="margin-top:.5rem"></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column">
          <div style="display:flex;gap:.5rem;padding:.5rem;overflow-x:auto;border-bottom:1px solid var(--border)">
            ${DESIGN_TYPES.map(t=>`<button class="btn btn-outline" data-type="${t.id}">${t.icon} ${t.nombre}</button>`).join('')}
          </div>
          <div style="flex:1;overflow:auto;background:#e5e7eb;display:flex;align-items:center;justify-content:center">
            <div id="canva-lona" style="position:relative;background:white;box-shadow:0 4px 20px rgba(0,0,0,.1)"></div>
          </div>
          <div style="display:flex;justify-content:center;gap:1rem;padding:.5rem;border-top:1px solid var(--border)">
            <button class="btn btn-outline" id="canva-nuevo">Nuevo</button>
            <button class="btn btn-outline" id="canva-guardar">Guardar</button>
            <button class="btn" id="canva-export">Exportar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  const lona = document.getElementById('canva-lona');
  let seleccionado = null;
  let diseñoActualNombre = 'Sin título';
  let tipoActual = 'presentacion';

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

  function setTamano(tipo) {
    const t = DESIGN_TYPES.find(x=>x.id===tipo) || DESIGN_TYPES[0];
    lona.style.width = Math.min(t.w/4, 800) + 'px';
    lona.style.height = Math.min(t.h/4, 600) + 'px';
    tipoActual = tipo;
  }

  function serializar() {
    const elems = [...lona.querySelectorAll('.canva-elemento')];
    return elems.map(el => {
      const tipo = el.contentEditable ? 'texto' : el._img ? 'img' : 'rect';
      return {
        tipo,
        left: parseInt(el.style.left)||0,
        top: parseInt(el.style.top)||0,
        width: parseInt(el.style.width)||120,
        height: parseInt(el.style.height)||60,
        texto: tipo==='texto'?el.textContent:undefined,
        color: tipo==='rect'?el.style.background:'#4f46e5',
        src: tipo==='img'?el._img?.src:undefined,
      };
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
      if (d.tipo==='img' && d.src) e._img.src = d.src;
      lona.appendChild(e);
    });
  }

  function guardarDiseño() {
    const diseños = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    const nombre = prompt('Nombre del diseño', diseñoActualNombre);
    if (!nombre) return;
    diseños.unshift({id:Date.now(),nombre,fecha:new Date().toISOString(),tipo:tipoActual,elementos:serializar()});
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diseños.slice(0,50)));
    diseñoActualNombre = nombre;
    renderProyectos();
    document.getElementById('canva-titulo').textContent = nombre;
  }

  function renderProyectos() {
    const lista = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    const cont = document.getElementById('canva-sidebar-content');
    if (!cont) return;
    cont.innerHTML = `<div style="display:flex;flex-direction:column;gap:.4rem">${lista.map(d=>`<div style="padding:.4rem;border:1px solid var(--border);border-radius:.4rem;cursor:pointer" data-id="${d.id}">${d.nombre}<br><small>${new Date(d.fecha).toLocaleDateString()}</small></div>`).join('')||'<i>Sin diseños</i>'}</div>`;
    cont.querySelectorAll('div[data-id]').forEach(div=>{
      div.onclick=()=>{
        const d=lista.find(x=>x.id==div.dataset.id);
        if(d){ deserializar(d.elementos); diseñoActualNombre=d.nombre; document.getElementById('canva-titulo').textContent=d.nombre; setTamano(d.tipo||tipoActual);}
      };
    });
  }

  function renderPlantillas() {
    const tpls = TEMPLATES[tipoActual]||[];
    const cont = document.getElementById('canva-sidebar-content');
    cont.innerHTML = `<h4 style="margin:.5rem 0">Plantillas ${DESIGN_TYPES.find(t=>t.id===tipoActual)?.nombre}</h4>` + tpls.map(t=>`<button class="btn btn-outline" data-tpl="${t.id}">${t.nombre}</button>`).join('');
    cont.querySelectorAll('button[data-tpl]').forEach(btn=>{
      btn.onclick=()=>{
        const t = tpls.find(x=>x.id===btn.dataset.tpl);
        if(t){ deserializar(t.elementos); diseñoActualNombre=t.nombre; document.getElementById('canva-titulo').textContent=t.nombre;}
      };
    });
  }

  function renderElementos() {
    const cont = document.getElementById('canva-sidebar-content');
    cont.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem">
      <button class="btn btn-outline" id="el-texto">Texto</button>
      <button class="btn btn-outline" id="el-rect">Rectángulo</button>
      <button class="btn btn-outline" id="el-img">Imagen</button>
    </div>`;
    cont.querySelector('#el-texto').onclick=()=>{ const e=crearElemento('texto'); lona.appendChild(e); seleccionar(e); };
    cont.querySelector('#el-rect').onclick=()=>{ const e=crearElemento('rect'); lona.appendChild(e); seleccionar(e); };
    cont.querySelector('#el-img').onclick=()=>{ const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.onchange=()=>{ const f=input.files[0]; if(!f) return; const url=URL.createObjectURL(f); const e=crearElemento('img'); e._img.src=url; lona.appendChild(e); seleccionar(e); }; input.click(); };
  }

  // Tabs
  document.querySelectorAll('#canva-sidebar-tabs .tab').forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll('#canva-sidebar-tabs .tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab=btn.dataset.tab;
      if(tab==='plantillas') renderPlantillas();
      else if(tab==='elementos') renderElementos();
      else if(tab==='texto'){ const cont=document.getElementById('canva-sidebar-content'); cont.innerHTML='<button class="btn" id="btn-texto">Añadir Texto</button>'; cont.querySelector('#btn-texto').onclick=()=>{ const e=crearElemento('texto'); lona.appendChild(e); seleccionar(e); };}
      else if(tab==='proyectos') renderProyectos();
      else { document.getElementById('canva-sidebar-content').innerHTML='<i>Próximamente</i>'; }
    };
  });

  // Design types
  document.querySelectorAll('[data-type]').forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll('[data-type]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      setTamano(btn.dataset.type);
    };
  });

  // Buttons
  document.getElementById('canva-nuevo').onclick=()=>{ limpiarLona(); diseñoActualNombre='Sin título'; document.getElementById('canva-titulo').textContent='Diseño sin título'; };
  document.getElementById('canva-guardar').onclick=guardarDiseño;
  document.getElementById('canva-export').onclick=async ()=>{
    // Carga html2canvas si no está disponible
    if (!window.html2canvas) {
      await new Promise(res=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload=res; document.head.appendChild(s);
      });
    }
    const canvas = await window.html2canvas(lona, {backgroundColor:'#ffffff',scale:2});
    const a=document.createElement('a'); a.href=canvas.toDataURL('image/png'); a.download=(diseñoActualNombre||'diseno')+'.png'; a.click();
  };

  // Drag
  let offsetX, offsetY, dragging=false;
  lona.addEventListener('mousedown',ev=>{
    const target=ev.target.closest('.canva-elemento'); if(!target) return; seleccionar(target); dragging=true;
    const rect=target.getBoundingClientRect(); const lonaRect=lona.getBoundingClientRect();
    offsetX=ev.clientX-rect.left+lonaRect.left; offsetY=ev.clientY-rect.top+lonaRect.top; ev.preventDefault();
  });
  window.addEventListener('mousemove',ev=>{ if(!dragging||!seleccionado) return; const lonaRect=lona.getBoundingClientRect(); const x=ev.clientX-lonaRect.left-offsetX+parseInt(seleccionado.style.left); const y=ev.clientY-lonaRect.top-offsetY+parseInt(seleccionado.style.top); seleccionado.style.left=Math.max(0,x)+'px'; seleccionado.style.top=Math.max(0,y)+'px'; });
  window.addEventListener('mouseup',()=>dragging=false);
  lona.addEventListener('click',ev=>{ if(ev.target===lona) seleccionar(null); });

  // Init
  setTamano('presentacion');
  renderPlantillas();
}
