/* ===================================================================
   agenda-ui.js — Pantalla de «Horario y tareas».

   Tres pestañas:
     · Horario     → clases de la semana (materia, día, hora, aula)
     · Tareas      → entregas y evaluaciones por materia
     · Próximos 7 días → lo que vence pronto, con las vencidas marcadas

   Se carga de forma diferida al entrar a la sección.
   =================================================================== */

import { storage, CLAVES } from '../storage.js';
import { el, render, avisar, nuevoId, formatearFechaCorta, claveFecha, hoy, DIAS_SEMANA } from '../utils.js';
import {
  validarTarea, validarClase, estadoTarea, proximosDias, resumenEstados,
  clasesDelDia, diaDeHoy, clasesDeHoy, horasSemanales, materiasDelHorario,
  detectarSolapes, tareasParaRecordar, TEXTO_TIPO, TEXTO_ESTADO, TIPOS_TAREA, ESTADOS_TAREA,
} from './logica-agenda.js';
import { construirModelo, crearBotonCompartir } from '../compartir/compartir.js';
import { aviso, etiqueta, selector, boton, tarjeta, vacio, confirmar, dialogoFormulario } from '../ui-kit.js';

const CLAVE_RECORDATORIOS = 'agenda.recordatorios.vistos';

let raiz = null;
let estado = { horario: [], tareas: [], pestana: 'proximos' };
let intervaloRecordatorios = null;

/* Colores por tipo de actividad, siempre con variables del tema. */
const COLOR_TIPO = {
  tarea: 'var(--primary-light)',
  examen: 'var(--red-light)',
  laboratorio: 'var(--teal-light)',
  proyecto: 'var(--purple-light)',
};
const COLOR_ESTADO = {
  vencida: 'var(--red)',
  hoy: 'var(--amber)',
  manana: 'var(--purple)',
  semana: 'var(--primary)',
  entregada: 'var(--green)',
};

/* ---------------- Datos ---------------- */

async function cargar() {
  estado.horario = await storage.list(CLAVES.HORARIO);
  estado.tareas = await storage.list(CLAVES.TAREAS_AGENDA);
}

const guardarHorario = () => storage.set(CLAVES.HORARIO, estado.horario);
const guardarTareas = () => storage.set(CLAVES.TAREAS_AGENDA, estado.tareas);

/* ---------------- Montaje ---------------- */

export async function montar() {
  raiz = document.getElementById('cb-planificador-root');
  if (!raiz) return;
  await cargar();
  dibujar();
  programarRecordatorios();
}

function dibujar() {
  const cont = el('div');

  /* Pestañas */
  const pestanas = [
    { id: 'proximos', texto: 'Próximos 7 días' },
    { id: 'horario', texto: 'Horario' },
    { id: 'tareas', texto: 'Tareas' },
  ];
  const nav = el('div', {
    role: 'tablist', 'aria-label': 'Vistas del planificador',
    style: { display: 'flex', gap: '.35rem', marginBottom: '1rem', flexWrap: 'wrap' },
  });
  pestanas.forEach((p) => {
    const activa = estado.pestana === p.id;
    const b = el('button', {
      type: 'button', role: 'tab', id: 'cb-pestana-' + p.id,
      'aria-selected': String(activa),
      'aria-controls': 'cb-panel-pestana',
      tabindex: activa ? '0' : '-1',
      class: 'btn btn-sm ' + (activa ? 'btn-primary' : 'btn-ghost'),
    }, p.texto);
    b.addEventListener('click', () => { estado.pestana = p.id; dibujar(); });
    b.addEventListener('keydown', (ev) => {
      const i = pestanas.findIndex((x) => x.id === estado.pestana);
      let destino = null;
      if (ev.key === 'ArrowRight') destino = (i + 1) % pestanas.length;
      if (ev.key === 'ArrowLeft') destino = (i - 1 + pestanas.length) % pestanas.length;
      if (destino === null) return;
      ev.preventDefault();
      estado.pestana = pestanas[destino].id;
      dibujar();
      const nuevo = document.getElementById('cb-pestana-' + estado.pestana);
      if (nuevo) nuevo.focus();
    });
    nav.appendChild(b);
  });
  cont.appendChild(nav);

  const panel = el('div', { id: 'cb-panel-pestana', role: 'tabpanel', 'aria-labelledby': 'cb-pestana-' + estado.pestana, tabindex: '0' });
  if (estado.pestana === 'horario') panel.appendChild(vistaHorario());
  else if (estado.pestana === 'tareas') panel.appendChild(vistaTareas());
  else panel.appendChild(vistaProximos());
  cont.appendChild(panel);

  render(raiz, cont);
}

/* ================================================================
   PRÓXIMOS 7 DÍAS
   ================================================================ */
function vistaProximos() {
  const cont = el('div');
  const lista = proximosDias(estado.tareas);
  const resumen = resumenEstados(estado.tareas);

  /* Resumen rápido */
  const chips = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.9rem' } });
  chips.appendChild(etiqueta(resumen.vencida + ' vencida(s)', 'var(--red-light)'));
  chips.appendChild(etiqueta(resumen.pendiente + ' pendiente(s)', 'var(--amber-light)'));
  chips.appendChild(etiqueta(resumen['en-proceso'] + ' en proceso', 'var(--primary-light)'));
  chips.appendChild(etiqueta(resumen.entregada + ' entregada(s)', 'var(--green-light)'));
  cont.appendChild(chips);

  if (resumen.vencida) {
    cont.appendChild(aviso('Tenés ' + resumen.vencida + ' entrega(s) vencida(s)',
      'Miralas abajo con la marca roja. Si ya las entregaste, marcálas como entregadas para que desaparezcan de acá.', 'aviso'));
  }

  /* Recordatorios: aviso si el permiso de notificaciones está apagado */
  cont.appendChild(estadoAvisoNotificaciones());

  if (!lista.length) {
    cont.appendChild(vacio('No tenés entregas en los próximos 7 días. ¡Buen momento para adelantar!', '+ Agregar una tarea', () => {
      estado.pestana = 'tareas';
      agregarTarea();
    }));
    return cont;
  }

  /* Lista agrupada por día */
  const porFecha = {};
  lista.forEach((t) => {
    const k = claveFecha(t.fecha);
    (porFecha[k] = porFecha[k] || []).push(t);
  });
  Object.keys(porFecha).sort().forEach((fecha) => {
    cont.appendChild(bloqueDia(fecha, porFecha[fecha]));
  });

  return cont;
}

function bloqueDia(fecha, tareas) {
  const f = hoy(fecha);
  const dias = Math.round((f.getTime() - hoy().getTime()) / 86400000);
  const tituloDias = dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : formatearFechaCorta(fecha);

  const filas = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.45rem' } });
  tareas.forEach((t) => filas.appendChild(filaTarea(t, true)));

  return tarjeta(tituloDias + ' · ' + formatearFechaCorta(fecha), filas);
}

function filaTarea(t, mostrarFecha) {
  const e = estadoTarea(t);
  const color = COLOR_ESTADO[e] || 'var(--gray-300)';

  const f = el('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '.55rem', padding: '.5rem .6rem',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--gray-50)',
      borderLeft: '4px solid ' + color,
    },
  });

  /* Marcador de estado para quien no distingue bien los colores */
  const marca = e === 'vencida' ? '⚠ ' : e === 'hoy' ? '● ' : '';
  const caja = el('div', { style: { flex: '1', minWidth: '0' } });
  caja.appendChild(el('div', {
    style: { fontWeight: '600', fontSize: '.88rem', overflowWrap: 'anywhere' },
  }, marca + t.titulo));

  const meta = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.15rem' } });
  meta.appendChild(etiqueta(TEXTO_TIPO[t.tipo] || 'Tarea', COLOR_TIPO[t.tipo]));
  meta.appendChild(etiqueta(TEXTO_ESTADO[t.estado] || 'Pendiente'));
  if (mostrarFecha && e !== 'sin-fecha') {
    meta.appendChild(el('span', { style: { fontSize: '.75rem', color: 'var(--text-secondary)', alignSelf: 'center' } },
      formatearFechaCorta(t.fecha)));
  }
  if (t.materia) meta.appendChild(el('span', { style: { fontSize: '.75rem', color: 'var(--text-secondary)', alignSelf: 'center' } }, '· ' + t.materia));
  caja.appendChild(meta);
  f.appendChild(caja);

  const acciones = el('div', { style: { display: 'flex', gap: '.25rem', flexShrink: '0' } });
  if (t.estado !== 'entregada') {
    acciones.appendChild(boton('✓', 'fantasma', () => marcarEntregada(t), { 'aria-label': 'Marcar «' + t.titulo + '» como entregada', title: 'Marcar como entregada' }));
  }
  acciones.appendChild(boton('✎', 'fantasma', () => editarTarea(t), { 'aria-label': 'Editar «' + t.titulo + '»', title: 'Editar' }));
  acciones.appendChild(boton('✕', 'peligro', () => borrarTarea(t), { 'aria-label': 'Borrar «' + t.titulo + '»', title: 'Borrar' }));
  f.appendChild(acciones);

  return f;
}

/* ================================================================
   HORARIO
   ================================================================ */
function vistaHorario() {
  const cont = el('div');

  const cabecera = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.7rem' } });
  cabecera.appendChild(el('p', { style: { margin: 0, fontSize: '.85rem', color: 'var(--text-secondary)' } },
    horasSemanales(estado.horario) + ' horas de clase a la semana · ' + materiasDelHorario(estado.horario).length + ' materia(s)'));
  const acciones = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } });
  acciones.appendChild(boton('+ Agregar clase', 'primario', agregarClase));
  acciones.appendChild(crearBotonCompartir('Compartir horario', modeloHorario, avisar));
  cabecera.appendChild(acciones);
  cont.appendChild(cabecera);

  /* Avisos de solapes */
  const solapes = detectarSolapes(estado.horario);
  solapes.forEach((s) => cont.appendChild(aviso('Cruce de horario', s.mensaje, 'aviso')));

  if (!estado.horario.length) {
    cont.appendChild(vacio('Tu horario está vacío. Agregá las clases de la semana con su hora y, si querés, el aula.',
      '+ Agregar mi primera clase', agregarClase));
    return cont;
  }

  /* Clases de hoy destacadas */
  const hoyClases = clasesDeHoy(estado.horario);
  if (hoyClases.length) {
    const caja = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.4rem' } });
    hoyClases.forEach((c) => caja.appendChild(filaClase(c)));
    cont.appendChild(tarjeta('Hoy · ' + diaDeHoy(), caja));
  }

  /* Semana completa */
  DIAS_SEMANA.forEach((dia) => {
    const clases = clasesDelDia(estado.horario, dia);
    if (!clases.length) return;
    const caja = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.4rem' } });
    clases.forEach((c) => caja.appendChild(filaClase(c)));
    cont.appendChild(tarjeta(dia.charAt(0).toUpperCase() + dia.slice(1), caja));
  });

  return cont;
}

function filaClase(c) {
  const f = el('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '.55rem', padding: '.5rem .6rem',
      borderRadius: 'var(--radius-sm)', background: 'var(--gray-50)',
    },
  });
  const caja = el('div', { style: { flex: '1', minWidth: '0' } });
  caja.appendChild(el('div', { style: { fontWeight: '600', fontSize: '.88rem', overflowWrap: 'anywhere' } }, c.materia));
  caja.appendChild(el('div', { style: { fontSize: '.78rem', color: 'var(--text-secondary)' } },
    c.horaInicio + (c.horaFin ? ' – ' + c.horaFin : '') + (c.aula ? ' · Aula ' + c.aula : '')));
  f.appendChild(caja);
  const acciones = el('div', { style: { display: 'flex', gap: '.25rem' } });
  acciones.appendChild(boton('✎', 'fantasma', () => editarClase(c), { 'aria-label': 'Editar la clase de ' + c.materia, title: 'Editar' }));
  acciones.appendChild(boton('✕', 'peligro', () => borrarClase(c), { 'aria-label': 'Borrar la clase de ' + c.materia, title: 'Borrar' }));
  f.appendChild(acciones);
  return f;
}

function modeloHorario() {
  const filas = DIAS_SEMANA.flatMap((dia) => clasesDelDia(estado.horario, dia)
    .map((c) => [dia, c.horaInicio + (c.horaFin ? ' – ' + c.horaFin : ''), c.materia, c.aula || '—']));
  return construirModelo({
    titulo: 'Horario de clases',
    subtitulo: horasSemanales(estado.horario) + ' horas semanales',
    encabezados: ['Día', 'Hora', 'Materia', 'Aula'],
    filas,
    pie: 'Generado con Cherry-Bomb',
  });
}

/* ================================================================
   TAREAS
   ================================================================ */
function vistaTareas() {
  const cont = el('div');

  const cabecera = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.7rem' } });
  cabecera.appendChild(el('h3', { style: { margin: '0', fontSize: '1rem' } },
    'Tareas y evaluaciones (' + estado.tareas.length + ')'));
  const acciones = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } });
  acciones.appendChild(boton('+ Nueva', 'primario', agregarTarea));
  acciones.appendChild(crearBotonCompartir('Compartir agenda', modeloAgenda, avisar));
  cabecera.appendChild(acciones);
  cont.appendChild(cabecera);

  if (!estado.tareas.length) {
    cont.appendChild(vacio('Todavía no cargaste ninguna tarea o examen.',
      '+ Agregar la primera', agregarTarea));
    return cont;
  }

  /* Filtro por materia */
  const materias = Array.from(new Set(estado.tareas.map((t) => t.materia).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
  const opciones = [{ valor: '', texto: 'Todas las materias' }].concat(materias.map((m) => ({ valor: m, texto: m })));
  const filtro = selector({
    etiqueta: 'Filtrar por materia',
    opciones,
    valor: estado.filtroMateria || '',
    onChange(ev) { estado.filtroMateria = ev.target.value; dibujar(); },
  });
  cont.appendChild(filtro);

  const filtradas = estado.filtroMateria
    ? estado.tareas.filter((t) => t.materia === estado.filtroMateria)
    : estado.tareas;

  const caja = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.45rem' } });
  filtradas.forEach((t) => caja.appendChild(filaTarea(t, true)));
  cont.appendChild(caja);

  return cont;
}

function modeloAgenda() {
  const lista = proximosDias(estado.tareas, undefined, 30);
  return construirModelo({
    titulo: 'Agenda de entregas',
    subtitulo: lista.length + ' entrega(s) por venir',
    encabezados: ['Fecha', 'Tipo', 'Actividad', 'Materia'],
    filas: lista.map((t) => [
      formatearFechaCorta(t.fecha),
      TEXTO_TIPO[t.tipo] || 'Tarea',
      t.titulo,
      t.materia || '—',
    ]),
    pie: 'Generado con Cherry-Bomb',
  });
}

/* ================================================================
   Operaciones con clases
   ================================================================ */
function opcionesDias() {
  return DIAS_SEMANA.map((d) => ({ valor: d, texto: d.charAt(0).toUpperCase() + d.slice(1) }));
}

async function agregarClase() {
  const { confirmado, valores } = await dialogoFormulario('Nueva clase', [
    { clave: 'materia', etiqueta: 'Materia', placeholder: 'Ej: Matemática', requerido: true },
    { clave: 'dia', etiqueta: 'Día', tipo: 'selector', opciones: opcionesDias(), valor: 'lunes' },
    { clave: 'horaInicio', etiqueta: 'Hora de inicio', tipo: 'time', requerido: true, valor: '07:30' },
    { clave: 'horaFin', etiqueta: 'Hora de fin (opcional)', tipo: 'time' },
    { clave: 'aula', etiqueta: 'Aula (opcional)', placeholder: 'Ej: B-2' },
  ], 'Agregar');
  if (!confirmado) return;

  const nueva = {
    id: nuevoId(),
    materia: valores.materia.trim(),
    dia: valores.dia,
    horaInicio: valores.horaInicio,
    horaFin: valores.horaFin || '',
    aula: valores.aula.trim(),
  };
  const errores = validarClase(nueva);
  if (errores.length) { avisar(errores[0], 'error'); return; }

  estado.horario.push(nueva);
  await guardarHorario();
  estado.pestana = 'horario';
  dibujar();
  avisar('Clase agregada.', 'success');
}

async function editarClase(c) {
  const { confirmado, valores } = await dialogoFormulario('Editar clase', [
    { clave: 'materia', etiqueta: 'Materia', valor: c.materia, requerido: true },
    { clave: 'dia', etiqueta: 'Día', tipo: 'selector', opciones: opcionesDias(), valor: c.dia },
    { clave: 'horaInicio', etiqueta: 'Hora de inicio', tipo: 'time', valor: c.horaInicio, requerido: true },
    { clave: 'horaFin', etiqueta: 'Hora de fin (opcional)', tipo: 'time', valor: c.horaFin || '' },
    { clave: 'aula', etiqueta: 'Aula (opcional)', valor: c.aula || '' },
  ]);
  if (!confirmado) return;

  const nueva = {
    id: c.id,
    materia: valores.materia.trim(),
    dia: valores.dia,
    horaInicio: valores.horaInicio,
    horaFin: valores.horaFin || '',
    aula: valores.aula.trim(),
  };
  const errores = validarClase(nueva);
  if (errores.length) { avisar(errores[0], 'error'); return; }

  Object.assign(c, nueva);
  await guardarHorario();
  dibujar();
}

async function borrarClase(c) {
  const ok = await confirmar('Borrar clase', 'Se va a borrar la clase de «' + c.materia + '» del ' + c.dia + '.', 'Borrar');
  if (!ok) return;
  estado.horario = estado.horario.filter((x) => x.id !== c.id);
  await guardarHorario();
  dibujar();
  avisar('Clase borrada.', 'success');
}

/* ================================================================
   Operaciones con tareas
   ================================================================ */

function materiasConocidas() {
  const conjunto = new Set(materiasDelHorario(estado.horario));
  estado.tareas.forEach((t) => { if (t.materia) conjunto.add(t.materia); });
  return Array.from(conjunto).sort((a, b) => a.localeCompare(b, 'es'));
}

async function agregarTarea() {
  const materias = materiasConocidas();
  const campos = [
    { clave: 'titulo', etiqueta: 'Título', placeholder: 'Ej: Ensayo de Lenguaje', requerido: true },
    { clave: 'fecha', etiqueta: 'Fecha de entrega', tipo: 'date', requerido: true },
    { clave: 'tipo', etiqueta: 'Tipo', tipo: 'selector', valor: 'tarea', opciones: TIPOS_TAREA.map((t) => ({ valor: t, texto: TEXTO_TIPO[t] })) },
    { clave: 'estado', etiqueta: 'Estado', tipo: 'selector', valor: 'pendiente', opciones: ESTADOS_TAREA.map((t) => ({ valor: t, texto: TEXTO_ESTADO[t] })) },
  ];
  if (materias.length) {
    campos.splice(1, 0, { clave: 'materia', etiqueta: 'Materia (opcional)', tipo: 'selector', valor: materias[0], opciones: [{ valor: '', texto: 'Sin materia' }].concat(materias.map((m) => ({ valor: m, texto: m }))) });
  } else {
    campos.splice(1, 0, { clave: 'materia', etiqueta: 'Materia (opcional)', placeholder: 'Ej: Matemática' });
  }

  const { confirmado, valores } = await dialogoFormulario('Nueva tarea o evaluación', campos, 'Agregar');
  if (!confirmado) return;

  const nueva = {
    id: nuevoId(),
    titulo: valores.titulo.trim(),
    materia: (valores.materia || '').trim(),
    fecha: valores.fecha,
    tipo: valores.tipo,
    estado: valores.estado,
  };
  const errores = validarTarea(nueva);
  if (errores.length) { avisar(errores[0], 'error'); return; }

  estado.tareas.push(nueva);
  await guardarTareas();
  estado.pestana = 'tareas';
  dibujar();
  avisar('Tarea agregada.', 'success');
  avisarNotificacionAsignada(nueva);
}

async function editarTarea(t) {
  const materias = materiasConocidas();
  const { confirmado, valores } = await dialogoFormulario('Editar tarea', [
    { clave: 'titulo', etiqueta: 'Título', valor: t.titulo, requerido: true },
    { clave: 'materia', etiqueta: 'Materia (opcional)', tipo: 'selector', valor: t.materia || '', opciones: [{ valor: '', texto: 'Sin materia' }].concat(materias.map((m) => ({ valor: m, texto: m }))) },
    { clave: 'fecha', etiqueta: 'Fecha de entrega', tipo: 'date', valor: t.fecha, requerido: true },
    { clave: 'tipo', etiqueta: 'Tipo', tipo: 'selector', valor: t.tipo, opciones: TIPOS_TAREA.map((x) => ({ valor: x, texto: TEXTO_TIPO[x] })) },
    { clave: 'estado', etiqueta: 'Estado', tipo: 'selector', valor: t.estado, opciones: ESTADOS_TAREA.map((x) => ({ valor: x, texto: TEXTO_ESTADO[x] })) },
  ]);
  if (!confirmado) return;

  const nueva = {
    titulo: valores.titulo.trim(),
    materia: (valores.materia || '').trim(),
    fecha: valores.fecha,
    tipo: valores.tipo,
    estado: valores.estado,
  };
  const errores = validarTarea(nueva);
  if (errores.length) { avisar(errores[0], 'error'); return; }

  Object.assign(t, nueva);
  await guardarTareas();
  dibujar();
}

async function borrarTarea(t) {
  const ok = await confirmar('Borrar tarea', 'Se va a borrar «' + t.titulo + '».', 'Borrar');
  if (!ok) return;
  estado.tareas = estado.tareas.filter((x) => x.id !== t.id);
  await guardarTareas();
  dibujar();
  avisar('Tarea borrada.', 'success');
}

async function marcarEntregada(t) {
  t.estado = 'entregada';
  await guardarTareas();
  dibujar();
  avisar('¡Marcaste «' + t.titulo + '» como entregada!', 'success');
}

/* ================================================================
   Recordatorios (un día antes y el mismo día)

   El navegador sólo puede avisar mientras la aplicación está abierta,
   así que:
     · con permiso → se avisa con la Notification API;
     · sin permiso → se sigue mostrando el aviso DENTRO de la app,
       que es lo que importa en un teléfono de gama baja.
   ================================================================ */
function permisoNotificaciones() {
  const n = window.CherryBombNotifications;
  if (!n || !n.isSupported || !n.isSupported()) return 'no-soportado';
  return n.getPermission ? n.getPermission() : 'desconocido';
}

function estadoAvisoNotificaciones() {
  const permiso = permisoNotificaciones();
  if (permiso === 'granted') {
    return aviso('Recordatorios activados',
      'Te vamos a avisar un día antes y el mismo día de cada entrega, mientras la aplicación esté abierta.', 'ok');
  }
  if (permiso === 'denied') {
    return aviso('Los recordatorios del navegador están apagados',
      'No pasa nada: acá en «Próximos 7 días» siempre ves lo que vence hoy y mañana. Si querés avisos fuera de la app, activá las notificaciones del navegador para este sitio.', 'info');
  }
  if (permiso === 'no-soportado') {
    return aviso('Tu navegador no puede mostrar avisos',
      'Igual tenés todo organizado acá en «Próximos 7 días».', 'info');
  }

  /* Permiso todavía sin pedir: ofrecemos activarlo, sin insistir.
     Si ya se pidió y se dismissió, mostramos un mensaje neutro. */
  let yaDismiss = false;
  try { yaDismiss = localStorage.getItem('cherrybombNotifPermission') === 'dismissed'; } catch (e) { /* sin storage */ }
  if (yaDismiss) {
    return aviso('Recordatorios en la app',
      'Los avisos del navegador los tenés apagados. Igual acá siempre ves lo que vence hoy y mañana.', 'info');
  }

  const caja = aviso('Querés que te avisemos?',
    'Activá las notificaciones para recibir un recordatorio un día antes y el mismo día de cada entrega.',
    'info');
  const accion = el('div', { style: { marginTop: '.5rem' } });
  accion.appendChild(boton('Activar avisos', 'primario', () => {
    const n = window.CherryBombNotifications;
    if (n && n.requestPermission) n.requestPermission();
    setTimeout(dibujar, 400);
  }));
  accion.appendChild(boton('Ahora no', 'fantasma', () => {
    try { localStorage.setItem('cherrybombNotifPermission', 'dismissed'); } catch (e) { /* sin storage */ }
    dibujar();
  }));
  caja.lastChild.appendChild(accion);
  return caja;
}

function programarRecordatorios() {
  revisarRecordatorios();
  if (intervaloRecordatorios) clearInterval(intervaloRecordatorios);
  // Cada 30 minutos, igual que el módulo de notificaciones de la app
  intervaloRecordatorios = setInterval(revisarRecordatorios, 30 * 60 * 1000);
}

async function revisarRecordatorios() {
  const n = window.CherryBombNotifications;
  if (!n || !n.isSupported || !n.isSupported()) return;
  if (typeof n.getPermission === 'function' && n.getPermission() !== 'granted') return;

  let vistos = {};
  try { vistos = JSON.parse(await storage.get(CLAVE_RECORDATORIOS, '{}')) || {}; } catch (e) { vistos = {}; }

  const pendientes = tareasParaRecordar(estado.tareas, vistos);
  if (!pendientes.length) return;

  pendientes.forEach((p) => {
    const titulo = p.aviso === 'hoy' ? 'Hoy vence una entrega' : 'Mañana vence una entrega';
    n.send(titulo, p.mensaje, 'agenda-' + p.claveRecordatorio);
    vistos[p.claveRecordatorio] = Date.now();
  });
  await storage.set(CLAVE_RECORDATORIOS, vistos);
}

/** Aviso inmediato al crear una tarea, usando el módulo existente. */
function avisarNotificacionAsignada(t) {
  const n = window.CherryBombNotifications;
  if (!n || !n.notifyNewTask) return;
  if (typeof n.getPermission === 'function' && n.getPermission() !== 'granted') return;
  n.notifyNewTask(t, t.materia || '');
}

/* Se expone para el cargador diferido. */
export default { montar };
