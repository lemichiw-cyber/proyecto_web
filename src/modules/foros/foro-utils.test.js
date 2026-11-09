/* ===================================================================
   foro-utils.test.js — Pruebas de la lógica pura del foro
   =================================================================== */

import { describe, it, expect } from 'vitest';
import {
  COMUNIDADES,
  comunidadPorId,
  tipoPorId,
  estadoPorId,
  claveUsuario,
  normalizarVotos,
  votoUsuario,
  puntajeVotos,
  conteoVotos,
  alternarVoto,
  controversiaVotos,
  contarComentarios,
  contarAceptadas,
  buscarComentario,
  eliminarComentario,
  todosLosComentarios,
  ordenarComentarios,
  puntajePost,
  hotScore,
  ordenarForos,
  foroTieneReportes,
  buscarForo,
  formatearNumero,
  formatearTiempo,
  extraerMenciones,
  renderizarTexto,
  normalizarForo,
  migrarForos,
  TIPOS,
  ESTADOS,
  ORDENES,
  FILTROS,
} from './foro-utils.js';

const usuarioA = { nombre: 'Ana', email: 'Ana@Colegio.edu' };
const usuarioB = { nombre: 'Beto', email: 'beto@colegio.edu' };

function comentario(id, extra = {}) {
  return {
    id,
    autor: usuarioA,
    texto: 'Comentario ' + id,
    fecha: '2026-01-01T10:00:00.000Z',
    votos: {},
    respuestas: [],
    reportes: [],
    archivos: [],
    ...extra,
  };
}

function post(id, extra = {}) {
  return {
    id,
    titulo: 'Tema ' + id,
    desc: '',
    materia: 'general',
    tipo: 'discusion',
    estado: 'abierto',
    creada: '2026-01-01T10:00:00.000Z',
    actualizada: '2026-01-01T10:00:00.000Z',
    autor: usuarioA,
    votos: {},
    guardados: [],
    reportes: [],
    vistas: [],
    mensajes: [],
    ...extra,
  };
}

describe('foro-utils — catálogos', () => {
  it('expone comunidades, tipos, estados, órdenes y filtros', () => {
    expect(COMUNIDADES.length).toBeGreaterThan(5);
    expect(TIPOS.pregunta.nombre).toBe('Pregunta');
    expect(ESTADOS.resuelto.nombre).toBe('Resuelto');
    expect(ORDENES.map((o) => o.id)).toContain('hot');
    expect(FILTROS.map((f) => f.id)).toContain('reportados');
  });

  it('resuelve comunidad, tipo y estado con valores por defecto seguros', () => {
    expect(comunidadPorId('MATEMATICAS').id).toBe('matematicas');
    expect(comunidadPorId('no-existe').id).toBe('general');
    expect(comunidadPorId(null).id).toBe('general');
    expect(tipoPorId('pregunta').id).toBe('pregunta');
    expect(tipoPorId('raro').id).toBe('discusion');
    expect(estadoPorId('resuelto').id).toBe('resuelto');
    expect(estadoPorId('raro').id).toBe('abierto');
  });
});

describe('foro-utils — votos', () => {
  it('claveUsuario normaliza email y cae al nombre', () => {
    expect(claveUsuario(usuarioA)).toBe('ana@colegio.edu');
    expect(claveUsuario({ nombre: 'Sin Correo' })).toBe('sin correo');
    expect(claveUsuario(null)).toBe('');
  });

  it('normaliza votos antiguos (up/down/boolean) a 1/-1', () => {
    expect(normalizarVotos({ a: 'up', b: 'down', c: true, d: 1, e: 0, f: null })).toEqual({
      a: 1,
      b: -1,
      c: 1,
      d: 1,
    });
    expect(normalizarVotos(null)).toEqual({});
    expect(normalizarVotos([1, -1])).toEqual({});
  });

  it('calcula voto, puntaje y conteo por usuario', () => {
    const votos = { 'ana@colegio.edu': 1, 'beto@colegio.edu': -1, 'carla@colegio.edu': 1 };
    expect(votoUsuario(votos, usuarioA)).toBe(1);
    expect(votoUsuario(votos, usuarioB)).toBe(-1);
    expect(votoUsuario(votos, { email: 'nadie@x.com' })).toBe(0);
    expect(puntajeVotos(votos)).toBe(1);
    expect(conteoVotos(votos)).toEqual({ up: 2, down: 1, total: 3, puntaje: 1 });
  });

  it('alternarVoto agrega, cambia y retira el voto sin mutar el original', () => {
    const original = {};
    const conUp = alternarVoto(original, usuarioA, 1);
    expect(conUp).toEqual({ 'ana@colegio.edu': 1 });
    expect(original).toEqual({});

    const conDown = alternarVoto(conUp, usuarioA, -1);
    expect(conDown).toEqual({ 'ana@colegio.edu': -1 });

    const sinVoto = alternarVoto(conDown, usuarioA, -1);
    expect(sinVoto).toEqual({});
    expect(alternarVoto({}, null, 1)).toEqual({});
  });

  it('controversiaVotos premia opiniones divididas y exige al menos 2 votos', () => {
    expect(controversiaVotos({ a: 1 })).toBe(0);
    const dividido = controversiaVotos({ a: 1, b: 1, c: -1, d: -1 });
    const unanime = controversiaVotos({ a: 1, b: 1, c: 1, d: 1 });
    expect(dividido).toBeGreaterThan(unanime);
  });
});

describe('foro-utils — árbol de comentarios', () => {
  const arbol = [
    comentario('a', {
      aceptada: true,
      votos: { 'ana@colegio.edu': 1 },
      respuestas: [
        comentario('a1', { fecha: '2026-01-02T10:00:00.000Z' }),
        comentario('a2', { fecha: '2026-01-03T10:00:00.000Z' }),
      ],
    }),
    comentario('b', { fecha: '2026-01-04T10:00:00.000Z' }),
  ];

  it('cuenta comentarios y respuestas aceptadas de forma recursiva', () => {
    expect(contarComentarios(arbol)).toBe(4);
    expect(contarComentarios(null)).toBe(0);
    expect(contarAceptadas(arbol)).toBe(1);
  });

  it('busca y elimina comentarios anidados', () => {
    expect(buscarComentario(arbol, 'a2').texto).toBe('Comentario a2');
    expect(buscarComentario(arbol, 'no')).toBeNull();
    expect(buscarComentario(null, 'a')).toBeNull();

    const copia = JSON.parse(JSON.stringify(arbol));
    expect(eliminarComentario(copia, 'a1')).toBe(true);
    expect(contarComentarios(copia)).toBe(3);
    expect(eliminarComentario(copia, 'no')).toBe(false);
  });

  it('aplana todos los comentarios en orden de profundidad', () => {
    expect(todosLosComentarios(arbol).map((c) => c.id)).toEqual(['a', 'a1', 'a2', 'b']);
    expect(todosLosComentarios(null)).toEqual([]);
  });

  it('ordena por nuevo, viejo y mejor sin mutar el original', () => {
    const porNuevo = ordenarComentarios(arbol, 'nuevo').map((c) => c.id);
    expect(porNuevo[0]).toBe('b');

    const porViejo = ordenarComentarios(arbol, 'viejo').map((c) => c.id);
    expect(porViejo[0]).toBe('a');

    const mejores = ordenarComentarios(arbol, 'best');
    expect(mejores[0].id).toBe('a');
    expect(mejores[0].respuestas[0].fecha).toBe('2026-01-02T10:00:00.000Z');

    expect(ordenarComentarios(null, 'best')).toEqual([]);
  });
});

describe('foro-utils — publicaciones', () => {
  it('puntajePost suma un punto cuando el tema está resuelto', () => {
    expect(puntajePost(post('x', { votos: { a: 1, b: 1 } }))).toBe(2);
    expect(puntajePost(post('x', { votos: { a: 1, b: 1 }, estado: 'resuelto' }))).toBe(3);
    expect(puntajePost(null)).toBe(0);
  });

  it('hotScore decae con el tiempo y crece con la actividad', () => {
    const ahora = new Date('2026-01-02T10:00:00.000Z').getTime();
    const reciente = post('r', { creada: '2026-01-02T09:00:00.000Z', votos: { a: 1 } });
    const viejo = post('v', { creada: '2026-01-01T10:00:00.000Z', votos: { a: 1 } });
    expect(hotScore(reciente, ahora)).toBeGreaterThan(hotScore(viejo, ahora));

    const conComentarios = post('c', {
      creada: '2026-01-02T09:00:00.000Z',
      mensajes: [comentario('c1'), comentario('c2')],
    });
    expect(hotScore(conComentarios, ahora)).toBeGreaterThan(hotScore(reciente, ahora));
  });

  it('ordenarForos mantiene fijados primero y respeta nuevo/top', () => {
    const lista = [
      post('viejo', { creada: '2026-01-01T10:00:00.000Z' }),
      post('nuevo', { creada: '2026-01-05T10:00:00.000Z' }),
      post('fijado', { creada: '2025-12-01T10:00:00.000Z', fijado: true }),
    ];

    expect(ordenarForos(lista, 'nuevo').map((p) => p.id)).toEqual(['fijado', 'nuevo', 'viejo']);

    const conPuntos = [
      post('poco', { votos: {} }),
      post('mucho', { votos: { a: 1, b: 1, c: 1 } }),
    ];
    expect(ordenarForos(conPuntos, 'top').map((p) => p.id)).toEqual(['mucho', 'poco']);
    expect(ordenarForos(null, 'hot')).toEqual([]);
  });

  it('detecta reportes en el tema o en cualquier comentario', () => {
    expect(foroTieneReportes(post('x'))).toBe(false);
    expect(foroTieneReportes(post('x', { reportes: [{ motivo: 'spam' }] }))).toBe(true);
    expect(foroTieneReportes(post('x', {
      mensajes: [comentario('c', { reportes: [{ motivo: 'spam' }] })],
    }))).toBe(true);
    expect(foroTieneReportes(null)).toBe(false);
  });

  it('busca en título, descripción, autor, comunidad y comentarios', () => {
    const tema = post('x', {
      titulo: 'Duda de álgebra',
      desc: 'No entiendo las ecuaciones',
      mensajes: [comentario('c', { texto: 'Probá factorizando' })],
    });
    expect(buscarForo(tema, '')).toBe(true);
    expect(buscarForo(tema, 'álgebra')).toBe(true);
    expect(buscarForo(tema, 'ANA')).toBe(true);
    expect(buscarForo(tema, 'factorizando')).toBe(true);
    expect(buscarForo(tema, 'general')).toBe(true);
    expect(buscarForo(tema, 'química')).toBe(false);
    expect(buscarForo(null, 'algo')).toBe(true);
  });
});

describe('foro-utils — formato y texto seguro', () => {
  it('formatea números grandes y tiempos relativos', () => {
    expect(formatearNumero(999)).toBe('999');
    expect(formatearNumero(1500)).toBe('1.5k');
    expect(formatearNumero(2000000)).toBe('2M');
    expect(formatearNumero(null)).toBe('0');

    const ahora = new Date('2026-01-10T12:00:00.000Z').getTime();
    expect(formatearTiempo('2026-01-10T11:59:50.000Z', ahora)).toBe('ahora');
    expect(formatearTiempo('2026-01-10T11:00:00.000Z', ahora)).toBe('hace 1 h');
    expect(formatearTiempo('2026-01-09T12:00:00.000Z', ahora)).toBe('ayer');
    expect(formatearTiempo('no-es-fecha', ahora)).toBe('');
    expect(formatearTiempo('', ahora)).toBe('');
  });

  it('extrae menciones únicas y válidas', () => {
    expect(extraerMenciones('Hola @ana y @Beto_2, mirá @ana')).toEqual(['ana', 'Beto_2']);
    expect(extraerMenciones('correo@ejemplo.com')).toEqual([]);
    expect(extraerMenciones(null)).toEqual([]);
  });

  it('escapa HTML antes de aplicar Markdown', () => {
    const html = renderizarTexto('<script>alert("xss")</script> **hola**');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>hola</strong>');
  });

  it('renderiza negrita, cursiva, código, tachado, citas, viñetas y enlaces', () => {
    expect(renderizarTexto('**fuerte**')).toBe('<strong>fuerte</strong>');
    expect(renderizarTexto('*suave*')).toBe('<em>suave</em>');
    expect(renderizarTexto('`codigo`')).toBe('<code>codigo</code>');
    expect(renderizarTexto('~~tachado~~')).toBe('<del>tachado</del>');
    expect(renderizarTexto('> cita')).toContain('<span class="fr-cita">cita</span>');
    expect(renderizarTexto('- punto')).toContain('<span class="fr-vineta">• punto</span>');

    const conEnlace = renderizarTexto('Ver https://ejemplo.com/x.');
    expect(conEnlace).toContain('href="https://ejemplo.com/x"');
    expect(conEnlace).toContain('rel="noopener noreferrer nofollow"');

    expect(renderizarTexto('@ana')).toContain('fr-mencion');
    expect(renderizarTexto('linea1\nlinea2')).toBe('linea1<br>linea2');
    expect(renderizarTexto(null)).toBe('');
  });
});

describe('foro-utils — migración', () => {
  it('normaliza un foro antiguo y conserva sus datos', () => {
    const viejo = {
      titulo: 'Tema viejo',
      descripcion: 'Descripción heredada',
      estado: 'resuelto',
      mensajes: [
        { texto: 'comentario antiguo', votos: { ana: 'up' } },
      ],
    };

    const { foro, cambios } = normalizarForo(viejo);
    expect(cambios).toBe(true);
    expect(foro.id).toBeTruthy();
    expect(foro.desc).toBe('Descripción heredada');
    expect(foro.tipo).toBe('pregunta');
    expect(foro.materia).toBe('general');
    expect(foro.autor.nombre).toBe('Anónimo');
    expect(foro.mensajes).toHaveLength(1);
    expect(foro.mensajes[0].id).toBeTruthy();
    expect(foro.mensajes[0].respuestas).toEqual([]);
    expect(foro.mensajes[0].votos).toEqual({ ana: 1 });
  });

  it('migrarForos elimina entradas inválidas e informa cambios', () => {
    const lista = [post('ok'), null, post('viejo', { desc: undefined, mensajes: [{ texto: 'hola' }] })];
    expect(migrarForos(lista)).toBe(true);
    expect(lista).toHaveLength(2);
    expect(lista.every((p) => p && p.id && Array.isArray(p.mensajes))).toBe(true);
    expect(migrarForos(null)).toBe(false);
    expect(migrarForos([])).toBe(false);
  });
});
