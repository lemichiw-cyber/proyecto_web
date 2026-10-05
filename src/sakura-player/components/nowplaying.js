/* ===================================================================
   Sakura Player — Vista Reproductor (now playing)
   Portada, artista, álbum, progreso, tiempos, shuffle, repeat,
   favoritos, cola, volumen y velocidad.
   =================================================================== */

import { player, REPEAT } from '../player/player.js';
import { library } from '../library/library.js';
import { formatTime } from '../library/local-files.js';
import { icon, escapeHtml, toast, emptyState } from './ui.js';

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export class NowPlayingView {
  constructor(root) {
    this.root = root;
    this.el = null;
    this._dragging = false;
    this._handlers = {};
  }

  render() {
    return '<div id="sp-now"></div>';
  }

  mount() {
    this._unbind();
    this.el = this.root.querySelector('#sp-now');
    if (!this.el) return;

    this._handlers.trackchange = () => this._renderTrack();
    this._handlers.time = (s) => this._renderTime(s);
    this._handlers.play = () => this._renderPlay();
    this._handlers.pause = () => this._renderPlay();
    player.on('trackchange', this._handlers.trackchange);
    player.on('time', this._handlers.time);
    player.on('play', this._handlers.play);
    player.on('pause', this._handlers.pause);

    this._paint(true);
  }

  _unbind() {
    player.off('trackchange', this._handlers.trackchange);
    player.off('time', this._handlers.time);
    player.off('play', this._handlers.play);
    player.off('pause', this._handlers.pause);
    this._handlers = {};
  }

  /* ---------------- pintado completo ---------------- */
  _paint(withControls) {
    const t = player.current();
    if (!t) {
      this.el.innerHTML = emptyState('music', 'Nada sonando todavía', 'Buscá en YouTube Music o cargá un archivo local para empezar.');
      return;
    }

    const s = player.status();
    const fav = library.isFavorite(t.id);
    const repeatIcon = s.repeat === REPEAT.ONE ? 'repeatOne' : 'repeat';

    this.el.innerHTML =
      '<div class="sp-now" style="display:grid;grid-template-columns:200px 1fr;gap:1.3rem;align-items:start;">' +
        '<div class="sp-cover" id="np-cover" style="width:100%;aspect-ratio:1;min-width:0;">' +
          (t.thumb
            ? '<img src="' + t.thumb + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
            : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--player-text-secondary);">' + icon('disc') + '</div>') +
        '</div>' +
        '<div style="min-width:0;">' +
          '<span class="sp-badge">' + (t.source === 'local' ? 'Archivo local' : 'YouTube Music') + '</span>' +
          '<div class="sp-track-title" id="np-title" style="font-size:1.35rem;font-weight:800;line-height:1.2;margin:.45rem 0 .2rem;word-break:break-word;">' + escapeHtml(t.title) + '</div>' +
          '<div id="np-artist" style="font-size:.9rem;color:var(--player-text-secondary);word-break:break-word;">' +
            escapeHtml(t.artist || 'Artista desconocido') + (t.album ? ' · ' + escapeHtml(t.album) : '') + '</div>' +

          '<div class="sp-progress" id="np-progress" style="margin-top:1.1rem;">' +
            '<div class="sp-progress-fill" id="np-fill" style="width:0%;"></div></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--player-text-secondary);margin-top:.35rem;font-variant-numeric:tabular-nums;">' +
            '<span id="np-cur">0:00</span><span id="np-dur">' + formatTime(s.duration || t.duration) + '</span></div>' +

          '<div id="np-controls" style="display:flex;align-items:center;justify-content:center;gap:.5rem;margin-top:.9rem;flex-wrap:wrap;">' +
            '<button class="sp-btn sp-btn-icon' + (s.shuffle ? ' sp-btn-active' : '') + '" id="np-shuffle" title="Shuffle (S)">' + icon('shuffle') + '</button>' +
            '<button class="sp-btn sp-btn-icon" id="np-prev" title="Anterior">' + icon('prev') + '</button>' +
            '<button class="sp-btn sp-btn-primary" id="np-play" title="Reproducir / Pausa (Espacio)" style="width:54px;height:54px;padding:0;border-radius:50%;">' + icon('play') + '</button>' +
            '<button class="sp-btn sp-btn-icon" id="np-next" title="Siguiente">' + icon('next') + '</button>' +
            '<button class="sp-btn sp-btn-icon' + (s.repeat !== REPEAT.OFF ? ' sp-btn-active' : '') + '" id="np-repeat" title="Repetir (R)">' + icon(repeatIcon) + '</button>' +
          '</div>' +

          '<div id="np-secondary" style="display:flex;align-items:center;justify-content:center;gap:.5rem;margin-top:.8rem;flex-wrap:wrap;">' +
            '<button class="sp-btn sp-btn-icon' + (fav ? ' sp-btn-active' : '') + '" id="np-fav" title="Favorito">' + icon(fav ? 'heartFill' : 'heart') + '</button>' +
            '<button class="sp-btn sp-btn-icon" id="np-queue" title="Ver cola">' + icon('queue') + '</button>' +
            '<button class="sp-btn sp-btn-icon" id="np-mute" title="Silencio (M)">' + icon(s.muted ? 'mute' : 'volume') + '</button>' +
            '<input type="range" class="sp-slider" id="np-vol" min="0" max="100" value="' + Math.round(s.volume * 100) + '" style="width:96px;" aria-label="Volumen">' +
            '<button class="sp-btn" id="np-speed" title="Velocidad de reproducción" style="font-variant-numeric:tabular-nums;">' + player.rate.toFixed(2).replace(/0$/, '') + 'x</button>' +
          '</div>' +
          '<div id="np-queuepos" style="text-align:center;font-size:.7rem;color:var(--player-text-secondary);margin-top:.7rem;">' +
            (s.index >= 0 ? 'Pista ' + (s.index + 1) + ' de ' + s.queueLength : '') + '</div>' +
        '</div>' +
      '</div>';

    if (withControls) this._bind();
    this._renderPlay();
    this._renderTime(s);
  }

  _bind() {
    const q = (sel) => this.el.querySelector(sel);

    q('#np-play').addEventListener('click', () => player.toggle());
    q('#np-next').addEventListener('click', () => player.next());
    q('#np-prev').addEventListener('click', () => player.prev());
    q('#np-shuffle').addEventListener('click', (e) => {
      player.toggleShuffle();
      e.currentTarget.classList.toggle('sp-btn-active', player.shuffle);
      toast(player.shuffle ? 'Shuffle activado' : 'Shuffle desactivado', 'success');
    });
    q('#np-repeat').addEventListener('click', (e) => {
      player.cycleRepeat();
      const on = player.repeat !== REPEAT.OFF;
      e.currentTarget.classList.toggle('sp-btn-active', on);
      e.currentTarget.innerHTML = icon(player.repeat === REPEAT.ONE ? 'repeatOne' : 'repeat');
      toast(player.repeat === REPEAT.OFF ? 'Repetir desactivado'
        : player.repeat === REPEAT.ALL ? 'Repetir: toda la cola' : 'Repetir: una canción', 'success');
    });
    q('#np-fav').addEventListener('click', (e) => {
      const t = player.current();
      if (!t) return;
      const added = library.toggleFavorite(t);
      const btn = e.currentTarget;
      btn.classList.toggle('sp-btn-active', added);
      btn.innerHTML = icon(added ? 'heartFill' : 'heart');
      toast(added ? 'Agregada a favoritos' : 'Quitada de favoritos', 'success');
    });
    q('#np-queue').addEventListener('click', () => {
      const btn = this.root.closest('#app-sakura-player')
        ? document.querySelector('#sp-nav [data-view="queue"]') : null;
      if (btn) btn.click();
      else toast('La cola está en la vista Cola', 'info');
    });
    q('#np-mute').addEventListener('click', (e) => {
      player.toggleMute();
      e.currentTarget.innerHTML = icon(player.muted ? 'mute' : 'volume');
    });
    q('#np-vol').addEventListener('input', (e) => {
      player.setVolume(e.target.value / 100);
      const m = q('#np-mute');
      if (m) m.innerHTML = icon(player.muted ? 'mute' : 'volume');
    });
    q('#np-speed').addEventListener('click', (e) => {
      const i = SPEEDS.findIndex((v) => Math.abs(v - player.rate) < 0.01);
      const next = SPEEDS[(i + 1) % SPEEDS.length];
      player.setRate(next);
      e.currentTarget.textContent = String(next).replace(/\.00$/, '.0') + 'x';
      toast('Velocidad ' + next + 'x', 'success');
    });

    // Seek en la barra de progreso
    const bar = q('#np-progress');
    const seek = (e) => {
      const rect = bar.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      player.seekFraction(Math.max(0, Math.min(1, x / rect.width)));
    };
    bar.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      bar.setPointerCapture(e.pointerId);
      seek(e);
    });
    bar.addEventListener('pointermove', (e) => { if (this._dragging) seek(e); });
    bar.addEventListener('pointerup', () => { this._dragging = false; });
  }

  /* ---------------- actualizaciones en vivo ---------------- */
  _renderTrack() { this._paint(true); }

  _renderPlay() {
    if (!this.el) return;
    const btn = this.el.querySelector('#np-play');
    if (btn) btn.innerHTML = icon(player.audio.paused ? 'play' : 'pause');
  }

  _renderTime(s) {
    if (!this.el) return;
    const fill = this.el.querySelector('#np-fill');
    const cur = this.el.querySelector('#np-cur');
    const dur = this.el.querySelector('#np-dur');
    if (!fill) return;
    if (!this._dragging) fill.style.width = (s.duration ? (s.currentTime / s.duration) * 100 : 0) + '%';
    if (cur) cur.textContent = formatTime(s.currentTime);
    if (dur) dur.textContent = formatTime(s.duration);
  }

  destroy() { this._unbind(); }
}
