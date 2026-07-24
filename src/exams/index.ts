import { Examen, Pregunta, PreguntaMultiple, PreguntaVF, PreguntaCompletar, generateId } from '../db';
import { getAll, put, remove } from '../db';

const EXAM_KEY = 'examenes';

export async function getExamenes(): Promise<Examen[]> {
  const cached = localStorage.getItem(EXAM_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }
  const exams = await getAll<Examen>('examenes');
  localStorage.setItem(EXAM_KEY, JSON.stringify(exams));
  return exams;
}

export async function saveExamen(examen: Examen): Promise<void> {
  await put('examenes', examen);
  const all = await getExamenes();
  localStorage.setItem(EXAM_KEY, JSON.stringify(all));
}

export async function deleteExamen(id: string): Promise<void> {
  await remove('examenes', id);
  const all = await getExamenes();
  localStorage.setItem(EXAM_KEY, JSON.stringify(all));
}

export function createPreguntaMultiple(
  texto: string,
  opciones: string[],
  correcta: number
): PreguntaMultiple {
  return {
    tipo: 'multiple',
    texto,
    opciones: opciones.slice(0, 3).map((o, i) => o || `Opción ${i + 1}`),
    correcta: Math.max(0, Math.min(2, correcta))
  };
}

export function createPreguntaVF(texto: string, correcta: boolean): PreguntaVF {
  return { tipo: 'vf', texto, correcta };
}

export function createPreguntaCompletar(texto: string, respuesta: string): PreguntaCompletar {
  return { tipo: 'completar', texto, respuesta: respuesta.trim().toLowerCase() };
}

export function validatePregunta(p: Pregunta): string | null {
  if (!p.texto.trim()) return 'El texto de la pregunta es obligatorio';
  if (p.tipo === 'multiple') {
    if (p.opciones.some(o => !o.trim())) return 'Todas las opciones deben tener texto';
  }
  if (p.tipo === 'completar' && !p.respuesta) return 'La respuesta correcta es obligatoria';
  return null;
}

export function createExamen(titulo: string, tiempo: number, preguntas: Pregunta[]): Examen {
  return {
    id: generateId(),
    titulo: titulo.trim(),
    tiempo: Math.max(1, Math.min(180, tiempo)),
    preguntas,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function checkAnswer(pregunta: Pregunta, respuesta: string | number | boolean): boolean {
  switch (pregunta.tipo) {
    case 'multiple':
      return typeof respuesta === 'number' && respuesta === pregunta.correcta;
    case 'vf':
      return typeof respuesta === 'boolean' && respuesta === pregunta.correcta;
    case 'completar':
      return typeof respuesta === 'string' &&
        respuesta.trim().toLowerCase() === pregunta.respuesta;
    default:
      return false;
  }
}