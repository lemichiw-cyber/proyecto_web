/* ===================================================================
   protegido-sync.test.js — pruebas de la lógica de "Colegio Protegido".

   Sin backend ni navegador: son funciones puras (mezcla servidor ↔
   dispositivo, permisos y estados).
   =================================================================== */

import { describe, it, expect } from 'vitest';
import {
  ROLES_GESTION,
  esGestor,
  normalizarRemoto,
  normalizarLocal,
  fusionar,
  pendientesDeSubir,
  pendientesDeBorrar,
  puedeBorrar,
  puedeResolver,
  formatearFecha,
  etiquetaEstado,
} from './protegido-sync.js';

describe('protegido-sync — rangos', () => {
  it('el personal docente atiende los reportes', () => {
    ['admin', 'director', 'subdirector', 'coordinador', 'docente'].forEach((r) => {
      expect(esGestor(r)).toBe(true);
    });
  });

  it('estudiante y padres NO atienden los reportes', () => {
    expect(esGestor('estudiante')).toBe(false);
    expect(esGestor('padres')).toBe(false);
    expect(esGestor('')).toBe(false);
    expect(esGestor(null)).toBe(false);
  });

  it('la lista de roles de gestión no está vacía', () => {
    expect(Array.isArray(ROLES_GESTION)).toBe(true);
    expect(ROLES_GESTION.length).toBeGreaterThan(0);
  });
});

describe('protegido-sync — normalización', () => {
  it('normaliza un incidente del servidor', () => {
    const i = normalizarRemoto({
      id: 'abc',
      tipo: 'Acoso',
      desc: 'en el patio',
      urgente: true,
      autor: 'Alumno@Test.Local',
      autor_rol: 'estudiante',
      estado: 'pendiente',
      creado: 1700000000,
    });
    expect(i.id).toBe('abc');
    expect(i.autor).toBe('alumno@test.local');
    expect(i.urgente).toBe(true);
    expect(i.estado).toBe('pendiente');
    expect(i.local).toBe(false);
    expect(i.pendiente).toBe(false);
  });

  it('descarta lo que no tiene tipo o id', () => {
    expect(normalizarRemoto({ id: 'x', tipo: '   ' })).toBeNull();
    expect(normalizarRemoto({ tipo: 'Robo' })).toBeNull();
    expect(normalizarRemoto(null)).toBeNull();
  });

  it('un incidente local sin subir queda pendiente', () => {
    const i = normalizarLocal({ id: 'l1', tipo: 'Robo', desc: 'mochila' });
    expect(i.pendiente).toBe(true);
    expect(i.local).toBe(true);
    expect(i.borrar).toBe(false);
  });

  it('un incidente local ya subido NO queda pendiente', () => {
    const i = normalizarLocal({ id: 'l1', tipo: 'Robo', remoto: 'srv-1', pendiente: false });
    expect(i.pendiente).toBe(false);
    expect(i.remoto).toBe('srv-1');
  });
});

describe('protegido-sync — mezcla servidor ↔ dispositivo', () => {
  it('el servidor manda sobre el espejo local', () => {
    const local = [{ id: 'l1', tipo: 'Robo', desc: 'vieja', remoto: 'srv-1', pendiente: false }];
    const remoto = [{ id: 'srv-1', tipo: 'Robo', desc: 'nueva', estado: 'resuelto', autor: 'a@b.c' }];
    const out = fusionar(local, remoto);
    expect(out.length).toBe(1);
    expect(out[0].desc).toBe('nueva');
    expect(out[0].estado).toBe('resuelto');
  });

  it('un reporte local sin subir se ve igual (local-first)', () => {
    const local = [{ id: 'l1', tipo: 'Emergencia', desc: 'gas', pendiente: true }];
    const out = fusionar(local, []);
    expect(out.length).toBe(1);
    expect(out[0].tipo).toBe('Emergencia');
    expect(out[0].pendiente).toBe(true);
  });

  it('un local marcado para borrar no se muestra', () => {
    const local = [{ id: 'l1', tipo: 'Robo', borrar: true, remoto: 'srv-1' }];
    expect(fusionar(local, []).length).toBe(0);
  });

  it('un local que ya no está en el servidor se descarta', () => {
    const local = [{ id: 'l1', tipo: 'Robo', remoto: 'srv-9', pendiente: false }];
    expect(fusionar(local, []).length).toBe(0);
  });

  it('ordena del más reciente al más antiguo', () => {
    const remoto = [
      { id: 'a', tipo: 'Viejo', creado: 100, autor: 'x@y.z' },
      { id: 'b', tipo: 'Nuevo', creado: 200, autor: 'x@y.z' },
    ];
    const out = fusionar([], remoto);
    expect(out[0].tipo).toBe('Nuevo');
  });

  it('aguanta entradas inválidas sin romperse', () => {
    expect(fusionar(null, null).length).toBe(0);
    expect(fusionar([null, {}, { tipo: '' }], [null]).length).toBe(0);
  });
});

describe('protegido-sync — cola de sincronización', () => {
  it('detecta lo que falta subir', () => {
    const locales = [
      { id: 'l1', tipo: 'A', pendiente: true },
      { id: 'l2', tipo: 'B', pendiente: false, remoto: 's2' },
      { id: 'l3', tipo: 'C', pendiente: true, borrar: true },
    ];
    const suben = pendientesDeSubir(locales);
    expect(suben.length).toBe(1);
    expect(suben[0].id).toBe('l1');
  });

  it('detecta lo que falta borrar en el servidor', () => {
    const locales = [
      { id: 'l1', tipo: 'A', borrar: true, remoto: 's1' },
      { id: 'l2', tipo: 'B', borrar: true },
    ];
    const borran = pendientesDeBorrar(locales);
    expect(borran.length).toBe(1);
    expect(borran[0].remoto).toBe('s1');
  });
});

describe('protegido-sync — permisos', () => {
  const incidente = { id: 'x', autor: 'alu@test.local' };

  it('el autor puede borrar su reporte', () => {
    expect(puedeBorrar(incidente, { email: 'alu@test.local', rol: 'estudiante' })).toBe(true);
  });

  it('otro estudiante NO puede borrarlo', () => {
    expect(puedeBorrar(incidente, { email: 'otro@test.local', rol: 'estudiante' })).toBe(false);
  });

  it('el personal docente puede borrar cualquiera', () => {
    expect(puedeBorrar(incidente, { email: 'profe@test.local', rol: 'docente' })).toBe(true);
    expect(puedeBorrar(incidente, { email: 'profe@test.local', rol: 'coordinador' })).toBe(true);
  });

  it('sólo el personal docente resuelve', () => {
    expect(puedeResolver(incidente, { email: 'profe@test.local', rol: 'docente' })).toBe(true);
    expect(puedeResolver(incidente, { email: 'alu@test.local', rol: 'estudiante' })).toBe(false);
    expect(puedeResolver(incidente, { email: 'alu@test.local', rol: 'padres' })).toBe(false);
  });
});

describe('protegido-sync — textos', () => {
  it('etiqueta los estados', () => {
    expect(etiquetaEstado('pendiente')).toBe('Pendiente');
    expect(etiquetaEstado('resuelto')).toBe('Atendido');
  });

  it('formatea la fecha', () => {
    expect(formatearFecha(Date.now() - 5000)).toBe('hace un momento');
    expect(formatearFecha(Date.now() - 5 * 60 * 1000)).toBe('hace 5 min');
    expect(formatearFecha(0)).toBe('');
    expect(formatearFecha('no-es-fecha')).toBe('');
  });
});
