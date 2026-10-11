/* ===================================================================
   storage.js — Capa de datos de las funciones de bachillerato

   TODA la información nueva (notas, horario, PAES, servicio social…)
   pasa por acá y NUNCA toca localStorage directamente.

   ¿Por qué? Porque hoy el guardado es local (funciona sin conexión y
   sin servidor), pero mañana queremos poder sincronizar con Supabase.
   Si toda la lectura/escritura pasa por esta interfaz, ese cambio se
   hace implementando otra clase y NO se toca la interfaz de usuario.

   Interfaz (todas devuelven Promise, como haría una base de datos real):

     get(clave, defecto)  -> Promise<any>
     set(clave, valor)    -> Promise<void>
     list(clave)          -> Promise<array>
     remove(clave)        -> Promise<void>
     keys()               -> Promise<string[]>
     clear()              -> Promise<void>

   Claves: se guardan con un prefijo para no chocar con las claves
   viejas de la app (cherrybombTheme, aulas, etc.).
   =================================================================== */

const PREFIJO = 'cb.bach.';

/** Sanitiza el nombre de una clave: sin puntos dobles ni vacíos. */
function claveLimpia(clave) {
  const k = String(clave || '').trim();
  if (!k) throw new Error('La clave no puede estar vacía.');
  if (k.length > 120) throw new Error('La clave es demasiado larga.');
  return k;
}

/* ------------------------------------------------------------------
   Implementación local: localStorage.
   Si el navegador no la tiene (modo privado muy viejo, cuota llena),
   cae a un Map en memoria para que la app no se rompa.
   ------------------------------------------------------------------ */
export class StorageLocal {
  constructor(prefijo = PREFIJO) {
    this.prefijo = prefijo;
    this._memoria = new Map(); // respaldo en RAM si localStorage falla
    this._soportado = (function () {
      try {
        const prueba = '__cb_prueba__';
        window.localStorage.setItem(prueba, '1');
        window.localStorage.removeItem(prueba);
        return true;
      } catch (e) {
        return false;
      }
    })();
  }

  _full(clave) {
    return this.prefijo + claveLimpia(clave);
  }

  async get(clave, defecto = null) {
    const k = this._full(clave); // si la clave es inválida, esto rechaza la promesa
    let crudo;
    if (this._soportado) {
      crudo = window.localStorage.getItem(k);
    } else {
      crudo = this._memoria.has(k) ? this._memoria.get(k) : null;
    }
    if (crudo === null || crudo === undefined) return defecto;
    try {
      return JSON.parse(crudo);
    } catch (e) {
      // JSON corrupto: devolvemos el defecto en vez de romper la pantalla
      return defecto;
    }
  }

  async set(clave, valor) {
    const k = this._full(clave);
    let crudo;
    try {
      crudo = JSON.stringify(valor === undefined ? null : valor);
    } catch (e) {
      throw new Error('No se pudo guardar: el dato no se puede convertir en JSON.');
    }
    try {
      if (this._soportado) {
        window.localStorage.setItem(k, crudo);
      } else {
        this._memoria.set(k, crudo);
      }
    } catch (e) {
      // Cuota llena: al menos lo dejamos en memoria y avisamos
      this._memoria.set(k, crudo);
      const lleno = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      throw new Error(
        lleno
          ? 'El teléfono ya no tiene espacio libre. Exportá un respaldo y borrá datos viejos.'
          : 'No se pudo guardar el dato.'
      );
    }
  }

  /** Devuelve SIEMPRE un array. Si lo guardado no es un array, devuelve []. */
  async list(clave) {
    const valor = await this.get(clave, []);
    return Array.isArray(valor) ? valor : [];
  }

  async remove(clave) {
    const k = this._full(clave);
    try {
      if (this._soportado) window.localStorage.removeItem(k);
    } catch (e) { /* seguimos y limpiamos la memoria */ }
    this._memoria.delete(k);
    return undefined;
  }

  async keys() {
    const encontradas = [];
    if (this._soportado) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.indexOf(this.prefijo) === 0) encontradas.push(k.slice(this.prefijo.length));
      }
    }
    for (const k of this._memoria.keys()) {
      const limpia = k.slice(this.prefijo.length);
      if (encontradas.indexOf(limpia) === -1) encontradas.push(limpia);
    }
    return encontradas;
  }

  async clear() {
    const claves = await this.keys();
    for (const c of claves) await this.remove(c);
    return undefined;
  }
}

/* ------------------------------------------------------------------
   Nombres canónicos de las claves. Centralizados acá para que la UI
   no escriba strings sueltos por todos lados (y para el respaldo).
   ------------------------------------------------------------------ */
export const CLAVES = {
  CONFIG_NOTAS: 'notas.config',
  MATERIAS: 'notas.materias',
  HORARIO: 'horario.clases',
  TAREAS_AGENDA: 'agenda.tareas',
  PAES_BANCO: 'paes.banco',            // preguntas cargadas por el docente
  PAES_HISTORIAL: 'paes.historial',
  PAES_METAS: 'paes.metas',
  PAES_TARJETAS: 'paes.tarjetas',
  PAES_EN_CURSO: 'paes.simulacro-en-curso',
  SERVICIO_SOCIAL: 'servicio.horas',
  SERVICIO_META: 'servicio.meta',
  PROYECTO_GRADO: 'proyecto.hitos',
  COMUNICADOS: 'centro.comunicados',
  ORIENTACION: 'orientacion.registros',
  CONTACTOS_APOYO: 'apoyo.contactos',
  CONSEJOS: 'apoyo.consejos',
  ESTUDIO_SESIONES: 'estudio.sesiones',
  METAS_SEMANALES: 'estudio.metas',
  RACHAS: 'estudio.rachas',
  MODO_AHORRO: 'sistema.ahorro',
};

/** Instancia única que usa toda la app. */
export const storage = new StorageLocal();
