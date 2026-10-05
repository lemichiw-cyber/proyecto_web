/* ===================================================================
   Sakura Player — Motor de audio
   Cola, shuffle, repeat, seek, velocidad, volumen, favoritos,
   historial y grafo Web Audio (EQ + mezclador + visualizador).
   =================================================================== */

import { api } from '../api/client.js';

const LS = {
  queue: 'sp_queue',
  index: 'sp_index',
  favorites: 'sp_favorites',
  history: 'sp_history',
  volume: 'sp_volume',
  muted: 'sp_muted',
  shuffle: 'sp_shuffle',
  repeat: 'sp_repeat',
  rate: 'sp_rate',
  theme: 'sp_theme',
  themeMode: 'sp_theme_mode',
  animations: 'sp_animations',
  eq: 'sp_eq',
  mixer: 'sp_mixer',
  playlists: 'sp_playlists',
  localSongs: 'sp_local_songs',
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin storage */ }
}

export const REPEAT = { OFF: 'off', ALL: 'all', ONE: 'one' };

export class Player {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

    this.queue = load(LS.queue, []);
    this.index = load(LS.index, -1);
    this.favorites = new Set(load(LS.favorites, []));
    this.history = load(LS.history, []);
    this.volume = load(LS.volume, 0.8);
    this.muted = load(LS.muted, false);
    this.shuffle = load(LS.shuffle, false);
    this.repeat = load(LS.repeat, REPEAT.OFF);
    this.rate = load(LS.rate, 1);

    this.listeners = {};
    this.context = null;
    this.nodes = null;
    this._objectUrls = new Map(); // trackId -> objectURL (archivos locales)

    this._bind();
    this._applyVolume();
    this.audio.playbackRate = this.rate;
  }

  /* ---------------- eventos ---------------- */
  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); return this; }
  off(evt, fn) {
    if (!fn) { this.listeners[evt] = []; return this; }
    this.listeners[evt] = (this.listeners[evt] || []).filter((f) => f !== fn);
    return this;
  }
  emit(evt, payload) { (this.listeners[evt] || []).forEach((fn) => fn(payload)); }

  _bind() {
    this.audio.addEventListener('timeupdate', () => this.emit('time', this.status()));
    this.audio.addEventListener('loadedmetadata', () => this.emit('time', this.status()));
    this.audio.addEventListener('play', () => this.emit('play'));
    this.audio.addEventListener('pause', () => this.emit('pause'));
    this.audio.addEventListener('ended', () => this._onEnded());
    this.audio.addEventListener('error', () => {
      if (!this.audio.src) return;
      this.emit('error', { message: 'Error de reproducción' });
      this._onEnded(true);
    });
    this.audio.addEventListener('waiting', () => this.emit('loading', true));
    this.audio.addEventListener('canplay', () => this.emit('loading', false));
  }

  /* ---------------- grafo Web Audio ---------------- */
  _ensureGraph() {
    if (this.context) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const src = ctx.createMediaElementSource(this.audio);

    // 10 bandas de ecualizador
    const freqs = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
    const bands = freqs.map((f, i) => {
      const bi = ctx.createBiquadFilter();
      bi.type = i === 0 ? 'lowshelf' : (i === freqs.length - 1 ? 'highshelf' : 'peaking');
      bi.frequency.value = f;
      bi.Q.value = 1;
      bi.gain.value = 0;
      return bi;
    });
    // Bajos (lowshelf extra) y agudos (highshelf extra) del mezclador
    const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 200; bass.gain.value = 0;
    const treble = ctx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 6000; treble.gain.value = 0;

    const musicGain = ctx.createGain(); musicGain.gain.value = 1;
    const masterGain = ctx.createGain(); masterGain.gain.value = 1;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;

    // Cadena: src -> EQ bandas -> bass -> treble -> music -> master -> panner -> analyser -> out
    let node = src;
    bands.forEach((b) => { node.connect(b); node = b; });
    node.connect(bass); node = bass;
    node.connect(treble); node = treble;
    node.connect(musicGain); node = musicGain;
    node.connect(masterGain); node = masterGain;
    if (panner) { node.connect(panner); node = panner; }
    node.connect(analyser);
    analyser.connect(ctx.destination);

    this.context = ctx;
    this.nodes = { src, bands, bass, treble, musicGain, masterGain, panner, analyser };
  }

  resumeContext() {
    this._ensureGraph();
    if (this.context && this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  getAnalyser() {
    this._ensureGraph();
    return this.nodes ? this.nodes.analyser : null;
  }

  /* ---------------- estado ---------------- */
  current() { return this.queue[this.index] || null; }

  status() {
    return {
      track: this.current(),
      index: this.index,
      queueLength: this.queue.length,
      playing: !this.audio.paused && !this.audio.ended,
      currentTime: this.audio.currentTime || 0,
      duration: this.audio.duration || 0,
      volume: this.volume,
      muted: this.muted,
      shuffle: this.shuffle,
      repeat: this.repeat,
      rate: this.rate,
      loading: this.audio.readyState < 3,
    };
  }

  /* ---------------- cola ---------------- */
  setQueue(tracks, startIndex = 0) {
    this.queue = tracks.slice();
    this.index = Math.max(0, Math.min(startIndex, this.queue.length - 1));
    save(LS.queue, this.queue);
    save(LS.index, this.index);
    this._loadCurrent(true);
  }

  playTracks(tracks, startIndex = 0) {
    this.setQueue(tracks, startIndex);
    this.play();
  }

  addToQueue(track) {
    this.queue.push(track);
    save(LS.queue, this.queue);
    this.emit('queue', this.queue);
    if (this.index === -1) this.setQueue(this.queue, 0);
  }

  removeFromQueue(i) {
    if (i < 0 || i >= this.queue.length) return;
    this.queue.splice(i, 1);
    if (i < this.index) this.index--;
    else if (i === this.index) this.index = Math.min(this.index, this.queue.length - 1);
    save(LS.queue, this.queue);
    save(LS.index, this.index);
    this.emit('queue', this.queue);
  }

  clearQueue() {
    this.queue = [];
    this.index = -1;
    save(LS.queue, this.queue);
    save(LS.index, this.index);
    this.emit('queue', this.queue);
  }

  moveInQueue(from, to) {
    if (from === to || from < 0 || to < 0 || from >= this.queue.length || to >= this.queue.length) return;
    const [item] = this.queue.splice(from, 1);
    this.queue.splice(to, 0, item);
    if (this.index === from) this.index = to;
    else if (from < this.index && to >= this.index) this.index--;
    else if (from > this.index && to <= this.index) this.index++;
    save(LS.queue, this.queue);
    save(LS.index, this.index);
    this.emit('queue', this.queue);
  }

  /* ---------------- reproducción ---------------- */
  async play() {
    this.resumeContext();
    if (!this.current()) return;
    try { await this.audio.play(); } catch (e) { /* autoplay bloqueado */ }
  }

  pause() { this.audio.pause(); }
  toggle() { return this.audio.paused ? this.play() : this.pause(); }

  _loadCurrent(autoplay = false) {
    const track = this.current();
    if (!track) { this.emit('time', this.status()); return; }
    this._ensureGraph();
    this.audio.src = track.source === 'local' ? track.url : api.streamUrl(track.id);
    this.audio.load();
    this.emit('trackchange', this.status());
    this._pushHistory(track);
    if (autoplay) this.play();
  }

  _onEnded(skipped = false) {
    if (!skipped && this.repeat === REPEAT.ONE) { this.audio.currentTime = 0; this.play(); return; }
    if (this.repeat === REPEAT.ALL && this.index === this.queue.length - 1) {
      this.index = 0;
      this._loadCurrent(true);
      return;
    }
    this.next();
  }

  next() {
    if (!this.queue.length) return;
    if (this.shuffle) {
      let i = this.index;
      while (this.queue.length > 1 && i === this.index) i = Math.floor(Math.random() * this.queue.length);
      this.index = i;
    } else {
      this.index = this.index + 1;
      if (this.index >= this.queue.length) {
        if (this.repeat === REPEAT.ALL) this.index = 0;
        else { this.index = this.queue.length - 1; this.audio.pause(); return; }
      }
    }
    this._loadCurrent(true);
  }

  prev() {
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    if (this.shuffle) { this.index = Math.floor(Math.random() * this.queue.length); }
    else { this.index = this.index - 1; if (this.index < 0) this.index = 0; }
    this._loadCurrent(true);
  }

  seek(seconds) {
    if (!isFinite(seconds)) return;
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || seconds));
    this.emit('time', this.status());
  }

  seekFraction(frac) {
    if (this.audio.duration) this.seek(this.audio.duration * frac);
  }

  /* ---------------- volumen / velocidad ---------------- */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.volume > 0) this.muted = false;
    this._applyVolume();
    save(LS.volume, this.volume);
    save(LS.muted, this.muted);
    this.emit('time', this.status());
  }

  toggleMute() {
    this.muted = !this.muted;
    this._applyVolume();
    save(LS.muted, this.muted);
    this.emit('time', this.status());
  }

  _applyVolume() {
    this.audio.muted = this.muted;
    this.audio.volume = Math.max(0, Math.min(1, this.volume));
  }

  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2, rate));
    this.audio.playbackRate = this.rate;
    save(LS.rate, this.rate);
    this.emit('time', this.status());
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    save(LS.shuffle, this.shuffle);
    this.emit('time', this.status());
  }

  cycleRepeat() {
    this.repeat = this.repeat === REPEAT.OFF ? REPEAT.ALL : (this.repeat === REPEAT.ALL ? REPEAT.ONE : REPEAT.OFF);
    save(LS.repeat, this.repeat);
    this.emit('time', this.status());
  }

  /* ---------------- favoritos / historial ---------------- */
  isFavorite(id) { return this.favorites.has(id); }

  toggleFavorite(track) {
    const id = track.id;
    if (this.favorites.has(id)) this.favorites.delete(id);
    else this.favorites.add(id);
    save(LS.favorites, [...this.favorites]);
    this.emit('favorites', [...this.favorites]);
    return this.favorites.has(id);
  }

  _pushHistory(track) {
    if (!track || !track.id) return;
    this.history = this.history.filter((t) => t.id !== track.id);
    this.history.unshift({ ...track, playedAt: Date.now() });
    this.history = this.history.slice(0, 200);
    save(LS.history, this.history);
    this.emit('history', this.history);
  }

  /* ---------------- archivos locales ---------------- */
  registerLocalTrack(track, objectUrl) {
    if (objectUrl) this._objectUrls.set(track.id, objectUrl);
    return track;
  }

  /* ---------------- EQ / mezclador (grafo) ---------------- */
  setEqBand(i, gain) {
    if (!this.nodes) return;
    const band = this.nodes.bands[i];
    if (band) band.gain.value = Math.max(-12, Math.min(12, gain));
  }

  setEqGains(gains) {
    if (!Array.isArray(gains)) return;
    gains.forEach((g, i) => this.setEqBand(i, g));
  }

  setMixer({ master, music, bass, treble, balance }) {
    if (!this.nodes) return;
    if (master !== undefined && this.nodes.masterGain) this.nodes.masterGain.gain.value = Math.max(0, Math.min(1, master));
    if (music !== undefined && this.nodes.musicGain) this.nodes.musicGain.gain.value = Math.max(0, Math.min(1, music));
    if (bass !== undefined && this.nodes.bass) this.nodes.bass.gain.value = Math.max(-12, Math.min(12, bass));
    if (treble !== undefined && this.nodes.treble) this.nodes.treble.gain.value = Math.max(-12, Math.min(12, treble));
    if (balance !== undefined && this.nodes.panner) this.nodes.panner.pan.value = Math.max(-1, Math.min(1, balance));
  }

  setChannelMute(channel, muted) {
    if (!this.nodes) return;
    if (channel === 'master') this.nodes.masterGain.gain.value = muted ? 0 : 1;
    if (channel === 'music') this.nodes.musicGain.gain.value = muted ? 0 : 1;
  }

  /* ---------------- persistencia de ajustes ---------------- */
  getSettings() {
    return {
      eq: load(LS.eq, null),
      mixer: load(LS.mixer, null),
      theme: load(LS.theme, null),
      themeMode: load(LS.themeMode, 'auto'),
      animations: load(LS.animations, null),
    };
  }

  saveSettings(patch) {
    if (patch.eq !== undefined) save(LS.eq, patch.eq);
    if (patch.mixer !== undefined) save(LS.mixer, patch.mixer);
    if (patch.theme !== undefined) save(LS.theme, patch.theme);
    if (patch.themeMode !== undefined) save(LS.themeMode, patch.themeMode);
    if (patch.animations !== undefined) save(LS.animations, patch.animations);
  }

  applySettings() {
    const s = this.getSettings();
    if (s.eq) this.setEqGains(s.eq);
    if (s.mixer) this.setMixer(s.mixer);
  }
}

export const player = new Player();
export { LS as PLAYER_LS };
