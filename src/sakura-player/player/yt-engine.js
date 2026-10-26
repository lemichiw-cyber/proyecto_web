/* ===================================================================
   Sakura Player — Motor de reproducción por YouTube IFrame API

   Envuelve el reproductor oficial de YouTube (iframe) detrás de una
   interfaz mínima que el Player entiende: play/pause/seek/volumen y
   eventos (time, play, pause, ended, ready, error).

   IMPORTANTE: el audio de un iframe de YouTube NO se puede enrutar por
   Web Audio (es de origen cruzado). Por eso este motor es independiente
   del grafo de ecualizador/visualizador: cuando se reproduce una pista
   de YouTube, el Player desactiva el grafo y el visualizador muestra su
   estado de reposo.

   El script de la API se carga una sola vez, de forma perezosa, al
   primer uso.
   =================================================================== */

/* Referencia global a la función de callback que llama YouTube cuando
   termina de cargar el script. Se guarda y se restaura para no pisar a
   otros consumidores. */
let _prevOnYouTubeIframeAPIReady = null;
let _apiPromise = null;

/** Carga el script de la YouTube IFrame API (una sola vez). */
function loadApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('sin ventana'));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (_apiPromise) return _apiPromise;

  _apiPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout api')), 20000);
    _prevOnYouTubeIframeAPIReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      // restaura el handler previo (si lo había)
      if (typeof _prevOnYouTubeIframeAPIReady === 'function') {
        try { _prevOnYouTubeIframeAPIReady(); } catch (e) { /* noop */ }
      }
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { clearTimeout(timeout); reject(new Error('no se pudo cargar la API de YouTube')); };
    document.head.appendChild(s);
  });
  return _apiPromise;
}

/* Estados de reproducción de la IFrame API. */
const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

export class YTEngine {
  /**
   * @param {Object} cb  callbacks: {onTime, onPlay, onPause, onEnded, onReady, onLoading, onError}
   */
  constructor(cb = {}) {
    this.cb = cb;
    this._player = null;
    this._ready = false;
    this._id = null;          // videoId actual
    this._duration = 0;
    this._wantPlay = false;   // reproducción deseada (para autoplay tras cue)
    this._poll = null;        // timer de progreso
    this._pending = null;     // {videoId, autoplay} pendiente de crear/crear-reproducir
  }

  get available() { return this._ready && !!this._player; }

  /** Crea (o reutiliza) el iframe oculto y reproduce un videoId. */
  load(videoId, { autoplay = true } = {}) {
    this._id = videoId;
    this._wantPlay = autoplay;
    loadApi().then((YT) => this._ensure(YT)).catch((err) => {
      if (this.cb.onError) this.cb.onError(err);
    });
  }

  _ensure(YT) {
    if (this._player) { this._cueAndPlay(); return; }
    // Contenedor oculto pero presente (un iframe 0x0 puede no iniciar audio).
    let host = document.getElementById('sp-yt-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sp-yt-host';
      host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
      document.body.appendChild(host);
    }
    this._player = new YT.Player(host, {
      videoId: this._id,
      playerVars: {
        autoplay: this._wantPlay ? 1 : 0,
        controls: 0,           // el control lo aporta la UI de Sakura Player
        disablekb: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
      },
      events: {
        onReady: (e) => {
          this._ready = true;
          try { this._duration = e.target.getDuration() || 0; } catch (err) { /* noop */ }
          if (this.cb.onReady) this.cb.onReady();
          this._cueAndPlay();
        },
        onStateChange: (e) => this._onState(e),
        onError: () => { if (this.cb.onError) this.cb.onError(new Error('Video no disponible')); },
      },
    });
  }

  _cueAndPlay() {
    if (!this._player) return;
    try {
      if (this._wantPlay) this._player.playVideo();
      else this._player.cueVideoById(this._id);
    } catch (e) { /* noop */ }
    this._syncDuration();
  }

  _onState(e) {
    const st = e.data;
    if (st === STATE.PLAYING) {
      this._syncDuration();
      this._startPoll();
      if (this.cb.onPlay) this.cb.onPlay();
      if (this.cb.onLoading) this.cb.onLoading(false);
    } else if (st === STATE.PAUSED) {
      this._stopPoll();
      this._emitTime();
      if (this.cb.onPause) this.cb.onPause();
    } else if (st === STATE.ENDED) {
      this._stopPoll();
      this._emitTime();
      if (this.cb.onEnded) this.cb.onEnded();
    } else if (st === STATE.BUFFERING) {
      if (this.cb.onLoading) this.cb.onLoading(true);
    } else if (st === STATE.CUED) {
      this._emitTime();
    }
  }

  _syncDuration() {
    if (!this._player) return;
    try { this._duration = this._player.getDuration() || 0; } catch (e) { /* noop */ }
  }

  _emitTime() {
    if (!this.cb.onTime) return;
    let cur = 0;
    try { cur = this._player ? this._player.getCurrentTime() || 0 : 0; } catch (e) { /* noop */ }
    this.cb.onTime({ currentTime: cur, duration: this._duration });
  }

  _startPoll() {
    this._stopPoll();
    this._poll = setInterval(() => this._emitTime(), 500);
  }

  _stopPoll() {
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
  }

  /* ---------------- interfaz de control ---------------- */
  play() {
    if (!this._player) { this._wantPlay = true; return; }
    try { this._player.playVideo(); } catch (e) { /* noop */ }
  }

  pause() {
    if (!this._player) { this._wantPlay = false; return; }
    try { this._player.pauseVideo(); } catch (e) { /* noop */ }
  }

  seek(seconds) {
    if (!this._player) return;
    try { this._player.seekTo(Math.max(0, seconds), true); } catch (e) { /* noop */ }
  }

  /** Volumen 0..1 (la API usa 0..100). */
  setVolume(v) {
    if (!this._player) return;
    try { this._player.setVolume(Math.round(Math.max(0, Math.min(1, v)) * 100)); } catch (e) { /* noop */ }
  }

  mute() { if (this._player) { try { this._player.mute(); } catch (e) { /* noop */ } } }
  unMute() { if (this._player) { try { this._player.unMute(); } catch (e) { /* noop */ } } }

  get currentTime() {
    try { return this._player ? this._player.getCurrentTime() || 0 : 0; } catch (e) { return 0; }
  }

  get duration() { return this._duration || 0; }

  get playing() {
    try { return this._player ? this._player.getPlayerState() === STATE.PLAYING : false; } catch (e) { return false; }
  }

  /** Detiene todo y libera el iframe (al cambiar a una pista local). */
  stop() {
    this._stopPoll();
    this._wantPlay = false;
    if (this._player) { try { this._player.stopVideo(); } catch (e) { /* noop */ } }
  }

  destroy() {
    this.stop();
    if (this._player) { try { this._player.destroy(); } catch (e) { /* noop */ } }
    this._player = null;
    this._ready = false;
  }
}
