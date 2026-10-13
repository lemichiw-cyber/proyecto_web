/* ===================================================================
   paes-logica.js — Lógica pura de la preparación PAES.

   IMPORTANTE sobre la puntuación:
   La PAES oficial se informa en una escala que convierte los aciertos
   en puntaje y esa conversión la fija el MINED. Acá NO se inventa esa
   tabla: se muestran aciertos y porcentaje, y la meta personal se
   define en porcentaje. Cuando el centro entregue la tabla de
   conversión oficial, se agrega acá sin tocar la interfaz.

   Sin DOM ni almacenamiento: todo es testeable.
   =================================================================== */

import { hoy as hoyPorDefecto, sumarDias, aFecha } from '../utils.js';

/** Esquema mínimo que debe cumplir cada pregunta del banco. */
export const ESQUEMA_PREGUNTA = Object.freeze({
  id: 'string',
  enunciado: 'string',
  opciones: 'array de { id, texto } con al menos 2 opciones',
  correcta: 'id de la opción correcta',
  explicacion: 'string (opcional)',
  tema: 'string (opcional, para el desglose)',
});

/* ------------------------------------------------------------------
   Validación del banco de preguntas
   ------------------------------------------------------------------ */

/**
 * Valida el banco de una materia.
 * @param {object} banco { materia, preguntas: [...] }
 * @returns {object} { valido, errores: [], preguntasValidas: [] }
 */
export function validarBanco(banco) {
  const errores = [];
  const preguntasValidas = [];

  if (!banco || typeof banco !== 'object') {
    return { valido: false, errores: ['El archivo del banco no es un objeto válido.'], preguntasValidas: [] };
  }
  if (!Array.isArray(banco.preguntas)) {
    return { valido: false, errores: ['El banco no tiene la lista "preguntas".'], preguntasValidas: [] };
  }
  if (!banco.preguntas.length) {
    errores.push('El banco no tiene ninguna pregunta todavía.');
  }

  const ids = new Set();
  banco.preguntas.forEach((p, i) => {
    const donde = 'Pregunta ' + (i + 1);
    if (!p || typeof p !== 'object') { errores.push(donde + ': no es un objeto.'); return; }
    if (!p.id) { errores.push(donde + ': falta el id.'); return; }
    if (ids.has(p.id)) { errores.push(donde + ': el id «' + p.id + '» se repite.'); return; }
    if (!String(p.enunciado || '').trim()) { errores.push(donde + ': falta el enunciado.'); return; }
    if (!Array.isArray(p.opciones) || p.opciones.length < 2) {
      errores.push(donde + ': necesita al menos 2 opciones.'); return;
    }
    const idsOpcion = p.opciones.map((o) => o && o.id);
    if (idsOpcion.some((x) => !x)) { errores.push(donde + ': todas las opciones necesitan id.'); return; }
    if (idsOpcion.some((x) => !String((p.opciones.find((o) => o.id === x) || {}).texto || '').trim())) {
      errores.push(donde + ': todas las opciones necesitan texto.'); return;
    }
    if (idsOpcion.indexOf(p.correcta) === -1) {
      errores.push(donde + ': la respuesta correcta no está entre las opciones.'); return;
    }
    if (typeof p.explicacion !== 'undefined' && p.explicacion !== null && typeof p.explicacion !== 'string') {
      errores.push(donde + ': la explicación debe ser texto.'); return;
    }
    ids.add(p.id);
    preguntasValidas.push(p);
  });

  return { valido: errores.length === 0, errores, preguntasValidas };
}

/* ------------------------------------------------------------------
   Selección de preguntas
   ------------------------------------------------------------------ */

/**
 * Muestra aleatoria pero determinista: con la misma semilla se elige
 * lo mismo, así un simulacro a medio guardar se puede reconstruir.
 * @param {object[]} preguntas
 * @param {number} cantidad
 * @param {number} semilla
 * @returns {object[]}
 */
export function seleccionarPreguntas(preguntas, cantidad, semilla = 1) {
  const lista = Array.isArray(preguntas) ? preguntas.slice() : [];
  if (!lista.length) return [];
  const n = Math.max(1, Math.min(lista.length, Math.floor(cantidad) || lista.length));

  let s = (Math.floor(semilla) || 1) % 2147483647;
  if (s <= 0) s += 2147483646;
  const siguiente = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const barajado = lista.slice();
  for (let i = barajado.length - 1; i > 0; i--) {
    const j = Math.floor(siguiente() * (i + 1));
    const tmp = barajado[i];
    barajado[i] = barajado[j];
    barajado[j] = tmp;
  }
  return barajado.slice(0, n);
}

/** Mezcla el orden de las opciones de una pregunta, de forma determinista. */
export function ordenarOpciones(pregunta, semilla = 1) {
  const p = pregunta || {};
  const opciones = Array.isArray(p.opciones) ? p.opciones.slice() : [];
  let s = (Math.floor(Math.abs(semilla)) || 1) % 2147483647;
  if (s <= 0) s += 2147483646;
  for (let i = opciones.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = Math.floor(((s - 1) / 2147483646) * (i + 1));
    const tmp = opciones[i];
    opciones[i] = opciones[j];
    opciones[j] = tmp;
  }
  return Object.assign({}, p, { opciones });
}

/* ------------------------------------------------------------------
   Calificación
   ------------------------------------------------------------------ */

/**
 * Califica un simulacro completo.
 * @param {object[]} preguntas  las que se presentaron, en orden
 * @param {object}   respuestas idPregunta → idOpción elegida (o ausente)
 * @returns {object} { total, correctas, incorrectas, sinResponder,
 *                     porcentaje, aciertos, porTema }
 */
export function calificarSimulacro(preguntas, respuestas) {
  const lista = Array.isArray(preguntas) ? preguntas : [];
  const resp = respuestas || {};
  let correctas = 0;
  let sinResponder = 0;
  const temas = {};

  lista.forEach((p) => {
    const tema = String(p.tema || 'Sin tema').trim() || 'Sin tema';
    if (!temas[tema]) temas[tema] = { tema, total: 0, correctas: 0 };
    temas[tema].total += 1;

    const elegida = resp[p.id];
    if (elegida === undefined || elegida === null || elegida === '') {
      sinResponder += 1;
      return;
    }
    if (elegida === p.correcta) {
      correctas += 1;
      temas[tema].correctas += 1;
    }
  });

  const total = lista.length;
  const incorrectas = total - correctas - sinResponder;
  const porcentaje = total ? Math.round((correctas / total) * 1000) / 10 : 0;

  const porTema = Object.keys(temas).map((k) => ({
    tema: temas[k].tema,
    total: temas[k].total,
    correctas: temas[k].correctas,
    incorrectas: temas[k].total - temas[k].correctas,
    porcentaje: temas[k].total
      ? Math.round((temas[k].correctas / temas[k].total) * 1000) / 10
      : 0,
  })).sort((a, b) => a.porcentaje - b.porcentaje); // los peores primero

  return { total, correctas, incorrectas, sinResponder, porcentaje, porTema };
}

/**
 * Los temas donde el estudiante tiene más para practicar.
 * @returns {string[]} hasta `cantidad` temas, del peor al mejor
 */
export function temasAPracticar(resultado, cantidad = 3) {
  const r = resultado || {};
  const lista = Array.isArray(r.porTema) ? r.porTema : [];
  return lista
    .filter((t) => t.porcentaje < 100)
    .slice(0, Math.max(1, cantidad))
    .map((t) => t.tema);
}

/* ------------------------------------------------------------------
   Temporizador que sobrevive a que se cierre la página
   ------------------------------------------------------------------ */

/**
 * El tiempo se guarda como marca de inicio + duración, no como
 * "quedan N segundos". Así, si el estudiante cierra la pestaña y
 * vuelve, el temporizador sigue siendo correcto.
 */
export function crearTemporizador(duracionSegundos, inicioEnMs) {
  const duracion = Math.max(0, Math.floor(Number(duracionSegundos) || 0));
  const inicio = Number(inicioEnMs) || Date.now();
  return {
    duracion,
    inicio,
    /** @param {number} ahoraEnMs */
    restante(ahoraEnMs) {
      const ahora = Number(ahoraEnMs) || Date.now();
      const usado = Math.floor((ahora - inicio) / 1000);
      return Math.max(0, duracion - usado);
    },
    transcurrido(ahoraEnMs) {
      const ahora = Number(ahoraEnMs) || Date.now();
      return Math.max(0, Math.floor((ahora - inicio) / 1000));
    },
    terminado(ahoraEnMs) {
      return this.restante(ahoraEnMs) <= 0;
    },
    /** 0..1 para la barra de progreso. */
    avance(ahoraEnMs) {
      if (!duracion) return 0;
      return Math.min(1, this.transcurrido(ahoraEnMs) / duracion);
    },
  };
}

/** Convierte segundos a 'mm:ss' (o 'h:mm:ss' si pasa de una hora). */
export function formatearTiempo(segundos) {
  const s = Math.max(0, Math.floor(Number(segundos) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dd = (x) => (x < 10 ? '0' : '') + x;
  return h > 0 ? h + ':' + dd(m) + ':' + dd(seg) : dd(m) + ':' + dd(seg);
}

/** Segundos promedio por pregunta, redondeados. */
export function segundosPorPregunta(segundosTotales, cantidadPreguntas) {
  const n = Number(cantidadPreguntas) || 0;
  if (n <= 0) return 0;
  return Math.round((Number(segundosTotales) || 0) / n);
}

/* ------------------------------------------------------------------
   Repaso con tarjetas — repetición espaciada (cajas de Leitner)
   ------------------------------------------------------------------ */

/** Días que hay que esperar en cada caja. Caja 1 = repasar mañana. */
export const INTERVALOS_LEITNER = Object.freeze([1, 2, 4, 8, 16]);
export const CAJA_MAXIMA = 5;

/** Crea una tarjeta nueva. */
export function tarjetaNueva(frente, dorso, tema) {
  return {
    id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    frente: String(frente || '').trim(),
    dorso: String(dorso || '').trim(),
    tema: String(tema || '').trim(),
    caja: 1,
    proximaRevision: null, // se calcula al primer repaso
    vueltas: 0,
  };
}

/** Valida una tarjeta. @returns {string[]} */
export function validarTarjeta(t) {
  const errores = [];
  if (!String((t || {}).frente || '').trim()) errores.push('La tarjeta necesita una pregunta o palabra por delante.');
  if (!String((t || {}).dorso || '').trim()) errores.push('La tarjeta necesita la respuesta por detrás.');
  return errores;
}

/**
 * Mueve la tarjeta de caja según el resultado del repaso.
 * · Acertó → sube una caja (hasta la 5) y espera más días.
 * · Falló  → vuelve a la caja 1, para repasarla mañana.
 * @param {object} tarjeta
 * @param {boolean} acierto
 * @param {string|Date} [deso] fecha del repaso (para pruebas)
 * @returns {object} una tarjeta NUEVA, sin tocar la original
 */
export function programarRepaso(tarjeta, acierto, deso) {
  const t = Object.assign({}, tarjeta || {});
  const cajaActual = Math.min(CAJA_MAXIMA, Math.max(1, Number(t.caja) || 1));
  const caja = acierto ? Math.min(CAJA_MAXIMA, cajaActual + 1) : 1;
  const dias = INTERVALOS_LEITNER[caja - 1];
  const base = hoyPorDefecto(deso);
  t.caja = caja;
  t.vueltas = (Number(t.vueltas) || 0) + 1;
  t.ultimaRevision = claveISO(base);
  t.proximaRevision = claveISO(sumarDias(base, dias));
  return t;
}

function claveISO(fecha) {
  const d = aFecha(fecha) || fecha;
  const dd = d.getDate();
  const mm = d.getMonth() + 1;
  return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
}

/**
 * Tarjetas que toca repasar hoy (las vencidas o sin repasar nunca).
 * @returns {object[]}
 */
export function tarjetasParaRepasar(tarjetas, deso) {
  const base = claveISO(hoyPorDefecto(deso));
  return (Array.isArray(tarjetas) ? tarjetas : [])
    .filter((t) => t && typeof t === 'object')
    .filter((t) => !t.proximaRevision || String(t.proximaRevision) <= base);
}

/** Resumen de las cajas, para mostrar el progreso del repaso. */
export function resumenCajas(tarjetas) {
  const r = {};
  INTERVALOS_LEITNER.forEach((dias, i) => { r[i + 1] = 0; });
  (Array.isArray(tarjetas) ? tarjetas : []).forEach((t) => {
    const c = Math.min(CAJA_MAXIMA, Math.max(1, Number((t || {}).caja) || 1));
    r[c] += 1;
  });
  return r;
}

/* ------------------------------------------------------------------
   Meta personal
   ------------------------------------------------------------------ */

/**
 * Avance del estudiante hacia su meta de porcentaje.
 * @returns {object} { meta, mejor, alcanzada, faltanPuntos, progreso (0..1) }
 */
export function avanceMeta(meta, historial) {
  const objetivo = Math.max(0, Math.min(100, Number(meta) || 0));
  const lista = Array.isArray(historial) ? historial : [];
  const mejor = lista.reduce((m, r) => Math.max(m, Number(r && r.porcentaje) || 0), 0);
  return {
    meta: objetivo,
    mejor,
    alcanzada: objetivo > 0 && mejor >= objetivo,
    faltanPuntos: Math.max(0, Math.round((objetivo - mejor) * 10) / 10),
    progreso: objetivo > 0 ? Math.min(1, mejor / objetivo) : 0,
  };
}

/**
 * Serie para la gráfica del historial: puntos (x, y) en 0..100.
 * Se dibuja en SVG a mano, sin librerías de gráficos.
 * @returns {object[]} [{ x: 0..1, y: 0..1, porcentaje, fecha }]
 */
export function serieHistorial(historial, ancho = 100, alto = 100) {
  const lista = (Array.isArray(historial) ? historial : [])
    .filter((r) => r && typeof r === 'object')
    .slice(-12); // máximo 12 puntos: en un celular una gráfica más densa no se lee
  const n = lista.length;
  return lista.map((r, i) => ({
    x: n === 1 ? 0 : (i / (n - 1)) * ancho,
    y: alto - ((Math.max(0, Math.min(100, Number(r.porcentaje) || 0)) / 100) * alto),
    porcentaje: Number(r.porcentaje) || 0,
    fecha: r.fecha || '',
  }));
}
