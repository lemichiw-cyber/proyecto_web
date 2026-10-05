/* ===================================================================
   Sakura Player — Controlador principal
   Integra el reproductor dentro de proyecto_web sin tocar su núcleo:
   se monta en #sakura-player-root y agrega el mini reproductor global.
   =================================================================== */

import './theme/player-theme.css';
import { api, friendlyError, getApiBase, setApiBase } from './api/client.js';
import { player } from './player/player.js';
import { Visualizer } from './player/visualizer.js';
import { library } from './library/library.js';
import { themeManager } from './theme/player-theme-manager.js';
import { SearchView } from './components/search.js';
import { NowPlayingView } from './components/nowplaying.js';
import { LibraryView } from './components/library.js';
import { PlaylistView } from './components/playlists.js';
import { MixerView } from './components/mixer.js';
import { UploadView } from './components/upload.js';
import { QueueView } from './components/queue.js';
import { MiniPlayer } from './components/mini-player.js';
import { icon, toast, emptyState, spinner, promptDialog, escapeHtml, coverHtml } from './components/ui.js';

const VIEWS = [
  { id: 'player', label: 'Reproductor', icon: 'note' },
  { id: 'search', label: 'Buscar', icon: 'search' },
  { id: 'library', label: 'Biblioteca', icon: 'home' },
  { id: 'playlists', label: 'Playlists', icon: 'list' },
  { id: 'queue', label: 'Cola', icon: 'queue' },
  { id: 'mixer', label: 'Mezclador', icon: 'sliders' },
  { id: 'upload', label: 'Local', icon: 'upload' },
  { id: 'settings', label: 'Ajustes', icon: 'settings' },
];

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

class SakuraPlayer {
  constructor() {
    this.root = null;
    this.view = 'search';
    this.views = {};
    this.mini = new MiniPlayer();
    this.visualizer = null;
    this.visualizerCanvas = null;
    this._offline = false;
    this._mounted = false;
  }

  /* ---------------- montaje ---------------- */
  mount(root) {
    this.root = root;
    if (!this.root) return;
    this.root.classList.add('sakura-player');
    this.root.innerHTML = this._shell();
    this._bindShell();

    // Vistas
    const content = this.root.querySelector('#sp-view-content');
    this.views = {
      player: new NowPlayingView(content),
      search: new SearchView(content, this._ctx()),
      library: new LibraryView(content, this._ctx()),
      playlists: new PlaylistView(content, this._ctx()),
      queue: new QueueView(content, this._ctx()),
      mixer: new MixerView(content),
      upload: new UploadView(content, this._ctx()),
    };
    this._renderView();

    // Mini reproductor global
    this.mini.mount();
    player.on('time', (s) => this.mini.setVolumeUI(s.volume, s.muted));

    // Tema
    themeManager.apply(this.root);
    themeManager.watch();
    themeManager.onThemeChange((t) => this._applyThemeToVisualizer(t));
    this.root.addEventListener('sp:theme', (e) => this._applyThemeToVisualizer(e.detail));

    // Visualizador
    this.visualizerCanvas = this.root.querySelector('#sp-visualizer-canvas');
    this.visualizer = new Visualizer(this.visualizerCanvas);
    player.on('play', () => { this._applyThemeToVisualizer(); this.visualizer.start(); });
    player.on('pause', () => this.visualizer.stop());
    this._applyThemeToVisualizer();

    // Ajustes guardados
    player.applySettings();

    // Atajos de teclado
    this._bindKeys();

    // Estado de conexión
    this._bindConnectivity();
    this._checkBackend();

    this._mounted = true;
  }

  _ctx() {
    return {
      playTracks: (tracks, i) => this.playTracks(tracks, i),
      openAlbum: (id) => this.openAlbum(id),
      openArtist: (id) => this.openArtist(id),
      openPlaylist: (id) => this.openPlaylist(id),
      promptNewPlaylist: (track) => this._promptNewPlaylist(track),
    };
  }

  _shell() {
    return '<div style="display:grid;grid-template-columns:220px 1fr;gap:1rem;align-items:start;" id="sp-layout">' +
      '<nav class="sp-panel" style="padding:.6rem;display:flex;flex-direction:column;gap:.2rem;position:sticky;top:1rem;" id="sp-nav">' +
        '<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .5rem .7rem;">' +
          '<span style="font-size:1.1rem;">🌸</span>' +
          '<div><div style="font-weight:800;font-size:.9rem;letter-spacing:.04em;">Sakura Player</div>' +
          '<div style="font-size:.62rem;color:var(--player-text-secondary);">YouTube Music + Local</div></div>' +
        '</div>' +
        VIEWS.map((v) => '<button class="sp-btn" data-view="' + v.id + '" style="justify-content:flex-start;">' + icon(v.icon) + ' ' + v.label + '</button>').join('') +
        '<div id="sp-offline-slot" style="margin-top:.6rem;"></div>' +
      '</nav>' +
      '<div style="display:flex;flex-direction:column;gap:1rem;min-width:0;">' +
        '<div class="sp-panel sp-visualizer-wrap" style="height:150px;">' +
          '<canvas id="sp-visualizer-canvas" style="width:100%;height:100%;"></canvas>' +
          '<div id="sp-visualizer-fallback" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:var(--player-text-secondary);font-size:.78rem;"></div>' +
        '</div>' +
        '<div id="sp-view-content" class="sp-panel" style="padding:1.1rem;min-height:340px;"></div>' +
      '</div>' +
    '</div>';
  }

  _bindShell() {
    this.root.querySelector('#sp-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      this.view = btn.dataset.view;
      this.root.querySelectorAll('#sp-nav [data-view]').forEach((b) => {
        b.classList.toggle('sp-btn-active', b === btn);
      });
      this._renderView();
    });
    // Responsive: nav horizontal en móvil
    const mq = window.matchMedia('(max-width: 760px)');
    const applyMq = () => {
      const layout = this.root.querySelector('#sp-layout');
      const nav = this.root.querySelector('#sp-nav');
      if (!layout || !nav) return;
      if (mq.matches) {
        layout.style.gridTemplateColumns = '1fr';
        nav.style.position = 'static';
        nav.style.flexDirection = 'row';
        nav.style.flexWrap = 'wrap';
      } else {
        layout.style.gridTemplateColumns = '220px 1fr';
        nav.style.position = 'sticky';
        nav.style.flexDirection = 'column';
        nav.style.flexWrap = 'nowrap';
      }
    };
    mq.addEventListener('change', applyMq);
    applyMq();
  }

  _renderView() {
    const content = this.root.querySelector('#sp-view-content');
    content.innerHTML = '';
    if (this.view === 'settings') {
      content.innerHTML = this._settingsHtml();
      this._bindSettings(content);
      return;
    }
    const view = this.views[this.view];
    if (!view) return;
    content.innerHTML = view.render();
    view.mount();
  }

  /* ---------------- reproducción ---------------- */
  playTracks(tracks, index = 0) {
    if (!tracks || !tracks.length) return;
    player.playTracks(tracks, index);
    toast('Reproduciendo: ' + (tracks[index] ? tracks[index].title : ''), 'success');
  }

  /* ---------------- vistas de detalle ---------------- */
  async openAlbum(id) {
    const content = this.root.querySelector('#sp-view-content');
    content.innerHTML = spinner('Cargando álbum...');
    try {
      const album = await api.album(id);
      this._detail({
        title: album.title,
        subtitle: album.artist || '',
        cover: album.thumb,
        description: album.description,
        tracks: album.tracks || [],
      });
    } catch (err) {
      content.innerHTML = emptyState('album', 'Álbum no encontrado', friendlyError(err));
    }
  }

  async openArtist(id) {
    const content = this.root.querySelector('#sp-view-content');
    content.innerHTML = spinner('Cargando artista...');
    try {
      const artist = await api.artist(id);
      const tracks = artist.songs || [];
      this._detail({
        title: artist.name,
        subtitle: artist.subscribers || 'Artista',
        cover: artist.thumb,
        description: artist.description,
        tracks,
        extra: '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.7rem;margin-top:1rem;">' +
          (artist.albums || []).map((a) => '<div class="sp-card" style="padding:.6rem;cursor:pointer;" data-album="' + a.id + '">' +
            coverHtml(a, '100%') +
            '<div style="font-weight:700;font-size:.78rem;margin-top:.4rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(a.title) + '</div></div>').join('') +
          '</div>',
      });
      content.querySelectorAll('[data-album]').forEach((c) =>
        c.addEventListener('click', () => this.openAlbum(c.dataset.album)));
    } catch (err) {
      content.innerHTML = emptyState('user', 'Artista no encontrado', friendlyError(err));
    }
  }

  async openPlaylist(id) {
    const content = this.root.querySelector('#sp-view-content');
    content.innerHTML = spinner('Cargando playlist...');
    try {
      const pl = await api.playlist(id);
      this._detail({
        title: pl.title,
        subtitle: (pl.author ? pl.author + ' · ' : '') + (pl.count || (pl.tracks || []).length) + ' canciones',
        cover: pl.thumb,
        description: pl.description,
        tracks: pl.tracks || [],
      });
    } catch (err) {
      content.innerHTML = emptyState('list', 'Playlist no encontrada', friendlyError(err));
    }
  }

  _detail({ title, subtitle, cover, description, tracks, extra }) {
    const content = this.root.querySelector('#sp-view-content');
    content.innerHTML =
      '<button class="sp-btn" id="sp-detail-back" style="margin-bottom:.7rem;">← Volver</button>' +
      '<div class="sp-panel" style="padding:1rem;display:flex;gap:1rem;align-items:center;margin-bottom:.8rem;flex-wrap:wrap;">' +
        '<div class="sp-cover" style="width:96px;height:96px;flex:none;">' +
          (cover ? '<img src="' + cover + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
                  : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--player-text-secondary);">' + icon('disc') + '</div>') +
        '</div>' +
        '<div style="flex:1;min-width:180px;"><div style="font-weight:800;font-size:1.15rem;">' + escapeHtml(title) + '</div>' +
        '<div style="font-size:.8rem;color:var(--player-text-secondary);">' + escapeHtml(subtitle || '') + '</div>' +
        (description ? '<div style="font-size:.75rem;color:var(--player-text-secondary);margin-top:.3rem;max-width:520px;">' + escapeHtml(description) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:.4rem;flex:none;">' +
          '<button class="sp-btn sp-btn-primary" id="sp-detail-play">' + icon('play') + ' Reproducir</button>' +
          '<button class="sp-btn" id="sp-detail-shuffle">' + icon('shuffle') + '</button>' +
        '</div></div>' +
      (extra || '') +
      (tracks.length
        ? '<div style="display:flex;flex-direction:column;gap:.3rem;margin-top:.5rem;">' +
          tracks.map((t, i) => '<div class="sp-queue-item" data-index="' + i + '">' +
            '<span style="font-size:.72rem;color:var(--player-text-secondary);min-width:1.4rem;text-align:right;">' + (i + 1) + '</span>' +
            '<div class="sp-cover" style="width:36px;height:36px;flex:none;">' +
              (t.thumb ? '<img src="' + t.thumb + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
                       : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--player-text-secondary);">' + icon('note') + '</div>') +
            '</div>' +
            '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(t.title) + '</div>' +
            '<div style="font-size:.7rem;color:var(--player-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(t.artist || '') + '</div></div>' +
            '<button class="sp-btn sp-btn-icon" data-add-queue title="Agregar a la cola">' + icon('plus') + '</button>' +
          '</div>').join('') + '</div>'
        : emptyState('music', 'Sin canciones', 'Este contenido no tiene canciones disponibles.'));

    content.querySelector('#sp-detail-back').addEventListener('click', () => this._renderView());
    content.querySelector('#sp-detail-play').addEventListener('click', () => this.playTracks(tracks, 0));
    content.querySelector('#sp-detail-shuffle').addEventListener('click', () => {
      player.shuffle = true;
      this.playTracks(tracks.slice().sort(() => Math.random() - 0.5), 0);
    });
    content.querySelectorAll('.sp-queue-item').forEach((row) =>
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-queue]')) return;
        this.playTracks(tracks, +row.dataset.index);
      }));
    content.querySelectorAll('[data-add-queue]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = tracks[+b.closest('[data-index]').dataset.index];
        if (t) { player.addToQueue(t); toast('Agregada a la cola', 'success'); }
      }));
  }

  async _promptNewPlaylist(track) {
    const name = await promptDialog('Nueva playlist', 'Nombre de la playlist');
    if (!name) return;
    const pl = library.createPlaylist(name);
    library.addToPlaylist(pl.id, track);
    toast('Canción agregada a ' + pl.name, 'success');
  }

  /* ---------------- ajustes ---------------- */
  _settingsHtml() {
    const s = player.getSettings();
    const themes = themeManager.listThemes();
    return '<div style="display:flex;flex-direction:column;gap:1rem;max-width:560px;">' +
      '<div class="sp-panel" style="padding:1rem;">' +
        '<div class="sp-panel-title" style="margin-bottom:.7rem;">Tema del reproductor</div>' +
        '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.7rem;">' +
          '<label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;cursor:pointer;">' +
            '<input type="radio" name="sp-theme-mode" value="auto"' + (s.themeMode === 'auto' ? ' checked' : '') + '> Usar tema de la aplicación</label>' +
          '<label style="display:flex;align-items:center;gap:.4rem;font-size:.82rem;cursor:pointer;">' +
            '<input type="radio" name="sp-theme-mode" value="manual"' + (s.themeMode === 'manual' ? ' checked' : '') + '> Elegir tema manualmente</label>' +
        '</div>' +
        '<select class="sp-select" id="sp-settings-theme" style="width:100%;' + (s.themeMode === 'auto' ? 'opacity:.5;' : '') + '" ' + (s.themeMode === 'auto' ? 'disabled' : '') + '>' +
          themes.map((t) => '<option value="' + t.id + '"' + (s.theme === t.id ? ' selected' : '') + '>' + t.label + '</option>').join('') +
        '</select>' +
        '<div style="font-size:.72rem;color:var(--player-text-secondary);margin-top:.4rem;">Tema actual de la app: <b>' + escapeHtml(themeManager.appTheme()) + '</b> → el reproductor se adapta solo.</div>' +
      '</div>' +
      '<div class="sp-panel" style="padding:1rem;">' +
        '<div class="sp-panel-title" style="margin-bottom:.7rem;">Animaciones</div>' +
        '<div style="display:flex;gap:.4rem;flex-wrap:wrap;">' +
          [['on', 'Activadas'], ['off', 'Desactivadas']].map(([v, l]) =>
            '<button class="sp-btn' + (s.animations !== 'off' ? (v === 'on' ? ' sp-btn-active' : '') : (v === 'off' ? ' sp-btn-active' : '')) + '" data-anim="' + v + '">' + l + '</button>').join('') +
        '</div>' +
        '<div style="font-size:.72rem;color:var(--player-text-secondary);margin-top:.4rem;">Desactivá las animaciones si notás que el dispositivo se lenta.</div>' +
      '</div>' +
      '<div class="sp-panel" style="padding:1rem;">' +
        '<div class="sp-panel-title" style="margin-bottom:.7rem;">Velocidad de reproducción</div>' +
        '<div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;">' +
          SPEEDS.map((v) => '<button class="sp-btn' + (Math.abs(player.rate - v) < 0.01 ? ' sp-btn-active' : '') + '" data-speed="' + v + '">' + v + 'x</button>').join('') +
        '</div>' +
        '<input type="range" class="sp-slider" id="sp-speed-slider" min="0.5" max="2" step="0.05" value="' + player.rate + '" style="margin-top:.7rem;">' +
        '<div style="font-size:.72rem;color:var(--player-text-secondary);margin-top:.3rem;">Actual: ' + player.rate + 'x</div>' +
      '</div>' +
      '<div class="sp-panel" style="padding:1rem;">' +
        '<div class="sp-panel-title" style="margin-bottom:.7rem;">Backend</div>' +
        '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">' +
          '<input class="sp-input" id="sp-api-base" style="flex:1;min-width:200px;" value="' + escapeHtml(getApiBase()) + '" placeholder="http://127.0.0.1:8000">' +
          '<button class="sp-btn" id="sp-api-save">Guardar</button>' +
          '<button class="sp-btn" id="sp-api-test">Probar</button>' +
        '</div>' +
        '<div id="sp-api-status" style="font-size:.78rem;margin-top:.5rem;color:var(--player-text-secondary);"></div>' +
      '</div>' +
      '<div class="sp-panel" style="padding:1rem;">' +
        '<div class="sp-panel-title" style="margin-bottom:.7rem;">Atajos de teclado</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.4rem;font-size:.78rem;color:var(--player-text-secondary);">' +
          '<div><span class="sp-kbd">Espacio</span> Reproducir / Pausa</div>' +
          '<div><span class="sp-kbd">←</span> <span class="sp-kbd">→</span> Seek 5 s</div>' +
          '<div><span class="sp-kbd">↑</span> <span class="sp-kbd">↓</span> Volumen</div>' +
          '<div><span class="sp-kbd">M</span> Silencio</div>' +
          '<div><span class="sp-kbd">S</span> Shuffle</div>' +
          '<div><span class="sp-kbd">R</span> Repeat</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  _bindSettings(content) {
    content.querySelectorAll('input[name="sp-theme-mode"]').forEach((r) =>
      r.addEventListener('change', () => {
        themeManager.setMode(r.value);
        const sel = content.querySelector('#sp-settings-theme');
        sel.disabled = r.value === 'auto';
        sel.style.opacity = r.value === 'auto' ? '.5' : '1';
        this._applyThemeToVisualizer();
        toast('Tema del reproductor actualizado', 'success');
      }));
    content.querySelector('#sp-settings-theme').addEventListener('change', (e) => {
      themeManager.setManualTheme(e.target.value);
      this._applyThemeToVisualizer();
    });
    content.querySelectorAll('[data-anim]').forEach((b) =>
      b.addEventListener('click', () => {
        themeManager.setAnimationsEnabled(b.dataset.anim);
        content.querySelectorAll('[data-anim]').forEach((x) => x.classList.toggle('sp-btn-active', x === b));
        toast('Animaciones ' + (b.dataset.anim === 'on' ? 'activadas' : 'desactivadas'), 'success');
      }));
    content.querySelectorAll('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => {
        player.setRate(parseFloat(b.dataset.speed));
        content.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('sp-btn-active', x === b));
        content.querySelector('#sp-speed-slider').value = player.rate;
      }));
    content.querySelector('#sp-speed-slider').addEventListener('input', (e) => {
      player.setRate(parseFloat(e.target.value));
      content.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('sp-btn-active', Math.abs(parseFloat(x.dataset.speed) - player.rate) < 0.01));
      content.querySelector('#sp-speed-slider').nextElementSibling.textContent = 'Actual: ' + player.rate + 'x';
    });
    content.querySelector('#sp-api-save').addEventListener('click', () => {
      setApiBase(content.querySelector('#sp-api-base').value.trim());
      toast('URL del backend guardada', 'success');
      this._checkBackend();
    });
    content.querySelector('#sp-api-test').addEventListener('click', () => this._checkBackend());
  }

  /* ---------------- tema → visualizador ---------------- */
  _applyThemeToVisualizer(detail) {
    if (!this.visualizer) return;
    const d = detail || { intensity: 'medium', visualizer: 'bars', colors: {} };
    this.visualizer.configure({
      style: d.visualizer || 'bars',
      intensity: d.intensity || 'medium',
      colors: d.colors || {},
    });
  }

  /* ---------------- teclado ---------------- */
  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (!this._mounted) return;
      switch (e.key) {
        case ' ': e.preventDefault(); player.toggle(); break;
        case 'ArrowRight': player.seek(player.audio.currentTime + 5); break;
        case 'ArrowLeft': player.seek(player.audio.currentTime - 5); break;
        case 'ArrowUp': e.preventDefault(); player.setVolume(player.volume + 0.05); break;
        case 'ArrowDown': e.preventDefault(); player.setVolume(player.volume - 0.05); break;
        case 'm': case 'M': player.toggleMute(); break;
        case 's': case 'S': player.toggleShuffle(); break;
        case 'r': case 'R': player.cycleRepeat(); break;
      }
    });
  }

  /* ---------------- conexión / offline ---------------- */
  _bindConnectivity() {
    const update = () => {
      this._offline = !navigator.onLine;
      this._renderOffline();
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  _renderOffline() {
    const slot = this.root && this.root.querySelector('#sp-offline-slot');
    if (!slot) return;
    if (this._offline) {
      slot.innerHTML = '<div class="sp-offline-banner">🌸 <div><b>MODO OFFLINE</b><br>Las funciones de YouTube Music no están disponibles.<br>Tu biblioteca local continúa disponible.</div></div>';
    } else {
      slot.innerHTML = '';
    }
  }

  async _checkBackend() {
    const status = this.root && this.root.querySelector('#sp-api-status');
    try {
      const h = await api.health();
      if (status) {
        status.innerHTML = '<span style="color:var(--player-success);">● Backend conectado</span>' +
          (h.authenticated ? ' · YouTube Music autenticado' : ' · YouTube Music en modo invitado');
      }
      if (this._offline) { this._offline = false; this._renderOffline(); }
    } catch (err) {
      if (status) status.innerHTML = '<span style="color:var(--player-error);>● Backend apagado</span> — andá a Ajustes para ver cómo conectarlo.';
    }
  }
}

/* ---------------- arranque ---------------- */
let instance = null;

export function mountSakuraPlayer() {
  const root = document.getElementById('sakura-player-root');
  if (!root) return null;
  if (!instance) instance = new SakuraPlayer();
  instance.mount(root);
  return instance;
}

export function getSakuraPlayer() { return instance; }

// El manager de temas necesita el root para aplicar tokens: escuchamos el montaje
document.addEventListener('sp:mounted', (e) => {
  if (instance && e.detail && e.detail.root) themeManager.apply(e.detail.root);
});

// API global para proyecto_web
window.mountSakuraPlayer = mountSakuraPlayer;
window.getSakuraPlayer = getSakuraPlayer;
