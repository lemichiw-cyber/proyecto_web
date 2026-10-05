/* ===================================================================
   Sakura Player — Gestor de temas
   Detecta el tema activo de proyecto_web (data-theme en <html>) y
   aplica los tokens del reproductor. Soporta modo automático o manual.
   =================================================================== */

const CONFIGS = {
  sakura: {
    label: 'Sakura',
    tokens: {
      '--player-bg': '#0b0512', '--player-bg-secondary': '#160a20',
      '--player-bg-card': 'rgba(255,183,222,.07)', '--player-text': '#ffe9f6',
      '--player-text-secondary': '#d8a8cc', '--player-primary': '#ff4fd8',
      '--player-secondary': '#9b5cff', '--player-accent': '#ff8ad8',
      '--player-accent-hover': '#ffb7e6', '--player-border': 'rgba(255,79,216,.3)',
      '--player-border-glow': 'rgba(255,79,216,.6)', '--player-shadow': '0 8px 30px rgba(255,79,216,.28)',
      '--player-progress': '#ff4fd8', '--player-progress-bg': 'rgba(255,255,255,.1)',
      '--player-slider': '#ff4fd8', '--player-slider-bg': 'rgba(255,255,255,.14)',
      '--player-equalizer': '#ff4fd8', '--player-visualizer': '#ff4fd8',
    },
    intensity: 'medium', visualizer: 'bars',
    effects: { glow: 1, scanlines: false, glitch: false, crt: false, hud: false, petals: true },
  },
  cyberpunk: {
    label: 'Cyberpunk',
    tokens: {
      '--player-bg': '#04070d', '--player-bg-secondary': '#081020',
      '--player-bg-card': 'rgba(0,234,255,.06)', '--player-text': '#d8f6ff',
      '--player-text-secondary': '#7fa8c8', '--player-primary': '#00eaff',
      '--player-secondary': '#ff00d4', '--player-accent': '#8a7cff',
      '--player-accent-hover': '#00ffd0', '--player-border': 'rgba(0,234,255,.35)',
      '--player-border-glow': 'rgba(0,234,255,.7)', '--player-shadow': '0 0 24px rgba(0,234,255,.3)',
      '--player-progress': '#00eaff', '--player-progress-bg': 'rgba(0,234,255,.12)',
      '--player-slider': '#00eaff', '--player-slider-bg': 'rgba(0,234,255,.16)',
      '--player-equalizer': '#00eaff', '--player-visualizer': '#00eaff',
    },
    intensity: 'high', visualizer: 'bars',
    effects: { glow: 1.4, scanlines: false, glitch: true, crt: false, hud: true, petals: false },
  },
  neon: {
    label: 'Neon',
    tokens: {
      '--player-bg': '#050509', '--player-bg-secondary': '#0d0d18',
      '--player-bg-card': 'rgba(54,217,255,.07)', '--player-text': '#eafcff',
      '--player-text-secondary': '#9fc8d8', '--player-primary': '#36d9ff',
      '--player-secondary': '#ff4fd8', '--player-accent': '#b6ff00',
      '--player-accent-hover': '#7dffce', '--player-border': 'rgba(54,217,255,.4)',
      '--player-border-glow': 'rgba(54,217,255,.8)', '--player-shadow': '0 0 28px rgba(54,217,255,.35)',
      '--player-progress': '#36d9ff', '--player-progress-bg': 'rgba(255,255,255,.1)',
      '--player-slider': '#36d9ff', '--player-slider-bg': 'rgba(255,255,255,.14)',
      '--player-equalizer': '#36d9ff', '--player-visualizer': '#36d9ff',
    },
    intensity: 'high', visualizer: 'wave',
    effects: { glow: 1.6, scanlines: false, glitch: false, crt: false, hud: false, petals: false },
  },
  ocean: {
    label: 'Ocean',
    tokens: {
      '--player-bg': '#04121c', '--player-bg-secondary': '#07202f',
      '--player-bg-card': 'rgba(56,189,248,.07)', '--player-text': '#e0f4ff',
      '--player-text-secondary': '#8fc0d8', '--player-primary': '#38bdf8',
      '--player-secondary': '#2dd4bf', '--player-accent': '#7dd3fc',
      '--player-accent-hover': '#5eead4', '--player-border': 'rgba(56,189,248,.3)',
      '--player-border-glow': 'rgba(56,189,248,.55)', '--player-shadow': '0 8px 28px rgba(56,189,248,.22)',
      '--player-progress': '#38bdf8', '--player-progress-bg': 'rgba(255,255,255,.1)',
      '--player-slider': '#38bdf8', '--player-slider-bg': 'rgba(255,255,255,.14)',
      '--player-equalizer': '#38bdf8', '--player-visualizer': '#38bdf8',
    },
    intensity: 'medium', visualizer: 'wave',
    effects: { glow: 0.9, scanlines: false, glitch: false, crt: false, hud: false, petals: false },
  },
  forest: {
    label: 'Forest',
    tokens: {
      '--player-bg': '#04120c', '--player-bg-secondary': '#072015',
      '--player-bg-card': 'rgba(74,222,128,.07)', '--player-text': '#e6ffef',
      '--player-text-secondary': '#93c8a8', '--player-primary': '#4ade80',
      '--player-secondary': '#2dd4bf', '--player-accent': '#a3e635',
      '--player-accent-hover': '#6ee7b7', '--player-border': 'rgba(74,222,128,.28)',
      '--player-border-glow': 'rgba(74,222,128,.5)', '--player-shadow': '0 8px 26px rgba(74,222,128,.2)',
      '--player-progress': '#4ade80', '--player-progress-bg': 'rgba(255,255,255,.1)',
      '--player-slider': '#4ade80', '--player-slider-bg': 'rgba(255,255,255,.14)',
      '--player-equalizer': '#4ade80', '--player-visualizer': '#4ade80',
    },
    intensity: 'low', visualizer: 'particles',
    effects: { glow: 0.5, scanlines: false, glitch: false, crt: false, hud: false, petals: false },
  },
  sunset: {
    label: 'Sunset',
    tokens: {
      '--player-bg': '#160608', '--player-bg-secondary': '#220a0e',
      '--player-bg-card': 'rgba(251,146,60,.08)', '--player-text': '#ffeede',
      '--player-text-secondary': '#d8a88f', '--player-primary': '#fb923c',
      '--player-secondary': '#f43f5e', '--player-accent': '#fbbf24',
      '--player-accent-hover': '#fda4af', '--player-border': 'rgba(251,146,60,.32)',
      '--player-border-glow': 'rgba(251,146,60,.6)', '--player-shadow': '0 8px 28px rgba(244,63,94,.25)',
      '--player-progress': '#fb923c', '--player-progress-bg': 'rgba(255,255,255,.1)',
      '--player-slider': '#fb923c', '--player-slider-bg': 'rgba(255,255,255,.14)',
      '--player-equalizer': '#fb923c', '--player-visualizer': '#fb923c',
    },
    intensity: 'medium', visualizer: 'wave',
    effects: { glow: 1, scanlines: false, glitch: false, crt: false, hud: false, petals: false },
  },
  midnight: {
    label: 'Midnight',
    tokens: {
      '--player-bg': '#07060f', '--player-bg-secondary': '#0d0b1e',
      '--player-bg-card': 'rgba(139,92,246,.08)', '--player-text': '#e6e4ff',
      '--player-text-secondary': '#a8a0d0', '--player-primary': '#8b5cf6',
      '--player-secondary': '#3b82f6', '--player-accent': '#60a5fa',
      '--player-accent-hover': '#a78bfa', '--player-border': 'rgba(139,92,246,.32)',
      '--player-border-glow': 'rgba(139,92,246,.6)', '--player-shadow': '0 8px 28px rgba(139,92,246,.25)',
      '--player-progress': '#8b5cf6', '--player-progress-bg': 'rgba(255,255,255,.1)',
      '--player-slider': '#8b5cf6', '--player-slider-bg': 'rgba(255,255,255,.14)',
      '--player-equalizer': '#8b5cf6', '--player-visualizer': '#8b5cf6',
    },
    intensity: 'low', visualizer: 'minimal',
    effects: { glow: 0.8, scanlines: false, glitch: false, crt: false, hud: false, petals: false },
  },
  lavender: {
    label: 'Lavender',
    tokens: {
      '--player-bg': '#120a1c', '--player-bg-secondary': '#1b1029',
      '--player-bg-card': 'rgba(196,181,253,.08)', '--player-text': '#f3edff',
      '--player-text-secondary': '#c0b4e0', '--player-primary': '#c4b5fd',
      '--player-secondary': '#f0abfc', '--player-accent': '#f9a8d4',
      '--player-accent-hover': '#ddd6fe', '--player-border': 'rgba(196,181,253,.3)',
      '--player-border-glow': 'rgba(196,181,253,.55)', '--player-shadow': '0 8px 26px rgba(196,181,253,.22)',
      '--player-progress': '#c4b5fd', '--player-progress-bg': 'rgba(255,255,255,.12)',
      '--player-slider': '#c4b5fd', '--player-slider-bg': 'rgba(255,255,255,.16)',
      '--player-equalizer': '#c4b5fd', '--player-visualizer': '#c4b5fd',
    },
    intensity: 'low', visualizer: 'minimal',
    effects: { glow: 0.7, scanlines: false, glitch: false, crt: false, hud: false, petals: false },
  },
  crimson: {
    label: 'Crimson',
    tokens: {
      '--player-bg': '#0e0508', '--player-bg-secondary': '#180a0e',
      '--player-bg-card': 'rgba(248,113,113,.07)', '--player-text': '#ffe9ea',
      '--player-text-secondary': '#d8a0a4', '--player-primary': '#ef4444',
      '--player-secondary': '#b91c1c', '--player-accent': '#f87171',
      '--player-accent-hover': '#fca5a5', '--player-border': 'rgba(239,68,68,.32)',
      '--player-border-glow': 'rgba(239,68,68,.6)', '--player-shadow': '0 8px 28px rgba(239,68,68,.25)',
      '--player-progress': '#ef4444', '--player-progress-bg': 'rgba(255,255,255,.1)',
      '--player-slider': '#ef4444', '--player-slider-bg': 'rgba(255,255,255,.14)',
      '--player-equalizer': '#ef4444', '--player-visualizer': '#ef4444',
    },
    intensity: 'medium', visualizer: 'bars',
    effects: { glow: 1.1, scanlines: false, glitch: false, crt: false, hud: false, petals: false },
  },
  arctic: {
    label: 'Arctic',
    tokens: {
      '--player-bg': '#f4f8fb', '--player-bg-secondary': '#e6eef5',
      '--player-bg-card': '#ffffff', '--player-text': '#0f2233',
      '--player-text-secondary': '#4d6a84', '--player-primary': '#0ea5e9',
      '--player-secondary': '#22d3ee', '--player-accent': '#0369a1',
      '--player-accent-hover': '#0284c7', '--player-border': 'rgba(14,165,233,.25)',
      '--player-border-glow': 'rgba(14,165,233,.45)', '--player-shadow': '0 8px 24px rgba(14,165,233,.18)',
      '--player-progress': '#0ea5e9', '--player-progress-bg': 'rgba(15,34,51,.1)',
      '--player-slider': '#0ea5e9', '--player-slider-bg': 'rgba(15,34,51,.12)',
      '--player-equalizer': '#0ea5e9', '--player-visualizer': '#0ea5e9',
      // Estados sobre fondo claro (AA ≥4.5)
      '--player-success': '#15803d', '--player-warning': '#b45309', '--player-error': '#b91c1c',
    },
    intensity: 'low', visualizer: 'bars',
    effects: { glow: 0.4, scanlines: false, glitch: false, crt: false, hud: false, petals: false },
  },
  retro: {
    label: 'Retro',
    tokens: {
      '--player-bg': '#050807', '--player-bg-secondary': '#0a120d',
      '--player-bg-card': 'rgba(51,255,102,.06)', '--player-text': '#d8ffe0',
      '--player-text-secondary': '#8fc8a0', '--player-primary': '#33ff66',
      '--player-secondary': '#ffb000', '--player-accent': '#7dff9a',
      '--player-accent-hover': '#ffd24d', '--player-border': 'rgba(51,255,102,.3)',
      '--player-border-glow': 'rgba(51,255,102,.55)', '--player-shadow': '0 0 22px rgba(51,255,102,.22)',
      '--player-progress': '#33ff66', '--player-progress-bg': 'rgba(255,255,255,.08)',
      '--player-slider': '#33ff66', '--player-slider-bg': 'rgba(255,255,255,.12)',
      '--player-equalizer': '#33ff66', '--player-visualizer': '#33ff66',
    },
    intensity: 'low', visualizer: 'crt',
    effects: { glow: 0.8, scanlines: true, glitch: false, crt: true, hud: false, petals: false },
  },
  'sakura-dark': {
    label: 'Sakura Dark',
    tokens: {
      '--player-bg': '#0a0410', '--player-bg-secondary': '#140a20',
      '--player-bg-card': 'rgba(255,79,216,.07)', '--player-text': '#ffe4f4',
      '--player-text-secondary': '#c8a0c8', '--player-primary': '#ff2fb3',
      '--player-secondary': '#7c3aed', '--player-accent': '#36d9ff',
      '--player-accent-hover': '#ff8ad8', '--player-border': 'rgba(255,47,179,.35)',
      '--player-border-glow': 'rgba(255,47,179,.65)', '--player-shadow': '0 0 26px rgba(255,47,179,.3)',
      '--player-progress': '#ff2fb3', '--player-progress-bg': 'rgba(255,255,255,.1)',
      '--player-slider': '#ff2fb3', '--player-slider-bg': 'rgba(255,255,255,.14)',
      '--player-equalizer': '#ff2fb3', '--player-visualizer': '#ff2fb3',
    },
    intensity: 'high', visualizer: 'bars',
    effects: { glow: 1.3, scanlines: false, glitch: true, crt: false, hud: false, petals: true },
  },
};

/* Mapa automático: tema de proyecto_web -> configuración del reproductor */
const AUTO_MAP = {
  light: 'arctic',
  dark: 'cyberpunk',
  pastel: 'lavender',
  sunset: 'sunset',
  dawn: 'forest',
  ocean: 'ocean',
  mlp: 'lavender',
  chicawa: 'sakura',
  sakura: 'sakura-dark',
  paraiso: 'midnight',
  frutiger: 'neon',
  dreamcore: 'lavender',
  'sakura-player': 'sakura',
};

/* Tokens base que toda configuración hereda si no los define */
const BASE_TOKENS = {
  '--player-success': '#4ade80',
  '--player-warning': '#fbbf24',
  '--player-error': '#fb7185',
};

/* Clases .sp-theme-<nombre>: respaldo CSS del tema elegido */
const THEME_CLASSES = Object.keys(CONFIGS).map((n) => 'sp-theme-' + n);

const FX_CLASS = {
  scanlines: 'sp-fx-scanlines',
  glitch: 'sp-fx-glitch',
  crt: 'sp-fx-crt',
  hud: 'sp-fx-hud',
  petals: 'sp-fx-petals',
};

class PlayerThemeManager {
  constructor() {
    this.root = null; // elemento .sakura-player
    this.mode = 'auto'; // 'auto' | 'manual'
    this.manualTheme = 'sakura';
    this.current = null;
    this._observer = null;
    this._listeners = [];
    this._load();
  }

  _load() {
    try {
      this.mode = localStorage.getItem('sp_theme_mode') || 'auto';
      this.manualTheme = localStorage.getItem('sp_theme') || 'sakura';
    } catch (e) { /* sin storage */ }
  }

  _save() {
    try {
      localStorage.setItem('sp_theme_mode', this.mode);
      localStorage.setItem('sp_theme', this.manualTheme);
    } catch (e) { /* sin storage */ }
  }

  onThemeChange(fn) { this._listeners.push(fn); }

  appTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  resolveConfig() {
    if (this.mode === 'manual' && CONFIGS[this.manualTheme]) return this.manualTheme;
    return AUTO_MAP[this.appTheme()] || 'sakura';
  }

  /* Pinta tokens y clase de tema en un elemento .sakura-player.
     Se usa para la raíz y para la barra inferior (mini reproductor),
     que se monta en <body> y por eso no hereda de la raíz. */
  _paint(el, name, tokens) {
    Object.entries(tokens).forEach(([k, v]) => el.style.setProperty(k, v));
    el.classList.remove(...THEME_CLASSES);
    el.classList.add('sp-theme-' + name);
    el.classList.toggle('sp-anim-off', this.animationsEnabled() === 'off');
  }

  /* Aplica los tokens al elemento raíz del reproductor */
  apply(root) {
    this.root = root;
    const name = this.resolveConfig();
    const cfg = CONFIGS[name] || CONFIGS.sakura;
    this.current = { name, cfg };

    // Tokens (base + específicos del tema)
    const tokens = Object.assign({}, BASE_TOKENS, cfg.tokens);

    // Raíz + todo .sakura-player que viva fuera de ella (mini reproductor):
    // así el modo manual también llega a la barra inferior, que no hereda
    // de la raíz porque se monta en <body>.
    const enApp = Array.from(document.querySelectorAll('.sakura-player'));
    if (!root.classList.contains('sakura-player')) enApp.push(root);
    enApp.forEach((el) => this._paint(el, name, tokens));

    // <html> para que toasts, diálogos y cualquier nodo en <body>
    // (fuera de la raíz) también hereden los tokens.
    Object.entries(tokens).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));

    // Efectos
    Object.entries(FX_CLASS).forEach(([fx, cls]) => {
      root.classList.toggle(cls, !!cfg.effects[fx]);
    });

    // Intensidad de animación global
    const anim = this.animationsEnabled();
    root.classList.toggle('sp-anim-off', anim === 'off');

    // Visualizador
    root.dispatchEvent(new CustomEvent('sp:theme', {
      detail: {
        name, label: cfg.label,
        intensity: anim === 'off' ? 'none' : cfg.intensity,
        visualizer: cfg.visualizer,
        colors: {
          primary: cfg.tokens['--player-primary'],
          secondary: cfg.tokens['--player-secondary'],
          accent: cfg.tokens['--player-accent'],
        },
      },
    }));

    this._listeners.forEach((fn) => fn(this.current));
    return this.current;
  }

  /* Observa cambios de tema de proyecto_web (sin recargar) */
  watch() {
    if (this._observer) return;
    const el = document.documentElement;
    this._observer = new MutationObserver(() => {
      if (this.root) this.apply(this.root);
    });
    this._observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
  }

  setMode(mode) {
    this.mode = mode === 'manual' ? 'manual' : 'auto';
    this._save();
    if (this.root) this.apply(this.root);
  }

  setManualTheme(name) {
    if (!CONFIGS[name]) return;
    this.manualTheme = name;
    this._save();
    if (this.root) this.apply(this.root);
  }

  animationsEnabled() {
    try { return localStorage.getItem('sp_animations') || 'on'; } catch (e) { return 'on'; }
  }

  setAnimationsEnabled(value) {
    try { localStorage.setItem('sp_animations', value); } catch (e) { /* sin storage */ }
    if (this.root) this.apply(this.root);
  }

  listThemes() {
    return Object.entries(CONFIGS).map(([id, c]) => ({ id, label: c.label }));
  }
}

export const themeManager = new PlayerThemeManager();
export { CONFIGS, AUTO_MAP, BASE_TOKENS, CONFIGS as PLAYER_THEME_CONFIGS, AUTO_MAP as PLAYER_AUTO_MAP };
