import { describe, it, expect } from 'vitest';
import {
  registrarSesion, resumenRango, serieDiaria, rachaActual, mejorRacha,
  avanceMetaSemanal, lunesDeLaSemana, avanzaDias,
  validarContacto, agregarContacto, editarContacto, eliminarContacto,
  CONSEJOS_EJEMPLO, MAX_SESIONES_POR_DIA,
} from './logica-bienestar.js';

describe('avanzaDias', () => {
  it('suma y resta días cruzando meses', () => {
    expect(avanzaDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(avanzaDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(avanzaDias('2026-01-01', 0)).toBe('2026-01-01');
  });

  it('devuelve la entrada si no es una fecha válida', () => {
    expect(avanzaDias('ayer', 1)).toBe('ayer');
    expect(avanzaDias('', 1)).toBe('');
  });
});

describe('registrarSesion', () => {
  it('acepta una sesión válida', () => {
    const r = registrarSesion([], { fecha: '2026-01-05', minutos: 25, hora: '10:00' });
    expect(r.ok).toBe(true);
    expect(r.sesiones[0]).toMatchObject({ fecha: '2026-01-05', minutos: 25 });
  });

  it('rechaza fechas y minutos inválidos', () => {
    expect(registrarSesion([], { fecha: 'ayer', minutos: 25 }).ok).toBe(false);
    expect(registrarSesion([], { fecha: '2026-01-05', minutos: 0 }).ok).toBe(false);
    expect(registrarSesion([], { fecha: '2026-01-05', minutos: -5 }).ok).toBe(false);
    expect(registrarSesion([], { fecha: '2026-01-05', minutos: 500 }).ok).toBe(false);
    expect(registrarSesion([], { fecha: '2026-01-05', minutos: 'x' }).ok).toBe(false);
  });

  it('limita cuántas sesiones se guardan por día', () => {
    const muchas = Array.from({ length: MAX_SESIONES_POR_DIA }, () => ({ fecha: '2026-01-05', minutos: 25 }));
    expect(registrarSesion(muchas, { fecha: '2026-01-05', minutos: 25 }).ok).toBe(false);
    expect(registrarSesion(muchas, { fecha: '2026-01-06', minutos: 25 }).ok).toBe(true);
  });
});

describe('resumenRango', () => {
  const sesiones = [
    { fecha: '2026-01-05', minutos: 25 },
    { fecha: '2026-01-05', minutos: 25 },
    { fecha: '2026-01-06', minutos: 50 },
  ];

  it('suma minutos y sesiones en un rango', () => {
    const r = resumenRango(sesiones, '2026-01-05', '2026-01-05');
    expect(r).toMatchObject({ minutos: 50, sesiones: 2 });
    expect(r.promedio).toBe(25);
  });

  it('sin límites devuelve todo', () => {
    expect(resumenRango(sesiones).minutos).toBe(100);
    expect(resumenRango([], '2026-01-01', '2026-12-31')).toMatchObject({ minutos: 0, sesiones: 0, promedio: 0 });
  });
});

describe('serieDiaria', () => {
  it('devuelve los últimos N días con sus minutos', () => {
    const serie = serieDiaria([{ fecha: '2026-01-04', minutos: 40 }], '2026-01-06', 3);
    expect(serie.map((d) => d.fecha)).toEqual(['2026-01-04', '2026-01-05', '2026-01-06']);
    expect(serie.map((d) => d.minutos)).toEqual([40, 0, 0]);
  });

  it('acumula varias sesiones del mismo día y usa al menos 7 días', () => {
    const serie = serieDiaria([
      { fecha: '2026-01-06', minutos: 25 },
      { fecha: '2026-01-06', minutos: 25 },
    ], '2026-01-06', 0);
    expect(serie).toHaveLength(7);
    expect(serie[6].minutos).toBe(50);
  });
});

describe('rachas', () => {
  const sesiones = [
    { fecha: '2026-01-01', minutos: 25 },
    { fecha: '2026-01-02', minutos: 25 },
    { fecha: '2026-01-03', minutos: 25 },
    { fecha: '2026-01-06', minutos: 25 },
  ];

  it('cuenta la racha que termina en hoy', () => {
    expect(rachaActual(sesiones, '2026-01-03')).toBe(3);
  });

  it('no pierde la racha si hoy todavía no estudió', () => {
    expect(rachaActual(sesiones, '2026-01-04')).toBe(3);
  });

  it('la racha se reinicia tras un día sin estudiar', () => {
    expect(rachaActual(sesiones, '2026-01-06')).toBe(1);
  });

  it('sin estudiar nada la racha es cero', () => {
    expect(rachaActual([], '2026-01-06')).toBe(0);
  });

  it('encuentra el récord de racha', () => {
    expect(mejorRacha(sesiones)).toBe(3);
    expect(mejorRacha([{ fecha: '2026-01-01', minutos: 10 }])).toBe(1);
    expect(mejorRacha([])).toBe(0);
  });
});

describe('meta semanal', () => {
  it('calcula avance, restantes y si se cumplió', () => {
    const m = avanceMetaSemanal(300, 150);
    expect(m).toMatchObject({ meta: 300, minutos: 150, faltan: 150, avance: 50, completo: false, sinMeta: false });
  });

  it('marca completo y nunca pasa del 100 %', () => {
    expect(avanceMetaSemanal(100, 250).completo).toBe(true);
    expect(avanceMetaSemanal(100, 250).avance).toBe(100);
  });

  it('sin meta configurada lo dice explícitamente', () => {
    const m = avanceMetaSemanal(0, 100);
    expect(m.sinMeta).toBe(true);
    expect(m.avance).toBe(0);
  });
});

describe('lunesDeLaSemana', () => {
  it('devuelve el lunes de la semana de la fecha', () => {
    expect(lunesDeLaSemana('2026-01-07')).toBe('2026-01-05'); // miércoles
    expect(lunesDeLaSemana('2026-01-05')).toBe('2026-01-05'); // ya es lunes
    expect(lunesDeLaSemana('2026-01-11')).toBe('2026-01-05'); // domingo → lunes anterior
  });

  it('devuelve la entrada si no es fecha', () => {
    expect(lunesDeLaSemana('ayer')).toBe('ayer');
  });
});

describe('contactos de apoyo', () => {
  it('valida nombre y teléfono', () => {
    expect(validarContacto({ nombre: '', telefono: '1234567' }).ok).toBe(false);
    expect(validarContacto({ nombre: 'Mamá', telefono: '' }).ok).toBe(false);
    expect(validarContacto({ nombre: 'Mamá', telefono: '12' }).ok).toBe(false);
    expect(validarContacto({ nombre: 'Mamá', telefono: '7000-0000' }).ok).toBe(true);
  });

  it('agrega, edita y elimina contactos', () => {
    const r = agregarContacto([], { nombre: ' Mamá ', telefono: '7000-0000', relacion: 'familia' }, { id: () => 'c1' });
    expect(r.ok).toBe(true);
    expect(r.lista[0]).toMatchObject({ id: 'c1', nombre: 'Mamá', telefono: '7000-0000' });
    expect(editarContacto(r.lista, 'c1', { nombre: 'Papá' }).lista[0].nombre).toBe('Papá');
    expect(editarContacto(r.lista, 'no', { nombre: 'x' }).ok).toBe(false);
    expect(eliminarContacto(r.lista, 'c1').lista).toHaveLength(0);
    expect(eliminarContacto(r.lista, 'no').ok).toBe(false);
  });

  it('limita la cantidad de contactos', () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({ id: String(i), nombre: 'a', telefono: '7000-0000' }));
    expect(agregarContacto(muchos, { nombre: 'b', telefono: '7000-0000' }).ok).toBe(false);
  });
});

describe('consejos de apoyo', () => {
  it('son generales, sin diagnósticos ni promesas médicas', () => {
    expect(CONSEJOS_EJEMPLO.length).toBeGreaterThan(0);
    const texto = CONSEJOS_EJEMPLO.join(' ').toLowerCase();
    expect(texto).toContain('orientación');
    ['diagnóstico', 'depresión', 'ansiedad', 'toma este medicamento'].forEach((t) => {
      expect(texto).not.toContain(t);
    });
  });
});
