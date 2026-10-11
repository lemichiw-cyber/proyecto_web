/* ===================================================================
   notas-ui.js — Pantalla de la calculadora de notas.

   Se carga de forma diferida (import()) sólo cuando el estudiante abre
   «Mis notas», así no pesa nada al abrir la aplicación.
   =================================================================== */

import { storage, CLAVES } from '../storage.js';
import { el, render, avisar, nuevoId } from '../utils.js';
import {
  normalizarConfig, validarActividad, validarPorcentajesPeriodo,
  calcularMateria, cuantoNecesito, estadoMateria, materiaNueva,
} from './calculo-notas.js';
import {
  aviso, etiqueta, campo, boton, tarjeta, vacio,
  dialogo, confirmar, dialogoFormulario,
} from '../ui-kit.js';

const COLORES_ESTADO = {
  aprobada: 'var(--green-light)',
  reprobada: 'var(--red-light)',
  'en-curso': 'var(--amber-light)',
};
const TEXTO_ESTADO = { aprobada: 'Aprobada', reprobada: 'No alcanzada', 'en-curso': 'En curso' };

let raiz = null;
let estado = { config: null, materias: [], materiaAbierta: null };

/* ---------------- Datos ---------------- */

async function cargarTodo() {
  const guardada = await storage.get(CLAVES.CONFIG_NOTAS, null);
  const { config } = normalizarConfig(guardada);
  estado.config = config;
  estado.materias = await storage.list(CLAVES.MATERIAS);
}

async function guardarConfig() {
  // Sólo se guardan los campos que el estudiante puede cambiar
  const paraGuardar = {
    escalaMin: estado.config.escalaMin,
    escalaMax: estado.config.escalaMax,
    notaAprobacion: estado.config.notaAprobacion,
    decimales: estado.config.decimales,
    periodosPorDefecto: estado.config.periodosPorDefecto,
  };
  await storage.set(CLAVES.CONFIG_NOTAS, paraGuardar);
}

async function guardarMaterias() {
  await storage.set(CLAVES.MATERIAS, estado.materias);
}

function materiaActual() {
  return estado.materias.find((m) => m.id === estado.materiaAbierta) || null;
}

/* ---------------- Pantalla principal ---------------- */

export async function montar() {
  raiz = document.getElementById('cb-notas-root');
  if (!raiz) return;
  await cargarTodo();
  dibujar();
}

function dibujar() {
  const m = materiaActual();
  if (m) dibujarMateria(m);
  else dibujarLista();
}

/* ---------------- Lista de materias ---------------- */

function dibujarLista() {
  const cont = el('div');

  /* 1. Aviso legal: nada de esto es oficial. */
  cont.appendChild(aviso(
    'Esto no es un documento oficial',
    'La escala de 0 a 10, la nota de aprobación, cuántos períodos hay y qué peso tiene cada uno ' +
    'los define tu centro escolar y el MINED. Los valores de acá son un punto de partida: ' +
    'confirmalos con tu docente o con el reglamento de tu centro antes de confiar en ellos.',
    'aviso'
  ));

  /* 2. Ajustes rápidos. */
  cont.appendChild(tarjeta('Ajustes de cálculo', construirAjustes()));

  /* 3. Materias. */
  const fila = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' } });
  fila.appendChild(el('h3', { style: { margin: '0', fontSize: '1rem' } }, 'Mis materias (' + estado.materias.length + ')'));
  fila.appendChild(boton('+ Agregar materia', 'primario', agregarMateria));
  cont.appendChild(fila);

  if (!estado.materias.length) {
    cont.appendChild(vacio(
      'Todavía no agregaste ninguna materia. Agregá tus materias del semestre y después cargá las notas de cada actividad.',
      '+ Agregar mi primera materia', agregarMateria
    ));
  } else {
    estado.materias.forEach((mat) => cont.appendChild(tarjetaMateria(mat)));
    cont.appendChild(tarjeta('Promedio general', resumenGeneral()));
  }

  render(raiz, cont);
}

function construirAjustes() {
  const wrap = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '.6rem' } });

  wrap.appendChild(campo({
    etiqueta: 'Nota mínima para aprobar',
    tipo: 'number', valor: estado.config.notaAprobacion,
    min: estado.config.escalaMin, max: estado.config.escalaMax, paso: '0.1', inputmode: 'decimal',
    ayuda: 'Por defecto 6,0. Confirmá el valor de tu centro.',
    onChange(ev) {
      const v = parseFloat(ev.target.value);
      if (!isFinite(v) || v < estado.config.escalaMin || v > estado.config.escalaMax) {
        avisar('La nota de aprobación debe estar entre ' + estado.config.escalaMin + ' y ' + estado.config.escalaMax + '.', 'error');
        return;
      }
      estado.config.notaAprobacion = v;
      guardarConfig().then(dibujar);
    },
  }));

  wrap.appendChild(campo({
    etiqueta: 'Nota máxima de la escala',
    tipo: 'number', valor: estado.config.escalaMax,
    min: 1, max: 100, paso: '1', inputmode: 'numeric',
    ayuda: 'La escala completa de tu centro (10, 20, 100…).',
    onChange(ev) {
      const v = parseFloat(ev.target.value);
      if (!isFinite(v) || v <= estado.config.escalaMin) {
        avisar('La nota máxima debe ser mayor que la mínima (' + estado.config.escalaMin + ').', 'error');
        return;
      }
      estado.config.escalaMax = v;
      guardarConfig().then(dibujar);
    },
  }));

  wrap.appendChild(boton('Cómo se calcula', 'secundario', explicarCalculo));
  return wrap;
}

async function explicarCalculo() {
  await dialogo({
    titulo: 'Cómo se calculan las notas',
    contenido: el('div', {
      style: { fontSize: '.88rem', lineHeight: '1.6' },
    },
      [
        el('p', { style: { marginTop: 0 } }, 'Cada materia tiene períodos (por ejemplo, 4). Cada período pesa un porcentaje del promedio final.'),
        el('p', {}, 'Dentro de cada período cargás actividades (tareas, exámenes, laboratorios, participación) con su porcentaje. Esos porcentajes deben sumar 100 % del período.'),
        el('p', {}, 'Para saber cuánto te falta, la aplicación calcula qué parte del promedio ya tenés ganada y cuánto queda pendiente, y de ahí saca la nota mínima que necesitás en lo que falta.'),
        el('p', { style: { marginBottom: 0 } }, 'Los porcentajes y la escala los pone tu centro escolar, no esta aplicación.'),
      ]),
    textoConfirmar: 'Entendido',
  });
}

function tarjetaMateria(mat) {
  const r = calcularMateria(mat, estado.config);
  const estadoActual = estadoMateria(mat, estado.config);

  const extras = el('div', { style: { display: 'flex', gap: '.4rem', alignItems: 'center' } });
  extras.appendChild(etiqueta(TEXTO_ESTADO[estadoActual] || estadoActual, COLORES_ESTADO[estadoActual]));

  const contenido = el('div');

  const filaNota = el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.35rem' } });
  filaNota.appendChild(el('span', { style: { fontSize: '1.7rem', fontWeight: '700', lineHeight: '1' } },
    estado.config.decimales === 0 ? String(r.promedio) : r.promedio.toFixed(estado.config.decimales)));
  filaNota.appendChild(el('span', { style: { color: 'var(--text-secondary)', fontSize: '.8rem' } },
    'de ' + estado.config.escalaMax + (r.alcanzadoTodo ? '' : ' · hasta ' + r.promedioMaximo.toFixed(estado.config.decimales))));
  contenido.appendChild(filaNota);

  if (!r.alcanzadoTodo) {
    contenido.appendChild(el('p', { style: { margin: '0 0 .5rem', fontSize: '.8rem', color: 'var(--text-secondary)' } },
      'Todavía hay actividades sin nota. Lo que ya tenés ganado equivale a ' +
      r.promedioMinimo.toFixed(estado.config.decimales) + '.'));
  }

  if (r.avisos.length) {
    contenido.appendChild(el('p', { style: { margin: '0 0 .5rem', fontSize: '.78rem', color: 'var(--amber-ink)' } },
      r.avisos[0] + (r.avisos.length > 1 ? ' (' + (r.avisos.length - 1) + ' aviso(s) más)' : '')));
  }

  const acciones = el('div', { style: { display: 'flex', gap: '.4rem', marginTop: '.4rem' } });
  acciones.appendChild(boton('Ver y editar', 'primario', () => { estado.materiaAbierta = mat.id; dibujar(); }));
  acciones.appendChild(boton('Borrar', 'peligro', () => borrarMateria(mat)));
  contenido.appendChild(acciones);

  contenido.appendChild(el('p', { style: { margin: '.5rem 0 0', fontSize: '.75rem', color: 'var(--text-secondary)' } },
    mat.periodos.length + ' período(s) · ' +
    mat.periodos.reduce((t, p) => t + (p.actividades ? p.actividades.length : 0), 0) + ' actividad(es)'));

  return tarjeta(mat.nombre, contenido, extras);
}

function resumenGeneral() {
  const conNota = estado.materias.map((m) => calcularMateria(m, estado.config)).filter((r) => r.alcanzadoTodo);
  const wrap = el('div');
  if (!conNota.length) {
    wrap.appendChild(el('p', { style: { margin: 0, fontSize: '.85rem', color: 'var(--text-secondary)' } },
      'Cuando termines de calificar alguna materia vas a ver tu promedio general acá.'));
    return wrap;
  }
  const promedio = conNota.reduce((t, r) => t + r.promedio, 0) / conNota.length;
  wrap.appendChild(el('p', { style: { margin: '0 0 .3rem', fontSize: '1.5rem', fontWeight: '700' } },
    promedio.toFixed(estado.config.decimales)));
  wrap.appendChild(el('p', { style: { margin: 0, fontSize: '.8rem', color: 'var(--text-secondary)' } },
    'Promedio de las ' + conNota.length + ' materia(s) totalmente calificada(s) de ' + estado.materias.length + '. ' +
    'Sólo promedia materias completas para no dar una idea equivocada.'));
  return wrap;
}

/* ---------------- Detalle de una materia ---------------- */

function dibujarMateria(mat) {
  const cont = el('div');
  const r = calcularMateria(mat, estado.config);

  const volver = boton('← Volver a mis materias', 'fantasma', () => { estado.materiaAbierta = null; dibujar(); });
  cont.appendChild(volver);

  const cabecera = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', margin: '.4rem 0 .8rem' } });
  cabecera.appendChild(el('h3', { style: { margin: '0', fontSize: '1.15rem' } }, mat.nombre));
  const acciones = el('div', { style: { display: 'flex', gap: '.4rem' } });
  acciones.appendChild(boton('Renombrar', 'secundario', () => renombrarMateria(mat)));
  acciones.appendChild(boton('Agregar período', 'secundario', () => agregarPeriodo(mat)));
  acciones.appendChild(boton('¿Cuánto necesito?', 'primario', () => panelCuantoNecesito(mat)));
  cabecera.appendChild(acciones);
  cont.appendChild(cabecera);

  /* Resumen del promedio */
  const resumen = el('div', {
    style: {
      display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline',
      padding: '.8rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', marginBottom: '.9rem',
    },
  });
  resumen.appendChild(el('div', {}, [
    el('span', { style: { display: 'block', fontSize: '.75rem', color: 'var(--text-secondary)' } }, 'Promedio actual'),
    el('span', { style: { fontSize: '1.6rem', fontWeight: '700' } }, r.promedio.toFixed(estado.config.decimales)),
  ]));
  resumen.appendChild(el('div', {}, [
    el('span', { style: { display: 'block', fontSize: '.75rem', color: 'var(--text-secondary)' } }, 'Máximo posible'),
    el('span', { style: { fontSize: '1.2rem', fontWeight: '600' } }, r.promedioMaximo.toFixed(estado.config.decimales)),
  ]));
  resumen.appendChild(el('div', {}, [
    el('span', { style: { display: 'block', fontSize: '.75rem', color: 'var(--text-secondary)' } }, 'Ya tenés ganado'),
    el('span', { style: { fontSize: '1.2rem', fontWeight: '600' } }, r.promedioMinimo.toFixed(estado.config.decimales)),
  ]));
  cont.appendChild(resumen);

  if (r.avisos.length) {
    const lista = el('ul', { style: { margin: '0 0 .9rem', paddingLeft: '1.1rem', fontSize: '.8rem', color: 'var(--amber-ink)' } });
    r.avisos.forEach((a) => lista.appendChild(el('li', {}, a)));
    cont.appendChild(aviso('Revisá estos puntos', '', 'aviso'));
    cont.appendChild(lista);
  }

  /* Períodos */
  mat.periodos.forEach((per, idx) => cont.appendChild(tarjetaPeriodo(mat, per, idx)));

  render(raiz, cont);
  volver.focus();
}

function tarjetaPeriodo(mat, per, idx) {
  const d = calcularMateria(mat, estado.config).periodos[idx];
  const validacion = validarPorcentajesPeriodo(per.actividades || []);

  const contenido = el('div');

  /* Barra de porcentaje del período */
  const barra = el('div', {
    role: 'img',
    'aria-label': 'Ponderación del período: ' + d.ponderacion + ' por ciento del promedio de la materia',
    style: { height: '6px', background: 'var(--gray-200)', borderRadius: '99px', overflow: 'hidden', marginBottom: '.5rem' },
  });
  barra.appendChild(el('div', {
    style: {
      height: '100%', width: Math.min(100, d.ponderacion) + '%',
      background: 'var(--primary)', transition: 'width .3s',
    },
  }));
  contenido.appendChild(barra);

  const meta = el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: 'var(--text-secondary)', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.3rem' } });
  meta.appendChild(el('span', {}, 'Pesa ' + d.ponderacion + ' % de la materia'));
  meta.appendChild(el('span', {}, 'Nota del período: ' +
    (d.promedio === null ? 'en curso (' + d.notaAcumulada.toFixed(estado.config.decimales) + ' ganados)' : d.promedio.toFixed(estado.config.decimales))));
  contenido.appendChild(meta);

  if (!validacion.ok) {
    contenido.appendChild(el('p', {
      role: 'alert',
      style: { margin: '0 0 .5rem', fontSize: '.78rem', color: 'var(--red-ink)', background: 'var(--red-light)', padding: '.4rem .55rem', borderRadius: 'var(--radius-sm)' },
    }, 'Los porcentajes de las actividades de este período suman ' + validacion.suma + ' %. Deben sumar exactamente 100 %; ' +
      (validacion.falta ? 'todavía falta repartir ' + validacion.falta + ' %.' : 'sobran ' + validacion.sobra + ' %.')));
  }

  /* Actividades */
  if (!(per.actividades || []).length) {
    contenido.appendChild(el('p', { style: { margin: '.3rem 0 .5rem', fontSize: '.82rem', color: 'var(--text-secondary)' } },
      'Sin actividades todavía.'));
  } else {
    const tabla = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '.83rem', marginBottom: '.5rem' } });
    const thead = el('thead');
    const filaH = el('tr');
    ['Actividad', '%', 'Nota', ''].forEach((t, i) => {
      filaH.appendChild(el('th', {
        scope: 'col',
        style: { textAlign: i === 0 ? 'left' : 'right', padding: '.25rem .2rem', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: '600' },
      }, t));
    });
    thead.appendChild(filaH);
    tabla.appendChild(thead);

    const tbody = el('tbody');
    (per.actividades || []).forEach((act) => {
      const f = el('tr');
      f.appendChild(el('td', { style: { padding: '.3rem .2rem', borderBottom: '1px solid var(--border-light)' } }, act.nombre));
      f.appendChild(el('td', { style: { padding: '.3rem .2rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)' } }, act.porcentaje + ' %'));
      const tieneNota = act.nota !== null && act.nota !== undefined && act.nota !== '';
      f.appendChild(el('td', {
        style: {
          padding: '.3rem .2rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)',
          fontWeight: '600', color: tieneNota ? 'var(--text)' : 'var(--text-secondary)',
        },
      }, tieneNota ? String(act.nota) : 'sin nota'));
      const tdAcc = el('td', { style: { padding: '.3rem .2rem', textAlign: 'right', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' } });
      tdAcc.appendChild(boton('Editar', 'fantasma', () => editarActividad(mat, per, act), { 'aria-label': 'Editar la actividad ' + act.nombre, style: { padding: '.15rem .3rem', fontSize: '.72rem' } }));
      tdAcc.appendChild(boton('Borrar', 'peligro', () => borrarActividad(mat, per, act), { 'aria-label': 'Borrar la actividad ' + act.nombre, style: { padding: '.15rem .3rem', fontSize: '.72rem' } }));
      f.appendChild(tdAcc);
      tbody.appendChild(f);
    });
    tabla.appendChild(tbody);
    contenido.appendChild(tabla);
  }

  const acciones = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } });
  acciones.appendChild(boton('+ Actividad', 'primario', () => agregarActividad(mat, per), { 'aria-label': 'Agregar actividad en ' + d.nombre }));
  acciones.appendChild(boton('Editar período', 'secundario', () => editarPeriodo(mat, per)));
  if (mat.periodos.length > 1) {
    acciones.appendChild(boton('Borrar período', 'peligro', () => borrarPeriodo(mat, per)));
  }
  contenido.appendChild(acciones);

  return tarjeta(d.nombre, contenido);
}

/* ---------------- Panel «¿Cuánto necesito?» ---------------- */

async function panelCuantoNecesito(mat) {
  const contenido = el('div');
  contenido.appendChild(el('p', { style: { margin: '0 0 .7rem', fontSize: '.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' } },
    'Poné la nota que querés alcanzar en la materia y mirá cuánto necesitás en las actividades que todavía no tienen nota.'));

  const entrada = campo({
    etiqueta: 'Quiero llegar a',
    tipo: 'number', valor: estado.config.notaAprobacion,
    min: estado.config.escalaMin, max: estado.config.escalaMax, paso: '0.1', inputmode: 'decimal',
    ayuda: '6,0 es la nota de aprobación por defecto. Cambiala si tu centro usa otra.',
    requerido: true,
  });
  contenido.appendChild(entrada);

  const salida = el('div', { id: 'cb-notas-salida', 'aria-live': 'polite', style: { marginTop: '.5rem' } });
  contenido.appendChild(salida);

  const mostrar = () => {
    const objetivo = parseFloat(entrada._control.value);
    render(salida, el('p', { style: { margin: 0, fontSize: '.85rem', color: 'var(--text-secondary)' } },
      'Escribí una nota para ver el resultado.'));
    if (!isFinite(objetivo)) return;
    const r = cuantoNecesito(mat, objetivo, estado.config);

    const caja = el('div', {
      style: {
        padding: '.8rem', borderRadius: 'var(--radius)',
        background: r.alcanzable ? 'var(--green-light)' : 'var(--red-light)',
        border: '1px solid ' + (r.alcanzable ? 'var(--green)' : 'var(--red)'),
      },
    });
    caja.appendChild(el('p', {
      role: 'status',
      style: { margin: '0 0 .4rem', fontSize: '.95rem', fontWeight: '700', lineHeight: '1.4' },
    }, r.mensaje));

    if (r.hayPendiente && r.alcanzable && r.minima > estado.config.escalaMin) {
      caja.appendChild(el('p', { style: { margin: '0 0 .3rem', fontSize: '.85rem' } },
        'Nota mínima necesaria en lo que falta: ' + r.minimaRedondeada.toFixed(estado.config.decimales) + '.'));
    }
    caja.appendChild(el('p', { style: { margin: 0, fontSize: '.8rem', color: 'var(--text-secondary)' } },
      'Promedio actual: ' + r.promedioActual.toFixed(estado.config.decimales) +
      ' · Mejor posible: ' + r.promedioMaximo.toFixed(estado.config.decimales) +
      ' · Meta: ' + r.objetivo.toFixed(estado.config.decimales)));
    render(salida, caja);
  };

  entrada._control.addEventListener('input', mostrar);
  mostrar();

  await dialogo({ titulo: '¿Cuánto necesito?', contenido, textoConfirmar: 'Cerrar' });
}

/* ---------------- Operaciones ---------------- */

async function agregarMateria() {
  const { confirmado, valores } = await dialogoFormulario('Nueva materia', [
    { clave: 'nombre', etiqueta: 'Nombre de la materia', placeholder: 'Ej: Matemática', requerido: true },
  ], 'Crear materia');
  if (!confirmado) return;
  const nombre = valores.nombre.trim();
  if (!nombre) { avisar('La materia necesita un nombre.', 'error'); return; }
  const nueva = materiaNueva(nombre, estado.config);
  estado.materias.push(nueva);
  await guardarMaterias();
  estado.materiaAbierta = nueva.id;
  dibujar();
  avisar('Materia creada con ' + nueva.periodos.length + ' períodos.', 'success');
}

async function renombrarMateria(mat) {
  const { confirmado, valores } = await dialogoFormulario('Renombrar materia', [
    { clave: 'nombre', etiqueta: 'Nombre', valor: mat.nombre, requerido: true },
  ]);
  if (!confirmado || !valores.nombre.trim()) return;
  mat.nombre = valores.nombre.trim();
  await guardarMaterias();
  dibujar();
}

async function borrarMateria(mat) {
  const ok = await confirmar('Borrar materia', 'Se van a borrar «' + mat.nombre + '» y todas sus notas. Esta acción no se puede deshacer.', 'Borrar');
  if (!ok) return;
  estado.materias = estado.materias.filter((m) => m.id !== mat.id);
  estado.materiaAbierta = null;
  await guardarMaterias();
  dibujar();
  avisar('Materia borrada.', 'success');
}

async function agregarPeriodo(mat) {
  const { confirmado, valores } = await dialogoFormulario('Nuevo período', [
    { clave: 'nombre', etiqueta: 'Nombre del período', placeholder: 'Ej: Primer período', requerido: true },
    { clave: 'ponderacion', etiqueta: 'Ponderación (%)', tipo: 'number', valor: '0', min: 0, max: 100, paso: '0.5', inputmode: 'decimal',
      ayuda: 'Cuánto pesa este período en el promedio de la materia. Las ponderaciones de todos los períodos deben sumar 100 %.' },
  ]);
  if (!confirmado) return;
  const pond = parseFloat(valores.ponderacion);
  mat.periodos.push({
    id: nuevoId(),
    nombre: valores.nombre.trim() || 'Período',
    ponderacion: isFinite(pond) ? pond : 0,
    actividades: [],
  });
  await guardarMaterias();
  dibujar();
}

async function editarPeriodo(mat, per) {
  const { confirmado, valores } = await dialogoFormulario('Editar período', [
    { clave: 'nombre', etiqueta: 'Nombre', valor: per.nombre, requerido: true },
    { clave: 'ponderacion', etiqueta: 'Ponderación (%)', tipo: 'number', valor: String(per.ponderacion), min: 0, max: 100, paso: '0.5', inputmode: 'decimal',
      ayuda: 'Debe sumar 100 % junto con la de los demás períodos.' },
  ]);
  if (!confirmado) return;
  const pond = parseFloat(valores.ponderacion);
  per.nombre = valores.nombre.trim() || per.nombre;
  if (isFinite(pond)) per.ponderacion = pond;
  await guardarMaterias();
  dibujar();
}

async function borrarPeriodo(mat, per) {
  const ok = await confirmar('Borrar período', 'Se van a borrar «' + per.nombre + '» y todas sus actividades.', 'Borrar');
  if (!ok) return;
  mat.periodos = mat.periodos.filter((p) => p.id !== per.id);
  await guardarMaterias();
  dibujar();
}

async function agregarActividad(mat, per) {
  const { confirmado, valores } = await dialogoFormulario('Nueva actividad', [
    { clave: 'nombre', etiqueta: 'Nombre', placeholder: 'Ej: Examen parcial', requerido: true },
    { clave: 'porcentaje', etiqueta: 'Porcentaje del período (%)', tipo: 'number', valor: '', min: 0, max: 100, paso: '0.5', inputmode: 'decimal', requerido: true,
      ayuda: 'Las actividades de este período deben sumar 100 %.' },
    { clave: 'nota', etiqueta: 'Nota (dejá vacío si aún no la tenés)', tipo: 'number', valor: '', paso: '0.01', inputmode: 'decimal',
      min: estado.config.escalaMin, max: estado.config.escalaMax, ayuda: 'Escala de ' + estado.config.escalaMin + ' a ' + estado.config.escalaMax + '.' },
  ], 'Agregar');
  if (!confirmado) return;

  const act = {
    id: nuevoId(),
    nombre: valores.nombre.trim(),
    porcentaje: parseFloat(valores.porcentaje),
    nota: valores.nota.trim() === '' ? null : parseFloat(valores.nota),
  };
  const errores = validarActividad(act, estado.config);
  if (errores.length) { avisar(errores[0], 'error'); return; }

  per.actividades = per.actividades || [];
  per.actividades.push(act);
  await guardarMaterias();
  dibujar();
  avisar('Actividad agregada.', 'success');
}

async function editarActividad(mat, per, act) {
  const { confirmado, valores } = await dialogoFormulario('Editar actividad', [
    { clave: 'nombre', etiqueta: 'Nombre', valor: act.nombre, requerido: true },
    { clave: 'porcentaje', etiqueta: 'Porcentaje del período (%)', tipo: 'number', valor: String(act.porcentaje), min: 0, max: 100, paso: '0.5', inputmode: 'decimal', requerido: true },
    { clave: 'nota', etiqueta: 'Nota (vacío = pendiente)', tipo: 'number', valor: act.nota === null || act.nota === undefined ? '' : String(act.nota), paso: '0.01', inputmode: 'decimal',
      min: estado.config.escalaMin, max: estado.config.escalaMax },
  ]);
  if (!confirmado) return;

  const nuevo = {
    id: act.id,
    nombre: valores.nombre.trim(),
    porcentaje: parseFloat(valores.porcentaje),
    nota: valores.nota.trim() === '' ? null : parseFloat(valores.nota),
  };
  const errores = validarActividad(nuevo, estado.config);
  if (errores.length) { avisar(errores[0], 'error'); return; }

  Object.assign(act, nuevo);
  await guardarMaterias();
  dibujar();
}

async function borrarActividad(mat, per, act) {
  const ok = await confirmar('Borrar actividad', 'Se va a borrar «' + act.nombre + '» y su nota.', 'Borrar');
  if (!ok) return;
  per.actividades = (per.actividades || []).filter((a) => a.id !== act.id);
  await guardarMaterias();
  dibujar();
}

/* Se expone para que el cargador diferido lo invoque. */
export default { montar };
