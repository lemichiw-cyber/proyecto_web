import { Examen, Pregunta, PreguntaMultiple, PreguntaVF, PreguntaCompletar, generateId } from '../db';
import { put, getAll, remove } from '../db';

const EXAM_KEY = 'bachillerato_examenes';

export async function loadExamenes(): Promise<Examen[]> {
  try {
    const cached = localStorage.getItem(EXAM_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return getAll<Examen>('examenes');
}

export async function saveExamenes(examenes: Examen[]): Promise<void> {
  localStorage.setItem(EXAM_KEY, JSON.stringify(examenes));
  await Promise.all(examenes.map(e => put('examenes', e)));
}

export async function addExamen(examen: Omit<Examen, 'id' | 'createdAt' | 'updatedAt'>): Promise<Examen> {
  const now = Date.now();
  const nuevo: Examen = {
    ...examen,
    id: generateId(),
    createdAt: now,
    updatedAt: now
  };
  await put('examenes', nuevo);
  const all = await loadExamenes();
  localStorage.setItem(EXAM_KEY, JSON.stringify(all));
  return nuevo;
}

export async function updateExamen(id: string, changes: Partial<Examen>): Promise<void> {
  const all = await loadExamenes();
  const idx = all.findIndex(e => e.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...changes, updatedAt: Date.now() };
    await saveExamenes(all);
  }
}

export async function deleteExamen(id: string): Promise<void> {
  await remove('examenes', id);
  const all = await loadExamenes();
  localStorage.setItem(EXAM_KEY, JSON.stringify(all));
}

export function createPreguntaMultiple(
  texto: string,
  opciones: string[],
  correcta: number
): PreguntaMultiple {
  return {
    texto,
    tipo: 'multiple',
    opciones: opciones.slice(0, 3).map((o, i) => o || `Opción ${i + 1}`),
    correcta: Math.max(0, Math.min(2, correcta))
  };
}

export function createPreguntaVF(texto: string, correcta: boolean): PreguntaVF {
  return { texto, tipo: 'vf', correcta };
}

export function createPreguntaCompletar(texto: string, respuesta: string): PreguntaCompletar {
  return { texto, tipo: 'completar', respuesta: respuesta.trim() };
}

export function validatePregunta(p: Pregunta): string | null {
  if (!p.texto?.trim()) return 'El texto de la pregunta es obligatorio';
  if (p.tipo === 'multiple') {
    if (p.opciones.some(o => !o?.trim())) return 'Todas las opciones deben tener texto';
  }
  if (p.tipo === 'completar' && !p.respuesta?.trim()) return 'La respuesta es obligatoria';
  return null;
}