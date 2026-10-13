/* ===================================================================
   compartir.js — Exportar el horario o la agenda como imagen y
   compartirlo (pensado para pegarlo en un grupo de WhatsApp).

   La parte que decide QUÉ se dibuja y cómo se reparte el espacio es
   una función pura (construirModelo), así se puede probar. La parte
   que usa canvas va aparte.

   Orden de preferencia al compartir:
   1. Web Share API con archivo  (celular: abre WhatsApp directo)
   2. Web Share API con texto    (si el navegador no comparte archivos)
   3. Descarga del archivo       (siempre funciona, incluso sin red)
   =================================================================== */

import { el } from '../utils.js';

/* Colores que se leen del tema activo, nunca fijos. */
function leerTema() {
  const cs = typeof window !== 'undefined'
    ? window.getComputedStyle(document.documentElement)
    : null;
  const leer = (variable, defecto) => {
    if (!cs) return defecto;
    const v = cs.getPropertyValue(variable).trim();
    return v || defecto;
  };
  return {
    fondo: leer('--bg-card', '#ffffff'),
    texto: leer('--text', '#111827'),
    suave: leer('--text-secondary', '#6b7280'),
    linea: leer('--border', '#e5e7eb'),
    acento: leer('--primary', '#2563eb'),
    sobreAcento: leer('--on-primary', '#ffffff'),
  };
}

/* ------------------------------------------------------------------
   Modelo de la imagen (puro: no toca canvas)
   ------------------------------------------------------------------ */

/**
 * Arma la estructura de la tarjeta que se va a dibujar.
 * @param {object} opts { titulo, subtitulo, encabezados, filas, pie }
 *   encabezados: string[]
 *   filas: string[][]
 * @returns {object} { titulo, subtitulo, encabezados, filas, pie,
 *                     ancho, alto, columnas }
 */
export function construirModelo(opts) {
  const o = opts || {};
  const encabezados = Array.isArray(o.encabezados) ? o.encabezados : [];
  const filasBrutas = Array.isArray(o.filas) ? o.filas : [];

  // Se limita cada celda para que ninguna palabra desborde la tarjeta
  const limiteCelda = 34;
  const filas = filasBrutas.map((fila) => (Array.isArray(fila) ? fila : [])
    .map((celda) => {
      const t = String(celda === null || celda === undefined ? '' : celda);
      return t.length > limiteCelda ? t.slice(0, limiteCelda - 1) + '…' : t;
    }));

  const altoFila = 42;
  const altoCabecera = 56;
  const altoPie = filas.length ? 46 : 0;
  const ancho = 900;
  const alto = 130 + filas.length * altoFila + altoCabecera + altoPie;

  return {
    titulo: String(o.titulo || 'Cherry-Bomb'),
    subtitulo: String(o.subtitulo || ''),
    encabezados: encabezados.map(String),
    filas,
    pie: String(o.pie || ''),
    ancho,
    alto: Math.max(320, alto),
    altoFila,
    anchoColumna: Math.floor((ancho - 80) / Math.max(1, encabezados.length)),
  };
}

/** Construye el texto plano que se envía junto con la imagen. */
export function construirTexto(modelo) {
  const m = modelo;
  const lineas = [];
  lineas.push(m.titulo);
  if (m.subtitulo) lineas.push(m.subtitulo);
  lineas.push('');
  const anchoCol = m.encabezados.map((h, i) => Math.max(
    h.length,
    ...m.filas.map((f) => String(f[i] || '').length)
  ));
  const formatear = (celdas) => celdas
    .map((c, i) => String(c || '').padEnd(anchoCol[i] + 2))
    .join('')
    .trimEnd();
  lineas.push(formatear(m.encabezados));
  lineas.push(anchoCol.map((a) => '─'.repeat(a)).join('  '));
  m.filas.forEach((f) => lineas.push(formatear(f)));
  if (m.pie) { lineas.push(''); lineas.push(m.pie); }
  return lineas.join('\n');
}

/* ------------------------------------------------------------------
   Dibujo en canvas
   ------------------------------------------------------------------ */

/**
 * Dibuja el modelo en un canvas y devuelve el Blob de la imagen PNG.
 * @param {object} modelo  ver construirModelo()
 * @param {number} escala  multiplicador para pantallas de alta densidad
 * @returns {Promise<Blob>}
 */
export function renderizarImagen(modelo, escala = 2) {
  return new Promise((resolver, rechazar) => {
    if (typeof document === 'undefined') {
      rechazar(new Error('Sin navegador no se puede dibujar la imagen.'));
      return;
    }
    const tema = leerTema();
    const canvas = document.createElement('canvas');
    canvas.width = modelo.ancho * escala;
    canvas.height = modelo.alto * escala;
    const ctx = canvas.getContext('2d');
    if (!ctx) { rechazar(new Error('Este navegador no puede dibujar la imagen.')); return; }

    ctx.scale(escala, escala);
    ctx.textBaseline = 'top';

    /* Fondo */
    ctx.fillStyle = tema.fondo;
    ctx.fillRect(0, 0, modelo.ancho, modelo.alto);

    /* Banda superior con el color de acento del tema */
    ctx.fillStyle = tema.acento;
    ctx.fillRect(0, 0, modelo.ancho, 96);

    ctx.fillStyle = tema.sobreAcento;
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.fillText(modelo.titulo, 40, 30);

    let y = 120;
    if (modelo.subtitulo) {
      ctx.fillStyle = tema.suave;
      ctx.font = '19px system-ui, -apple-system, sans-serif';
      ctx.fillText(modelo.subtitulo, 40, y);
      y += 40;
    }

    /* Encabezados de tabla */
    ctx.fillStyle = tema.suave;
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    modelo.encabezados.forEach((h, i) => {
      ctx.fillText(h.toUpperCase(), 40 + i * modelo.anchoColumna, y);
    });
    y += 30;
    ctx.strokeStyle = tema.linea;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(modelo.ancho - 40, y);
    ctx.stroke();
    y += 14;

    /* Filas con fondo alternado para que se lean mejor */
    modelo.filas.forEach((fila, i) => {
      if (i % 2 === 1) {
        ctx.fillStyle = tema.linea;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(32, y - 6, modelo.ancho - 64, modelo.altoFila - 6);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = tema.texto;
      ctx.font = '19px system-ui, -apple-system, sans-serif';
      fila.forEach((celda, j) => {
        ctx.fillText(String(celda || ''), 40 + j * modelo.anchoColumna, y);
      });
      y += modelo.altoFila;
    });

    /* Pie */
    if (modelo.pie) {
      ctx.fillStyle = tema.suave;
      ctx.font = 'italic 16px system-ui, -apple-system, sans-serif';
      ctx.fillText(modelo.pie, 40, y + 10);
    }

    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (blob) resolver(blob);
        else rechazar(new Error('No se pudo crear la imagen.'));
      }, 'image/png');
    } else {
      rechazar(new Error('Este navegador no puede exportar imágenes.'));
    }
  });
}

/* ------------------------------------------------------------------
   Compartir
   ------------------------------------------------------------------ */

/** ¿Este navegador puede compartir archivos? */
export function puedeCompartirArchivos() {
  return typeof navigator !== 'undefined'
    && typeof navigator.canShare === 'function'
    && typeof navigator.share === 'function';
}

/** ¿Este navegador puede compartir texto? */
export function puedeCompartirTexto() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Comparte el modelo como imagen y como texto.
 * @returns {Promise<'compartido'|'descargado'|'cancelado'>}
 */
export async function compartirModelo(modelo, nombreArchivo) {
  const texto = construirTexto(modelo);
  const archivoNombre = nombreArchivo || 'cherry-bomb.png';

  let blob = null;
  try {
    blob = await renderizarImagen(modelo);
  } catch (e) {
    blob = null;
  }

  if (blob && puedeCompartirArchivos()) {
    const archivo = new File([blob], archivoNombre, { type: 'image/png' });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: modelo.titulo, text: texto });
        return 'compartido';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelado';
        // Si falla, seguimos con las otras opciones
      }
    }
  }

  if (puedeCompartirTexto()) {
    try {
      await navigator.share({ title: modelo.titulo, text: texto });
      return 'compartido';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelado';
    }
  }

  /* Respaldo: descargar lo que se pueda. */
  if (blob) {
    descargarBlob(archivoNombre, blob);
    return 'descargado';
  }
  descargarBlob(archivoNombre.replace(/\.png$/, '.txt'), texto, 'text/plain;charset=utf-8');
  return 'descargado';
}

function descargarBlob(nombre, blob, tipo) {
  const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------
   Botón de compartir reutilizable
   ------------------------------------------------------------------ */

/**
 * Crea un botón «Compartir» que arma el modelo, lo dibuja y lo comparte.
 * @param {function} fabricaModelo () => modelo
 */
export function crearBotonCompartir(textoBoton, fabricaModelo, avisar) {
  const b = el('button', {
    type: 'button',
    class: 'btn btn-sm btn-outline',
    'aria-label': textoBoton,
  }, textoBoton);
  b.addEventListener('click', async () => {
    const antes = b.textContent;
    b.disabled = true;
    b.textContent = 'Preparando…';
    try {
      const modelo = fabricaModelo();
      if (!modelo.filas.length) {
        if (avisar) avisar('No hay nada que compartir todavía.', 'error');
        return;
      }
      const resultado = await compartirModelo(modelo);
      if (avisar) {
        if (resultado === 'compartido') avisar('Listo, se abrió para compartir.', 'success');
        else if (resultado === 'descargado') avisar('Se guardó el archivo para que lo compartas.', 'success');
        // 'cancelado' no avisa: el usuario canceló a propósito
      }
    } catch (e) {
      if (avisar) avisar('No se pudo compartir en este momento.', 'error');
    } finally {
      b.disabled = false;
      b.textContent = antes;
    }
  });
  return b;
}
