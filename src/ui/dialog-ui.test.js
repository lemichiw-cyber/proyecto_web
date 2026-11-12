/* ===================================================================
   dialog-ui.test.js — pruebas de la lógica de las ventanas emergentes.

   Sin navegador: sólo se comprueba cómo se decide el tono, la etiqueta
   del campo y los textos de los botones.
   =================================================================== */

import { describe, it, expect } from 'vitest';
import {
  DIALOG_TONES,
  TONO_ALERT,
  TONO_CONFIRM,
  TONO_PROMPT,
  definicionTono,
  esTonoValido,
  descomponerMensaje,
  etiquetaCampo,
  mismoTexto,
  textoBotonOk,
  textoBotonCancelar,
  esDestructivo,
} from './dialog-ui.js';

describe('dialog-ui — tonos', () => {
  it('define los tonos con ícono y textos', () => {
    expect(Object.keys(DIALOG_TONES)).toEqual(
      expect.arrayContaining(['info', 'warn', 'danger', 'success', 'help']),
    );
    Object.values(DIALOG_TONES).forEach((t) => {
      expect(typeof t.icono).toBe('string');
      expect(t.icono.length).toBeGreaterThan(0);
      expect(typeof t.textoOk).toBe('string');
      expect(typeof t.textoCancelar).toBe('string');
    });
  });

  it('un tono desconocido cae en "info"', () => {
    expect(definicionTono('no-existe').icono).toBe(DIALOG_TONES.info.icono);
    expect(definicionTono('').icono).toBe(DIALOG_TONES.info.icono);
    expect(definicionTono(null).icono).toBe(DIALOG_TONES.info.icono);
  });

  it('reconoce los tonos válidos', () => {
    expect(esTonoValido('danger')).toBe(true);
    expect(esTonoValido('inventado')).toBe(false);
  });

  it('cada tipo de diálogo tiene su tono por defecto', () => {
    expect(esTonoValido(TONO_ALERT)).toBe(true);
    expect(esTonoValido(TONO_CONFIRM)).toBe(true);
    expect(esTonoValido(TONO_PROMPT)).toBe(true);
  });
});

describe('dialog-ui — etiqueta del campo', () => {
  it('separa la etiqueta de la ayuda', () => {
    const d = descomponerMensaje('Tipo de incidente (ej: Acoso, Robo, Emergencia):');
    expect(d.etiqueta).toBe('Tipo de incidente');
    expect(d.ayuda).toBe('ej: Acoso, Robo, Emergencia');
  });

  it('un mensaje sin paréntesis es toda etiqueta', () => {
    const d = descomponerMensaje('Describe lo sucedido:');
    expect(d.etiqueta).toBe('Describe lo sucedido');
    expect(d.ayuda).toBe('');
  });

  it('la etiqueta se recorta si es muy larga', () => {
    const e = etiquetaCampo('Una etiqueta extremadamente larga para este campo de texto:', 'X');
    expect(e.length).toBeLessThanOrEqual(35);
  });

  it('si no hay mensaje usa el título', () => {
    expect(etiquetaCampo('', 'Nombre de la materia')).toBe('Nombre de la materia');
    expect(etiquetaCampo('', '')).toBe('Escribí aquí');
  });

  it('detecta textos equivalentes', () => {
    expect(mismoTexto('Hora', 'hora')).toBe(true);
    expect(mismoTexto('Hora:', 'hora')).toBe(true);
    expect(mismoTexto('Hora', 'Fecha')).toBe(false);
    expect(mismoTexto('', 'Hora')).toBe(false);
  });
});

describe('dialog-ui — botones', () => {
  it('usa el texto del tono si no se pasa uno', () => {
    expect(textoBotonOk('danger')).toBe('Eliminar');
    expect(textoBotonOk('info')).toBe('Aceptar');
    expect(textoBotonCancelar('danger')).toBe('Cancelar');
  });

  it('el texto explícito manda', () => {
    expect(textoBotonOk('danger', 'Borrar ahora')).toBe('Borrar ahora');
    expect(textoBotonCancelar('info', 'No, gracias')).toBe('No, gracias');
  });
});

describe('dialog-ui — acciones destructivas', () => {
  it('reconoce las confirmaciones que borran', () => {
    expect(esDestructivo('¿Eliminar la tarea?')).toBe(true);
    expect(esDestructivo('¿Borrar esta columna?')).toBe(true);
    expect(esDestructivo('¿Reiniciar toda la planilla?')).toBe(true);
  });

  it('no marca como destructivas las preguntas normales', () => {
    expect(esDestructivo('¿Marcar este reporte como urgente?')).toBe(false);
    expect(esDestructivo('¿Querés salir?')).toBe(false);
    expect(esDestructivo('')).toBe(false);
  });
});
