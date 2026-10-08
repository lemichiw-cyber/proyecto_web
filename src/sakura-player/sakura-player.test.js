/* Tests de lógica pura del reproductor (sin DOM). */
import { describe, it, expect } from 'vitest';
import { EQ_PRESETS, EQ_FREQUENCIES } from './audio/equalizer.js';
import { CONFIGS, AUTO_MAP, BASE_TOKENS } from './theme/player-theme-manager.js';

describe('Ecualizador', () => {
  it('tiene 10 bandas con las frecuencias esperadas', () => {
    expect(EQ_FREQUENCIES).toEqual([60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000]);
  });

  it('todos los presets tienen 10 ganancias', () => {
    for (const preset of Object.values(EQ_PRESETS)) {
      expect(preset.gains).toHaveLength(10);
      preset.gains.forEach((g) => {
        expect(g).toBeGreaterThanOrEqual(-12);
        expect(g).toBeLessThanOrEqual(12);
      });
    }
  });

  it('incluye los presets pedidos', () => {
    for (const name of ['normal', 'rock', 'pop', 'jazz', 'electronica', 'bassboost', 'vocal', 'retro', 'cyberpunk', 'sakura', 'custom']) {
      expect(EQ_PRESETS[name]).toBeDefined();
    }
  });
});

describe('Temas del reproductor', () => {
  it('define 12 configuraciones', () => {
    expect(Object.keys(CONFIGS)).toHaveLength(12);
  });

  it('cada configuración tiene todos los tokens', () => {
    const required = [
      '--player-bg', '--player-bg-secondary', '--player-bg-card', '--player-text',
      '--player-text-secondary', '--player-primary', '--player-secondary', '--player-accent',
      '--player-accent-hover', '--player-border', '--player-border-glow', '--player-shadow',
      '--player-progress', '--player-progress-bg', '--player-slider', '--player-slider-bg',
      '--player-equalizer', '--player-visualizer', '--player-success', '--player-warning', '--player-error',
    ];
    for (const [id, cfg] of Object.entries(CONFIGS)) {
      const merged = { ...BASE_TOKENS, ...cfg.tokens };
      for (const token of required) {
        expect(merged[token], `${id} → ${token}`).toBeTruthy();
      }
      expect(['none', 'low', 'medium', 'high']).toContain(cfg.intensity);
      expect(cfg.visualizer).toBeTruthy();
    }
  });

  it('el mapa automático cubre los 13 temas de la app', () => {
    const appThemes = ['light', 'dark', 'pastel', 'sunset', 'dawn', 'ocean', 'mlp', 'chicawa', 'sakura', 'paraiso', 'frutiger', 'dreamcore', 'sakura-player'];
    for (const t of appThemes) {
      const e = AUTO_MAP[t];
      expect(e, t).toBeTruthy();
      const base = typeof e === 'string' ? e : e.base;
      expect(CONFIGS[base], `${t} → ${base}`).toBeTruthy();
      if (typeof e !== 'string') {
        expect(Object.keys(e.tokens || {}).length, `${t} sin tokens`).toBeGreaterThan(0);
        expect(e.visualizer).toBeTruthy();
        expect(e.effects).toBeTruthy();
      }
    }
  });

  it('los 12 temas de la app tienen look distinto en el reproductor', () => {
    const doce = ['light', 'dark', 'pastel', 'sunset', 'dawn', 'ocean', 'mlp', 'chicawa', 'sakura', 'paraiso', 'frutiger', 'dreamcore'];
    const firmas = new Map();
    for (const id of doce) {
      const e = AUTO_MAP[id];
      const base = typeof e === 'string' ? e : e.base;
      const t = { ...BASE_TOKENS, ...CONFIGS[base].tokens, ...(typeof e === 'string' ? {} : e.tokens) };
      const firma = `${t['--player-primary']}|${t['--player-bg']}`;
      expect(firmas.has(firma), `${id} idéntico a ${firmas.get(firma)}`).toBe(false);
      firmas.set(firma, id);
    }
    expect(firmas.size).toBe(12);
  });
});

/* ------------------------------------------------------------------
   Contraste WCAG AA (≥4.5) de los tokens de texto en los 13 temas
   ------------------------------------------------------------------ */
function parseColor(c) {
  if (Array.isArray(c)) return c;
  const s = String(c).trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) { const h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 1]; }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  return null;
}
function composite(fg, bg) {
  const f = parseColor(fg), b = parseColor(bg);
  if (!f) throw new Error('color inválido: ' + fg);
  const a = f[3] === undefined ? 1 : f[3];
  return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a)];
}
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const l1 = luminance(parseColor(a)), l2 = luminance(parseColor(b));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function rgbStr(c) {
  return 'rgb(' + c.slice(0, 3).map((v) => Math.round(v)).join(', ') + ')';
}

describe('Contraste WCAG AA de los tokens', () => {
  const TEXT_PAIRS = [
    ['texto sobre fondo', (t) => t['--player-text'], (t, bg) => bg],
    ['texto secundario', (t) => t['--player-text-secondary'], (t, bg) => bg],
    ['texto sobre tarjeta', (t) => t['--player-text'], (t) => t['--player-bg-card']],
    ['secundario sobre tarjeta', (t) => t['--player-text-secondary'], (t) => t['--player-bg-card']],
    ['botón primario', () => '#08040c', (t) => t['--player-primary']],
    ['botón hover', () => '#08040c', (t) => t['--player-accent-hover']],
    ['badge/acentos', (t) => t['--player-accent'], (t, bg) => bg],
    ['aviso', (t) => t['--player-warning'], (t, bg) => bg],
    ['error', (t) => t['--player-error'], (t, bg) => bg],
    ['éxito', (t) => t['--player-success'], (t, bg) => bg],
  ];

  it('todos los pares de texto llegan a ≥4.5 en los 13 temas', () => {
    const fallas = [];
    for (const [id, cfg] of Object.entries(CONFIGS)) {
      const t = { ...BASE_TOKENS, ...cfg.tokens };
      const bg = t['--player-bg'];
      for (const [name, fgFn, bgFn] of TEXT_PAIRS) {
        const bgv = bgFn(t, bg);
        // el fondo puede ser translúcido: se compone primero sobre --player-bg
        const bgComp = parseColor(bgv)[3] < 1 ? composite(bgv, bg) : parseColor(bgv).slice(0, 3);
        const fgComp = composite(fgFn(t), bgComp);
        const r = contrast(rgbStr(fgComp), rgbStr(bgComp));
        if (r < 4.5) fallas.push(`${id} · ${name}: ${r.toFixed(2)}`);
      }
    }
    expect(fallas, fallas.join(' | ')).toEqual([]);
  });

  it('los looks del mapa automático con ajustes propios también pasan AA', () => {
    const fallas = [];
    for (const [id, e] of Object.entries(AUTO_MAP)) {
      if (typeof e === 'string') continue;
      const t = { ...BASE_TOKENS, ...CONFIGS[e.base].tokens, ...e.tokens };
      const bg = t['--player-bg'];
      for (const [name, fgFn, bgFn] of TEXT_PAIRS) {
        const bgv = bgFn(t, bg);
        const bgComp = parseColor(bgv)[3] < 1 ? composite(bgv, bg) : parseColor(bgv).slice(0, 3);
        const fgComp = composite(fgFn(t), bgComp);
        const r = contrast(rgbStr(fgComp), rgbStr(bgComp));
        if (r < 4.5) fallas.push(`${id} · ${name}: ${r.toFixed(2)}`);
      }
    }
    expect(fallas, fallas.join(' | ')).toEqual([]);
  });

  it('el fondo es oscuro o claro de forma consistente con el texto', () => {
    for (const [id, cfg] of Object.entries(CONFIGS)) {
      const t = { ...BASE_TOKENS, ...cfg.tokens };
      const bgLum = luminance(parseColor(t['--player-bg']));
      const textLum = luminance(parseColor(t['--player-text']));
      // texto claro sobre fondo oscuro, o texto oscuro sobre fondo claro
      expect(bgLum < 0.5 ? textLum > 0.4 : textLum < 0.3, id).toBe(true);
    }
  });
});

describe('Cliente del backend (mensajes amigables)', () => {
  it('sitio desplegado con API remota (nuevo default) muestra mensaje genérico', async () => {
    const { friendlyError, PlayerError } = await import('./api/client.js');
    const prev = globalThis.location;
    // Sitio servido desde Render con API por defecto en la nube.
    // Ya no apunta a 127.0.0.1, por lo que el mensaje es el genérico.
    globalThis.location = { hostname: 'proyecto-web-2-bygl.onrender.com' };
    try {
      const msg = friendlyError(new PlayerError('backend_offline', 'x'));
      // Con el default en la nube, no hay IP local que mostrar → genérico
      expect(msg).toBe('Backend apagado o sin conexión');
      // Sin location (Node.js) → también genérico
      delete globalThis.location;
      expect(friendlyError(new PlayerError('backend_offline', 'x'))).toBe('Backend apagado o sin conexión');
      // Localhost → también genérico
      globalThis.location = { hostname: 'localhost' };
      expect(friendlyError(new PlayerError('backend_offline', 'x'))).toBe('Backend apagado o sin conexión');
    } finally {
      if (prev === undefined) delete globalThis.location;
      else globalThis.location = prev;
    }
  });

  it('configuración manual de API local: setApiBase no rompe el mensaje', async () => {
    // Verifica que setApiBase('http://127.0.0.1:8000') no cause errores y el mensaje
    // sea un string válido (sea la IP o el genérico, depende del entorno de test).
    const { friendlyError, PlayerError, setApiBase } = await import('./api/client.js');
    setApiBase('http://127.0.0.1:8000');
    const msg = friendlyError(new PlayerError('backend_offline', 'x'));
    // El mensaje debe ser string y no ser "Error inesperado"
    expect(typeof msg).toBe('string');
    expect(msg).not.toBe('Error inesperado');
  });
});

/* ------------------------------------------------------------------
   Modo administrador (sesión + login contra /api/admin/*)
   ------------------------------------------------------------------ */
function stubLocalStorage() {
  const store = new Map();
  const prev = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
    ? globalThis.localStorage : undefined;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  return () => {
    if (prev === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev;
  };
}

describe('Modo administrador', () => {
  it('login correcto guarda la sesión y envía las credenciales al backend', async () => {
    const restoreStore = stubLocalStorage();
    const admin = await import('./api/admin.js');
    const { clearCache } = await import('./api/client.js');
    const prevFetch = globalThis.fetch;
    clearCache();
    let seen = null;
    globalThis.fetch = async (url, opts) => {
      seen = { url, opts };
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, email: 'sakuraenterprise2@gmail.com', token: 'tk.segura', expires_in: 86400 }),
      };
    };
    try {
      expect(admin.isAdmin()).toBe(false);
      const res = await admin.loginAdmin('sakuraenterprise2@gmail.com', 'MLRTJAH');
      expect(res.ok).toBe(true);
      expect(admin.isAdmin()).toBe(true);
      expect(admin.adminToken()).toBe('tk.segura');
      expect(admin.adminEmail()).toBe('sakuraenterprise2@gmail.com');
      expect(String(seen.url)).toContain('/api/admin/login');
      const body = JSON.parse(seen.opts.body);
      expect(body).toEqual({ email: 'sakuraenterprise2@gmail.com', password: 'MLRTJAH' });

      admin.clearSession();
      expect(admin.isAdmin()).toBe(false);
      expect(admin.adminToken()).toBeNull();
    } finally {
      globalThis.fetch = prevFetch;
      restoreStore();
    }
  });

  it('credenciales incorrectas → error auth con el mensaje del backend y sin sesión', async () => {
    const restoreStore = stubLocalStorage();
    const admin = await import('./api/admin.js');
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Correo o contraseña incorrectos' }),
    });
    try {
      await expect(admin.loginAdmin('otro@correo.com', 'mala'))
        .rejects.toMatchObject({ code: 'auth' });
      expect(admin.isAdmin()).toBe(false);
      let msg = '';
      try { await admin.loginAdmin('otro@correo.com', 'mala'); }
      catch (e) { msg = admin.adminError(e); }
      expect(msg).toBe('Correo o contraseña incorrectos');
      // Otros errores siguen usando el traductor genérico
      const { PlayerError, friendlyError } = await import('./api/client.js');
      expect(admin.adminError(new PlayerError('backend_offline', 'x'))).toBe('Backend apagado o sin conexión');
      expect(admin.adminError(new PlayerError('backend_offline', 'x'))).toBe(friendlyError(new PlayerError('backend_offline', 'x')));
    } finally {
      globalThis.fetch = prevFetch;
      restoreStore();
    }
  });

  it('restaura una sesión válida y limpia el token si el backend la rechaza', async () => {
    const restoreStore = stubLocalStorage();
    const admin = await import('./api/admin.js');
    const prevFetch = globalThis.fetch;
    try {
      // Sesión válida → se conserva
      admin.storeSession({ token: 'tk.ok', email: 'sakuraenterprise2@gmail.com' });
      globalThis.fetch = async (url, opts) => {
        expect(String(url)).toContain('/api/admin/me');
        expect(opts.headers.Authorization).toBe('Bearer tk.ok');
        return { ok: true, status: 200, json: async () => ({ ok: true, email: 'sakuraenterprise2@gmail.com', role: 'admin' }) };
      };
      expect(await admin.restoreSession()).toBe('sakuraenterprise2@gmail.com');
      expect(admin.isAdmin()).toBe(true);

      // Token expirado (401) → se borra y se vuelve al formulario
      globalThis.fetch = async () => ({
        ok: false, status: 401, json: async () => ({ detail: 'Token inválido o expirado' }),
      });
      expect(await admin.restoreSession()).toBeNull();
      expect(admin.isAdmin()).toBe(false);
    } finally {
      globalThis.fetch = prevFetch;
      restoreStore();
    }
  });
});

describe('Reintentos del cliente', () => {
  it('reintenta una vez cuando la petición aborta por timeout (cold start)', async () => {
    const { api } = await import('./api/client.js');
    const prev = globalThis.fetch;
    let llamadas = 0;
    globalThis.fetch = async () => {
      llamadas += 1;
      if (llamadas === 1) {
        const e = new Error('The user aborted a request.');
        e.name = 'AbortError';
        throw e;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, service: 'nube' }) };
    };
    try {
      const h = await api.health();
      expect(h.ok).toBe(true);
      expect(llamadas).toBe(2); // intento 1 agotado → reintento exitoso
    } finally {
      globalThis.fetch = prev;
    }
  });

  it('no reintenta si el fallo no es un timeout (backend apagado)', async () => {
    const { api } = await import('./api/client.js');
    const prev = globalThis.fetch;
    let llamadas = 0;
    globalThis.fetch = async () => {
      llamadas += 1;
      throw new TypeError('Failed to fetch');
    };
    try {
      await expect(api.health()).rejects.toMatchObject({ code: 'backend_offline' });
      expect(llamadas).toBe(1); // conexión rechazada: fallo inmediato, sin reintento
    } finally {
      globalThis.fetch = prev;
    }
  });
});

/* ------------------------------------------------------------------
   Auto-sanado de la URL del backend guardada en Ajustes
   (una URL vieja/mal tipeada no debe dejar al reproductor sin música)
   ------------------------------------------------------------------ */
describe('Auto-sanado de la URL del backend', () => {
  it('sanea la URL guardada: añade esquema, quita barra final y sube http a https en páginas https', async () => {
    const restoreStore = stubLocalStorage();
    const { setApiBase, getApiBase, DEFAULT_BASE } = await import('./api/client.js');
    const prevLoc = globalThis.location;
    try {
      globalThis.location = { protocol: 'https:', hostname: 'proyecto-web-2-bygl.onrender.com' };
      setApiBase('sakura-backend-indb.onrender.com/');
      expect(getApiBase()).toBe('https://sakura-backend-indb.onrender.com');
      setApiBase('http://sakura-backend-indb.onrender.com'); // mixed content
      expect(getApiBase()).toBe('https://sakura-backend-indb.onrender.com');
      setApiBase('  http://127.0.0.1:8000/  '); // loopback conserva http
      expect(getApiBase()).toBe('http://127.0.0.1:8000');
      setApiBase('');
      expect(getApiBase()).toBe(DEFAULT_BASE);
    } finally {
      if (prevLoc === undefined) delete globalThis.location;
      else globalThis.location = prevLoc;
      restoreStore();
    }
  });

  it('si la URL guardada falla a nivel de red, GET reintenta contra la del sitio y la sesión queda apuntando ahí', async () => {
    const restoreStore = stubLocalStorage();
    const client = await import('./api/client.js');
    const prevFetch = globalThis.fetch;
    const prevDoc = Object.prototype.hasOwnProperty.call(globalThis, 'document') ? globalThis.document : undefined;
    const llamadas = [];
    let evento = null;
    globalThis.document = { dispatchEvent: (e) => { evento = e; } };
    client.setApiBase('https://url-vieja.example.com');
    globalThis.fetch = async (url) => {
      llamadas.push(url);
      if (llamadas.length === 1) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => ({ ok: true, via: 'por-defecto' }) };
    };
    try {
      const h = await client.api.health();
      expect(h.via).toBe('por-defecto');
      expect(llamadas).toHaveLength(2);
      expect(llamadas[0]).toContain('url-vieja.example.com');
      expect(llamadas[1]).toBe(client.DEFAULT_BASE + '/api/health');
      // La sesión queda usando la URL del sitio…
      expect(client.activeApiBase()).toBe(client.DEFAULT_BASE);
      // …sin pisar lo que guardó el usuario (él puede volver a probarlo)
      expect(client.getApiBase()).toBe('https://url-vieja.example.com');
      // …y se avisa una sola vez con el evento
      expect(evento).not.toBeNull();
      expect(evento.detail.from).toBe('https://url-vieja.example.com');
      expect(evento.detail.to).toBe(client.DEFAULT_BASE);
      // Las peticiones siguientes ya van directo a la del sitio
      await client.api.health();
      expect(llamadas).toHaveLength(3);
      expect(llamadas[2]).toBe(client.DEFAULT_BASE + '/api/health');
      expect(evento.type).toBe('sp:api-base-fallback');
    } finally {
      globalThis.fetch = prevFetch;
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
      client.setApiBase(''); // limpia forcedBase y la URL de prueba
      restoreStore();
    }
  });

  it('nunca reintenta una petición con efectos (POST) contra otra URL', async () => {
    const restoreStore = stubLocalStorage();
    const client = await import('./api/client.js');
    const prevFetch = globalThis.fetch;
    let llamadas = 0;
    client.setApiBase('https://url-vieja.example.com');
    globalThis.fetch = async () => {
      llamadas += 1;
      throw new TypeError('Failed to fetch');
    };
    try {
      await expect(client.api.adminLogin('a@b.c', 'x')).rejects.toMatchObject({ code: 'backend_offline' });
      expect(llamadas).toBe(1);
      expect(client.activeApiBase()).toBe('https://url-vieja.example.com'); // sin cambio
    } finally {
      globalThis.fetch = prevFetch;
      client.setApiBase('');
      restoreStore();
    }
  });

  it('5xx con detalle JSON del backend es "upstream" (YouTube Music caído), no "backend apagado"', async () => {
    const restoreStore = stubLocalStorage();
    const { api, friendlyError, setApiBase, activeApiBase, DEFAULT_BASE } = await import('./api/client.js');
    const prevFetch = globalThis.fetch;
    let llamadas = 0;
    setApiBase('');
    globalThis.fetch = async () => {
      llamadas += 1;
      return { ok: false, status: 502, json: async () => ({ detail: 'YouTube Music no está disponible' }) };
    };
    try {
      await expect(api.health()).rejects.toMatchObject({ code: 'upstream' });
      expect(llamadas).toBe(1); // el backend contestó: no hay fallback de URL
      expect(activeApiBase()).toBe(DEFAULT_BASE);
      const { PlayerError } = await import('./api/client.js');
      expect(friendlyError(new PlayerError('upstream', 'YouTube Music no está disponible')))
        .toBe('YouTube Music no está disponible');
    } finally {
      globalThis.fetch = prevFetch;
      setApiBase('');
      restoreStore();
    }
  });

  it('5xx sin cuerpo JSON (proxy/edge) cuenta como fallo de red y usa la URL del sitio', async () => {
    const restoreStore = stubLocalStorage();
    const client = await import('./api/client.js');
    const prevFetch = globalThis.fetch;
    const llamadas = [];
    client.setApiBase('https://url-vieja.example.com');
    globalThis.fetch = async (url) => {
      llamadas.push(url);
      if (llamadas.length === 1) {
        return { ok: false, status: 503, json: async () => { throw new Error('no es JSON'); } };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      const h = await client.api.health();
      expect(h.ok).toBe(true);
      expect(llamadas).toHaveLength(2);
      expect(llamadas[1]).toBe(client.DEFAULT_BASE + '/api/health');
      expect(client.activeApiBase()).toBe(client.DEFAULT_BASE);
    } finally {
      globalThis.fetch = prevFetch;
      client.setApiBase('');
      restoreStore();
    }
  });

  it('si también falla la URL por defecto, se informa el error original', async () => {
    const restoreStore = stubLocalStorage();
    const client = await import('./api/client.js');
    const prevFetch = globalThis.fetch;
    let llamadas = 0;
    client.setApiBase('https://url-vieja.example.com');
    globalThis.fetch = async () => {
      llamadas += 1;
      throw new TypeError('Failed to fetch');
    };
    try {
      await expect(client.api.health()).rejects.toMatchObject({ code: 'backend_offline' });
      expect(llamadas).toBe(2); // probó la guardada y luego la del sitio
      expect(client.activeApiBase()).toBe('https://url-vieja.example.com'); // no se cambió
    } finally {
      globalThis.fetch = prevFetch;
      client.setApiBase('');
      restoreStore();
    }
  });
});
