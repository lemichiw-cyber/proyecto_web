/* ===================================================================
   aulas-sync.test.js — pruebas de la lógica de "Aulas Virtuales".

   Sin backend ni navegador: son funciones puras (mapeo local ↔ servidor,
   mezcla, permisos y traducción de índices).
   =================================================================== */

import { describe, it, expect } from 'vitest';
import {
  ROLES_GESTION,
  ROLES_ELIMINAR,
  esGestion,
  esEliminar,
  idComoNumero,
  indiceDeTarea,
  aRemotoAula,
  aLocalAula,
  aRemotoInscripcion,
  aLocalInscripcion,
  aRemotoTarea,
  aLocalTarea,
  aRemotoEntrega,
  aLocalEntrega,
  aRemotoCalificacion,
  aLocalCalificacion,
  aRemotoAsistencia,
  aLocalAsistencia,
  fusionar,
  fusionarEstado,
  esEntregaMia,
} from './aulas-sync.js';

describe('aulas-sync — rangos', () => {
  it('el personal docente gestiona las aulas', () => {
    ['admin', 'director', 'subdirector', 'coordinador', 'docente'].forEach((r) => {
      expect(esGestion(r)).toBe(true);
    });
  });

  it('estudiante y padres NO gestionan las aulas', () => {
    expect(esGestion('estudiante')).toBe(false);
    expect(esGestion('padres')).toBe(false);
    expect(esGestion('')).toBe(false);
    expect(esGestion(null)).toBe(false);
    expect(esGestion(undefined)).toBe(false);
  });

  it('sólo dirección (y admin) borran', () => {
    ['admin', 'director', 'subdirector'].forEach((r) => {
      expect(esEliminar(r)).toBe(true);
    });
    expect(esEliminar('coordinador')).toBe(false);
    expect(esEliminar('docente')).toBe(false);
    expect(esEliminar('estudiante')).toBe(false);
  });

  it('las listas de roles no están vacías', () => {
    expect(ROLES_GESTION.length).toBeGreaterThan(0);
    expect(ROLES_ELIMINAR.length).toBeGreaterThan(0);
    expect(ROLES_ELIMINAR.length).toBeLessThan(ROLES_GESTION.length);
  });
});

describe('aulas-sync — ids', () => {
  it('un id numérico conserva el tipo que usa la interfaz', () => {
    expect(idComoNumero('1730000000000')).toBe(1730000000000);
    expect(idComoNumero(1730000000000)).toBe(1730000000000);
  });

  it('un id no numérico queda como texto', () => {
    expect(idComoNumero('a-1')).toBe('a-1');
    expect(idComoNumero('007')).toBe('007');
  });

  it('un id vacío no inventa nada', () => {
    expect(idComoNumero('')).toBe('');
    expect(idComoNumero(null)).toBe(null);
    expect(idComoNumero(undefined)).toBe(undefined);
  });
});

describe('aulas-sync — aulas', () => {
  it('el aula local se manda al servidor con los nombres del backend', () => {
    const r = aRemotoAula({
      id: 123, nombre: 'Aula 101', capacidad: 30, ubicacion: 'Edificio A',
      tipo: 'salon', equipamiento: 'proyector', desc: 'Sala grande',
      especialidad: 'software', anio: '1', seccion: 'C',
    });
    expect(r.id).toBe('123');
    expect(r.nombre).toBe('Aula 101');
    expect(r.capacidad).toBe(30);
    expect(r.desc).toBe('Sala grande');
  });

  it('el aula del servidor vuelve al formato de la interfaz', () => {
    const a = aLocalAula({
      id: '1730000000000', nombre: 'Aula 101', capacidad: 30,
      tipo: 'salon', ubicacion: 'Edificio A', descripcion: 'Sala grande',
    });
    expect(a.id).toBe(1730000000000);
    expect(a.nombre).toBe('Aula 101');
    expect(a.desc).toBe('Sala grande');
    expect(a.remoto).toBe(true);
  });

  it('un aula sin id se descarta', () => {
    expect(aLocalAula({ nombre: 'Sin id' })).toBe(null);
    expect(aLocalAula(null)).toBe(null);
  });
});

describe('aulas-sync — inscripciones', () => {
  it('la inscripción local se manda con el email del alumno', () => {
    const r = aRemotoInscripcion({
      id: 'ins-1', aulaId: 10, estudianteId: 'alu@test.local',
      estudianteEmail: 'Alu@Test.Local', estudiante: 'Alumno', estado: 'aprobado',
    });
    expect(r.id).toBe('ins-1');
    expect(r.aula_id).toBe('10');
    expect(r.estudiante_email).toBe('alu@test.local');
    expect(r.estudiante_nombre).toBe('Alumno');
  });

  it('la inscripción del servidor vuelve con la relación por aula', () => {
    const i = aLocalInscripcion({
      id: 'ins-1', aula_id: '10', estudiante_id: 'alu@test.local',
      estudiante_email: 'alu@test.local', estudiante_nombre: 'Alumno',
    });
    expect(i.aulaId).toBe(10);
    expect(i.estudianteEmail).toBe('alu@test.local');
    expect(i.estudiante).toBe('Alumno');
  });
});

describe('aulas-sync — tareas', () => {
  it('la tarea local se manda apuntando al aula por id', () => {
    const r = aRemotoTarea({
      id: 5, aulaId: 10, titulo: 'Ensayo', desc: 'Dos páginas',
      materia: 'Historia', grupo: '1C', fecha: '2026-11-20',
    });
    expect(r.id).toBe('5');
    expect(r.aula_id).toBe('10');
    expect(r.titulo).toBe('Ensayo');
    expect(r.descripcion).toBe('Dos páginas');
  });

  it('la tarea del servidor vuelve con su aula', () => {
    const t = aLocalTarea({ id: '5', aula_id: '10', titulo: 'Ensayo', descripcion: 'Dos páginas' });
    expect(t.id).toBe(5);
    expect(t.aulaId).toBe(10);
    expect(t.desc).toBe('Dos páginas');
  });
});

describe('aulas-sync — entregas (id ↔ índice)', () => {
  const tareas = [{ id: 5, titulo: 'Ensayo' }, { id: 6, titulo: 'Otra' }];

  it('la entrega local se manda apuntando a la tarea por id', () => {
    const r = aRemotoEntrega({ id: 'ent-1', tareaIdx: 1, respuesta: 'Listo', estudianteEmail: 'alu@test.local' }, tareas);
    expect(r.id).toBe('ent-1');
    expect(r.tarea_id).toBe('6');
    expect(r.estudiante_email).toBe('alu@test.local');
  });

  it('la entrega del servidor vuelve con el índice de la tarea', () => {
    const e = aLocalEntrega({ id: 'ent-1', tarea_id: '6', respuesta: 'Listo' }, tareas);
    expect(e.tareaIdx).toBe(1);
    expect(e.tareaId).toBe(6);
    expect(e.respuesta).toBe('Listo');
  });

  it('una entrega cuya tarea no está en el dispositivo se descarta', () => {
    expect(aLocalEntrega({ id: 'ent-9', tarea_id: '99' }, tareas)).toBe(null);
  });

  it('se encuentra el índice de una tarea por id', () => {
    expect(indiceDeTarea(tareas, '6')).toBe(1);
    expect(indiceDeTarea(tareas, 5)).toBe(0);
    expect(indiceDeTarea(tareas, 'nope')).toBe(-1);
    expect(indiceDeTarea(null, '5')).toBe(-1);
  });

  it('una entrega sin email (datos viejos) se considera propia', () => {
    expect(esEntregaMia({ estudiante: 'Alumno' }, 'alu@test.local')).toBe(true);
    expect(esEntregaMia({ estudianteEmail: 'alu@test.local' }, 'alu@test.local')).toBe(true);
    expect(esEntregaMia({ estudianteEmail: 'otro@test.local' }, 'alu@test.local')).toBe(false);
    expect(esEntregaMia(null, 'alu@test.local')).toBe(false);
    expect(esEntregaMia({ estudianteEmail: 'alu@test.local' }, '')).toBe(false);
  });
});

describe('aulas-sync — calificaciones', () => {
  const tareas = [{ id: 5, titulo: 'Ensayo' }];
  const entregas = [{ id: 'ent-1', tareaIdx: 0, estudianteEmail: 'alu@test.local' }];

  it('la calificación local se manda apuntando a la entrega', () => {
    const r = aRemotoCalificacion(
      { id: 'cal-1', entregaIdx: 0, nota: 90, retroealimentacion: 'Bien' },
      entregas,
      tareas,
    );
    expect(r.id).toBe('cal-1');
    expect(r.entrega_id).toBe('ent-1');
    expect(r.tarea_id).toBe('5');
    expect(r.estudiante_email).toBe('alu@test.local');
    expect(r.nota).toBe(90);
  });

  it('la calificación del servidor vuelve con el índice de la entrega', () => {
    const c = aLocalCalificacion(
      { id: 'cal-1', entrega_id: 'ent-1', tarea_id: '5', nota: 90 },
      entregas,
      tareas,
    );
    expect(c.entregaIdx).toBe(0);
    expect(c.tareaIdx).toBe(0);
    expect(c.nota).toBe(90);
  });
});

describe('aulas-sync — asistencia', () => {
  it('la asistencia local se manda con la lista de estados', () => {
    const r = aRemotoAsistencia({
      id: 'asi-1', aulaId: 10, fecha: '2026-11-12',
      registros: [{ nombre: 'Alumno', estado: 'ausente' }],
    });
    expect(r.id).toBe('asi-1');
    expect(r.aula_id).toBe('10');
    expect(r.fecha).toBe('2026-11-12');
    expect(r.registros[0].estado).toBe('ausente');
  });

  it('la asistencia del servidor vuelve con su aula', () => {
    const a = aLocalAsistencia({
      id: 'asi-1', aula_id: '10', fecha: '2026-11-12',
      registros: [{ nombre: 'Alumno', estado: 'ausente' }],
    });
    expect(a.aulaId).toBe(10);
    expect(a.registros[0].nombre).toBe('Alumno');
  });
});

describe('aulas-sync — mezcla local ↔ servidor', () => {
  it('el servidor manda sobre la copia local', () => {
    const local = [{ id: '1', nombre: 'Nombre viejo', remoto: true }];
    const remoto = [{ id: '1', nombre: 'Nombre nuevo' }];
    const out = fusionar(local, remoto);
    expect(out).toHaveLength(1);
    expect(out[0].nombre).toBe('Nombre nuevo');
    expect(out[0].remoto).toBe(true);
  });

  it('lo local que todavía no se subió se conserva (local-first)', () => {
    const local = [{ id: '1', nombre: 'Pendiente' }];
    const out = fusionar(local, []);
    expect(out).toHaveLength(1);
    expect(out[0].nombre).toBe('Pendiente');
  });

  it('lo que otra persona borró en el servidor desaparece', () => {
    const local = [{ id: '1', nombre: 'Ya no está', remoto: true }];
    const out = fusionar(local, []);
    expect(out).toHaveLength(0);
  });

  it('lo que creó otra persona aparece', () => {
    const local = [{ id: '1', nombre: 'Mía' }];
    const remoto = [{ id: '2', nombre: 'De otro' }];
    const out = fusionar(local, remoto);
    expect(out).toHaveLength(2);
    expect(out[1].nombre).toBe('De otro');
  });

  it('un id numérico local y su versión textual se reconocen como el mismo', () => {
    const local = [{ id: 1730000000000, nombre: 'Mía' }];
    const remoto = [{ id: '1730000000000', nombre: 'Actualizada' }];
    const out = fusionar(local, remoto);
    expect(out).toHaveLength(1);
    expect(out[0].nombre).toBe('Actualizada');
  });

  it('el estado completo se mezcla respecting el orden de las relaciones', () => {
    const local = {
      aulas: [{ id: 10, nombre: 'Aula 101' }],
      tareas: [{ id: 5, aulaId: 10, titulo: 'Ensayo' }],
      entregas: [],
      calificaciones: [],
    };
    const remoto = {
      aulas: [{ id: '10', nombre: 'Aula 101' }],
      tareas: [{ id: '5', aula_id: '10', titulo: 'Ensayo' }],
      entregas: [{ id: 'ent-1', tarea_id: '5', respuesta: 'Listo' }],
      calificaciones: [{ id: 'cal-1', entrega_id: 'ent-1', tarea_id: '5', nota: 95 }],
    };
    const out = fusionarEstado(local, remoto);
    expect(out.aulas).toHaveLength(1);
    expect(out.tareas).toHaveLength(1);
    // La entrega apunta a la tarea por índice (ya mezclada).
    expect(out.entregas[0].tareaIdx).toBe(0);
    // Y la calificación a la entrega por índice.
    expect(out.calificaciones[0].entregaIdx).toBe(0);
    expect(out.calificaciones[0].nota).toBe(95);
  });

  it('el archivo adjunto local no se pierde al mezclar', () => {
    const local = [{ id: 'ent-1', tareaIdx: 0, archivo: 'data:...', archivoNombre: 'trabajo.pdf' }];
    const remoto = [{ id: 'ent-1', tarea_id: '5', respuesta: 'Listo' }];
    const tareas = [{ id: 5 }];
    const out = fusionar(local, remoto, {
      clave: 'id',
      aLocal: (r) => aLocalEntrega(r, tareas),
    });
    expect(out[0].archivo).toBe('data:...');
    expect(out[0].respuesta).toBe('Listo');
  });
});
