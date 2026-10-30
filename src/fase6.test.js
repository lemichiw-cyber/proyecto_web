// @vitest-environment jsdom
/* ===================================================================
   fase6.test.js — Pruebas Fase 6: migración modelo único, choques
   de horario y cálculo del temporizador Pomodoro.
   =================================================================== */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* ---- Mock de localStorage ---- */
const createStorageMock = () => {
  const store = new Map();
  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, value)),
    removeItem: vi.fn((key) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    get length() { return store.size; },
    key: vi.fn((i) => Array.from(store.keys())[i] ?? null),
    _store: store,
  };
};

let storage;
beforeEach(() => {
  storage = createStorageMock();
  Object.defineProperty(window, 'localStorage', { value: storage, writable: true });
});
afterEach(() => { storage._store.clear(); });

describe('Fase 6 — migración al modelo único de eventos', () => {
  it('migra actividades, agenda, calendario y tareas sin duplicar y sin borrar claves legacy', async () => {
    await import('./data/eventos.js');
    storage._store.set('actividades', JSON.stringify([{ titulo: 'Actividad A', desc: 'x' }]));
    storage._store.set('agendaItems', JSON.stringify([{ titulo: 'Agenda B', hora: '10:00' }]));
    storage._store.set('calEventos', JSON.stringify([{ titulo: 'Evento C', fecha: '2026-11-05' }]));
    storage._store.set('bachillerato_tareas', JSON.stringify([{ titulo: 'Tarea D', materia: 'matematicas', fecha: '2026-11-06' }]));

    const n = window.eventosAPI.migrarLegacy();
    const todas = window.eventosAPI.listar();
    const tareas = window.eventosAPI.listar('tarea');
    const agendas = window.eventosAPI.listar('agenda');

    expect(todas.length).toBe(4);
    expect(tareas.length).toBe(1);
    expect(tareas[0].materia).toBe('matematicas');
    expect(agendas.length).toBe(1);
    // Claves legacy no se borran (compatibilidad)
    expect(storage._store.get('actividades')).not.toBeNull();
    expect(storage._store.get('bachillerato_tareas')).not.toBeNull();
    // Idempotente: volver a migrar no duplica
    window.eventosAPI.migrarLegacy();
    expect(window.eventosAPI.listar().length).toBe(4);
  });
});

describe('Fase 6 — choques de horario', () => {
  it('detecta choque misma hora y día con distinta materia', async () => {
    const { detectarChoqueHorario } = await import('./data/horario-choque.js');
    const horario = [
      { hora: '08:00', Lunes: 'Matemáticas', Martes: '', 'Miércoles': '', Jueves: '', Viernes: '' },
      { hora: '09:00', Lunes: '', Martes: '', 'Miércoles': '', Jueves: '', Viernes: '' },
    ];
    const datos = { hora: '08:00', Lunes: 'Física', Martes: '', 'Miércoles': '', Jueves: '', Viernes: '' };
    const choques = detectarChoqueHorario(horario, datos);
    expect(choques.length).toBe(1);
    expect(choques[0]).toContain('Lunes');
  });

  it('no detecta choque cuando la materia es la misma o hay receso/almuerzo', async () => {
    const { detectarChoqueHorario } = await import('./data/horario-choque.js');
    const horario = [
      { hora: '08:00', Lunes: 'Matemáticas', Martes: '', 'Miércoles': '', Jueves: '', Viernes: '' },
    ];
    let c = detectarChoqueHorario(horario, { hora: '08:00', Lunes: 'Matemáticas', Martes: '', 'Miércoles': '', Jueves: '', Viernes: '' });
    expect(c.length).toBe(0);
    c = detectarChoqueHorario(horario, { hora: '08:00', Lunes: 'RECESO', Martes: '', 'Miércoles': '', Jueves: '', Viernes: '' });
    expect(c.length).toBe(0);
  });
});

describe('Fase 6 — cálculo del temporizador Pomodoro', () => {
  it('calcula restante desde la hora de inicio (no setInterval acumulado)', async () => {
    const { pomodoroRestante } = await import('./data/pomodoro-timer.js');
    const dur = 25 * 60; // 1500 s
    const inicio = Date.now() - 60 * 1000; // inició hace 60 s
    expect(pomodoroRestante(dur, inicio)).toBe(dur - 60);

    const inicioFuturo = Date.now() + 1000 * 1000;
    expect(pomodoroRestante(dur, inicioFuturo)).toBe(dur);

    const inicioMuyPasado = Date.now() - 1000 * dur * 2;
    expect(pomodoroRestante(dur, inicioMuyPasado)).toBe(0);
  });
});
