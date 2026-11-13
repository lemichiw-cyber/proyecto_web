/* ===================================================================
   ide-app.js — IDE en la nube (Monaco + backend /api/ide)
   Sin dependencias externas: se carga vía import() cuando el usuario entra
   a la app IDE. Usa lógica pura de ide-utils.js para estado y formateo.
   =================================================================== */

import { lenguaje, crearArchivo, estadoEjecucion, textoConsola, truncarTexto, esDepurable, normalizarResultado } from './ide-utils.js';

let monaco = null;
let editor = null;
let estado = {
  lenguajeActual: 'python',
  archivos: [],
  indiceArchivo: 0,
  pasos: [],
  indicePaso: -1,
  resultado: null,
};

/** Obtiene base relativa del API (mismo origen). */
function apiUrl(path) { return path; }

/** Ejecuta código en backend. */
async function ejecutarRemoto(codigo, lenguajeId, entrada = '', timeout = 10) {
  const r = await fetch(apiUrl('/api/ide/ejecutar'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ codigo, lenguaje: lenguajeId, entrada, timeout_seg: timeout }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(()=> '');
    throw new Error('API ' + r.status + ': ' + txt);
  }
  return r.json();
}

/** Depura Python. */
async function depurarRemoto(codigo, lenguajeId, breakpoints, maxPasos = 500) {
  const r = await fetch(apiUrl('/api/ide/depurar'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ codigo, lenguaje: lenguajeId, breakpoints, max_pasos: maxPasos }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(()=> '');
    throw new Error('API ' + r.status + ': ' + txt);
  }
  return r.json();
}

/** Carga catálogo de lenguajes y rellena <select>. */
async function cargarLenguajes() {
  const r = await fetch(apiUrl('/api/ide/lenguajes'), { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar lenguajes');
  const data = await r.json();
  const sel = document.getElementById('ide-lenguaje');
  sel.innerHTML = '';
  data.lenguajes.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.nombre + (l.disponible ? '' : ' (no disp.)');
    opt.disabled = !l.disponible;
    sel.appendChild(opt);
  });
  // Restaurar selección guardada
  if (sel.querySelector(`option[value="${estado.lenguajeActual}"]`)) {
    sel.value = estado.lenguajeActual;
  } else {
    sel.selectedIndex = 0;
    estado.lenguajeActual = sel.value;
  }
}

/** Inicializa Monaco Editor (carga una vez). */
async function initMonaco() {
  if (editor) return;
  // Lazy import monaco para no cargarlo hasta usarlo
  const monacoMod = await import('monaco-editor/esm/vs/editor/editor.api.js');
  monaco = monacoMod;
  // Configurar tema y mapa de workers (opcional)
  // Para evitar workers, usamos el modo simple y dejamos que Vite lo resuelva
  const container = document.getElementById('ide-editor');
  const cfg = lenguaje(estado.lenguajeActual);
  const archivo = estado.archivos[estado.indiceArchivo] || crearArchivo(estado.lenguajeActual, 0);
  editor = monaco.editor.create(container, {
    value: archivo.contenido,
    language: cfg.monaco,
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
  });
  editor.onDidChangeModelContent(() => {
    const cur = estado.archivos[estado.indiceArchivo];
    if (cur) cur.contenido = editor.getValue();
  });
}

/** Actualiza editor al cambiar lenguaje. */
function cambiarLenguaje(lid) {
  estado.lenguajeActual = lid;
  if (!monaco) return;
  const cfg = lenguaje(lid);
  monaco.editor.setModelLanguage(editor.getModel(), cfg.monaco);
  document.getElementById('ide-depurar').disabled = !esDepurable(lid);
  // Si no hay archivo para este lenguaje, crear uno
  if (!estado.archivos.length || estado.archivos[estado.indiceArchivo].lenguaje !== lid) {
    const nuevo = crearArchivo(lid, estado.archivos.length);
    estado.archivos.push(nuevo);
    estado.indiceArchivo = estado.archivos.length - 1;
    editor.setValue(nuevo.contenido);
  }
}

/** Muestra salida formateada. */
function mostrarSalida(res) {
  const normal = normalizarResultado(res);
  estado.resultado = normal;
  const salida = document.getElementById('ide-salida');
  salida.textContent = textoConsola(normal);
  // Actualizar depurador si hay pasos
  const depDiv = document.getElementById('ide-depurador');
  if (normal.pasos && normal.pasos.length) {
    estado.pasos = normal.pasos;
    estado.indicePaso = 0;
    depDiv.textContent = describirPaso(normal.pasos[0], 0, normal.pasos.length);
    document.getElementById('ide-dbg-info').textContent = `Línea ${normal.pasos[0].linea}`;
    document.getElementById('ide-dbg-next').disabled = false;
    document.getElementById('ide-dbg-prev').disabled = true;
  } else {
    depDiv.textContent = '(sin traza)';
    document.getElementById('ide-dbg-info').textContent = '';
    document.getElementById('ide-dbg-next').disabled = true;
    document.getElementById('ide-dbg-prev').disabled = true;
  }
  // Nota
  if (normal.nota) {
    salida.textContent += '\n\nNota: ' + normal.nota;
  }
}

/** Descripción de paso (copia de ide-utils para evitar dependencia circular en versión pura) */
function describirPaso(paso, indice, total) {
  if (!paso) return '';
  const vars = paso.variables ? Object.entries(paso.variables).map(([k,v])=>k+'='+v).join(', ') : '';
  return `Paso ${indice+1}/${total} · línea ${paso.linea}${paso.funcion && paso.funcion!=='<module>'? ' · '+paso.funcion: ''}${vars? ' · '+vars: ''}`;
}

/** Bind de eventos UI */
function bindUI() {
  const sel = document.getElementById('ide-lenguaje');
  sel.addEventListener('change', e => {
    cambiarLenguaje(e.target.value);
  });
  document.getElementById('ide-ejecutar').addEventListener('click', async () => {
    if (!editor) return;
    const codigo = editor.getValue();
    const entrada = document.getElementById('ide-entrada').value;
    try {
      const res = await ejecutarRemoto(codigo, estado.lenguajeActual, entrada);
      mostrarSalida(res);
    } catch (err) {
      document.getElementById('ide-salida').textContent = 'Error: ' + err.message;
    }
  });
  document.getElementById('ide-depurar').addEventListener('click', async () => {
    if (!esDepurable(estado.lenguajeActual)) return;
    const codigo = editor.getValue();
    try {
      const res = await depurarRemoto(codigo, estado.lenguajeActual, []);
      mostrarSalida(res);
    } catch (err) {
      document.getElementById('ide-salida').textContent = 'Error depuración: ' + err.message;
    }
  });
  document.getElementById('ide-nuevo').addEventListener('click', () => {
    const nuevo = crearArchivo(estado.lenguajeActual, estado.archivos.length);
    estado.archivos.push(nuevo);
    estado.indiceArchivo = estado.archivos.length - 1;
    editor.setValue(nuevo.contenido);
  });
  document.getElementById('ide-limpiar').addEventListener('click', () => {
    document.getElementById('ide-salida').textContent = '';
    document.getElementById('ide-entrada').value = '';
    document.getElementById('ide-depurador').textContent = '';
  });
  document.getElementById('ide-dbg-next').addEventListener('click', () => {
    if (!estado.pasos.length) return;
    estado.indicePaso = Math.min(estado.indicePaso + 1, estado.pasos.length - 1);
    const p = estado.pasos[estado.indicePaso];
    document.getElementById('ide-depurador').textContent = describirPaso(p, estado.indicePaso, estado.pasos.length);
    document.getElementById('ide-dbg-info').textContent = `Línea ${p.linea}`;
    document.getElementById('ide-dbg-prev').disabled = estado.indicePaso === 0;
    document.getElementById('ide-dbg-next').disabled = estado.indicePaso === estado.pasos.length - 1;
  });
  document.getElementById('ide-dbg-prev').addEventListener('click', () => {
    if (!estado.pasos.length) return;
    estado.indicePaso = Math.max(estado.indicePaso - 1, 0);
    const p = estado.pasos[estado.indicePaso];
    document.getElementById('ide-depurador').textContent = describirPaso(p, estado.indicePaso, estado.pasos.length);
    document.getElementById('ide-dbg-info').textContent = `Línea ${p.linea}`;
    document.getElementById('ide-dbg-prev').disabled = estado.indicePaso === 0;
    document.getElementById('ide-dbg-next').disabled = estado.indicePaso === estado.pasos.length - 1;
  });
}

/** Init público */
export async function init() {
  try {
    await cargarLenguajes();
    await initMonaco();
    bindUI();
    // Asegurar estado inicial
    if (!estado.archivos.length) {
      const archivo = crearArchivo(estado.lenguajeActual, 0);
      estado.archivos.push(archivo);
      editor.setValue(archivo.contenido);
    }
  } catch (e) {
    console.error('[IDE] Init error', e);
    const salida = document.getElementById('ide-salida');
    if (salida) salida.textContent = 'No se pudo inicializar el IDE: ' + e.message;
  }
}