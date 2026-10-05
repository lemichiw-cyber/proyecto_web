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
      expect(AUTO_MAP[t], t).toBeTruthy();
      expect(CONFIGS[AUTO_MAP[t]], `${t} → ${AUTO_MAP[t]}`).toBeTruthy();
    }
  });
});
