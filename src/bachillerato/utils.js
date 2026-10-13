/* ===================================================================
   utils.js — Ayudantes compartidos por las funciones de bachillerato.

   Regla de seguridad: el texto que escribe el estudiante NUNCA se
   inserta con innerHTML. Acá sólo hay formas de crear nodos con
   textContent, que el navegador no interpreta como código.
   =================================================================== */

/* ---- Elementos del DOM ---- */

/** Crea un elemento y le pone texto seguro (textContent, nunca innerHTML). */
export function el(tag, attrs = {}, texto = null) {
  const nodo = document.createElement(tag);
  for (const clave of Object.keys(attrs)) {
    const valor = attrs[clave];
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'class') nodo.className = String(valor);
    else if (clave === 'dataset') {
      for (const d of Object.keys(valor)) nodo.dataset[d] = String(valor[d]);
    } else if (clave === 'style' && typeof valor === 'object') {
      Object.assign(nodo.style, valor);
    } else if (clave.slice(0, 2) === 'on' && typeof valor === 'function') {
      nodo.addEventListener(clave.slice(2), valor);
    } else if (valor === true) {
      nodo.setAttribute(clave, '');
    } else {
      nodo.setAttribute(clave, String(valor));
    }
  }
  if (texto !== null && texto !== undefined) nodo.textContent = String(texto);
  return nodo;
}

/** Vacía un contenedor y le pone nodos hijos. */
export function render(contenedor, nodos) {
  if (!contenedor) return;
  contenedor.textContent = '';
  const lista = Array.isArray(nodos) ? nodos : [nodos];
  for (const n of lista) {
    if (n) contenedor.appendChild(n);
  }
}

/* ---- Fechas ---- */

/** Convierte 'YYYY-MM-DD' (o Date) a medianoche local. Devuelve null si es inválida. */
export function aFecha(fecha) {
  if (fecha instanceof Date) {
    return isNaN(fecha.getTime()) ? null : new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  }
  const s = String(fecha || '').trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null; // ej: 2026-02-31
  return d;
}

/**
 * Fecha de hoy a medianoche (se puede inyectar para tests).
 * Acepta un 'YYYY-MM-DD'; se parsea a mano porque new Date('AAAA-MM-DD')
 * lo interpreta como UTC medianoche y en El Salvador eso cae al día
 * anterior, lo que desfasaba todos los cálculos de vencimiento.
 */
export function hoy(deso) {
  const normalizar = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (deso === undefined || deso === null) return normalizar(new Date());
  const f = aFecha(deso);
  if (f) return f;
  const d = new Date(deso);
  return isNaN(d.getTime()) ? normalizar(new Date()) : normalizar(d);
}

/** Suma días a una fecha, sin efectos de horario de verano. */
export function sumarDias(fecha, dias) {
  const d = new Date(fecha.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

/** Días completos entre dos fechas (positivo si b es después de a). */
export function diasEntre(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Formatea 'YYYY-MM-DD' como 'lun 12 oct' (es-SV, sin depender de ICU completa). */
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function formatearFechaCorta(fecha) {
  const d = aFecha(fecha);
  if (!d) return '';
  return DIAS_CORTO[d.getDay()] + ' ' + d.getDate() + ' ' + MESES_CORTO[d.getMonth()];
}

export function formatearFechaLarga(fecha) {
  const d = aFecha(fecha);
  if (!d) return '';
  return DIAS_LARGO[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES_LARGO[d.getMonth()] + ' de ' + d.getFullYear();
}

/** Clave 'YYYY-MM-DD' de una fecha, para agrupar por día. */
export function claveFecha(fecha) {
  const d = aFecha(fecha) || fecha;
  const dd = d.getDate();
  const mm = d.getMonth() + 1;
  return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
}

export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/* ---- Números ---- */

/** Redondea sin sorpresas por los decimales flotantes (ej: 1.005 → 1.01). */
export function redondear(valor, decimales = 2) {
  const n = Number(valor);
  if (!isFinite(n)) return 0;
  const f = Math.pow(10, decimales);
  // +1e-9 compensa errores típicos de punto flotante al multiplicar
  return Math.round((n + Number.EPSILON * n * 10) * f) / f;
}

/** Limita un número dentro de un rango. */
export function limitar(valor, min, max) {
  return Math.min(max, Math.max(min, valor));
}

/* ---- Archivos ---- */

/** Dispara la descarga de un texto como archivo. */
export function descargarTexto(nombreArchivo, contenido, tipo = 'application/json;charset=utf-8') {
  const blob = new Blob(['\ufeff' + contenido], { type: tipo }); // \ufeff = BOM para que Excel lea bien el UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

/** Convierte filas [{a:1,b:2}] a texto CSV con separador ';' y comillas dobles. */
export function aCSV(filas, columnas) {
  if (!filas || !filas.length) return '';
  const cols = columnas || Object.keys(filas[0]);
  const escapar = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lineas = [cols.map(escapar).join(';')];
  for (const fila of filas) lineas.push(cols.map((c) => escapar(fila[c])).join(';'));
  return lineas.join('\r\n');
}

/* ---- Avisos ---- */

/** Muestra un toast reutilizando el de la app si existe; si no, una burbuja propia. */
export function avisar(mensaje, tipo = 'success') {
  const texto = String(mensaje || '');
  if (typeof window !== 'undefined' && typeof window.mostrarToast === 'function') {
    window.mostrarToast(texto, tipo);
    return;
  }
  if (typeof document === 'undefined') return;
  const burbuja = el('div', {
    role: 'status',
    'aria-live': 'polite',
    style: {
      position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)',
      padding: '.6rem 1rem', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
      zIndex: 9999, fontSize: '.85rem', maxWidth: '90vw',
    },
  }, texto);
  document.body.appendChild(burbuja);
  setTimeout(() => burbuja.remove(), 3200);
}

/** Id corto y legible para los registros nuevos. */
export function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
