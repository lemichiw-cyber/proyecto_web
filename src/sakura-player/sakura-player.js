/* ===================================================================
   Sakura Player — Controlador principal
   Integra el reproductor dentro de proyecto_web sin tocar su núcleo:
   se monta en #sakura-player-root y agrega el mini reproductor global.
   =================================================================== */

import './theme/player-theme.css';
import { api, friendlyError, getApiBase, setApiBase, clearCache, activeApiBase } from './api/client.js';
import { isAdmin, adminEmail, loginAdmin, clearSession, restoreSession, adminStats, adminError } from './api/admin.js';
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
import { icon, toast, emptyState, errorState, bindRetry, spinner, promptDialog, escapeHtml, coverHtml } from './components/ui.js';

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
    this._currentView = null;
    this._detailSeq = 0;
    this._themeSubscribed = false;

    // Handlers guardados como propiedades para poder desregistrarlos:
    // sin esto, cada remontaje duplicaba los listeners globales.
    this._onPlayerTime = (s) => this.mini.setVolumeUI(s.volume, s.muted);
    this._onPlayerPlay = () => {
      this._applyThemeToVisualizer();
      if (this.visualizer) {
        // setAnalyser nunca se llamaba: el visualizador quedaba en línea plana
        this.visualizer.setAnalyser(player.getAnalyser());
        this.visualizer.start();
      }
    };
    this._onPlayerPause = () => { if (this.visualizer) this.visualizer.stop(); };
    this._onPlayerBlocked = () => toast('El navegador bloqueó el autoplay: tocá ▶ para iniciar el audio', 'error');
    this._onNetUpdate = () => {
      this._offline = !navigator.onLine;
      this._renderOffline();
      // Al recuperar la conexión, verificar de nuevo el backend sin que
      // el usuario tenga que entrar a Ajustes y pulsar "Probar".
      if (!this._offline) this._checkBackend();
    };
    this._onKeydown = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const isControl = e.target.closest && e.target.closest('button, a, [role="button"], [role="slider"]');
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable || isControl) return;
      if (!this._mounted || e.ctrlKey || e.metaKey || e.altKey) return;
      // No secuestrar atajos mientras hay un diálogo abierto.
      if (document.querySelector('.modal-overlay.open, .sp-dialog-overlay')) return;
      switch (e.key) {
        case ' ': e.preventDefault(); player.toggle(); break;
        case 'ArrowRight': e.preventDefault(); player.seek(player.audio.currentTime + 5); break;
        case 'ArrowLeft': e.preventDefault(); player.seek(player.audio.currentTime - 5); break;
        case 'ArrowUp': e.preventDefault(); player.setVolume(player.volume + 0.05); break;
        case 'ArrowDown': e.preventDefault(); player.setVolume(player.volume - 0.05); break;
        case 'm': case 'M': player.toggleMute(); break;
        case 's': case 'S': player.toggleShuffle(); break;
        case 'r': case 'R': player.cycleRepeat(); break;
      }
    };

    // El cliente detectó que la URL guardada en Ajustes → Backend no
    // respondía y se pasó a la del sitio: avisamos una vez para que el
    // usuario sepa por qué sus cambios "no se ven" en esa URL.
    this._onBaseFallback = (e) => {
      const from = e && e.detail ? e.detail.from : '';
      toast(
        'No se pudo conectar con ' + (from || 'la URL guardada') +
        '. Se usó el backend del sitio; volvé a probar tu URL en Ajustes → Backend.',
        'info',
      );
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('sp:api-base-fallback', this._onBaseFallback);
    }
  }

  /* ---------------- montaje ---------------- */
  mount(root) {
    if (!root) return;
    // Idempotente: app.js llama a mountSakuraPlayer en cada navegación.
    // Sin esta guarda se duplicaban keydown/online/player listeners y los
    // atajos dejaban de funcionar (Espacio alternaba play+pausa).
    if (this._mounted && this.root === root) return;

    // Limpieza de un montaje anterior (solo si el root cambió)
    document.removeEventListener('keydown', this._onKeydown);
    window.removeEventListener('online', this._onNetUpdate);
    window.removeEventListener('offline', this._onNetUpdate);
    player.off('time', this._onPlayerTime);
    player.off('play', this._onPlayerPlay);
    player.off('pause', this._onPlayerPause);
    player.off('blocked', this._onPlayerBlocked);
    Object.values(this.views || {}).forEach((v) => { if (v && typeof v.destroy === 'function') v.destroy(); });
    if (this.visualizer) { this.visualizer.stop(); this.visualizer.destroy(); this.visualizer = null; }

    this.root = root;
    this._mounted = false;
    this._currentView = null;
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

    // Mini reproductor global (mount es idempotente)
    this.mini.mount();
    player.on('time', this._onPlayerTime);

    // Tema: el listener va ANTES de apply(), que despacha sp:theme
    // sincrónico al aplicar (si no, la primera configuración se perdía)
    this.root.addEventListener('sp:theme', () => this._applyThemeToVisualizer());
    if (!this._themeSubscribed) {
      this._themeSubscribed = true;
      themeManager.onThemeChange(() => this._applyThemeToVisualizer());
    }
    themeManager.apply(this.root);
    themeManager.watch();

    // Visualizador
    this.visualizerCanvas = this.root.querySelector('#sp-visualizer-canvas');
    this.visualizer = new Visualizer(this.visualizerCanvas);
    player.on('play', this._onPlayerPlay);
    player.on('pause', this._onPlayerPause);
    player.on('blocked', this._onPlayerBlocked);
    this._applyThemeToVisualizer();
    if (!player.audio.paused) this._onPlayerPlay(); // si ya venía sonando

    // Ajustes guardados
    player.applySettings();

    // Atajos de teclado
    this._bindKeys();

    // Estado de conexión
    this._bindConnectivity();
    this._checkBackend();

    // Restaurar sesión de administrador guardada (token de 24 h).
    // Si el backend la rechaza, se limpia y el panel vuelve al formulario.
    if (isAdmin()) {
      restoreSession().then((email) => { if (!email) this._renderAdmin(); }).catch(() => {});
    }

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
    return '<div id="sp-layout" class="sp-layout">' +
      '<nav class="sp-panel sp-nav" id="sp-nav" aria-label="Secciones del reproductor">' +
        '<div class="sp-nav-brand">' +
          '<span class="sp-nav-logo" aria-hidden="true">🌸</span>' +
          '<div><div class="sp-nav-title">Sakura Player</div>' +
          '<div class="sp-nav-sub">YouTube Music + Local</div></div>' +
        '</div>' +
        '<div class="sp-nav-links">' +
          VIEWS.map((v) => '<button class="sp-btn" type="button" data-view="' + v.id + '" title="' + v.label + '" aria-label="' + v.label + '">' +
            '<span class="sp-nav-icon" aria-hidden="true">' + icon(v.icon) + '</span>' +
            '<span class="sp-nav-label">' + v.label + '</span></button>').join('') +
        '</div>' +
        '<div id="sp-offline-slot" class="sp-nav-offline"></div>' +
      '</nav>' +
      '<div class="sp-main">' +
        '<div class="sp-panel sp-visualizer-wrap" id="sp-visualizer-wrap" aria-hidden="true">' +
          '<canvas id="sp-visualizer-canvas"></canvas>' +
          '<div id="sp-visualizer-fallback" class="sp-visualizer-fallback"></div>' +
        '</div>' +
        '<div id="sp-view-content" class="sp-panel sp-content"></div>' +
      '</div>' +
    '</div>';
  }

  _bindShell() {
    this.root.querySelector('#sp-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      this.view = btn.dataset.view;
      this._renderView();
    });
  }

  _renderView() {
    const content = this.root.querySelector('#sp-view-content');
    // Destruye SIEMPRE la vista saliente: sus listeners de player seguían
    // actuando sobre DOM desconectado y su TypeError abortaba emit()
    // (cola y reproductor dejaban de reaccionar a cambios de pista).
    const prev = this.views[this._currentView];
    if (prev && typeof prev.destroy === 'function') prev.destroy();
    this._currentView = this.view;
    this._detailSeq++; // invalida detalles de álbum/artista/playlist pendientes
    this.root.querySelectorAll('#sp-nav [data-view]').forEach((b) => {
      const active = b.dataset.view === this.view;
      b.classList.toggle('sp-btn-active', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
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
    const seq = ++this._detailSeq; // invalida respuestas anteriores
    const content = this.root.querySelector('#sp-view-content');
    content.innerHTML = spinner('Cargando álbum...');
    try {
      const album = await api.album(id);
      if (seq !== this._detailSeq) return; // el usuario ya navegó
      this._detail({
        title: album.title,
        subtitle: album.artist || '',
        cover: album.thumb,
        description: album.description,
        tracks: album.tracks || [],
      });
    } catch (err) {
      if (seq !== this._detailSeq) return;
      this._detailError(content, 'album', 'No se pudo abrir el álbum', err, () => this.openAlbum(id));
    }
  }

  async openArtist(id) {
    const seq = ++this._detailSeq;
    const content = this.root.querySelector('#sp-view-content');
    content.innerHTML = spinner('Cargando artista...');
    try {
      const artist = await api.artist(id);
      if (seq !== this._detailSeq) return;
      const tracks = artist.songs || [];
      this._detail({
        title: artist.name,
        subtitle: artist.subscribers || 'Artista',
        cover: artist.thumb,
        description: artist.description,
        tracks,
        extra: '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.7rem;margin-top:1rem;">' +
          (artist.albums || []).map((a) => '<div class="sp-card" style="padding:.6rem;cursor:pointer;" data-album="' + escapeHtml(String(a.id)) + '">' +
            coverHtml(a, '100%') +
            '<div style="font-weight:700;font-size:.78rem;margin-top:.4rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(a.title) + '</div></div>').join('') +
          '</div>',
      });
      content.querySelectorAll('[data-album]').forEach((c) =>
        c.addEventListener('click', () => this.openAlbum(c.dataset.album)));
    } catch (err) {
      if (seq !== this._detailSeq) return;
      this._detailError(content, 'user', 'No se pudo abrir el artista', err, () => this.openArtist(id));
    }
  }

  async openPlaylist(id) {
    const seq = ++this._detailSeq;
    const content = this.root.querySelector('#sp-view-content');
    content.innerHTML = spinner('Cargando playlist...');
    try {
      const pl = await api.playlist(id);
      if (seq !== this._detailSeq) return;
      this._detail({
        title: pl.title,
        subtitle: (pl.author ? pl.author + ' · ' : '') + (pl.count || (pl.tracks || []).length) + ' canciones',
        cover: pl.thumb,
        description: pl.description,
        tracks: pl.tracks || [],
      });
    } catch (err) {
      if (seq !== this._detailSeq) return;
      this._detailError(content, 'list', 'No se pudo abrir la playlist', err, () => this.openPlaylist(id));
    }
  }

  _detailError(content, iconName, title, err, retry) {
    const offline = this._offline || (typeof navigator !== 'undefined' && navigator.onLine === false);
    content.innerHTML = errorState(offline ? 'wifiOff' : iconName,
      offline ? 'Sin conexión' : title,
      offline ? 'Este contenido vive en YouTube Music y necesita internet.' : friendlyError(err),
      { retryLabel: 'Reintentar' });
    bindRetry(content, retry);
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
        '<div class="sp-panel-title" style="margin-bottom:.7rem;">Modo administrador</div>' +
        '<div id="sp-admin-area">' + this._adminHtml() + '</div>' +
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

  /* ---------------- modo administrador ---------------- */
  _adminHtml() {
    if (!isAdmin()) {
      return '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">' +
        '<input class="sp-input" id="sp-admin-email" type="email" placeholder="Correo de administrador" ' +
          'autocomplete="username" style="flex:1;min-width:170px;">' +
        '<input class="sp-input" id="sp-admin-pass" type="password" placeholder="Contraseña" ' +
          'autocomplete="current-password" style="flex:1;min-width:130px;">' +
        '<button class="sp-btn" id="sp-admin-login">Ingresar</button>' +
      '</div>' +
      '<div id="sp-admin-status" style="font-size:.78rem;margin-top:.5rem;color:var(--player-text-secondary);">' +
        'Acceso restringido: hacete administrador con tu correo y contraseña.' +
      '</div>';
    }
    return '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">' +
        '<span style="font-size:.82rem;color:var(--player-success);">● Sesión activa: <b>' +
          escapeHtml(adminEmail() || 'administrador') + '</b></span>' +
      '</div>' +
      '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.6rem;">' +
        '<button class="sp-btn" id="sp-admin-stats">Estado del backend</button>' +
        '<button class="sp-btn" id="sp-admin-clear">Limpiar caché</button>' +
        '<button class="sp-btn" id="sp-admin-logout">Cerrar sesión</button>' +
      '</div>' +
      '<div id="sp-admin-status" style="font-size:.78rem;margin-top:.5rem;color:var(--player-text-secondary);"></div>' +
      '<div id="sp-admin-output" style="font-size:.76rem;margin-top:.35rem;color:var(--player-text-secondary);white-space:pre-wrap;"></div>';
  }

  /* Vuelve a dibujar el panel admin y le ata los eventos (tras login/logout). */
  _renderAdmin() {
    if (!this.root) return;
    const area = this.root.querySelector('#sp-admin-area');
    if (!area) return;
    area.innerHTML = this._adminHtml();
    this._bindAdmin(area);
  }

  _bindAdmin(scope) {
    const container = scope && scope.querySelector ? scope : (this.root && this.root.querySelector('#sp-admin-area'));
    if (!container) return;
    const $ = (sel) => container.querySelector(sel);

    const status = (html) => {
      const el = $('#sp-admin-status');
      if (el) el.innerHTML = html;
    };

    // ---- login ----
    const doLogin = async () => {
      const emailEl = $('#sp-admin-email');
      const passEl = $('#sp-admin-pass');
      if (!emailEl || !passEl) return;
      const email = emailEl.value.trim();
      const password = passEl.value;
      if (!email || !password) {
        status('<span style="color:var(--player-error);">Ingresá correo y contraseña.</span>');
        return;
      }
      status('<span style="color:var(--player-text-secondary);">Verificando…</span>');
      try {
        await loginAdmin(email, password);
        this._renderAdmin();
        toast('Modo administrador activado', 'success');
      } catch (err) {
        status('<span style="color:var(--player-error);">' + escapeHtml(adminError(err)) + '</span>');
        if (passEl) passEl.value = '';
      }
    };
    if ($('#sp-admin-login')) {
      $('#sp-admin-login').addEventListener('click', doLogin);
      // Enter en cualquiera de los dos campos dispara el ingreso
      [$('#sp-admin-email'), $('#sp-admin-pass')].forEach((el) =>
        el && el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } }));
    }

    // ---- logout ----
    if ($('#sp-admin-logout')) {
      $('#sp-admin-logout').addEventListener('click', () => {
        clearSession();
        this._renderAdmin();
        toast('Sesión de administrador cerrada', 'success');
      });
    }

    // ---- limpiar caché de búsquedas ----
    if ($('#sp-admin-clear')) {
      $('#sp-admin-clear').addEventListener('click', () => {
        clearCache();
        status('<span style="color:var(--player-success);">Caché de búsquedas limpiada.</span>');
      });
    }

    // ---- estado del backend ----
    if ($('#sp-admin-stats')) {
      $('#sp-admin-stats').addEventListener('click', async () => {
        const out = $('#sp-admin-output');
        status('<span style="color:var(--player-text-secondary);">Consultando…</span>');
        try {
          const s = await adminStats();
          if (!s) { status('<span style="color:var(--player-error);">Sesión no válida.</span>'); this._renderAdmin(); return; }
          if (out) {
            out.textContent = 'YouTube Music: ' + (s.authenticated ? 'autenticado' : 'modo invitado') +
              '\nSesión admin: ' + (s.email || '') +
              '\nDuración del token: ' + Math.round((s.session_ttl || 0) / 3600) + ' h' +
              (s.locked_ips ? '\nIPs bloqueadas por intentos: ' + s.locked_ips : '');
          }
          status('<span style="color:var(--player-success);">● Backend conectado</span>');
        } catch (err) {
          status('<span style="color:var(--player-error);">' + escapeHtml(adminError(err)) + '</span>');
          if (err && err.code === 'auth') this._renderAdmin();
        }
      });
    }
  }

  _bindSettings(content) {
    this._bindAdmin(content);
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
  _applyThemeToVisualizer() {
    if (!this.visualizer) return;
    // Sin argumentos: usa el payload calculado por el gestor (con los
    // overrides del mapa automático). Antes recibía {name,cfg} o nada y
    // terminaba en los valores por defecto (bars/medium/{}).
    const info = themeManager.visualizerInfo();
    this.visualizer.configure({
      style: info.visualizer,
      intensity: info.intensity,
      colors: info.colors,
    });
  }

  /* ---------------- teclado ---------------- */
  _bindKeys() {
    // Handler guardado en el constructor: mount() puede registrar/quitar
    // sin duplicar (el listener inline se acumulaba en cada navegación)
    document.addEventListener('keydown', this._onKeydown);
  }

  /* ---------------- conexión / offline ---------------- */
  _bindConnectivity() {
    window.addEventListener('online', this._onNetUpdate);
    window.addEventListener('offline', this._onNetUpdate);
    // Estado inicial sin lanzar dos veces la comprobación del backend:
    // mount() llama a _checkBackend() justo después.
    this._offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    this._renderOffline();
  }

  _renderOffline() {
    const slot = this.root && this.root.querySelector('#sp-offline-slot');
    if (!slot) return;
    if (this._offline) {
      slot.innerHTML = '<div class="sp-offline-banner" role="status">' + icon('wifiOff') +
        '<div><b>Sin conexión</b><span>YouTube Music no está disponible. Tu biblioteca local sigue funcionando.</span></div></div>';
    } else {
      slot.innerHTML = '';
    }
  }

  async _checkBackend() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const statusOff = this.root && this.root.querySelector('#sp-api-status');
      if (statusOff) statusOff.innerHTML = '<span style="color:var(--player-warning);">● Sin conexión</span> — el backend no es accesible ahora.';
      return;
    }
    const status = this.root && this.root.querySelector('#sp-api-status');
    const inUse = activeApiBase();
    const custom = inUse !== getApiBase(); // la URL guardada falló y se forzó la del sitio
    try {
      const h = await api.health();
      if (status) {
        status.innerHTML = '<span style="color:var(--player-success);">● Backend conectado</span>' +
          (h.authenticated ? ' · YouTube Music autenticado' : ' · YouTube Music en modo invitado') +
          (custom ? '<br><span style="color:var(--player-text-secondary);">Usando: ' + escapeHtml(inUse) +
            ' (tu URL no respondía)</span>' : '');
      }
      if (this._offline) { this._offline = false; this._renderOffline(); }
    } catch (err) {
      if (status) {
        status.innerHTML = '<span style="color:var(--player-error);">● Backend apagado</span> — ' +
          escapeHtml(friendlyError(err)) + '<br><span style="color:var(--player-text-secondary);">URL probada: ' +
          escapeHtml(inUse) + '</span>';
      }
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
