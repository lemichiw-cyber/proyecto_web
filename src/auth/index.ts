import { store } from '../store';
import { User, UserRole } from '../store';

const SESSION_KEY = 'incoaSession';
const PASS_HASH_PREFIX = 'passHash_';

function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export function saveSession(user: User) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  store.setSession(user);
}

export function loadSession(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as User;
    store.setSession(user);
    return user;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  store.logout();
}

export function verifyPassword(email: string, password: string): boolean {
  const storedHash = localStorage.getItem(PASS_HASH_PREFIX + btoa(email));
  const hash = hashPassword(password);
  if (storedHash && storedHash !== hash) return false;
  if (!storedHash) localStorage.setItem(PASS_HASH_PREFIX + btoa(email), hash);
  return true;
}

export function getRoleDisplay(rol: UserRole): string {
  const map: Record<UserRole, string> = {
    estudiante: 'Estudiante',
    docente: 'Docente',
    director: 'Director',
    subdirector: 'Subdirector',
    coordinador: 'Coordinador',
    padres: 'Padre de familia',
    admin: 'Admin'
  };
  return map[rol] ?? rol;
}