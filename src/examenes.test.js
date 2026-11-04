import { describe, it, expect } from 'vitest';
import {
  evaluarRespuesta,
  textoRespuesta,
  textoCorrecta,
  calcularResultadoExamen,
} from './modules/examenes/evaluador.js';

describe('Exámenes — Evaluación y Formato de Respuestas', () => {
  describe('Tipo: vf_justificacion (Verdadero/Falso con justificación)', () => {
    const qVfJust = {
      texto: '¿El agua hierve a 100°C al nivel del mar?',
      tipo: 'vf_justificacion',
      correcta: 1,
      justificacion: 'A 1 atmósfera de presión.',
    };

    it('evalúa como correcto si el valor V/F coincide', () => {
      const resp = { vf: 1, justificacion: 'Porque la presión atmosférica es 1 atm' };
      expect(evaluarRespuesta(qVfJust, resp)).toBe(true);
    });

    it('evalúa como incorrecto si el valor V/F no coincide', () => {
      const resp = { vf: 0, justificacion: 'Hierve a 90°C' };
      expect(evaluarRespuesta(qVfJust, resp)).toBe(false);
    });

    it('formatea textoRespuesta incluyendo la justificación del alumno', () => {
      const resp = { vf: 1, justificacion: 'Por la presión' };
      expect(textoRespuesta(qVfJust, resp)).toBe('Verdadero (Justificación: Por la presión)');
    });

    it('formatea textoCorrecta con la explicación esperada', () => {
      expect(textoCorrecta(qVfJust)).toBe('Verdadero (Explicación: A 1 atmósfera de presión.)');
    });
  });

  describe('Tipo: rango (Numérico con tolerancia)', () => {
    const qRango = {
      texto: '¿Cuál es el valor aproximado de Pi?',
      tipo: 'rango',
      respuesta: 3.1416,
      tolerancia: 0.01,
    };

    it('acepta valor dentro del rango de tolerancia', () => {
      expect(evaluarRespuesta(qRango, '3.14')).toBe(true);
      expect(evaluarRespuesta(qRango, '3.15')).toBe(true);
      expect(evaluarRespuesta(qRango, 3.1416)).toBe(true);
    });

    it('rechaza valor fuera del rango de tolerancia', () => {
      expect(evaluarRespuesta(qRango, '3.12')).toBe(false);
      expect(evaluarRespuesta(qRango, '3.16')).toBe(false);
      expect(evaluarRespuesta(qRango, 'no se')).toBe(false);
    });

    it('formatea correctamente respuesta y esperada', () => {
      expect(textoRespuesta(qRango, '3.14')).toBe('3.14');
      expect(textoCorrecta(qRango)).toBe('3.1416 (± 0.01)');
    });
  });

  describe('Tipo: cloze (Completar huecos)', () => {
    const qCloze = {
      texto: 'El Sol es una ___ y la Tierra es un ___.',
      tipo: 'cloze',
      respuestas: ['estrella', 'planeta'],
    };

    it('acepta respuestas en orden sin importar mayúsculas', () => {
      expect(evaluarRespuesta(qCloze, ['Estrella', 'PLANETA'])).toBe(true);
    });

    it('rechaza respuestas incompletas o en orden incorrecto', () => {
      expect(evaluarRespuesta(qCloze, ['planeta', 'estrella'])).toBe(false);
      expect(evaluarRespuesta(qCloze, ['estrella'])).toBe(false);
    });

    it('formatea textoRespuesta y textoCorrecta', () => {
      expect(textoRespuesta(qCloze, ['estrella', 'planeta'])).toBe('estrella, planeta');
      expect(textoCorrecta(qCloze)).toBe('estrella, planeta');
    });
  });

  describe('Tipo: completar (Insensible a mayúsculas/minúsculas)', () => {
    const qCompletar = {
      texto: '¿Cuál es la capital de Francia?',
      tipo: 'completar',
      respuesta: 'París',
    };

    it('normaliza mayúsculas y espacios en la respuesta del estudiante', () => {
      expect(evaluarRespuesta(qCompletar, 'parís')).toBe(true);
      expect(evaluarRespuesta(qCompletar, '  PARÍS  ')).toBe(true);
      expect(evaluarRespuesta(qCompletar, 'Londres')).toBe(false);
    });
  });

  describe('Tipo: casilla (Casillas múltiples autocalificables)', () => {
    const qCasilla = {
      texto: 'Seleccioná los números primos:',
      tipo: 'casilla',
      opciones: ['2', '4', '5', '9'],
      correctas: [0, 2],
    };

    it('autocalifica correctamente si seleccionó todas las correctas', () => {
      expect(evaluarRespuesta(qCasilla, [0, 2])).toBe(true);
      expect(evaluarRespuesta(qCasilla, [2, 0])).toBe(true); // orden no afecta
    });

    it('rechaza si faltó una o marcó de más', () => {
      expect(evaluarRespuesta(qCasilla, [0])).toBe(false);
      expect(evaluarRespuesta(qCasilla, [0, 1, 2])).toBe(false);
    });
  });

  describe('calcularResultadoExamen', () => {
    it('calcula porcentaje y estado de aprobación correctamente', () => {
      const preguntas = [
        { tipo: 'vf', correcta: 1 },
        { tipo: 'rango', respuesta: 10, tolerancia: 1 },
        { tipo: 'completar', respuesta: 'sol' },
      ];
      const respuestas = [1, '10.5', 'LUNA']; // 2 de 3 correctas
      const res = calcularResultadoExamen(preguntas, respuestas, 60);

      expect(res.correctas).toBe(2);
      expect(res.total).toBe(3);
      expect(res.porcentaje).toBe(67);
      expect(res.aprobado).toBe(true);
    });
  });
});
