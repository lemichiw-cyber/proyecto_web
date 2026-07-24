export type UserRole = 'estudiante' | 'docente' | 'director' | 'subdirector' | 'coordinador' | 'padres' | 'admin';

export interface User {
  email: string;
  rol: UserRole;
  nombre: string;
}

export interface Session {
  user: User | null;
  isLoggedIn: boolean;
}

type Listener = () => void;

class Store {
  private state: Session = { user: null, isLoggedIn: false };
  private listeners: Set<Listener> = new Set();

  get session(): Session {
    return this.state;
  }

  get user(): User | null {
    return this.state.user;
  }

  get isLoggedIn(): boolean {
    return this.state.isLoggedIn;
  }

  get rol(): UserRole | null {
    return this.state.user?.rol ?? null;
  }

  setSession(user: User | null) {
    this.state = { user, isLoggedIn: !!user };
    this.notify();
  }

  logout() {
    this.state = { user: null, isLoggedIn: false };
    this.notify();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }
}

export const store = new Store();