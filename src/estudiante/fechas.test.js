import { describe, it, expect } from 'vitest';
import {
  hoyISO, mananaISO, parsearFecha, diasHasta, esHoy, esManana, yaVencio,
  textoCuentaRegresiva, nombreDia, diaHorario, minutoHora, minutosDelDia
} from './fechas.js';

// 2026-10-12 es lunes; 2026-10-11 domingo; 2026-10-10 sábado.
var LUNES = '2026-10-12';

describe('fechas', () => {
  it('hoyISO devuelve la fecha local en formato YYYY-MM-DD', () => {
    expect(hoyISO(new Date(2026, 9, 12))).toBe('2026-10-12');
    expect(hoyISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('mananaISO cruza de mes correctamente', () => {
    expect(mananaISO(new Date(2026, 11, 31))).toBe('2027-01-01');
  });

  it('parsearFecha lee YYYY-MM-DD como fecha local (no UTC)', () => {
    var d = parsearFecha('2026-10-12');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(12);
    expect(d.getHours()).toBe(0);
  });

  it('parsearFecha acepta DD/MM/YYYY y YYYY-MM-DDTHH:MM', () => {
    expect(parsearFecha('12/10/2026').getDate()).toBe(12);
    expect(parsearFecha('2026-10-12T07:30').getHours()).toBe(7);
  });

  it('parsearFecha rechaza basura e imposibles', () => {
    expect(parsearFecha('2026-02-31')).toBe(null);
    expect(parsearFecha('mañana')).toBe(null);
    expect(parsearFecha('')).toBe(null);
    expect(parsearFecha(null)).toBe(null);
    expect(parsearFecha(20261012)).toBe(null);
  });

  it('diasHasta cuenta días completos', () => {
    expect(diasHasta(LUNES, LUNES)).toBe(0);
    expect(diasHasta('2026-10-13', LUNES)).toBe(1);
    expect(diasHasta('2026-10-08', LUNES)).toBe(-4);
    expect(diasHasta('sin fecha', LUNES)).toBe(-Infinity);
  });

  it('esHoy / esManana / yaVencio', () => {
    expect(esHoy(LUNES, LUNES)).toBe(true);
    expect(esManana('2026-10-13', LUNES)).toBe(true);
    expect(yaVencio('2026-10-10', LUNES)).toBe(true);
    expect(esHoy('2026-10-13', LUNES)).toBe(false);
  });

  it('textoCuentaRegresiva habla como hablamos', () => {
    expect(textoCuentaRegresiva(LUNES, LUNES)).toBe('Hoy');
    expect(textoCuentaRegresiva('2026-10-13', LUNES)).toBe('Mañana');
    expect(textoCuentaRegresiva('2026-10-17', LUNES)).toBe('En 5 días');
    expect(textoCuentaRegresiva('2026-10-01', LUNES)).toBe('Vencida');
    expect(textoCuentaRegresiva('', LUNES)).toBe('');
  });

  it('nombreDia y diaHorario mapean el día de la semana', () => {
    expect(nombreDia(new Date(2026, 9, 12))).toBe('Lunes');
    expect(diaHorario(new Date(2026, 9, 12))).toBe('Lunes');
    expect(diaHorario(new Date(2026, 9, 16))).toBe('Viernes');
    expect(diaHorario(new Date(2026, 9, 17))).toBe(null); // sábado
    expect(diaHorario(new Date(2026, 9, 18))).toBe(null); // domingo
  });

  it('minutoHora entiende horarios y descarta lo demás', () => {
    expect(minutoHora('07:30')).toBe(450);
    expect(minutoHora('7:05')).toBe(425);
    expect(minutoHora('24:00')).toBe(null);
    expect(minutoHora('RECESO')).toBe(null);
    expect(minutoHora('')).toBe(null);
  });

  it('minutosDelDia convierte la hora actual', () => {
    expect(minutosDelDia(new Date(2026, 9, 12, 8, 15))).toBe(8 * 60 + 15);
  });
});
