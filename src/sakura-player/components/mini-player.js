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
    el.className = 'sakura-player';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:400;display:none;' +
      'background:var(--player-bg-secondary);border-top:1px solid var(--player-border);' +
      'box-shadow:0 -6px 30px rgba(0,0,0,.4);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);' +
      'padding:.55rem .9rem;';
    el.innerHTML =
      '<div class="sp-progress" id="sp-mini-progress" style="position:absolute;top:-3px;left:0;right:0;height:6px;">' +
        '<div class="sp-progress-fill" id="sp-mini-fill" style="width:0%;"></div></div>' +
      '<div style="display:flex;align-items:center;gap:.7rem;max-width:1200px;margin:0 auto;">' +
        '<div id="sp-mini-cover" class="sp-cover" style="width:44px;height:44px;flex:none;"></div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div id="sp-mini-title" style="font-weight:700;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>' +
          '<div id="sp-mini-artist" style="font-size:.72rem;color:var(--player-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.25rem;flex:none;">' +
          '<button class="sp-btn sp-btn-icon" id="sp-mini-prev" title="Anterior">' + icon('prev') + '</button>' +
          '<button class="sp-btn sp-btn-icon" id="sp-mini-play" title="Reproducir/Pausa" style="width:40px;height:40px;">' + icon('play') + '</button>' +
          '<button class="sp-btn sp-btn-icon" id="sp-mini-next" title="Siguiente">' + icon('next') + '</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.4rem;flex:none;font-size:.72rem;color:var(--player-text-secondary);min-width:74px;justify-content:flex-end;">' +
          '<span id="sp-mini-time">0:00 / 0:00</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.2rem;flex:none;">' +
          '<button class="sp-btn sp-btn-icon" id="sp-mini-mute" title="Silencio">' + icon('volume') + '</button>' +
          '<input type="range" class="sp-slider" id="sp-mini-vol" min="0" max="100" value="80" style="width:74px;" aria-label="Volumen">' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    this.el = el;

    this.progressEl = el.querySelector('#sp-mini-progress');
    this.fillEl = el.querySelector('#sp-mini-fill');
    this.timeEl = el.querySelector('#sp-mini-time');

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
    const playing = !player.audio.paused;
    this.el.querySelector('#sp-mini-play').innerHTML = playing ? icon('pause') : icon('play');
  }

  _renderTime(s) {
    if (!this.el) return;
    if (!this._dragging) {
      const pct = s.duration ? (s.currentTime / s.duration) * 100 : 0;
      this.fillEl.style.width = pct + '%';
    }
    this.timeEl.textContent = formatTime(s.currentTime) + ' / ' + formatTime(s.duration);
  }

  setVolumeUI(v, muted) {
    if (!this.el) return;
    this.el.querySelector('#sp-mini-vol').value = Math.round(v * 100);
    this.el.querySelector('#sp-mini-mute').innerHTML = muted ? icon('mute') : icon('volume');
  }
}
