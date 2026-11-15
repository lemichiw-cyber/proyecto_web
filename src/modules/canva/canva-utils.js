export function exportarPNG(canvasEl) {
  return new Promise((resolve) => {
    const dataUrl = canvasEl.toDataURL('image/png');
    resolve(dataUrl);
  });
}

export function crearElemento(tipo, opciones = {}) {
  const el = document.createElement('div');
  el.className = 'canva-elemento';
  el.style.position = 'absolute';
  el.style.left = (opciones.left || 50) + 'px';
  el.style.top = (opciones.top || 50) + 'px';
  el.style.width = (opciones.width || 120) + 'px';
  el.style.height = (opciones.height || 60) + 'px';
  el.style.cursor = 'move';
  el.style.userSelect = 'none';
  el.contentEditable = tipo === 'texto';
  if (tipo === 'texto') {
    el.style.border = '1px dashed transparent';
    el.style.padding = '4px';
    el.style.fontSize = '16px';
    el.textContent = opciones.texto || 'Texto';
  } else if (tipo === 'rect') {
    el.style.background = opciones.color || '#4f46e5';
    el.style.borderRadius = '4px';
  } else if (tipo === 'img') {
    el.style.background = '#eee';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.overflow = 'hidden';
    const img = document.createElement('img');
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    el.appendChild(img);
    el._img = img;
  }
  return el;
}
