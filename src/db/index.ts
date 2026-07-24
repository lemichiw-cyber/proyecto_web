export interface Examen {
  id: string;
  titulo: string;
  tiempo: number;
  preguntas: Pregunta[];
  createdAt: number;
  updatedAt: number;
}

export type PreguntaTipo = 'multiple' | 'vf' | 'completar';

export interface PreguntaBase {
  texto: string;
  tipo: PreguntaTipo;
}

export interface PreguntaMultiple extends PreguntaBase {
  tipo: 'multiple';
  opciones: string[];
  correcta: number;
}

export interface PreguntaVF extends PreguntaBase {
  tipo: 'vf';
  correcta: boolean;
}

export interface PreguntaCompletar extends PreguntaBase {
  tipo: 'completar';
  respuesta: string;
}

export type Pregunta = PreguntaMultiple | PreguntaVF | PreguntaCompletar;

export type StoreName =
  | 'examenes'
  | 'actividades'
  | 'agenda'
  | 'mensajes'
  | 'tareas'
  | 'aulas'
  | 'planificacion'
  | 'matricula'
  | 'asistencias'
  | 'foros'
  | 'clases'
  | 'horario'
  | 'calendario'
  | 'settings';

const DB_NAME = 'incoa_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const stores: StoreName[] = [
          'examenes', 'actividades', 'agenda', 'mensajes', 'tareas',
          'aulas', 'planificacion', 'matricula', 'asistencias', 'foros',
          'clases', 'horario', 'calendario', 'settings'
        ];
        stores.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        });
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getById<T>(store: StoreName, id: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function put<T extends { id: string }>(store: StoreName, data: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put({ ...data, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function remove(store: StoreName, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clear(store: StoreName): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}