// Interfaz de Servicio social y proyecto de grado.
// Los requisitos (horas, formatos, fechas) los define tu centro: aquí todo es configurable.

import { storage, CLAVES } from '../storage.js';
import {
  el, hoy, descargarTexto, aCSV, avisar, nuevoId,
} from '../utils.js';
import {
  aviso, tarjeta, vacio, boton, dialogoFormulario, confirmar,
} from '../ui-kit.js';
import {
  resumenServicio, agregarRegistroServicio, editarRegistroServicio,
  eliminarRegistroServicio, historialServicio,
  avanceProyecto, estadosHitos, siguienteHito,
  agregarHito, alternarHito, editarHito, eliminarHito, HITOS_EJEMPLO,
} from './logica-servicio.js';

const META_POR_DEFECTO = 200; // Ejemplo: cámbialo según tu centro.

export async function montarServicio() {
  const raiz = document.getElementById('cb-servicio-root');
  if (!raiz) return;

  let registros = await storage.list(CLAVES.SERVICIO_SOCIAL);
  let metaHoras = await storage.get(CLAVES.SERVICIO_META, META_POR_DEFECTO);
  let hitos = await storage.get(CLAVES.PROYECTO_GRADO, null);
  if (!Array.isArray(hitos) || hitos.length === 0) hitos = HITOS_EJEMPLO.map((h) => ({ ...h }));

  const cont = el('div');
  raiz.textContent = '';
  raiz.append(
    aviso(
      'Todo se guarda en este dispositivo',
      'Las horas de servicio social y el proyecto de grado los define tu centro o carrera. Revisa el reglamento antes de usar estas cifras como referencia.',
    ),
    cont,
  );

  const guardarRegistros = () => storage.set(CLAVES.SERVICIO_SOCIAL, registros).catch(() => {});
  const guardarHitos = () => storage.set(CLAVES.PROYECTO_GRADO, hitos).catch(() => {});

  function pintar() {
    cont.textContent = '';
    cont.append(seccionServicio(), seccionProyecto());
  }

  /* ---------------- Servicio social ---------------- */

  function seccionServicio() {
    const resumen = resumenServicio(registros, metaHoras);
    const contenido = [barraAvance(resumen.avance)];

    const cuadro = el('p', { role: 'status', style: { margin: '.5rem 0 .7rem' } },
      resumen.avance + '% · ' + resumen.horas + ' de ' + resumen.meta + ' horas · faltan ' + resumen.faltan);
    contenido.push(cuadro);
    if (resumen.completo) {
      contenido.push(aviso('¡Meta alcanzada!', 'Confírmalo con tu asesor o responsable antes de darlo por cerrado.', 'ok'));
    }

    const acciones = el('div', { style: { display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.6rem' } });
    acciones.append(
      boton('Registrar actividad', 'primario', dialogoRegistro),
      boton('Cambiar mi meta', 'secundario', dialogoMeta),
      boton('Exportar historial', 'secundario', exportarCSV),
    );
    contenido.push(acciones);

    if (registros.length === 0) {
      contenido.push(vacio('Todavía no registras horas. Cada actividad que sumes se guarda aquí con su fecha, lugar y horas.'));
    } else {
      contenido.push(listaRegistros());
    }

    return tarjeta('Horas de servicio social', contenido);
  }

  function listaRegistros() {
    const ul = el('ul', { class: 'cb-lista-lista', style: { listStyle: 'none', padding: '0', margin: '0', display: 'grid', gap: '.6rem' } });
    historialServicio(registros).forEach((r) => {
      const li = el('li', { class: 'cb-lista-item', style: { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.6rem' } });
      li.append(
        campoTexto('Actividad', r.actividad),
        campoTexto('Fecha', r.fecha),
        campoTexto('Horas', String(r.horas)),
        campoTexto('Lugar', r.lugar || '—'),
        campoTexto('Comprobante', r.comprobante || '—'),
      );
      const acciones = el('div', { style: { display: 'flex', gap: '.4rem', marginTop: '.4rem', flexWrap: 'wrap' } });
      acciones.append(
        boton('Editar', 'secundario', () => dialogoRegistro(r), { 'aria-label': 'Editar el registro de ' + r.actividad }),
        boton('Eliminar', 'peligro', () => borrarRegistro(r), { 'aria-label': 'Eliminar el registro de ' + r.actividad }),
      );
      li.append(acciones);
      ul.append(li);
    });
    return ul;
  }

  /* ---------------- Proyecto de grado ---------------- */

  function seccionProyecto() {
    const avance = avanceProyecto(hitos);
    const contenido = [
      aviso('Lista editable', 'Esta lista es un ejemplo. Usa el formato y las fechas que exija tu centro o tu asesor.'),
      barraAvance(avance.avance),
    ];
    contenido.push(el('p', { role: 'status', style: { margin: '.5rem 0 .7rem' } },
      avance.avance + '% · ' + avance.hechos + ' de ' + avance.total + ' hitos listos'));

    const sig = siguienteHito(hitos, hoy());
    if (sig) {
      const dias = sig.fecha ? ' (fecha sugerida: ' + sig.fecha + (sig.estado === 'vencido' ? ', ya pasó' : '') + ')' : '';
      contenido.push(el('p', { class: 'cb-sig-bloque', style: { margin: '0 0 .7rem' } }, 'Siguiente paso: ' + sig.titulo + dias));
    } else {
      contenido.push(aviso('¡Terminaste todos los hitos!', 'Revisa con tu asesor antes de darlo por cerrado.', 'ok'));
    }

    const ul = el('ul', { class: 'cb-lista-lista', style: { listStyle: 'none', padding: '0', margin: '0', display: 'grid', gap: '.5rem' } });
    estadosHitos(hitos, hoy()).forEach((h) => {
      const li = el('li', { class: 'cb-lista-item', style: { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.5rem .6rem' } });

      const label = el('label', { style: { display: 'flex', gap: '.5rem', alignItems: 'flex-start', cursor: 'pointer' } });
      const ck = el('input', { type: 'checkbox', style: { marginTop: '.15rem' } });
      ck.checked = !!h.hecho;
      ck.addEventListener('change', () => {
        const r = alternarHito(hitos, h.indice);
        if (r.ok) {
          hitos = r.hitos;
          guardarHitos();
          pintar();
        }
      });
      label.append(ck, el('span', null, h.titulo));
      li.append(label);

      li.append(el('p', { class: 'cb-meta-fila', style: { margin: '.3rem 0 .4rem', fontSize: '.78rem', color: 'var(--text-secondary)' } },
        h.fecha ? 'Fecha sugerida: ' + h.fecha + (h.estado === 'vencido' ? ' · vencido' : '') : 'Sin fecha'));

      const acciones = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } });
      acciones.append(
        boton('Editar', 'secundario', () => dialogoHito(h.indice), { 'aria-label': 'Editar el hito ' + h.titulo }),
        boton('Eliminar', 'peligro', () => borrarHito(h.indice), { 'aria-label': 'Eliminar el hito ' + h.titulo }),
      );
      li.append(acciones);
      ul.append(li);
    });
    contenido.push(ul);
    contenido.push(boton('+ Agregar hito', 'secundario', () => dialogoHito()));
    return tarjeta('Proyecto de grado', contenido);
  }

  /* ---------------- Auxiliares de pintado ---------------- */

  function barraAvance(avance) {
    const relleno = el('div', { style: { width: avance + '%', height: '100%', background: 'var(--primary)', borderRadius: 'var(--radius-full)' } });
    const barra = el('div', {
      class: 'onboarding-progreso',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(avance),
      style: { height: '.6rem', background: 'var(--gray-100)', borderRadius: 'var(--radius-full)', overflow: 'hidden' },
    }, null);
    barra.append(relleno);
    return barra;
  }

  function campoTexto(titulo, valor) {
    const p = el('p', { class: 'cb-campo-texto', style: { margin: '.15rem 0', fontSize: '.82rem' } });
    p.append(el('span', { style: { fontWeight: '600' } }, titulo + ': '));
    p.append(el('span', null, valor));
    return p;
  }

  /* ---------------- Diálogos ---------------- */

  async function dialogoRegistro(actual) {
    const { confirmado, valores } = await dialogoFormulario(actual ? 'Editar registro de horas' : 'Registrar actividad', [
      { clave: 'fecha', etiqueta: 'Fecha de la actividad', tipo: 'date', valor: (actual && actual.fecha) || hoy(), requerido: true },
      { clave: 'actividad', etiqueta: 'Actividad realizada', valor: actual ? actual.actividad : '', placeholder: 'Ej: jornada de limpieza del parque', requerido: true, ayuda: 'Máx. 100 caracteres.' },
      { clave: 'horas', etiqueta: 'Horas', tipo: 'number', valor: actual ? String(actual.horas) : '', min: 0.5, max: 24, paso: '0.5', inputmode: 'decimal', requerido: true, ayuda: 'Entre 0.5 y 24 horas por actividad.' },
      { clave: 'lugar', etiqueta: 'Lugar (opcional)', valor: actual ? actual.lugar : '', placeholder: 'Ej: parque de la comunidad' },
      { clave: 'comprobante', etiqueta: 'Comprobante o referencia (opcional)', valor: actual ? actual.comprobante : '', placeholder: 'Ej: carta del comité' },
    ], actual ? 'Guardar cambios' : 'Guardar');
    if (!confirmado) return;

    const r = actual
      ? editarRegistroServicio(registros, actual.id, {
        fecha: valores.fecha, actividad: valores.actividad, horas: Number(valores.horas),
        lugar: valores.lugar, comprobante: valores.comprobante,
      })
      : agregarRegistroServicio(registros, {
        fecha: valores.fecha, actividad: valores.actividad, horas: Number(valores.horas),
        lugar: valores.lugar, comprobante: valores.comprobante,
      }, { id: nuevoId });

    if (!r.ok) { avisar(r.motivo, 'error'); return; }
    registros = r.registros;
    await guardarRegistros();
    avisar('Registro guardado.');
    pintar();
  }

  async function borrarRegistro(r) {
    const ok = await confirmar('Eliminar registro', 'Se va a borrar el registro de «' + r.actividad + '» del ' + r.fecha + '.', 'Borrar');
    if (!ok) return;
    const r2 = eliminarRegistroServicio(registros, r.id);
    if (!r2.ok) { avisar(r2.motivo, 'error'); return; }
    registros = r2.registros;
    await guardarRegistros();
    avisar('Registro borrado.');
    pintar();
  }

  async function dialogoMeta() {
    const { confirmado, valores } = await dialogoFormulario('Meta de horas', [
      { clave: 'meta', etiqueta: 'Horas que necesitas completar', tipo: 'number', valor: String(metaHoras), min: 1, max: 4000, paso: '1', inputmode: 'numeric', requerido: true, ayuda: 'Según tu centro o carrera. Ejemplo: 200.' },
    ]);
    if (!confirmado) return;
    const m = Number(valores.meta);
    if (!Number.isFinite(m) || m <= 0 || m > 4000) { avisar('La meta debe estar entre 1 y 4000 horas.', 'error'); return; }
    metaHoras = m;
    await storage.set(CLAVES.SERVICIO_META, m).catch(() => {});
    pintar();
  }

  async function dialogoHito(indice) {
    const actual = typeof indice === 'number' ? hitos[indice] : null;
    const { confirmado, valores } = await dialogoFormulario(actual ? 'Editar hito' : 'Agregar hito', [
      { clave: 'titulo', etiqueta: 'Nombre del hito', valor: actual ? actual.titulo : '', placeholder: 'Ej: Anteproyecto', requerido: true },
      { clave: 'fecha', etiqueta: 'Fecha sugerida (opcional)', tipo: 'date', valor: actual ? actual.fecha : '' },
    ], 'Guardar');
    if (!confirmado) return;

    const r = actual
      ? editarHito(hitos, indice, { titulo: valores.titulo, fecha: valores.fecha })
      : agregarHito(hitos, { titulo: valores.titulo, fecha: valores.fecha });
    if (!r.ok) { avisar(r.motivo, 'error'); return; }
    hitos = r.hitos;
    await guardarHitos();
    pintar();
  }

  async function borrarHito(indice) {
    const ok = await confirmar('Quitar hito', 'Se va a quitar «' + hitos[indice].titulo + '» de la lista.', 'Quitar');
    if (!ok) return;
    const r = eliminarHito(hitos, indice);
    if (!r.ok) { avisar(r.motivo, 'error'); return; }
    hitos = r.hitos;
    await guardarHitos();
    pintar();
  }

  function exportarCSV() {
    if (registros.length === 0) { avisar('Todavía no hay horas que exportar.', 'error'); return; }
    const filas = [['fecha', 'actividad', 'horas', 'lugar', 'comprobante']];
    historialServicio(registros).forEach((r) => {
      filas.push([r.fecha, r.actividad, r.horas, r.lugar || '', r.comprobante || '']);
    });
    descargarTexto('servicio-social-' + hoy() + '.csv', aCSV(filas), 'text/csv;charset=utf-8');
    avisar('Historial descargado en formato CSV.');
  }

  pintar();
}

export default { montar: montarServicio };
