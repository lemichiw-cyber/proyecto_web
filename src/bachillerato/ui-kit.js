/* ===================================================================
   ui-kit.js — Piezas de interfaz reutilizadas por todas las secciones
   nuevas de bachillerato.

   Reglas que respeta:
   * Ningún texto escrito por el estudiante pasa por innerHTML. Todo
     se crea con textContent (ver utils.js → el()).
   * Los focos son visibles, los botones llevan etiqueta y los campos
     tienen <label> asociado.
   * Los colores salen de las variables CSS del tema activo; nunca hay
     colores fijos, así funciona en los 13 temas.
   =================================================================== */

import { el, avisar } from './utils.js';

/* ---- Etiquetas ---- */

/** Aviso con icono de alerta. `tono`: 'info' | 'aviso' | 'ok'. */
export function aviso(titulo, texto, tono = 'info') {
  const color = tono === 'aviso' ? 'var(--amber)' : tono === 'ok' ? 'var(--green)' : 'var(--primary)';
  const caja = el('div', {
    class: 'cb-aviso',
    role: tono === 'aviso' ? 'alert' : 'note',
    style: {
      display: 'flex', gap: '.6rem', alignItems: 'flex-start',
      padding: '.75rem .9rem', borderRadius: 'var(--radius)',
      background: 'var(--gray-50)', border: '1px solid var(--border)',
      borderLeft: '4px solid ' + color,
      fontSize: '.85rem', lineHeight: '1.5', marginBottom: '1rem',
    },
  });
  caja.appendChild(el('span', {
    'aria-hidden': 'true',
    style: { color: color, fontWeight: '700', flexShrink: '0' },
  }, tono === 'aviso' ? '!' : tono === 'ok' ? '✓' : 'i'));
  const cajaTexto = el('div', { style: { flex: '1', minWidth: '0' } });
  cajaTexto.appendChild(el('strong', { style: { display: 'block', marginBottom: '.15rem' } }, titulo));
  cajaTexto.appendChild(el('span', { style: { color: 'var(--text-secondary)' } }, texto));
  caja.appendChild(cajaTexto);
  return caja;
}

/** Etiqueta de estado pequeña (aprobada, pendiente, vencida…). */
export function etiqueta(texto, color) {
  return el('span', {
    style: {
      display: 'inline-block', padding: '.1rem .5rem', borderRadius: 'var(--radius-full)',
      fontSize: '.72rem', fontWeight: '600', whiteSpace: 'nowrap',
      background: color || 'var(--gray-100)', color: 'var(--text)',
    },
  }, texto);
}

/* ---- Formularios ---- */

let contador = 0;
/** Identificador estable para asociar <label> y control. */
function idUnico() {
  contador += 1;
  return 'cb-f' + contador;
}

/**
 * Campo de texto con etiqueta visible.
 * @param {object} opts { etiqueta, tipo, valor, placeholder, requerido,
 *                        min, max, paso, ayuda, onChange, inputmode }
 */
export function campo(opts) {
  const o = opts || {};
  const id = idUnico();
  const wrap = el('div', { style: { marginBottom: '.7rem' } });
  wrap.appendChild(el('label', { for: id, style: { display: 'block', fontSize: '.82rem', fontWeight: '600', marginBottom: '.25rem' } },
    o.etiqueta + (o.requerido ? ' *' : '')));
  const attrs = {
    id, class: 'input', type: o.tipo || 'text',
    placeholder: o.placeholder || '',
    style: { width: '100%', padding: '.5rem .65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit' },
  };
  if (o.requerido) attrs.required = true;
  if (o.min !== undefined) attrs.min = o.min;
  if (o.max !== undefined) attrs.max = o.max;
  if (o.paso !== undefined) attrs.step = o.paso;
  if (o.inputmode) attrs.inputmode = o.inputmode;
  const control = el('input', attrs);
  if (o.valor !== undefined && o.valor !== null) control.value = o.valor;
  if (o.onChange) control.addEventListener('input', o.onChange);
  wrap.appendChild(control);
  if (o.ayuda) {
    const ayudaId = id + '-ayuda';
    control.setAttribute('aria-describedby', ayudaId);
    wrap.appendChild(el('span', { id: ayudaId, style: { display: 'block', fontSize: '.75rem', color: 'var(--text-secondary)', marginTop: '.2rem' } }, o.ayuda));
  }
  wrap._control = control;
  return wrap;
}

/** Selector desplegable con etiqueta. */
export function selector(opts) {
  const o = opts || {};
  const id = idUnico();
  const wrap = el('div', { style: { marginBottom: '.7rem' } });
  wrap.appendChild(el('label', { for: id, style: { display: 'block', fontSize: '.82rem', fontWeight: '600', marginBottom: '.25rem' } }, o.etiqueta));
  const control = el('select', {
    id,
    style: { width: '100%', padding: '.5rem .65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit' },
  });
  (o.opciones || []).forEach((op) => {
    const opcion = el('option', { value: op.valor }, op.texto);
    if (String(op.valor) === String(o.valor)) opcion.selected = true;
    control.appendChild(opcion);
  });
  if (o.onChange) control.addEventListener('change', o.onChange);
  wrap.appendChild(control);
  wrap._control = control;
  return wrap;
}

/* ---- Botones ---- */

/**
 * Botón. `tono`: 'primario' | 'secundario' | 'peligro' | 'fantasma'.
 * Reutiliza las clases .btn que ya existen en el tema, así respeta
 * los 13 temas sin duplicar estilos.
 */
const TONOS_BTN = {
  primario: 'btn-primary',
  secundario: 'btn-outline',
  peligro: 'btn-danger',
  fantasma: 'btn-ghost',
};

export function boton(texto, tono, onClick, attrs) {
  const b = el('button', Object.assign({
    type: 'button',
    class: 'btn btn-sm ' + (TONOS_BTN[tono] || TONOS_BTN.secundario),
  }, attrs || {}), texto);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/* ---- Tarjetas ---- */

/** Tarjeta con título y contenido. */
export function tarjeta(titulo, contenido, extraTitulo) {
  const c = el('div', {
    style: {
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '.9rem', marginBottom: '.9rem',
    },
  });
  if (titulo) {
    const cabecera = el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', marginBottom: '.6rem' },
    });
    cabecera.appendChild(el('h3', { style: { margin: '0', fontSize: '1rem' } }, titulo));
    if (extraTitulo) cabecera.appendChild(extraTitulo);
    c.appendChild(cabecera);
  }
  if (contenido) {
    if (Array.isArray(contenido)) contenido.forEach((n) => n && c.appendChild(n));
    else c.appendChild(contenido);
  }
  return c;
}

/** Estado vacío con mensaje claro. */
export function vacio(mensaje, accionTexto, onAccion) {
  const c = el('div', {
    style: {
      textAlign: 'center', padding: '1.4rem .8rem', color: 'var(--text-secondary)',
      fontSize: '.87rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
    },
  });
  c.appendChild(el('p', { style: { margin: '0 0 .6rem' } }, mensaje));
  if (accionTexto && onAccion) c.appendChild(boton(accionTexto, 'primario', onAccion));
  return c;
}

/* ---- Diálogos ---- */

/**
 * Diálogo modal accesible: fondo oscuro, se cierra con Escape,
 * devuelve el foco al botón que lo abrió y atrapa el Tab dentro.
 * @param {object} opts { titulo, contenido, onCerrar }
 * @returns {Promise<boolean>} true si se confirmó
 */
export function dialogo(opts) {
  const o = opts || {};
  return new Promise((resolver) => {
    const devolverFoco = document.activeElement;
    const cerrado = { valor: false };

    const fondo = el('div', {
      class: 'cb-dialogo-fondo',
      style: {
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,.5)', zIndex: 9990,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      },
    });

    const caja = el('div', {
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cb-dialogo-titulo',
      style: {
        background: 'var(--bg-card)', color: 'var(--text)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
        width: 'min(520px, 100%)', maxHeight: '86vh', overflowY: 'auto', padding: '1rem',
      },
    });
    caja.appendChild(el('h3', { id: 'cb-dialogo-titulo', style: { margin: '0 0 .7rem', fontSize: '1.05rem' } }, o.titulo || ''));

    const cuerpo = el('div');
    if (Array.isArray(o.contenido)) o.contenido.forEach((n) => n && cuerpo.appendChild(n));
    else if (o.contenido) cuerpo.appendChild(o.contenido);
    caja.appendChild(cuerpo);

    const cerrar = (resultado) => {
      if (cerrado.valor) return;
      cerrado.valor = true;
      document.removeEventListener('keydown', alTeclear, true);
      fondo.remove();
      document.body.classList.remove('no-scroll');
      if (o.onCerrar) o.onCerrar(resultado);
      if (devolverFoco && devolverFoco.focus) devolverFoco.focus();
      resolver(resultado);
    };

    const alTeclear = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); cerrar(false); return; }
      if (ev.key !== 'Tab') return;
      // Atrapar el foco dentro del diálogo
      const foco = caja.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!foco.length) return;
      const primero = foco[0];
      const ultimo = foco[foco.length - 1];
      if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
    };

    fondo.addEventListener('mousedown', (ev) => { if (ev.target === fondo) cerrar(false); });
    document.addEventListener('keydown', alTeclear, true);

    const pie = el('div', { style: { display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' } });
    const btnCancelar = boton('Cancelar', 'fantasma', () => cerrar(false));
    const btnConfirmar = boton(o.textoConfirmar || 'Guardar', 'primario', () => cerrar(true), { 'aria-label': o.textoConfirmar || 'Guardar' });
    pie.appendChild(btnCancelar);
    pie.appendChild(btnConfirmar);
    caja.appendChild(pie);

    fondo.appendChild(caja);
    document.body.appendChild(fondo);
    document.body.classList.add('no-scroll');

    // El foco entra al primer campo del diálogo
    const primerCampo = caja.querySelector('input, select, textarea, button');
    if (primerCampo) primerCampo.focus();
  });
}

/** Diálogo de confirmación corto (borrar, cancelar…). */
export function confirmar(titulo, mensaje, textoConfirmar) {
  return dialogo({
    titulo,
    contenido: el('p', { style: { margin: '0', fontSize: '.9rem', lineHeight: '1.5' } }, mensaje),
    textoConfirmar: textoConfirmar || 'Sí, continuar',
  });
}

/** Formulario dentro de un diálogo. Devuelve { confirmado, valores }. */
export function dialogoFormulario(titulo, campos, textoConfirmar) {
  const nodos = campos.map((f) => {
    if (f.tipo === 'selector') {
      const s = selector({ etiqueta: f.etiqueta, opciones: f.opciones, valor: f.valor, ayuda: f.ayuda });
      return s;
    }
    if (f.tipo === 'area') {
      const wrap = el('div', { style: { marginBottom: '.7rem' } });
      const id = idUnico();
      wrap.appendChild(el('label', { for: id, style: { display: 'block', fontSize: '.82rem', fontWeight: '600', marginBottom: '.25rem' } }, f.etiqueta));
      const ta = el('textarea', {
        id, rows: f.filas || 3,
        placeholder: f.placeholder || '',
        style: { width: '100%', padding: '.5rem .65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit', resize: 'vertical' },
      });
      ta.value = f.valor || '';
      wrap.appendChild(ta);
      wrap._control = ta;
      return wrap;
    }
    const c = campo({
      etiqueta: f.etiqueta, tipo: f.tipo || 'text', valor: f.valor,
      placeholder: f.placeholder, requerido: f.requerido,
      min: f.min, max: f.max, paso: f.paso, ayuda: f.ayuda, inputmode: f.inputmode,
    });
    return c;
  });

  return dialogo({ titulo, contenido: nodos, textoConfirmar: textoConfirmar || 'Guardar' }).then((confirmado) => {
    const valores = {};
    campos.forEach((f, i) => { valores[f.clave] = nodos[i]._control.value; });
    return { confirmado, valores };
  });
}

/** Muestra un error de validación junto a un control sin mover el foco a la nada. */
export function avisarError(mensaje) {
  avisar(mensaje, 'error');
}

/* ---- Botón de compartir (se reutiliza en horario, agenda y notas) ---- */
export function botonCompartir(texto, onCompartir) {
  return boton(texto || 'Compartir', 'secundario', onCompartir, {
    'aria-label': 'Compartir ' + (texto || ''),
  });
}
