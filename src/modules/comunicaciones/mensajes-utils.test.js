/* ===================================================================
   mensajes-utils.test.js — Pruebas de la lógica pura de Mensajes
   =================================================================== */

import { describe, it, expect } from 'vitest';
import {
  normalizarEmail,
  etiquetaRol,
  iniciales,
  fechaCorta,
  horaCorta,
  resumen,
  esPropio,
  ordenarPorFecha,
  contarNoLeidos,
  agruparPorConversacion,
  validarMensaje,
  filtrarContactos,
} from './mensajes-utils.js';

const YO = 'alu@colegio.edu';

function mensaje(extra = {}) {
  return {
    id: 'm1',
    remitente: YO,
    remitente_nombre: 'Alumno',
    destinatario: 'doc@colegio.edu',
    asunto: 'Consulta',
    contenido: '¿Me pasás la consigna?',
    creado: 1700000000,
    leido: false,
    ...extra,
  };
}

describe('mensajes-utils — normalización', () => {
  it('normaliza emails', () => {
    expect(normalizarEmail('  Ana@Colegio.EDU ')).toBe('ana@colegio.edu');
    expect(normalizarEmail(null)).toBe('');
    expect(normalizarEmail(undefined)).toBe('');
  });

  it('traduce el rango a una etiqueta legible', () => {
    expect(etiquetaRol('docente')).toBe('Docente');
    expect(etiquetaRol('PADRES')).toBe('Padre / madre');
    expect(etiquetaRol('inventado')).toBe('Colegio');
  });

  it('arma iniciales', () => {
    expect(iniciales('Ana García López')).toBe('AL');
    expect(iniciales('Ana')).toBe('AN');
    expect(iniciales('')).toBe('?');
  });
});

describe('mensajes-utils — fechas', () => {
  it('devuelve dd/mm (y año si no es el actual)', () => {
    const ts = new Date(2024, 2, 5, 14, 30).getTime() / 1000;
    const f = fechaCorta(ts);
    expect(f).toMatch(/^\d{2}\/\d{2}(\/\d{4})?$/);
    expect(horaCorta(ts)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('devuelve cadena vacía si el timestamp no sirve', () => {
    expect(fechaCorta(0)).toBe('');
    expect(fechaCorta('abc')).toBe('');
    expect(horaCorta(null)).toBe('');
  });
});

describe('mensajes-utils — contenido', () => {
  it('hace un resumen de una línea y recorta', () => {
    expect(resumen('hola\n  mundo')).toBe('hola mundo');
    expect(resumen('a'.repeat(120), 10)).toBe('aaaaaaaaaa…');
  });

  it('sabe si el mensaje es propio', () => {
    expect(esPropio(mensaje(), 'ALU@colegio.edu')).toBe(true);
    expect(esPropio(mensaje(), 'doc@colegio.edu')).toBe(false);
    expect(esPropio(null, YO)).toBe(false);
  });
});

describe('mensajes-utils — conversaciones', () => {
  it('ordena por fecha sin tocar el array original', () => {
    const lista = [mensaje({ id: 'b', creado: 20 }), mensaje({ id: 'a', creado: 10 })];
    const out = ordenarPorFecha(lista);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
    expect(lista[0].id).toBe('b');
  });

  it('cuenta sólo los no leídos recibidos', () => {
    const lista = [
      mensaje({ id: '1', destinatario: YO, leido: false }),
      mensaje({ id: '2', destinatario: YO, leido: true }),
      mensaje({ id: '3', remitente: YO, destinatario: 'doc@colegio.edu', leido: false }),
    ];
    expect(contarNoLeidos(lista, YO)).toBe(1);
  });

  it('agrupa por la otra persona y ordena por el último mensaje', () => {
    const lista = [
      mensaje({ id: '1', remitente: 'doc@colegio.edu', destinatario: YO, creado: 10 }),
      mensaje({ id: '2', remitente: YO, destinatario: 'doc@colegio.edu', creado: 30 }),
      mensaje({ id: '3', remitente: 'otro@colegio.edu', destinatario: 'x@colegio.edu', creado: 99 }),
    ];
    const grupos = agruparPorConversacion(lista, YO);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].email).toBe('doc@colegio.edu');
    expect(grupos[0].mensajes.map((m) => m.id)).toEqual(['1', '2']);
    expect(grupos[0].ultimo.id).toBe('2');
    expect(grupos[0].noLeidos).toBe(1);
  });

  it('ignora los mensajes ajenos', () => {
    expect(agruparPorConversacion([mensaje({ remitente: 'a@x.edu', destinatario: 'b@x.edu' })], YO)).toEqual([]);
    expect(agruparPorConversacion(null, YO)).toEqual([]);
  });
});

describe('mensajes-utils — validación', () => {
  it('exige destinatario y contenido', () => {
    expect(validarMensaje({ destinatario: '', asunto: 'x', contenido: 'hola' })).toMatch(/enviar el mensaje/i);
    expect(validarMensaje({ destinatario: 'doc@colegio.edu', asunto: 'x', contenido: '  ' })).toMatch(/vacío/i);
  });

  it('acepta un mensaje válido', () => {
    expect(validarMensaje({ destinatario: 'doc@colegio.edu', asunto: 'Consulta', contenido: 'hola' })).toBe('');
  });

  it('limita los tamaños máximos', () => {
    expect(validarMensaje({ destinatario: 'doc@colegio.edu', asunto: 'a'.repeat(161), contenido: 'hola' })).toMatch(/asunto/i);
    expect(validarMensaje({ destinatario: 'doc@colegio.edu', asunto: 'x', contenido: 'a'.repeat(4001) })).toMatch(/largo/i);
  });
});

describe('mensajes-utils — contactos', () => {
  const contactos = [
    { email: 'doc@colegio.edu', nombre: 'Docente Uno', rol: 'docente' },
    { email: 'dir@colegio.edu', nombre: 'Dirección', rol: 'director' },
  ];

  it('filtra por nombre o email', () => {
    expect(filtrarContactos(contactos, 'docen').map((c) => c.email)).toEqual(['doc@colegio.edu']);
    expect(filtrarContactos(contactos, 'direc').map((c) => c.email)).toEqual(['dir@colegio.edu']);
    expect(filtrarContactos(contactos, 'nada')).toHaveLength(0);
  });

  it('sin texto devuelve todos', () => {
    expect(filtrarContactos(contactos, '')).toHaveLength(2);
    expect(filtrarContactos(null, 'x')).toEqual([]);
  });
});
