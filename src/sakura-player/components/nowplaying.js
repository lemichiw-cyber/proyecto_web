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
      '<div class="sp-now">' +
        '<div class="sp-cover sp-now-cover" id="np-cover">' +
          (t.thumb
            ? '<img src="' + t.thumb + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
            : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--player-text-secondary);">' + icon('disc') + '</div>') +
        '</div>' +
        '<div class="sp-now-body">' +
          '<span class="sp-badge">' + (t.source === 'local' ? 'Archivo local' : 'YouTube Music') + '</span>' +
          '<div class="sp-track-title sp-now-title" id="np-title">' + escapeHtml(t.title) + '</div>' +
          '<div id="np-artist" class="sp-now-artist">' +
            escapeHtml(t.artist || 'Artista desconocido') + (t.album ? ' · ' + escapeHtml(t.album) : '') + '</div>' +

          '<div class="sp-now-progress">' +
            '<div class="sp-progress" id="np-progress" role="slider" tabindex="0" aria-label="Progreso de la canción" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0:00">' +
              '<div class="sp-progress-fill" id="np-fill" style="width:0%;"></div></div>' +
            '<div class="sp-now-times">' +
              '<span id="np-cur">0:00</span><span id="np-dur">' + formatTime(s.duration || t.duration) + '</span></div>' +
          '</div>' +

          '<div id="np-controls" class="sp-now-controls">' +
            '<button class="sp-btn sp-btn-icon' + (s.shuffle ? ' sp-btn-active' : '') + '" id="np-shuffle" title="Shuffle (S)" aria-label="Aleatorio" aria-pressed="' + !!s.shuffle + '">' + icon('shuffle') + '</button>' +
            '<button class="sp-btn sp-btn-icon" id="np-prev" title="Anterior" aria-label="Canción anterior">' + icon('prev') + '</button>' +
            '<button class="sp-btn sp-btn-primary sp-now-play" id="np-play" title="Reproducir / Pausa (Espacio)" aria-label="Reproducir o pausar">' + icon('play') + '</button>' +
            '<button class="sp-btn sp-btn-icon" id="np-next" title="Siguiente" aria-label="Canción siguiente">' + icon('next') + '</button>' +
            '<button class="sp-btn sp-btn-icon' + (s.repeat !== REPEAT.OFF ? ' sp-btn-active' : '') + '" id="np-repeat" title="Repetir (R)" aria-label="Repetir" aria-pressed="' + (s.repeat !== REPEAT.OFF) + '">' + icon(repeatIcon) + '</button>' +
          '</div>' +

          '<div id="np-secondary" class="sp-now-secondary">' +
            '<button class="sp-btn sp-btn-icon' + (fav ? ' sp-btn-active' : '') + '" id="np-fav" title="Favorito" aria-label="Agregar a favoritos" aria-pressed="' + !!fav + '">' + icon(fav ? 'heartFill' : 'heart') + '</button>' +
            '<button class="sp-btn sp-btn-icon" id="np-queue" title="Ver cola" aria-label="Ver cola de reproducción">' + icon('queue') + '</button>' +
            '<button class="sp-btn sp-btn-icon" id="np-mute" title="Silencio (M)" aria-label="Silenciar">' + icon(s.muted ? 'mute' : 'volume') + '</button>' +
            '<input type="range" class="sp-slider" id="np-vol" min="0" max="100" value="' + Math.round(s.volume * 100) + '" style="width:96px;" aria-label="Volumen">' +
            '<button class="sp-btn" id="np-speed" title="Velocidad de reproducción" aria-label="Velocidad de reproducción" style="font-variant-numeric:tabular-nums;">' + player.rate.toFixed(2).replace(/0$/, '') + 'x</button>' +
          '</div>' +
          '<div id="np-queuepos" class="sp-now-queuepos">' +
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
      e.currentTarget.setAttribute('aria-pressed', String(player.shuffle));
      toast(player.shuffle ? 'Shuffle activado' : 'Shuffle desactivado', 'success');
    });
    q('#np-repeat').addEventListener('click', (e) => {
      player.cycleRepeat();
      const on = player.repeat !== REPEAT.OFF;
      e.currentTarget.classList.toggle('sp-btn-active', on);
      e.currentTarget.setAttribute('aria-pressed', String(on));
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
      btn.setAttribute('aria-pressed', String(added));
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
      e.currentTarget.setAttribute('aria-label', player.muted ? 'Activar sonido' : 'Silenciar');
    });
    q('#np-vol').addEventListener('input', (e) => {
      player.setVolume(e.target.value / 100);
      const m = q('#np-mute');
      if (m) m.innerHTML = icon(player.muted ? 'mute' : 'volume');
    });
    q('#np-speed').addEventListener('click', (e) => {
      // Cicla hacia la preset superior: con un rate custom (p. ej. 1.05)
      // findIndex daba -1 y el botón saltaba a 0.5x
      const i = SPEEDS.findIndex((v) => v > player.rate + 0.01);
      const next = i === -1 ? SPEEDS[0] : SPEEDS[i];
      player.setRate(next);
      e.currentTarget.textContent = Number(next.toFixed(2)) + 'x';
      e.currentTarget.setAttribute('aria-label', 'Velocidad de reproducción: ' + next + 'x');
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
    bar.addEventListener('pointercancel', () => { this._dragging = false; });
    // La barra es un slider accesible: flechas, Inicio y Fin.
    bar.addEventListener('keydown', (e) => {
      const s = player.status();
      if (!s.duration) return;
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = s.currentTime + 5;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = s.currentTime - 5;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = s.duration;
      if (next === null) return;
      e.preventDefault();
      player.seek(Math.max(0, Math.min(s.duration, next)));
    });
  }

  /* ---------------- actualizaciones en vivo ---------------- */
  _renderTrack() { this._paint(true); }

  _renderPlay() {
    if (!this.el) return;
    const btn = this.el.querySelector('#np-play');
    if (btn) btn.innerHTML = icon(player.isPlaying() ? 'pause' : 'play');
  }

  _renderTime(s) {
    if (!this.el) return;
    const fill = this.el.querySelector('#np-fill');
    const cur = this.el.querySelector('#np-cur');
    const dur = this.el.querySelector('#np-dur');
    if (!fill) return;
    const pct = s.duration ? (s.currentTime / s.duration) * 100 : 0;
    if (!this._dragging) fill.style.width = pct + '%';
    if (cur) cur.textContent = formatTime(s.currentTime);
    if (dur) dur.textContent = formatTime(s.duration);
    const bar = this.el.querySelector('#np-progress');
    if (bar) {
      bar.setAttribute('aria-valuenow', String(Math.round(pct)));
      bar.setAttribute('aria-valuetext', formatTime(s.currentTime) + ' de ' + formatTime(s.duration));
    }
  }

  destroy() { this._unbind(); }
}
