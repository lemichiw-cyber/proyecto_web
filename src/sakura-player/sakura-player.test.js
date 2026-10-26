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


/* ------------------------------------------------------------------
   Catálogo curado (sin backend): la búsqueda y los detalles salen de
   la lista incluida en la página, y la reproducción usa el ID de video
   de YouTube que trae cada pista.
   ------------------------------------------------------------------ */
describe('Catálogo curado', () => {
  it('no hay backend: el cliente no expone salud ni stream remoto', async () => {
    const client = await import('./api/client.js');
    expect(client.api.health).toBeUndefined();
    expect(client.api.streamUrl).toBeUndefined();
    // En cambio sí expone búsqueda sobre el catálogo
    expect(typeof client.api.search).toBe('function');
  });

  it('las pistas del catálogo traen forma completa y source "yt"', async () => {
    const catalogo = await import('./api/catalogo.js');
    const all = catalogo.todos();
    expect(all.length).toBeGreaterThan(0);
    for (const t of all) {
      expect(t.id).toMatch(/^[A-Za-z0-9_-]{11}$/); // ID de video de YouTube
      expect(t.title).toBeTruthy();
      expect(t.artist).toBeTruthy();
      expect(t.source).toBe('yt');
      expect(t.thumb).toContain(t.id);
    }
  });

  it('buscar filtra por título y por artista (sin distinción de mayúsculas)', async () => {
    const catalogo = await import('./api/catalogo.js');
    const r = catalogo.buscar('queen');
    expect(r.songs.length).toBeGreaterThan(0);
    expect(r.songs.every((t) => t.artist.toLowerCase().includes('queen') || t.title.toLowerCase().includes('queen'))).toBe(true);
    // Una búsqueda que no existe no devuelve canciones
    expect(catalogo.buscar('zzz-no-existe-zzz').songs).toEqual([]);
  });

  it('extraerVideoId acepta enlaces y IDs sueltos, y rechaza basura', async () => {
    const { extraerVideoId } = await import('./api/catalogo.js');
    expect(extraerVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extraerVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extraerVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extraerVideoId('no es un video')).toBeNull();
  });

  it('buscar con un enlace de YouTube lo coloca como primer resultado reproducible', async () => {
    const { api } = await import('./api/client.js');
    const res = await api.search('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.songs[0].id).toBe('dQw4w9WgXcQ');
    expect(res.songs[0].source).toBe('yt');
  });

  it('api.search devuelve artistas y álbumes derivados de los resultados', async () => {
    const { api } = await import('./api/client.js');
    const res = await api.search('katy');
    expect(res.songs.length).toBeGreaterThan(0);
    expect(res.artists.length).toBeGreaterThan(0);
    expect(res.albums.length).toBeGreaterThan(0);
  });

  it('la búsqueda cancelada se rechaza con el código "cancelled"', async () => {
    const { api } = await import('./api/client.js');
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(api.search('queen', 'all', 20, ctrl.signal)).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe('Mensajes amigables (sin red)', () => {
  it('traduce los códigos restantes a mensajes en español', async () => {
    const { friendlyError, PlayerError } = await import('./api/client.js');
    expect(friendlyError(new PlayerError('not_found', 'x'))).toBe('No se encontró el contenido');
    expect(friendlyError(new PlayerError('playback', 'x'))).toBe('Error de reproducción');
    expect(friendlyError(new PlayerError('cancelled', 'x'))).toBe('La búsqueda fue cancelada');
    expect(friendlyError(new Error('boom'))).toBe('Error inesperado');
  });
});
