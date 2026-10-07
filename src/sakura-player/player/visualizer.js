/* ===================================================================
   Sakura Player — Visualizador de audio (canvas)
   Adaptativo al tema activo: barras, ondas, partículas, CRT, glitch.
   =================================================================== */

const STYLES = ['bars', 'wave', 'particles', 'crt', 'minimal'];

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = null;
    this.style = 'bars';
    this.intensity = 'medium';
    this.colors = { primary: '#ff4fd8', secondary: '#9b5cff', accent: '#36d9ff' };
    this.particles = [];
    this._raf = null;
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  setAnalyser(analyser) { this.analyser = analyser; }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resize);
  }

  configure({ style, intensity, colors }) {
    if (style && STYLES.includes(style)) this.style = style;
    if (intensity) this.intensity = intensity;
    if (colors) this.colors = Object.assign({}, this.colors, colors);
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(2, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(2, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    if (this._raf) return;
    const loop = () => {
      this._draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  /* Intensidad "none" = menos fotogramas (rendimiento) */
  _shouldDraw() {
    if (this.intensity !== 'none') return true;
    const now = performance.now();
    if (now - (this._lastDraw || 0) < 250) return false; // ~4 fps
    this._lastDraw = now;
    return true;
  }

  _data() {
    if (!this.analyser) return null;
    const n = this.analyser.frequencyBinCount;
    if (!this._buf || this._buf.length !== n) this._buf = new Uint8Array(n);
    this.analyser.getByteFrequencyData(this._buf);
    return this._buf;
  }

  _draw() {
    if (!this._shouldDraw()) return;
    const { ctx, canvas } = this;
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, w, h);
    const data = this._data();
    const playing = data ? data.some((v) => v > 0) : false;

    switch (this.style) {
      case 'wave': this._wave(ctx, w, h, data, playing); break;
      case 'particles': this._particles(ctx, w, h, data, playing); break;
      case 'crt': this._crt(ctx, w, h, data, playing); break;
      case 'minimal': this._minimal(ctx, w, h, data, playing); break;
      default: this._bars(ctx, w, h, data, playing);
    }
  }

  _bars(ctx, w, h, data, playing) {
    const bars = 48;
    const gap = 2;
    const bw = (w - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      const v = data ? data[Math.floor((i / bars) * data.length * 0.7)] / 255 : 0;
      const bh = playing ? Math.max(2, v * h * 0.95) : 2;
      const x = i * (bw + gap);
      const g = ctx.createLinearGradient(0, h, 0, h - bh);
      g.addColorStop(0, this.colors.primary);
      g.addColorStop(1, this.colors.accent);
      ctx.fillStyle = g;
      ctx.globalAlpha = this.intensity === 'high' ? 0.95 : (this.intensity === 'none' ? 0.7 : 0.8);
      ctx.fillRect(x, h - bh, bw, bh);
    }
    ctx.globalAlpha = 1;
  }

  _wave(ctx, w, h, data, playing) {
    if (!data) return;
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.colors.accent;
    ctx.shadowColor = this.colors.primary;
    ctx.shadowBlur = this.intensity === 'high' ? 18 : (this.intensity === 'none' ? 0 : 8);
    ctx.beginPath();
    const step = Math.max(1, Math.floor(data.length / 120));
    let first = true;
    for (let i = 0; i < data.length; i += step) {
      const v = data[i] / 255;
      const x = (i / data.length) * w;
      const y = h / 2 + (v - 0.3) * h * (playing ? 1 : 0.1);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  _particles(ctx, w, h, data, playing) {
    const level = data ? data[Math.floor(data.length * 0.15)] / 255 : 0;
    if (this.intensity !== 'none' && playing && this.particles.length < 90 && Math.random() < 0.4) {
      this.particles.push({
        x: Math.random() * w, y: h + 6,
        vx: (Math.random() - 0.5) * 0.6, vy: -(0.6 + Math.random() * 1.6 + level * 2),
        r: 1 + Math.random() * 2.4, life: 1,
        color: Math.random() < 0.5 ? this.colors.primary : this.colors.accent,
      });
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.008;
      ctx.globalAlpha = Math.max(0, p.life) * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _crt(ctx, w, h, data, playing) {
    // Estilo terminal/retro: barras verdes con scanlines
    const bars = 32;
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const v = data ? data[Math.floor((i / bars) * data.length * 0.7)] / 255 : 0;
      const bh = playing ? Math.max(2, v * h) : 2;
      ctx.fillStyle = i % 2 ? '#33ff66' : '#ffb000';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    }
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.globalAlpha = 1;
  }

  _minimal(ctx, w, h, data, playing) {
    const v = data ? data[Math.floor(data.length * 0.2)] / 255 : 0;
    const r = (playing ? 12 + v * 40 : 12);
    const cx = w / 2, cy = h / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, this.colors.primary);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
