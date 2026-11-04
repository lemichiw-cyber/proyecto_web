/// <reference types="vite/client" />

export {};

declare global {
  const VITE_API_BASE: string | undefined;
  const VITE_API_EMAIL: string | undefined;
  const VITE_VAPID_PUBLIC_KEY: string | undefined;

  interface Window {
    usuarioActual?: { email: string; rol: string; nombre: string };
    eventosAPI?: {
      listar: (tipo?: string) => any[];
      migrarLegacy: () => void;
      agregar: (ev: any) => any;
      borrar: (id: any) => void;
    };
    DB?: any;
    CherryBombNotifications?: {
      requestPermission: () => void;
      send: (title: string, body: string, tag?: string) => void;
      notifyNewTask: (tarea: any, aulaNombre?: string) => void;
      checkUpcomingDeadlines: () => void;
      startDeadlineChecker: () => void;
      stopDeadlineChecker: () => void;
      showPermissionBanner: () => void;
      isSupported: () => boolean;
      getPermission: () => string;
      getEstudianteActual: () => any;
      getPendingItems: () => any;
      suscribirPush: () => Promise<void>;
      enviarPush: (titulo: string, cuerpo: string, tag?: string) => Promise<void>;
    };
  }
}
