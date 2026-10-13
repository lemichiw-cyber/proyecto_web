/* ===================================================================
   paes-ui.js — Pantalla «Preparación PAES».

   · Simulacro cronometrado con guardado de progreso.
   · Resultados con aciertos, tiempo y desglose por tema.
   · Historial con una gráfica dibujada en SVG a mano (sin librerías).
   · Repaso con tarjetas y repetición espaciada (cajas de Leitner).
   · Meta personal de porcentaje.

   Los bancos de preguntas viven en public/data/paes/*.json; el
   esquema y los avisos de uso están explicados en docs/PAES.md.
   =================================================================== */

import { storage, CLAVES } from '../storage.js';
import { el, render, avisar, nuevoId, claveFecha, hoy, descargarTexto } from '../utils.js';
import {
  validarBanco, seleccionarPreguntas, ordenarOpciones,
  calificarSimulacro, temasAPracticar, crearTemporizador, formatearTiempo,
  segundosPorPregunta, tarjetaNueva, validarTarjeta, programarRepaso,
  tarjetasParaRepasar, resumenCajas, avanceMeta, serieHistorial,
  INTERVALOS_LEITNER,
} from './paes-logica.js';
import { aviso, etiqueta, boton, tarjeta, vacio, dialogo, confirmar, dialogoFormulario } from '../ui-kit.js';

/** Bancos que vienen con la aplicación (todos originales). */
const BANCOS_INCLUIDOS = ['matematica', 'lenguaje'];

let raiz = null;
let estado = {
  bancos: [],
  historial: [],
  tarjetas: [],
  metas: {},
  pestana: 'inicio',
  simulacro: null,
  temporizadorId: null,
};

/* ---------------- Carga ---------------- */

async function montar() {
  raiz = document.getElementById('cb-paes-root');
  if (!raiz) return;

  estado.historial = await storage.list(CLAVES.PAES_HISTORIAL);
  estado.tarjetas = await storage.list(CLAVES.PAES_TARJETAS);
  estado.metas = await storage.get(CLAVES.PAES_METAS, {});
  estado.simulacro = await storage.get(CLAVES.PAES_EN_CURSO, null);

  await cargarBancos();
  detenerReloj();
  dibujar();
}

async function cargarBancos() {
  const propios = await storage.list(CLAVES.PAES_BANCO);
  const bancos = [];

  /* Bancos incluidos: se piden con fetch; si no hay red y no están
     cacheados, se sigue sin ellos y la app lo avisa. */
  for (const clave of BANCOS_INCLUIDOS) {
    try {
      const resp = await fetch('./data/paes/' + clave + '.json', { cache: 'no-cache' });
      if (!resp.ok) continue;
      const datos = await resp.json();
      const validacion = validarBanco(datos);
      bancos.push({
        clave,
        materia: datos.materia || clave,
        aviso: datos.aviso || '',
        origen: 'incluido',
        preguntas: validacion.preguntasValidas,
        errores: validacion.errores,
      });
    } catch (e) {
      // Sin red y sin caché: simplemente no aparece este banco
    }
  }

  /* Bancos que cargó el docente desde un archivo. */
  propios.forEach((b) => {
    if (!b || typeof b !== 'object') return;
    const validacion = validarBanco(b);
    bancos.push({
      clave: b.clave || 'personalizado-' + (b.materia || ''),
      materia: b.materia || 'Banco cargado',
      aviso: b.aviso || 'Banco cargado desde un archivo.',
      origen: 'cargado',
      fecha: b.fecha || '',
      preguntas: validacion.preguntasValidas,
      errores: validacion.errores,
    });
  });

  estado.bancos = bancos;
}

function bancoPorClave(clave) {
  return estado.bancos.find((b) => b.clave === clave) || null;
}

/* ---------------- Dibujo ---------------- */

function dibujar() {
  const cont = el('div');

  /* Aviso permanente: nada de esto es oficial. */
  cont.appendChild(aviso(
    'Esto es práctica, no es la prueba oficial',
    'Las preguntas que vienen con la aplicación fueron escritas para practicar el formato de una prueba de opción múltiple; ' +
    'no son preguntas oficiales de la PAES. El banco real lo carga tu centro escolar, y antes hay que verificar qué material ' +
    'se puede usar. Además, esta aplicación no incluye la conversión oficial de aciertos a puntaje: muestra aciertos y porcentaje.',
    'aviso'
  ));

  /* Simulacro en curso, si lo hay */
  if (estado.simulacro) cont.appendChild(bloqueEnCurso());

  /* Pestañas */
  const pestanas = [
    { id: 'inicio', texto: 'Simulacros' },
    { id: 'historial', texto: 'Mi historial' },
    { id: 'tarjetas', texto: 'Repaso' },
    { id: 'meta', texto: 'Mi meta' },
  ];
  const nav = el('div', {
    role: 'tablist', 'aria-label': 'Vistas de preparación PAES',
    style: { display: 'flex', gap: '.35rem', marginBottom: '1rem', flexWrap: 'wrap' },
  });
  pestanas.forEach((p) => {
    const activa = estado.pestana === p.id;
    const b = el('button', {
      type: 'button', role: 'tab', id: 'cb-paes-pestana-' + p.id,
      'aria-selected': String(activa),
      'aria-controls': 'cb-paes-panel',
      tabindex: activa ? '0' : '-1',
      class: 'btn btn-sm ' + (activa ? 'btn-primary' : 'btn-ghost'),
    }, p.texto);
    b.addEventListener('click', () => { estado.pestana = p.id; dibujar(); });
    b.addEventListener('keydown', (ev) => {
      const i = pestanas.findIndex((x) => x.id === estado.pestana);
      let d = null;
      if (ev.key === 'ArrowRight') d = (i + 1) % pestanas.length;
      if (ev.key === 'ArrowLeft') d = (i - 1 + pestanas.length) % pestanas.length;
      if (d === null) return;
      ev.preventDefault();
      estado.pestana = pestanas[d].id;
      dibujar();
      const nuevo = document.getElementById('cb-paes-pestana-' + estado.pestana);
      if (nuevo) nuevo.focus();
    });
    nav.appendChild(b);
  });
  cont.appendChild(nav);

  const panel = el('div', { id: 'cb-paes-panel', role: 'tabpanel', 'aria-labelledby': 'cb-paes-pestana-' + estado.pestana, tabindex: '0' });
  if (estado.pestana === 'historial') panel.appendChild(vistaHistorial());
  else if (estado.pestana === 'tarjetas') panel.appendChild(vistaTarjetas());
  else if (estado.pestana === 'meta') panel.appendChild(vistaMeta());
  else panel.appendChild(vistaInicio());
  cont.appendChild(panel);

  render(raiz, cont);
}

/* ================================================================
   INICIO: elegir simulacro
   ================================================================ */
function vistaInicio() {
  const cont = el('div');

  if (!estado.bancos.length) {
    cont.appendChild(vacio(
      'No se pudo cargar ningún banco de preguntas. Probá de nuevo cuando tengas datos o conexión.',
      'Reintentar', () => montar()
    ));
    return cont;
  }

  estado.bancos.forEach((b) => {
    const contenido = el('div');

    if (b.errores && b.errores.length) {
      contenido.appendChild(aviso('Este banco tiene ' + b.errores.length + ' pregunta(s) con problemas',
        b.errores[0], 'aviso'));
    }
    if (b.aviso) {
      contenido.appendChild(el('p', { style: { margin: '0 0 .6rem', fontSize: '.78rem', color: 'var(--text-secondary)', lineHeight: '1.5' } }, b.aviso));
    }

    contenido.appendChild(el('p', { style: { margin: '0 0 .6rem', fontSize: '.85rem' } },
      b.preguntas.length + ' pregunta(s) disponibles' + (b.fecha ? ' · cargado el ' + b.fecha : '')));

    const acciones = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } });
    acciones.appendChild(boton('Hacer simulacro', 'primario', () => configurarSimulacro(b), { disabled: !b.preguntas.length }));
    acciones.appendChild(boton('Repasar tarjetas', 'secundario', () => iniciarRepaso(b.clave), { disabled: !b.preguntas.length }));
    if (b.origen === 'cargado') {
      acciones.appendChild(boton('Borrar banco', 'peligro', () => borrarBanco(b)));
    }
    contenido.appendChild(acciones);

    cont.appendChild(tarjeta(b.materia, contenido));
  });

  cont.appendChild(boton('Cargar banco desde un archivo', 'secundario', cargarBancoArchivo, { style: { marginTop: '.3rem' } }));
  cont.appendChild(el('p', { style: { margin: '.5rem 0 0', fontSize: '.75rem', color: 'var(--text-secondary)' } },
    'El formato del archivo está explicado en docs/PAES.md. Antes de cargar material, verificá que su uso esté permitido.'));

  return cont;
}

function bloqueEnCurso() {
  const s = estado.simulacro;
  const banco = bancoPorClave(s.bancoClave);
  const t = crearTemporizador(s.duracionSeg, s.inicioMs);
  const restante = t.restante();

  const caja = el('div', {
    style: {
      padding: '.8rem', borderRadius: 'var(--radius)', marginBottom: '1rem',
      background: 'var(--amber-light)', border: '1px solid var(--amber)',
    },
  });
  caja.appendChild(el('p', { style: { margin: '0 0 .4rem', fontWeight: '700', fontSize: '.9rem' } },
    'Tenés un simulacro a medias'));
  caja.appendChild(el('p', { style: { margin: '0 0 .6rem', fontSize: '.85rem' } },
    (banco ? banco.materia : s.bancoClave) + ' · pregunta ' + (s.indice + 1) + ' de ' + s.preguntasIds.length +
    ' · quedan ' + formatearTiempo(restante)));

  const acciones = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } });
  acciones.appendChild(boton(restante > 0 ? 'Continuar simulacro' : 'Ver resultados', 'primario', () => {
    if (restante > 0) reanudarSimulacro();
    else terminarSimulacro(true);
  }));
  acciones.appendChild(boton('Descartarlo', 'peligro', () => descartarSimulacro()));
  caja.appendChild(acciones);

  return caja;
}

async function configurarSimulacro(banco) {
  const max = banco.preguntas.length;
  const opcionesCantidad = [5, 10, 15, 20, max]
    .filter((n, i, a) => n <= max && a.indexOf(n) === i)
    .map((n) => ({ valor: String(n), texto: n + ' pregunta(s)' }));
  const opcionesTiempo = [
    { valor: '10', texto: '10 minutos' },
    { valor: '20', texto: '20 minutos' },
    { valor: '45', texto: '45 minutos' },
    { valor: '60', texto: '60 minutos' },
  ];

  const { confirmado, valores } = await dialogoFormulario('Simulacro de ' + banco.materia, [
    { clave: 'cantidad', etiqueta: '¿Cuántas preguntas?', tipo: 'selector', valor: opcionesCantidad[0].valor, opciones: opcionesCantidad },
    { clave: 'tiempo', etiqueta: '¿Cuánto tiempo tenés?', tipo: 'selector', valor: '20', opciones: opcionesTiempo },
    { clave: 'mezclar', etiqueta: '¿Mezclar el orden de las opciones?', tipo: 'selector', valor: 'si', opciones: [{ valor: 'si', texto: 'Sí, mezclar' }, { valor: 'no', texto: 'No mezclar' }] },
  ], 'Empezar');

  if (!confirmado) return;
  if (estado.simulacro) {
    const seguir = await confirmar('Ya hay un simulacro en curso',
      'Si empezás este, se descarta el anterior. ¿Querés continuar?', 'Sí, empezar este');
    if (!seguir) return;
  }

  const semilla = Math.floor(Math.random() * 100000) + 1;
  const elegidas = seleccionarPreguntas(banco.preguntas, parseInt(valores.cantidad, 10), semilla);
  const conOpciones = valores.mezclar === 'si'
    ? elegidas.map((p, i) => ordenarOpciones(p, semilla + i))
    : elegidas;

  estado.simulacro = {
    bancoClave: banco.clave,
    materia: banco.materia,
    preguntasIds: conOpciones.map((p) => p.id),
    preguntas: conOpciones,
    respuestas: {},
    indice: 0,
    inicioMs: Date.now(),
    duracionSeg: parseInt(valores.tiempo, 10) * 60,
  };
  await guardarSimulacro();
  estado.pestana = 'inicio';
  dibujar();
  mostrarPregunta();
}

function guardarSimulacro() {
  // No se guardan las preguntas completas (son muchos datos); basta con
  // los id y el banco para reconstruirlas al volver.
  if (!estado.simulacro) return storage.remove(CLAVES.PAES_EN_CURSO);
  const s = estado.simulacro;
  return storage.set(CLAVES.PAES_EN_CURSO, {
    bancoClave: s.bancoClave,
    materia: s.materia,
    preguntasIds: s.preguntasIds,
    respuestas: s.respuestas,
    indice: s.indice,
    inicioMs: s.inicioMs,
    duracionSeg: s.duracionSeg,
  });
}

function reanudarSimulacro() {
  const s = estado.simulacro;
  const banco = bancoPorClave(s.bancoClave);
  if (!banco) {
    avisar('No se encontró el banco de este simulacro.', 'error');
    estado.simulacro = null;
    guardarSimulacro();
    dibujar();
    return;
  }
  const porId = {};
  banco.preguntas.forEach((p) => { porId[p.id] = p; });
  s.preguntas = s.preguntasIds.map((id) => porId[id]).filter(Boolean);
  if (!s.preguntas.length) {
    avisar('Las preguntas de este simulacro ya no están disponibles.', 'error');
    estado.simulacro = null;
    guardarSimulacro();
    dibujar();
    return;
  }
  mostrarPregunta();
}

async function descartarSimulacro() {
  const ok = await confirmar('Descartar simulacro', 'Se va a borrar el progreso de este simulacro.', 'Descartar');
  if (!ok) return;
  estado.simulacro = null;
  await guardarSimulacro();
  detenerReloj();
  dibujar();
}

/* ---------------- Pregunta en pantalla ---------------- */

function mostrarPregunta() {
  const s = estado.simulacro;
  if (!s) return;

  const cont = el('div');
  const total = s.preguntas.length;
  const indice = Math.min(s.indice, total - 1);

  /* Cabecera con tiempo y progreso */
  const cabecera = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem', flexWrap: 'wrap' } });
  const reloj = el('span', {
    id: 'cb-paes-reloj',
    role: 'timer',
    'aria-live': 'off',
    style: { fontSize: '1.15rem', fontWeight: '700', fontVariantNumeric: 'tabular-nums' },
  }, formatearTiempo(crearTemporizador(s.duracionSeg, s.inicioMs).restante()));
  cabecera.appendChild(reloj);
  cabecera.appendChild(el('span', { style: { fontSize: '.85rem', color: 'var(--text-secondary)' } },
    s.materia + ' · pregunta ' + (indice + 1) + ' de ' + total));
  cont.appendChild(cabecera);

  /* Barra de avance */
  const barra = el('div', {
    role: 'progressbar',
    'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(indice + 1),
    'aria-label': 'Avance del simulacro',
    style: { height: '6px', background: 'var(--gray-200)', borderRadius: '99px', overflow: 'hidden', marginBottom: '1rem' },
  });
  barra.appendChild(el('div', { id: 'cb-paes-barra', style: { height: '100%', width: ((indice + 1) / total * 100) + '%', background: 'var(--primary)', transition: 'width .3s' } }));
  cont.appendChild(barra);

  /* Pregunta */
  const p = s.preguntas[indice];
  cont.appendChild(tarjeta('Pregunta ' + (indice + 1), el('div', {}, [
    el('p', { style: { margin: '0 0 .8rem', fontSize: '.95rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' } }, p.enunciado),
  ])));

  /* Opciones */
  const opciones = el('div', { role: 'group', 'aria-label': 'Opciones de respuesta', style: { display: 'flex', flexDirection: 'column', gap: '.45rem' } });
  const elegida = s.respuestas[p.id] || '';
  p.opciones.forEach((o) => {
    const id = 'cb-opt-' + p.id + '-' + o.id;
    const label = el('label', {
      for: id,
      style: {
        display: 'flex', alignItems: 'center', gap: '.55rem', padding: '.55rem .65rem',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        border: '1.5px solid ' + (elegida === o.id ? 'var(--primary)' : 'var(--border)'),
        background: elegida === o.id ? 'var(--primary-light)' : 'var(--bg-card)',
        fontSize: '.88rem', lineHeight: '1.4',
      },
    });
    const radio = el('input', { type: 'radio', name: 'cb-paes-op', id, value: o.id });
    radio.checked = elegida === o.id;
    radio.addEventListener('change', async () => {
      s.respuestas[p.id] = o.id;
      await guardarSimulacro();
      mostrarPregunta();
    });
    label.appendChild(radio);
    label.appendChild(el('span', { style: { overflowWrap: 'anywhere' } }, o.texto));
    opciones.appendChild(label);
  });
  cont.appendChild(opciones);

  /* Navegación */
  const nav = el('div', { style: { display: 'flex', gap: '.5rem', marginTop: '1rem', flexWrap: 'wrap' } });
  if (indice > 0) nav.appendChild(boton('← Anterior', 'secundario', () => { s.indice = indice - 1; guardarSimulacro(); mostrarPregunta(); }));
  if (indice < total - 1) {
    nav.appendChild(boton('Siguiente →', 'primario', () => { s.indice = indice + 1; guardarSimulacro(); mostrarPregunta(); }));
  } else {
    nav.appendChild(boton('Terminar y ver resultados', 'primario', () => terminarSimulacro(false)));
  }
  nav.appendChild(boton('Salir sin terminar', 'fantasma', () => descartarSimulacro()));
  cont.appendChild(nav);

  render(raiz, cont);
  arrancarReloj();
}

function arrancarReloj() {
  detenerReloj();
  const s = estado.simulacro;
  if (!s) return;
  estado.temporizadorId = setInterval(() => {
    const t = crearTemporizador(s.duracionSeg, s.inicioMs);
    const restante = t.restante();
    const reloj = document.getElementById('cb-paes-reloj');
    if (reloj) {
      reloj.textContent = formatearTiempo(restante);
      // Cuando queda poco, el color avisa sin gritar
      reloj.style.color = restante <= 60 ? 'var(--red-ink)' : 'var(--text)';
      reloj.setAttribute('aria-label', 'Tiempo restante: ' + formatearTiempo(restante));
    }
    if (restante <= 0) {
      detenerReloj();
      terminarSimulacro(true);
    }
  }, 1000);
}

function detenerReloj() {
  if (estado.temporizadorId) {
    clearInterval(estado.temporizadorId);
    estado.temporizadorId = null;
  }
}

async function terminarSimulacro(porTiempo) {
  const s = estado.simulacro;
  if (!s) return;
  detenerReloj();

  const resultado = calificarSimulacro(s.preguntas, s.respuestas);
  const usado = crearTemporizador(s.duracionSeg, s.inicioMs).transcurrido();

  const registro = {
    id: nuevoId(),
    fecha: claveFecha(hoy()),
    hora: new Date().toTimeString().slice(0, 5),
    bancoClave: s.bancoClave,
    materia: s.materia,
    total: resultado.total,
    correctas: resultado.correctas,
    incorrectas: resultado.incorrectas,
    sinResponder: resultado.sinResponder,
    porcentaje: resultado.porcentaje,
    segundos: usado,
    porTema: resultado.porTema,
    porTiempo: !!porTiempo,
  };

  estado.historial.push(registro);
  await storage.set(CLAVES.PAES_HISTORIAL, estado.historial);
  estado.simulacro = null;
  await guardarSimulacro();

  await mostrarResultado(registro);
  estado.pestana = 'historial';
  dibujar();
}

async function mostrarResultado(r) {
  const temas = temasAPracticar(r, 3);
  const meta = estado.metas[r.bancoClave];
  const avance = meta ? avanceMeta(meta, estado.historial.filter((x) => x.bancoClave === r.bancoClave)) : null;

  const cuerpo = el('div');

  const cifras = el('div', { style: { display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '.8rem' } });
  cifras.appendChild(el('div', {}, [
    el('span', { style: { display: 'block', fontSize: '.72rem', color: 'var(--text-secondary)' } }, 'Aciertos'),
    el('span', { style: { fontSize: '1.5rem', fontWeight: '700' } }, r.correctas + '/' + r.total),
  ]));
  cifras.appendChild(el('div', {}, [
    el('span', { style: { display: 'block', fontSize: '.72rem', color: 'var(--text-secondary)' } }, 'Porcentaje'),
    el('span', { style: { fontSize: '1.5rem', fontWeight: '700' } }, r.porcentaje + ' %'),
  ]));
  cifras.appendChild(el('div', {}, [
    el('span', { style: { display: 'block', fontSize: '.72rem', color: 'var(--text-secondary)' } }, 'Tiempo usado'),
    el('span', { style: { fontSize: '1.5rem', fontWeight: '700' } }, formatearTiempo(r.segundos)),
  ]));
  cuerpo.appendChild(cifras);

  if (r.porTiempo) {
    cuerpo.appendChild(aviso('Se acabó el tiempo',
      'El simulacro terminó solo cuando llegó a cero el reloj. Las preguntas sin respuesta quedaron contadas como sin responder.',
      'aviso'));
  }
  cuerpo.appendChild(el('p', { style: { margin: '0 0 .7rem', fontSize: '.82rem', color: 'var(--text-secondary)' } },
    'Promedio: ' + segundosPorPregunta(r.segundos, r.total) + ' segundos por pregunta.' +
    (avance ? (avance.alcanzada ? ' ¡Alcanzaste tu meta de ' + meta + ' %!' : ' Tu meta es ' + meta + ' %; te faltan ' + avance.faltanPuntos + ' puntos.') : '')));

  if (temas.length) {
    cuerpo.appendChild(el('p', { style: { margin: '0 0 .4rem', fontWeight: '600', fontSize: '.88rem' } }, 'Conviene practicar más:'));
    const lista = el('ul', { style: { margin: '0 0 .8rem', paddingLeft: '1.1rem', fontSize: '.85rem' } });
    temas.forEach((t) => lista.appendChild(el('li', {}, t)));
    cuerpo.appendChild(lista);
  } else {
    cuerpo.appendChild(el('p', { style: { margin: '0 0 .8rem', fontSize: '.88rem', color: 'var(--green-ink)' } },
      '¡Muy bien! En todos los temas tuviste al menos una respuesta correcta.'));
  }

  /* Desglose por tema */
  if (r.porTema && r.porTema.length) {
    cuerpo.appendChild(el('h4', { style: { margin: '0 0 .4rem', fontSize: '.88rem' } }, 'Resultado por tema'));
    r.porTema.forEach((t) => {
      const fila = el('div', { style: { marginBottom: '.45rem' } });
      fila.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: '.15rem' } }, [
        el('span', {}, t.tema),
        el('span', { style: { color: 'var(--text-secondary)' } }, t.correctas + '/' + t.total + ' · ' + t.porcentaje + ' %'),
      ]));
      const barra = el('div', { style: { height: '6px', background: 'var(--gray-200)', borderRadius: '99px', overflow: 'hidden' } });
      barra.appendChild(el('div', {
        style: {
          height: '100%', width: t.porcentaje + '%',
          background: t.porcentaje >= 70 ? 'var(--green)' : t.porcentaje >= 40 ? 'var(--amber)' : 'var(--red)',
          transition: 'width .3s',
        },
      }));
      fila.appendChild(barra);
      cuerpo.appendChild(fila);
    });
  }

  await dialogo({ titulo: 'Resultado del simulacro', contenido: cuerpo, textoConfirmar: 'Cerrar' });
}

/* ================================================================
   HISTORIAL
   ================================================================ */
function vistaHistorial() {
  const cont = el('div');

  if (!estado.historial.length) {
    cont.appendChild(vacio('Todavía no terminaste ningún simulacro. Cuando termines uno, el resultado queda guardado acá.'));
    return cont;
  }

  const recientes = estado.historial.slice(-12);

  /* Gráfica en SVG, dibujada a mano */
  const puntos = serieHistorial(recientes, 100, 100);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label',
    'Gráfica de tus últimos ' + puntos.length + ' simulacros: ' +
    puntos.map((p) => p.porcentaje + ' % el ' + p.fecha).join(', '));
  svg.style.cssText = 'width:100%;height:150px;display:block;';

  /* Líneas de referencia al 50 % y al 100 % */
  [50, 100].forEach((v) => {
    const linea = document.createElementNS(svgNS, 'line');
    linea.setAttribute('x1', '0');
    linea.setAttribute('x2', '100');
    linea.setAttribute('y1', String(100 - (v / 100) * 100));
    linea.setAttribute('y2', String(100 - (v / 100) * 100));
    linea.setAttribute('stroke', 'var(--border)');
    linea.setAttribute('stroke-width', '0.5');
    linea.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(linea);
  });

  /* Línea de tendencia */
  const d = puntos.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ' ' + p.y).join(' ');
  const camino = document.createElementNS(svgNS, 'path');
  camino.setAttribute('d', d);
  camino.setAttribute('fill', 'none');
  camino.setAttribute('stroke', 'var(--primary)');
  camino.setAttribute('stroke-width', '2');
  camino.setAttribute('vector-effect', 'non-scaling-stroke');
  camino.setAttribute('stroke-linejoin', 'round');
  camino.setAttribute('stroke-linecap', 'round');
  svg.appendChild(camino);

  puntos.forEach((p) => {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', String(p.x));
    c.setAttribute('cy', String(p.y));
    c.setAttribute('r', '1.6');
    c.setAttribute('fill', 'var(--primary)');
    svg.appendChild(c);
  });

  cont.appendChild(tarjeta('Tus últimos simulacros', svg));

  /* Lista */
  const lista = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.45rem' } });
  estado.historial.slice().reverse().forEach((r) => {
    const fila = el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', padding: '.5rem .6rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' },
    });
    const caja = el('div', { style: { flex: '1', minWidth: '0' } });
    caja.appendChild(el('div', { style: { fontWeight: '600', fontSize: '.86rem', overflowWrap: 'anywhere' } },
      r.materia + ' · ' + r.correctas + '/' + r.total + ' (' + r.porcentaje + ' %)'));
    caja.appendChild(el('div', { style: { fontSize: '.75rem', color: 'var(--text-secondary)' } },
      r.fecha + (r.hora ? ' · ' + r.hora : '') + ' · ' + formatearTiempo(r.segundos) + (r.porTiempo ? ' · se acabó el tiempo' : '')));
    fila.appendChild(caja);
    fila.appendChild(boton('Borrar', 'peligro', () => borrarHistorial(r), { 'aria-label': 'Borrar el resultado del ' + r.fecha }));
    lista.appendChild(fila);
  });
  cont.appendChild(tarjeta('Resultados guardados', lista));

  const acciones = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } });
  acciones.appendChild(boton('Exportar historial (CSV)', 'secundario', exportarHistorial));
  acciones.appendChild(boton('Borrar todo el historial', 'peligro', () => confirmarBorrarHistorial()));
  cont.appendChild(acciones);

  return cont;
}

async function borrarHistorial(r) {
  const ok = await confirmar('Borrar resultado', 'Se va a borrar el resultado del ' + r.fecha + '.', 'Borrar');
  if (!ok) return;
  estado.historial = estado.historial.filter((x) => x.id !== r.id);
  await storage.set(CLAVES.PAES_HISTORIAL, estado.historial);
  dibujar();
}

async function confirmarBorrarHistorial() {
  const ok = await confirmar('Borrar todo el historial', 'Se van a borrar todos tus resultados guardados. Esta acción no se puede deshacer.', 'Borrar todo');
  if (!ok) return;
  estado.historial = [];
  await storage.set(CLAVES.PAES_HISTORIAL, estado.historial);
  dibujar();
}

function exportarHistorial() {
  const filas = estado.historial.map((r) => ({
    fecha: r.fecha,
    hora: r.hora,
    materia: r.materia,
    total: r.total,
    correctas: r.correctas,
    incorrectas: r.incorrectas,
    sin_responder: r.sinResponder,
    porcentaje: r.porcentaje,
    tiempo_segundos: r.segundos,
    se_acabo_el_tiempo: r.porTiempo ? 'si' : 'no',
  }));
  if (!filas.length) { avisar('Todavía no hay resultados para exportar.', 'error'); return; }
  descargarTexto('historial-paes.csv', aCSVPropio(filas), 'text/csv;charset=utf-8');
  avisar('Historial exportado.', 'success');
}

function aCSVPropio(filas) {
  const cols = Object.keys(filas[0]);
  const escapar = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(';')].concat(filas.map((f) => cols.map((c) => escapar(f[c])).join(';'))).join('\r\n');
}

/* ================================================================
   REPASO CON TARJETAS
   ================================================================ */
function vistaTarjetas() {
  const cont = el('div');
  const pendientes = tarjetasParaRepasar(estado.tarjetas);
  const cajas = resumenCajas(estado.tarjetas);

  const resumen = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.8rem' } });
  resumen.appendChild(etiqueta(estado.tarjetas.length + ' tarjeta(s)', 'var(--gray-100)'));
  resumen.appendChild(etiqueta(pendientes.length + ' para repasar hoy', pendientes.length ? 'var(--amber-light)' : 'var(--green-light)'));
  INTERVALOS_LEITNER.forEach((dias, i) => {
    if (cajas[i + 1]) resumen.appendChild(etiqueta(cajas[i + 1] + ' en caja ' + (i + 1) + ' (' + dias + ' d)', 'var(--gray-100)'));
  });
  cont.appendChild(resumen);

  const acciones = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.9rem' } });
  acciones.appendChild(boton('+ Nueva tarjeta', 'primario', nuevaTarjeta));
  acciones.appendChild(boton('Empezar repaso', 'secundario', () => repasarTarjetas(), { disabled: !pendientes.length }));
  acciones.appendChild(boton('Exportar tarjetas (JSON)', 'fantasma', exportarTarjetas));
  cont.appendChild(acciones);

  if (!estado.tarjetas.length) {
    cont.appendChild(vacio(
      'Las tarjetas son para repasar con el método de las cajas: cada acierto aleja más la próxima revisión y cada error la trae para mañana.',
      '+ Crear la primera tarjeta', nuevaTarjeta
    ));
    return cont;
  }

  const lista = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.4rem' } });
  estado.tarjetas.forEach((t) => {
    const fila = el('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.5rem .6rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' } });
    const caja = el('div', { style: { flex: '1', minWidth: '0' } });
    caja.appendChild(el('div', { style: { fontWeight: '600', fontSize: '.86rem', overflowWrap: 'anywhere' } }, t.frente));
    caja.appendChild(el('div', { style: { fontSize: '.78rem', color: 'var(--text-secondary)', overflowWrap: 'anywhere' } }, t.dorso));
    caja.appendChild(el('div', { style: { fontSize: '.72rem', color: 'var(--text-secondary)', marginTop: '.15rem' } },
      'Caja ' + t.caja + (t.proximaRevision ? ' · se repasa el ' + t.proximaRevision : ' · sin repasar todavía')));
    fila.appendChild(caja);
    const botones = el('div', { style: { display: 'flex', gap: '.25rem' } });
    botones.appendChild(boton('✎', 'fantasma', () => editarTarjeta(t), { 'aria-label': 'Editar la tarjeta ' + t.frente }));
    botones.appendChild(boton('✕', 'peligro', () => borrarTarjeta(t), { 'aria-label': 'Borrar la tarjeta ' + t.frente }));
    fila.appendChild(botones);
    lista.appendChild(fila);
  });
  cont.appendChild(tarjeta('Mis tarjetas', lista));

  return cont;
}

async function nuevaTarjeta() {
  const { confirmado, valores } = await dialogoFormulario('Nueva tarjeta', [
    { clave: 'frente', etiqueta: 'Por delante (pregunta o palabra)', placeholder: 'Ej: ¿Qué es la hipotenusa?', requerido: true, tipo: 'area', filas: 2 },
    { clave: 'dorso', etiqueta: 'Por detrás (respuesta)', placeholder: 'Ej: El lado mayor de un triángulo rectángulo.', requerido: true, tipo: 'area', filas: 3 },
    { clave: 'tema', etiqueta: 'Tema (opcional)', placeholder: 'Ej: Geometría' },
  ], 'Crear tarjeta');
  if (!confirmado) return;

  const t = tarjetaNueva(valores.frente, valores.dorso, valores.tema);
  const errores = validarTarjeta(t);
  if (errores.length) { avisar(errores[0], 'error'); return; }

  estado.tarjetas.push(t);
  await storage.set(CLAVES.PAES_TARJETAS, estado.tarjetas);
  dibujar();
  avisar('Tarjeta creada.', 'success');
}

async function editarTarjeta(t) {
  const { confirmado, valores } = await dialogoFormulario('Editar tarjeta', [
    { clave: 'frente', etiqueta: 'Por delante', valor: t.frente, requerido: true, tipo: 'area', filas: 2 },
    { clave: 'dorso', etiqueta: 'Por detrás', valor: t.dorso, requerido: true, tipo: 'area', filas: 3 },
    { clave: 'tema', etiqueta: 'Tema (opcional)', valor: t.tema || '' },
  ]);
  if (!confirmado) return;

  const errores = validarTarjeta(valores);
  if (errores.length) { avisar(errores[0], 'error'); return; }

  t.frente = valores.frente.trim();
  t.dorso = valores.dorso.trim();
  t.tema = (valores.tema || '').trim();
  await storage.set(CLAVES.PAES_TARJETAS, estado.tarjetas);
  dibujar();
}

async function borrarTarjeta(t) {
  const ok = await confirmar('Borrar tarjeta', 'Se va a borrar la tarjeta «' + t.frente + '».', 'Borrar');
  if (!ok) return;
  estado.tarjetas = estado.tarjetas.filter((x) => x.id !== t.id);
  await storage.set(CLAVES.PAES_TARJETAS, estado.tarjetas);
  dibujar();
}

function exportarTarjetas() {
  if (!estado.tarjetas.length) { avisar('Todavía no tenés tarjetas.', 'error'); return; }
  descargarTexto('tarjetas-repaso.json', JSON.stringify({ version: 1, tarjetas: estado.tarjetas }, null, 2));
  avisar('Tarjetas exportadas.', 'success');
}

/** Repaso guiado: se enseña el frente, se revela, se califica. */
async function repasarTarjetas() {
  let pendientes = tarjetasParaRepasar(estado.tarjetas);
  if (!pendientes.length) { avisar('Hoy no tenés tarjetas para repasar.', 'success'); return; }

  let repasadas = 0;
  let acertadas = 0;
  let seguir = true;

  while (seguir && repasadas < pendientes.length) {
    const t = pendientes[repasadas];

    const cuerpo = el('div');
    cuerpo.appendChild(el('p', { style: { margin: '0 0 .3rem', fontSize: '.75rem', color: 'var(--text-secondary)' } },
      'Tarjeta ' + (repasadas + 1) + ' de ' + pendientes.length + (t.tema ? ' · ' + t.tema : '')));
    cuerpo.appendChild(el('p', { style: { margin: '0 0 .8rem', fontSize: '1.05rem', fontWeight: '600', lineHeight: '1.5', whiteSpace: 'pre-wrap' } }, t.frente));

    const dorso = el('div', { id: 'cb-paes-dorso', class: 'hidden', style: { padding: '.7rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' } });
    dorso.appendChild(el('p', { style: { margin: 0, fontSize: '.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' } }, t.dorso));
    dorso.appendChild(el('p', { style: { margin: '.5rem 0 0', fontSize: '.75rem', color: 'var(--text-secondary)' } },
      'Estás en la caja ' + t.caja + '. Cada acierto te sube una caja y aleja el próximo repaso; cada error te devuelve a la caja 1.'));
    cuerpo.appendChild(dorso);

    /* Hasta que no se revele, las acciones de calificación no existen:
       así no se puede responder sin haber mirado. */
    const btnRevelar = boton('Ver la respuesta', 'primario', () => {
      dorso.classList.remove('hidden');
      btnRevelar.remove();
      pie.classList.remove('hidden');
      const primero = pie.querySelector('button');
      if (primero) primero.focus();
    });
    cuerpo.appendChild(btnRevelar);

    const pie = el('div', { class: 'hidden', style: { marginTop: '.8rem', fontSize: '.8rem', color: 'var(--text-secondary)' } },
      '¿Sabías la respuesta?');
    cuerpo.appendChild(pie);

    const salida = await dialogo({
      titulo: 'Repaso de tarjetas',
      contenido: cuerpo,
      textoCancelar: 'Terminar repaso',
      acciones: [
        { texto: 'La sabía ✓', tono: 'primario', resultado: 'acierto' },
        { texto: 'La olvidé ✕', tono: 'peligro', resultado: 'error' },
      ],
    });

    if (salida !== 'acierto' && salida !== 'error') break;

    const acierto = salida === 'acierto';
    const nueva = programarRepaso(t, acierto);
    const idx = estado.tarjetas.findIndex((x) => x.id === t.id);
    if (idx >= 0) estado.tarjetas[idx] = nueva;
    pendientes = pendientes.map((x, j) => (j === repasadas ? nueva : x));
    if (acierto) acertadas += 1;
    repasadas += 1;
    if (repasadas < pendientes.length) {
      const quedan = await confirmar('Seguir repasando',
        'Acertaste ' + acertadas + ' de ' + repasadas + '. Quedan ' + (pendientes.length - repasadas) + ' tarjeta(s) para hoy.',
        'Seguir');
      if (!quedan) seguir = false;
    }
  }

  await storage.set(CLAVES.PAES_TARJETAS, estado.tarjetas);
  dibujar();
  if (repasadas > 0) {
    avisar('Repaso terminado: ' + acertadas + ' de ' + repasadas + '. ¡Seguí así!', 'success');
  }
}

/* ================================================================
   META PERSONAL
   ================================================================ */
function vistaMeta() {
  const cont = el('div');

  cont.appendChild(el('p', { style: { margin: '0 0 .8rem', fontSize: '.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' } },
    'Definí el porcentaje de acierto que querés alcanzar. Acá se compara contra tus propios resultados, no contra los de nadie más.'));

  if (!estado.bancos.length) {
    cont.appendChild(vacio('Primero necesitás al menos un banco de preguntas.'));
    return cont;
  }

  estado.bancos.forEach((b) => {
    const meta = estado.metas[b.clave] || 0;
    const historial = estado.historial.filter((x) => x.bancoClave === b.clave);
    const a = avanceMeta(meta, historial);

    const cuerpo = el('div');

    if (meta > 0) {
      const barra = el('div', {
        role: 'progressbar',
        'aria-valuemin': '0', 'aria-valuemax': String(meta),
        'aria-valuenow': String(Math.min(meta, a.mejor)),
        'aria-label': 'Avance hacia tu meta de ' + meta + ' por ciento en ' + b.materia,
        style: { height: '8px', background: 'var(--gray-200)', borderRadius: '99px', overflow: 'hidden', marginBottom: '.4rem' },
      });
      barra.appendChild(el('div', {
        style: {
          height: '100%', width: Math.round(a.progreso * 100) + '%',
          background: a.alcanzada ? 'var(--green)' : 'var(--primary)', transition: 'width .3s',
        },
      }));
      cuerpo.appendChild(barra);
      cuerpo.appendChild(el('p', { style: { margin: '0 0 .5rem', fontSize: '.82rem' } },
        a.alcanzada
          ? '¡Meta alcanzada! Tu mejor resultado fue ' + a.mejor + ' %.'
          : 'Tu mejor resultado fue ' + a.mejor + ' %; te faltan ' + a.faltanPuntos + ' puntos para la meta de ' + meta + ' %.'));
    } else {
      cuerpo.appendChild(el('p', { style: { margin: '0 0 .5rem', fontSize: '.82rem', color: 'var(--text-secondary)' } },
        'Todavía no definiste una meta para esta materia.'));
    }

    const acciones = el('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } });
    acciones.appendChild(boton(meta > 0 ? 'Cambiar meta' : 'Poner una meta', 'primario', () => definirMeta(b)));
    if (meta > 0) acciones.appendChild(boton('Quitar meta', 'fantasma', () => quitarMeta(b)));
    cuerpo.appendChild(acciones);

    cont.appendChild(tarjeta(b.materia, cuerpo));
  });

  return cont;
}

async function definirMeta(banco) {
  const { confirmado, valores } = await dialogoFormulario('Meta de ' + banco.materia, [
    { clave: 'porcentaje', etiqueta: 'Porcentaje de acierto que querés alcanzar', tipo: 'number', valor: String(estado.metas[banco.clave] || 70), min: 1, max: 100, paso: '1', inputmode: 'numeric', requerido: true,
      ayuda: 'Esto no es el puntaje oficial de la PAES: es tu propio porcentaje de aciertos.' },
  ], 'Guardar meta');
  if (!confirmado) return;

  const v = parseInt(valores.porcentaje, 10);
  if (!isFinite(v) || v < 1 || v > 100) { avisar('El porcentaje debe estar entre 1 y 100.', 'error'); return; }

  estado.metas[banco.clave] = v;
  await storage.set(CLAVES.PAES_METAS, estado.metas);
  dibujar();
  avisar('Meta guardada.', 'success');
}

async function quitarMeta(banco) {
  delete estado.metas[banco.clave];
  await storage.set(CLAVES.PAES_METAS, estado.metas);
  dibujar();
}

/* ================================================================
   Bancos cargados por el docente
   ================================================================ */
function cargarBancoArchivo() {
  const input = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  input.addEventListener('change', () => {
    const archivo = input.files && input.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = async () => {
      let datos;
      try {
        datos = JSON.parse(String(lector.result));
      } catch (e) {
        avisar('El archivo no es un JSON válido.', 'error');
        return;
      }
      const validacion = validarBanco(datos);
      if (!validacion.preguntasValidas.length) {
        avisar(validacion.errores[0] || 'El archivo no tiene preguntas válidas.', 'error');
        return;
      }
      const bancos = await storage.list(CLAVES.PAES_BANCO);
      const registro = {
        clave: nuevoId(),
        materia: datos.materia || archivo.name,
        aviso: datos.aviso || 'Banco cargado por el docente desde ' + archivo.name,
        fecha: claveFecha(hoy()),
        preguntas: validacion.preguntasValidas,
      };
      bancos.push(registro);
      await storage.set(CLAVES.PAES_BANCO, bancos);
      await cargarBancos();
      dibujar();
      avisar('Banco cargado con ' + validacion.preguntasValidas.length + ' pregunta(s).' +
        (validacion.errores.length ? ' Se ignoraron ' + validacion.errores.length + ' con problemas.' : ''), 'success');
    };
    lector.onerror = () => avisar('No se pudo leer el archivo.', 'error');
    lector.readAsText(archivo);
  });
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 1000);
}

async function borrarBanco(banco) {
  const ok = await confirmar('Borrar banco', 'Se van a borrar las preguntas del banco «' + banco.materia + '».', 'Borrar');
  if (!ok) return;
  const bancos = (await storage.list(CLAVES.PAES_BANCO)).filter((b) => b.clave !== banco.clave);
  await storage.set(CLAVES.PAES_BANCO, bancos);
  await cargarBancos();
  dibujar();
}

/* Se expone para el cargador diferido. */
export default { montar };
