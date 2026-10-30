/* ===================================================================
   Cuentas — localStorage (sincrono, 100% local, sin backend).
   Se extrajo de src/app.js para modularizar el monólito.
   =================================================================== */

export const LS_CUENTAS = 'cherrybombCuentas';
export const ROLES_VALIDOS = ['estudiante', 'docente', 'coordinador', 'director', 'subdirector', 'padres', 'admin'];
export const ROL_REGISTRO = 'estudiante';
export const ADMIN_EMAIL = 'admin@bachillerato.edu';

let cuentasBackend = null;

export function normalizaEmail(e) { return String(e || '').trim().toLowerCase(); }

export function cuentaActiva(cuenta) { return !!cuenta && cuenta.activo !== false; }

export function leerCuentas() {
  try {
    const db = JSON.parse(localStorage.getItem(LS_CUENTAS) || '{}');
    return (db && typeof db === 'object') ? db : {};
  } catch (e) { return {}; }
}

function asegurarAdmin(db) {
  if (!db || typeof db !== 'object') db = {};
  const a = db[ADMIN_EMAIL];
  if (!a || typeof a !== 'object') {
    db[ADMIN_EMAIL] = {
      email: ADMIN_EMAIL, nombre: 'Administrador', rol: 'admin',
      semestre: '', activo: true, creado: new Date().toISOString(),
    };
  } else if (a.rol !== 'admin') {
    a.rol = 'admin';
  }
  return db;
}

export function guardarCuentas(db) {
  if (!db || typeof db !== 'object') return;
  cuentasBackend = asegurarAdmin(db);
  try { localStorage.setItem(LS_CUENTAS, JSON.stringify(cuentasBackend)); } catch (e) { /* sin storage */ }
}

export function obtenerCuenta(email) {
  const key = normalizaEmail(email);
  if (!key) return null;
  const db = cuentasBackend || leerCuentas();
  return db[key] || null;
}

export function crearCuenta(email, nombre, rol, password) {
  const key = normalizaEmail(email);
  if (!key) return { ok: false, msg: 'Falta el correo.' };
  if (obtenerCuenta(key)) return { ok: false, msg: 'Ese correo ya est\u00e1 registrado. Inici\u00e1 sesi\u00f3n.' };

  const rango = ROLES_VALIDOS.indexOf(rol) !== -1 ? rol : ROL_REGISTRO;
  const nuevo = {
    email: key,
    nombre: String(nombre || key.split('@')[0]).trim(),
    rol: rango,
    semestre: rango === ROL_REGISTRO ? '1' : '',
    activo: true,
    creado: new Date().toISOString(),
  };
  const db = leerCuentas();
  db[key] = nuevo;
  guardarCuentas(db);
  return { ok: true, cuenta: nuevo };
}

export function cambiarRangoCuenta(email, rol) {
  const key = normalizaEmail(email);
  if (!key) return { ok: false, msg: 'Falta el correo.' };
  if (ROLES_VALIDOS.indexOf(rol) === -1) return { ok: false, msg: 'Rango desconocido.' };
  const db = leerCuentas();
  if (!db[key]) return { ok: false, msg: 'No existe esa cuenta.' };

  db[key].rol = rol;
  if (rol !== ROL_REGISTRO) db[key].semestre = '';
  guardarCuentas(db);
  return { ok: true, cuenta: db[key] };
}

/* Carga inicial: usada desde src/app.js (necesita savedSession de ahi). */
export function prepararCuentasCon(db) {
  guardarCuentas(db);
  return Promise.resolve(cuentasBackend);
}
