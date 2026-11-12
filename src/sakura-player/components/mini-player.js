/* ===================================================================
   Sakura Player — Mini reproductor (barra inferior permanente)
   Portada, título, artista, controles, progreso y volumen.
   =================================================================== */

import { player } from '../player/player.js';
import { formatTime } from '../library/local-files.js';
import { icon, toast } from './ui.js';

export class MiniPlayer {
  constructor() {
    this.el = null;
    this.progressEl = null;
    this.fillEl = null;
    this.timeEl = null;
    this._dragging = false;
  }

  mount() {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = 'sp-mini-player';
    el.className = 'sakura-player sp-mini';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Mini reproductor');
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:400;display:none;' +
      'background:var(--player-bg-secondary);border-top:1px solid var(--player-border);' +
      'box-shadow:0 -6px 30px rgba(0,0,0,.4);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);';
    el.innerHTML =
      '<div class="sp-mini-inner">' +
        /* Zona izquierda: portada + metadatos (abre la vista Reproductor) */
        '<div class="sp-mini-left" id="sp-mini-left" role="button" tabindex="0" ' +
          'title="Abrir el reproductor" aria-label="Abrir la vista del reproductor">' +
          '<div id="sp-mini-cover" class="sp-cover sp-mini-cover"></div>' +
          '<div class="sp-mini-meta">' +
            '<div id="sp-mini-title" class="sp-mini-title"></div>' +
            '<div id="sp-mini-artist" class="sp-mini-artist"></div>' +
          '</div>' +
        '</div>' +
        /* Zona central: controles + barra de progreso con tiempos */
        '<div class="sp-mini-center">' +
          '<div class="sp-mini-controls">' +
            '<button class="sp-btn sp-btn-icon" id="sp-mini-prev" title="Anterior" aria-label="Canción anterior">' + icon('prev') + '</button>' +
            '<button class="sp-btn sp-btn-icon sp-mini-play" id="sp-mini-play" title="Reproducir/Pausa" aria-label="Reproducir o pausar">' + icon('play') + '</button>' +
            '<button class="sp-btn sp-btn-icon" id="sp-mini-next" title="Siguiente" aria-label="Canción siguiente">' + icon('next') + '</button>' +
          '</div>' +
          '<div class="sp-mini-seek">' +
            '<span class="sp-mini-time" id="sp-mini-time-cur">0:00</span>' +
            '<div class="sp-progress sp-mini-progress" id="sp-mini-progress" role="slider" tabindex="0" ' +
              'aria-label="Progreso de la canción" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
              '<div class="sp-progress-fill" id="sp-mini-fill" style="width:0%;"></div></div>' +
            '<span class="sp-mini-time" id="sp-mini-time">0:00</span>' +
          '</div>' +
        '</div>' +
        /* Zona derecha: cola, silencio y volumen */
        '<div class="sp-mini-right">' +
          '<button class="sp-btn sp-btn-icon" id="sp-mini-queue" title="Cola" aria-label="Ver la cola">' + icon('queue') + '</button>' +
          '<button class="sp-btn sp-btn-icon" id="sp-mini-mute" title="Silencio" aria-label="Silenciar">' + icon('volume') + '</button>' +
          '<input type="range" class="sp-slider sp-mini-vol" id="sp-mini-vol" min="0" max="100" value="80" aria-label="Volumen">' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    this.el = el;

    this.progressEl = el.querySelector('#sp-mini-progress');
    this.fillEl = el.querySelector('#sp-mini-fill');
    this.timeEl = el.querySelector('#sp-mini-time');
    this.curEl = el.querySelector('#sp-mini-time-cur');

    const abrirReproductor = () => {
      const sp = window.getSakuraPlayer ? window.getSakuraPlayer() : null;
      if (sp) sp.go('player');
    };
    const left = el.querySelector('#sp-mini-left');
    left.addEventListener('click', abrirReproductor);
    left.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirReproductor(); }
    });
    el.querySelector('#sp-mini-queue').addEventListener('click', () => {
      const sp = window.getSakuraPlayer ? window.getSakuraPlayer() : null;
      if (sp) sp.go('queue');
    });

    el.querySelector('#sp-mini-play').addEventListener('click', () => player.toggle());
    el.querySelector('#sp-mini-next').addEventListener('click', () => player.next());
    el.querySelector('#sp-mini-prev').addEventListener('click', () => player.prev());
    el.querySelector('#sp-mini-mute').addEventListener('click', () => player.toggleMute());
    el.querySelector('#sp-mini-vol').addEventListener('input', (e) => player.setVolume(e.target.value / 100));

    // Seek arrastrando la barra
    const seek = (e) => {
      const rect = this.progressEl.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      player.seekFraction(Math.max(0, Math.min(1, x / rect.width)));
    };
    this.progressEl.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      this.progressEl.setPointerCapture(e.pointerId);
      seek(e);
    });
    this.progressEl.addEventListener('pointermove', (e) => { if (this._dragging) seek(e); });
    this.progressEl.addEventListener('pointerup', () => { this._dragging = false; });
    this.progressEl.addEventListener('pointercancel', () => { this._dragging = false; });
    // Barra de progreso enfocable: flechas para adelantar/retroceder
    this.progressEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); player.seek(player.currentTime() + 5); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); player.seek(player.currentTime() - 5); }
    });

    player.on('trackchange', () => this._renderTrack());
    player.on('time', (s) => this._renderTime(s));
    player.on('play', () => this._renderPlay());
    player.on('pause', () => this._renderPlay());
    player.on('error', (e) => toast(e.message || 'Error de reproducción', 'error'));

    this._renderTrack();
    this._renderPlay();
    this._renderTime(player.status());
  }

  _renderTrack() {
    if (!this.el) return;
    const t = player.current();
    this.el.style.display = t ? 'block' : 'none';
    // El mini reproductor es fijo: deja espacio para que no tape el final
    // de la página ni el pie en móvil.
    if (typeof document !== 'undefined') document.body.classList.toggle('sp-mini-open', !!t);
    if (!t) return;
    const cover = this.el.querySelector('#sp-mini-cover');
    cover.innerHTML = t.thumb
      ? '<img src="' + t.thumb + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
      : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--player-text-secondary);">' + icon('note') + '</div>';
    this.el.querySelector('#sp-mini-title').textContent = t.title;
    this.el.querySelector('#sp-mini-artist').textContent = t.artist || '';
  }

  _renderPlay() {
    if (!this.el) return;
    const playing = player.isPlaying();
    const btn = this.el.querySelector('#sp-mini-play');
    btn.innerHTML = playing ? icon('pause') : icon('play');
    btn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  }

  _renderTime(s) {
    if (!this.el) return;
    if (!this._dragging) {
      const pct = s.duration ? (s.currentTime / s.duration) * 100 : 0;
      this.fillEl.style.width = pct + '%';
      this.progressEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
    const cur = formatTime(s.currentTime);
    if (this.curEl) this.curEl.textContent = cur;
    this.timeEl.textContent = formatTime(s.duration);
    // Compatibilidad: el elemento sigue exponiendo ambos tiempos
    this.timeEl.setAttribute('aria-label', 'Duración ' + formatTime(s.duration));
  }

  setVolumeUI(v, muted) {
    if (!this.el) return;
    this.el.querySelector('#sp-mini-vol').value = Math.round(v * 100);
    const mute = this.el.querySelector('#sp-mini-mute');
    mute.innerHTML = muted ? icon('mute') : icon('volume');
    mute.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
  }
}
