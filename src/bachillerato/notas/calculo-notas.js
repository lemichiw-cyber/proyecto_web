/* ===================================================================
   calculo-notas.js — Lógica pura de la calculadora de notas.

   SIN DOM, SIN localStorage: todo lo que se puede escribir a mano en
   una hoja de cálculo, acá se puede probar.

   IMPORTANTE — nada de esto es oficial:
   La escala 0–10, la nota de aprobación, cuántos períodos hay y qué
   ponderación tienen los períodos NO las fija esta aplicación. Las
   deja el reglamento del centro escolar y el MINED. Por eso todo es
   configurable y la interfaz avisa que hay que confirmarlo.

   Modelo:
     materia
       └── período (ponderación: cuánto pesa en la materia, suma 100 %)
             └── actividad (porcentaje dentro del período, suma 100 %)
                   nombre, porcentaje y nota (null = aún pendiente)

   Escala de notas por defecto: 0 a 10.
   =================================================================== */

import { redondear } from '../utils.js';

/* ------------------------------------------------------------------
   Configuración por defecto. TODO es editable por el estudiante.
   ------------------------------------------------------------------ */
export const CONFIG_DEFECTO = Object.freeze({
  escalaMin: 0,
  escalaMax: 10,
  notaAprobacion: 6,
  decimales: 1,
  periodosPorDefecto: Object.freeze([
    Object.freeze({ nombre: 'Primer período', ponderacion: 25 }),
    Object.freeze({ nombre: 'Segundo período', ponderacion: 25 }),
    Object.freeze({ nombre: 'Tercer período', ponderacion: 25 }),
    Object.freeze({ nombre: 'Cuarto período', ponderacion: 25 }),
  ]),
});

/** Unidad mínima: 0,01 de tolerancia para comparar porcentajes. */
const EPS = 0.01;

/* ------------------------------------------------------------------
   Validaciones
   ------------------------------------------------------------------ */

/** Normaliza y valida la configuración. Devuelve { config, errores }. */
export function normalizarConfig(config) {
  const c = Object.assign({}, CONFIG_DEFECTO, config || {});
  const errores = [];

  c.escalaMin = Number(c.escalaMin);
  c.escalaMax = Number(c.escalaMax);
  c.notaAprobacion = Number(c.notaAprobacion);
  c.decimales = Number.isInteger(c.decimales) ? c.decimales : 1;

  if (!isFinite(c.escalaMin)) { c.escalaMin = 0; }
  if (!isFinite(c.escalaMax) || c.escalaMax <= c.escalaMin) {
    errores.push('La nota máxima debe ser mayor que la nota mínima.');
    c.escalaMax = c.escalaMin + 10;
  }
  if (c.notaAprobacion < c.escalaMin || c.notaAprobacion > c.escalaMax) {
    errores.push('La nota de aprobación debe estar dentro de la escala (' +
      c.escalaMin + ' a ' + c.escalaMax + ').');
    // La acomodamos dentro de la escala para que no quede roto el cálculo
    c.notaAprobacion = Math.min(c.escalaMax, Math.max(c.escalaMin, c.notaAprobacion));
  }
  c.decimales = Math.min(3, Math.max(0, c.decimales));

  // Las ponderaciones por defecto se normalizan a 100 % si el usuario
  // cambió la escala de períodos sin ajustar los pesos.
  const periodos = Array.isArray(c.periodosPorDefecto) ? c.periodosPorDefecto.slice() : [];
  const suma = periodos.reduce((t, p) => t + (Number(p.ponderacion) || 0), 0);
  if (periodos.length > 0 && Math.abs(suma - 100) > EPS) {
    if (suma > 0) {
      let acum = 0;
      periodos.forEach((p, i) => {
        // El último absorbe el redondeo para que siempre sume exactamente 100
        p.ponderacion = i === periodos.length - 1
          ? 100 - acum
          : redondear((Number(p.ponderacion) / suma) * 100, 2);
        acum += p.ponderacion;
      });
    } else {
      periodos.forEach((p) => { p.ponderacion = redondear(100 / periodos.length, 2); });
    }
  }
  c.periodosPorDefecto = periodos;

  return { config: c, errores };
}

/**
 * Valida una actividad.
 * @returns {string[]} lista de errores; vacía si está bien.
 */
export function validarActividad(actividad, config) {
  const cfg = normalizarConfig(config).config;
  const errores = [];
  const a = actividad || {};

  if (!String(a.nombre || '').trim()) errores.push('La actividad necesita un nombre.');
  const porcentaje = Number(a.porcentaje);
  if (!isFinite(porcentaje) || porcentaje <= 0) {
    errores.push('El porcentaje debe ser un número mayor que 0.');
  }
  if (a.nota !== null && a.nota !== undefined && a.nota !== '') {
    const nota = Number(a.nota);
    if (!isFinite(nota)) {
      errores.push('La nota debe ser un número.');
    } else if (nota < cfg.escalaMin || nota > cfg.escalaMax) {
      errores.push('La nota debe estar entre ' + cfg.escalaMin + ' y ' + cfg.escalaMax + '.');
    }
  }
  return errores;
}

/**
 * Valida los porcentajes de un período.
 * @returns {object} { suma, falta, sobra, ok }
 */
export function validarPorcentajesPeriodo(actividades) {
  const lista = Array.isArray(actividades) ? actividades : [];
  const suma = lista.reduce((t, a) => t + (Number(a.porcentaje) || 0), 0);
  const redondeada = redondear(suma, 2);
  const falta = redondear(Math.max(0, 100 - suma), 2);
  const sobra = redondear(Math.max(0, suma - 100), 2);
  return { suma: redondeada, falta, sobra, ok: Math.abs(suma - 100) <= EPS };
}

/**
 * Valida que las ponderaciones de los períodos sumen 100 %.
 * @returns {object} { suma, falta, sobra, ok }
 */
export function validarPonderaciones(periodos) {
  const lista = Array.isArray(periodos) ? periodos : [];
  const suma = lista.reduce((t, p) => t + (Number(p.ponderacion) || 0), 0);
  const redondeada = redondear(suma, 2);
  return {
    suma: redondeada,
    falta: redondear(Math.max(0, 100 - suma), 2),
    sobra: redondear(Math.max(0, suma - 100), 2),
    ok: Math.abs(suma - 100) <= EPS,
  };
}

/* ------------------------------------------------------------------
   Cálculos
   ------------------------------------------------------------------ */

/**
 * Promedio de un período.
 *
 * `notaAcumulada` = suma(porcentaje × nota) / 100 sobre las actividades
 * ya calificadas. Es lo que el estudiante "ya tiene ganado" del período.
 * `porcentajePendiente` = todo lo que aún no tiene nota.
 *
 * @returns {object}
 */
export function calcularPeriodo(periodo, config) {
  const cfg = normalizarConfig(config).config;
  const p = periodo || {};
  const actividades = Array.isArray(p.actividades) ? p.actividades : [];

  const validacion = validarPorcentajesPeriodo(actividades);

  let sumaCalificada = 0;       // % de actividades con nota
  let notaAcumulada = 0;        // fracción de nota ya asegurada (sobre el período completo)
  let fueraDeEscala = [];

  actividades.forEach((act) => {
    const pct = Number(act.porcentaje) || 0;
    const tieneNota = act.nota !== null && act.nota !== undefined && act.nota !== '';
    if (!tieneNota) return;
    const nota = Number(act.nota);
    sumaCalificada += pct;
    notaAcumulada += (pct * nota) / 100;
    if (nota < cfg.escalaMin || nota > cfg.escalaMax) {
      fueraDeEscala.push(act.nombre || '(sin nombre)');
    }
  });

  const porcentajePendiente = Math.max(0, redondear(100 - sumaCalificada, 4));
  const completo = porcentajePendiente <= EPS;

  return {
    nombre: p.nombre || 'Período',
    ponderacion: Number(p.ponderacion) || 0,
    totalActividades: actividades.length,
    porcentajeDefinido: validacion.suma,
    porcentajesOk: validacion.ok,
    faltaDefinir: validacion.falta,
    sobraDefinir: validacion.sobra,
    sumaCalificada: redondear(sumaCalificada, 2),
    porcentajePendiente: redondear(porcentajePendiente, 2),
    notaAcumulada: redondear(notaAcumulada, 4),
    // El período SÓLO tiene nota definida cuando todo está calificado.
    // Mientras quede algo sin nota, promedio es null y se muestra la
    // nota ya acumulada más el % que falta, que es lo honesto.
    promedio: completo ? redondear(notaAcumulada, cfg.decimales) : null,
    // Nota del período si el estudiante sacara `notaPendiente` en lo que falta
    promedioCon: (notaPendiente) => redondear(
      notaAcumulada + (porcentajePendiente * Number(notaPendiente)) / 100,
      cfg.decimales
    ),
    completo,
    fueraDeEscala,
  };
}

/**
 * Promedio de la materia completo.
 *
 * @param {object} materia { nombre, periodos: [...] }
 * @param {object} config  ver CONFIG_DEFECTO
 * @returns {object} { promedio, aprobada, alcanzadoTodo, avisos, periodos }
 */
export function calcularMateria(materia, config) {
  const cfg = normalizarConfig(config).config;
  const m = materia || {};
  const periodos = Array.isArray(m.periodos) ? m.periodos : [];

  const detallado = periodos.map((p) => calcularPeriodo(p, cfg));
  const pondOk = validarPonderaciones(periodos);

  let sumaPonderada = 0;
  let sumaPendiente = 0;   // cuánto del promedio todavía no está calificado
  const avisos = [];

  detallado.forEach((p) => {
    const peso = p.ponderacion / 100;
    sumaPonderada += peso * p.notaAcumulada;
    sumaPendiente += peso * (p.porcentajePendiente / 100);
    if (!p.porcentajesOk) {
      avisos.push('«' + p.nombre + '»: los porcentajes de las actividades suman ' +
        p.porcentajeDefinido + ' %, debería ser 100 %.');
    }
    if (p.totalActividades === 0) {
      avisos.push('«' + p.nombre + '» no tiene actividades todavía.');
    }
    if (p.fueraDeEscala.length) {
      avisos.push('«' + p.nombre + '»: estas notas quedan fuera de la escala ' +
        cfg.escalaMin + '–' + cfg.escalaMax + ': ' + p.fueraDeEscala.join(', ') + '.');
    }
  });

  if (!pondOk.ok && periodos.length) {
    avisos.push('Las ponderaciones de los períodos suman ' + pondOk.suma +
      ' %, debería ser 100 %.');
  }
  if (!periodos.length) {
    avisos.push('Esta materia todavía no tiene períodos.');
  }

  const alcanzadoTodo = sumaPendiente <= EPS;
  const promedio = redondear(sumaPonderada, cfg.decimales);

  return {
    nombre: m.nombre || 'Materia',
    config: cfg,
    periodos: detallado,
    promedio,
    // Promedio si en todo lo pendiente sacara la nota máxima
    promedioMaximo: redondear(sumaPonderada + sumaPendiente * cfg.escalaMax, cfg.decimales),
    // Promedio si en todo lo pendiente sacara 0
    promedioMinimo: redondear(sumaPonderada, cfg.decimales),
    pendienteReal: redondear(sumaPendiente * cfg.escalaMax, cfg.decimales),
    alcanzadoTodo,
    aprobada: alcanzadoTodo && promedio >= cfg.notaAprobacion,
    ponderacionesOk: pondOk.ok,
    avisos,
    // Se expone para las pruebas y para el cálculo de "cuánto necesito"
    _sumaPonderada: sumaPonderada,
    _sumaPendiente: sumaPendiente,
  };
}

/**
 * "¿Cuánto necesito?" — dada una meta, qué nota mínima debe sacar el
 * estudiante en las actividades que todavía no tiene nota.
 *
 * Se asume que todas las pendientes reciben la MISMA nota, que es la
 * forma más fácil de entender ("necesito un 7,5 en lo que falta").
 *
 * @param {object} materia
 * @param {number} objetivo  nota deseada en la materia (ej. 6.0 para aprobar)
 * @param {object} config
 * @returns {object} {
 *   alcanzable, yaAlcanzado, minima, minimaRedondeada, maximaPosible,
 *   motivo, porPeriodo, mensaje
 * }
 */
export function cuantoNecesito(materia, objetivo, config) {
  const cfg = normalizarConfig(config).config;
  const meta = Number(objetivo);
  const resultado = calcularMateria(materia, cfg);
  const A = resultado._sumaPonderada;
  const B = resultado._sumaPendiente;

  const base = {
    objetivo: isFinite(meta) ? meta : cfg.notaAprobacion,
    promedioActual: resultado.promedio,
    promedioMaximo: resultado.promedioMaximo,
  };

  /* Caso 1: no queda nada pendiente. */
  if (B <= EPS) {
    const alcanzado = A >= base.objetivo - EPS;
    return Object.assign(base, {
      alcanzable: alcanzado,
      yaAlcanzado: alcanzado,
      hayPendiente: false,
      minima: null,
      minimaRedondeada: null,
      motivo: alcanzado ? 'sin-pendiente-alcanzado' : 'sin-pendiente-imposible',
      porPeriodo: [],
      mensaje: alcanzado
        ? 'Ya tenés el ' + redondear(A, cfg.decimales) + '. No te falta nada por calificar.'
        : 'No queda ninguna actividad sin nota, así que el promedio ya no puede cambiar: es ' +
          redondear(A, cfg.decimales) + '.',
    });
  }

  /* Caso 2: la meta es tan baja que ya está alcanzada. */
  if (A >= base.objetivo - EPS) {
    return Object.assign(base, {
      alcanzable: true,
      yaAlcanzado: true,
      hayPendiente: true,
      minima: 0,
      minimaRedondeada: redondear(0, cfg.decimales),
      motivo: 'ya-alcanzado',
      porPeriodo: detallePorPeriodo(materia, cfg),
      mensaje: 'Ya alcanzaste el ' + redondear(A, cfg.decimales) +
        '. Si en lo que falta sacás 0, quedás en ese mismo número.',
    });
  }

  /* Caso 3: hay que calcular. */
  const cruda = (base.objetivo - A) / B;
  const alcanzable = cruda <= cfg.escalaMax + EPS;

  const minima = alcanzable
    ? Math.max(cfg.escalaMin, cruda)
    : cfg.escalaMax; // para mostrar el techo cuando es imposible

  let mensaje;
  if (!alcanzable) {
    mensaje = 'Con lo que ya tenés no se llega: aunque saques ' + cfg.escalaMax +
      ' (la nota máxima) en todo lo que falta, el mejor promedio posible sería ' +
      redondear(resultado.promedioMaximo, cfg.decimales) + ', y la meta es ' +
      redondear(base.objetivo, cfg.decimales) + '.';
  } else if (cruda <= cfg.escalaMin) {
    mensaje = 'Ya alcanzaste la meta con lo calificado hasta ahora.';
  } else {
    mensaje = 'Necesitás al menos ' + redondear(cruda, cfg.decimales) +
      ' en las actividades que todavía no tienen nota.';
  }

  return Object.assign(base, {
    alcanzable,
    yaAlcanzado: false,
    hayPendiente: true,
    minima: redondear(minima, 4),
    minimaRedondeada: redondear(Math.ceil(minima * 100) / 100, cfg.decimales),
    maximaPosible: resultado.promedioMaximo,
    motivo: alcanzable ? 'calculado' : 'inalcanzable',
    porPeriodo: detallePorPeriodo(materia, cfg),
    mensaje,
  });
}

/** Nota mínima necesaria en cada período por separado (para explicar mejor). */
function detallePorPeriodo(materia, cfg) {
  const m = materia || {};
  const periodos = Array.isArray(m.periodos) ? m.periodos : [];
  return periodos.map((p) => {
    const d = calcularPeriodo(p, cfg);
    const pend = d.porcentajePendiente;
    return {
      nombre: d.nombre,
      ponderacion: d.ponderacion,
      notaAcumulada: d.notaAcumulada,
      porcentajePendiente: pend,
      // Si el período se quedara en su nota acumulada, cuánto "aporta" ya
      aporteYa: redondear((d.ponderacion / 100) * d.notaAcumulada, cfg.decimales),
    };
  });
}

/**
 * Clasifica el estado de la materia para mostrar una etiqueta.
 * 'aprobada'   → ya está todo calificado y el promedio alcanza.
 * 'reprobada'  → ni el mejor caso posible llega a la nota de aprobación.
 * 'en-curso'   → todavía hay notas pendientes y aún se puede llegar.
 * @returns {'aprobada'|'reprobada'|'en-curso'}
 */
export function estadoMateria(materia, config) {
  const cfg = normalizarConfig(config).config;
  const r = calcularMateria(materia, cfg);
  if (r.aprobada) return 'aprobada';
  if (r.promedioMaximo < cfg.notaAprobacion) return 'reprobada';
  return 'en-curso';
}

/**
 * Crea una materia con los períodos por defecto de la configuración.
 */
export function materiaNueva(nombre, config) {
  const cfg = normalizarConfig(config).config;
  return {
    id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nombre: String(nombre || 'Materia').trim() || 'Materia',
    periodos: cfg.periodosPorDefecto.map((p, i) => ({
      id: 'p' + i + Date.now().toString(36).slice(-3),
      nombre: p.nombre,
      ponderacion: p.ponderacion,
      actividades: [],
    })),
  };
}
