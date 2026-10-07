/* ===================================================================
   Sakura Player — Vista Biblioteca
   Canciones | Artistas | Álbumes | Favoritos | Playlists | Historial
   =================================================================== */

import { player } from '../player/player.js';
import { library } from '../library/library.js';
import { api, friendlyError } from '../api/client.js';
import { icon, coverHtml, trackRow, emptyState, spinner, toast, escapeHtml } from './ui.js';

const SECTIONS = [
  { id: 'songs', label: 'Canciones', icon: 'music' },
  { id: 'favorites', label: 'Favoritos', icon: 'heart' },
  { id: 'artists', label: 'Artistas', icon: 'user' },
  { id: 'albums', label: 'Álbumes', icon: 'album' },
  { id: 'playlists', label: 'Playlists', icon: 'list' },
  { id: 'history', label: 'Historial', icon: 'clock' },
];

export class LibraryView {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.section = 'songs';
    this.remoteLoaded = false;
  }

  render() {
    return '<div style="display:flex;flex-direction:column;gap:1rem;">' +
      '<div style="display:flex;gap:.4rem;flex-wrap:wrap;" id="sp-lib-tabs">' +
        SECTIONS.map((s) => '<button class="sp-tab' + (s.id === this.section ? ' active' : '') + '" data-sec="' + s.id + '">' + icon(s.icon) + ' ' + s.label + '</button>').join('') +
      '</div>' +
      '<div style="display:flex;gap:.5rem;align-items:center;">' +
        '<button class="sp-btn" id="sp-lib-refresh">' + icon('search') + ' Traer de YouTube Music</button>' +
        '<button class="sp-btn" id="sp-lib-clear-history" style="display:none;">Limpiar historial</button>' +
      '</div>' +
      '<div id="sp-lib-content"></div>' +
    '</div>';
  }

  mount() {
    const content = this.root.querySelector('#sp-lib-content');
    const tabs = this.root.querySelector('#sp-lib-tabs');
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sec]');
      if (!btn) return;
      this.section = btn.dataset.sec;
      tabs.querySelectorAll('.sp-tab').forEach((b) => b.classList.toggle('active', b === btn));
      this._load(content);
    });
    this.root.querySelector('#sp-lib-refresh').addEventListener('click', () => this._loadRemote(content));
    const clearBtn = this.root.querySelector('#sp-lib-clear-history');
    clearBtn.addEventListener('click', async () => {
      const { confirmDialog } = await import('./ui.js');
      if (await confirmDialog('¿Vaciar el historial de reproducción?')) {
        library.clearHistory();
        this._load(content);
      }
    });
    this._load(content);
  }

  _load(content) {
    // La vista pudo navegar mientras cargaba: no tocar DOM desconectado
    if (!content || !content.isConnected) return;
    const clearBtn = this.root.querySelector('#sp-lib-clear-history');
    if (!clearBtn) return;
    clearBtn.style.display = this.section === 'history' ? '' : 'none';
    switch (this.section) {
      case 'songs': this._songs(content); break;
      case 'favorites': this._favorites(content); break;
      case 'artists': this._artists(content); break;
      case 'albums': this._albums(content); break;
      case 'playlists': this._playlists(content); break;
      case 'history': this._history(content); break;
    }
  }

  _list(container, tracks, emptyIcon, emptyTitle, emptyHint) {
    if (!tracks || !tracks.length) {
      container.innerHTML = emptyState(emptyIcon, emptyTitle, emptyHint);
      return;
    }
    container.innerHTML = '<div style="display:flex;flex-direction:column;gap:.3rem;">' +
      tracks.map((t, i) => trackRow(t, { index: i, actions:
        '<button class="sp-btn sp-btn-icon" data-play title="Reproducir">' + icon('play') + '</button>' +
        '<button class="sp-btn sp-btn-icon" data-queue title="Agregar a la cola">' + icon('plus') + '</button>' +
        '<button class="sp-btn sp-btn-icon" data-fav title="Favorito">' + icon(library.isFavorite(t.id) ? 'heartFill' : 'heart') + '</button>'
      })).join('') + '</div>';
    container.querySelectorAll('[data-play]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.closest('[data-track-id]').dataset.trackId;
        const idx = tracks.findIndex((t) => t.id === id);
        if (idx >= 0) this.ctx.playTracks(tracks, idx);
      }));
    container.querySelectorAll('[data-queue]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.closest('[data-track-id]').dataset.trackId;
        const t = tracks.find((x) => x.id === id);
        if (t) { player.addToQueue(t); toast('Agregada a la cola', 'success'); }
      }));
    container.querySelectorAll('[data-fav]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.closest('[data-track-id]').dataset.trackId;
        const t = tracks.find((x) => x.id === id);
        if (t) { library.toggleFavorite(t); b.innerHTML = icon(library.isFavorite(id) ? 'heartFill' : 'heart'); }
      }));
  }

  _songs(content) {
    const local = library.state.localSongs || [];
    const favs = library.state.favorites || [];
    const all = [...local, ...favs.filter((t) => t.source !== 'local')];
    this._list(content, all, 'music', 'Tu biblioteca está vacía', 'Arrastrá archivos de música o buscá en YouTube Music.');
  }

  _favorites(content) {
    this._list(content, library.favoritesList(), 'heart', 'Sin favoritos', 'Tocá el corazón de una canción para guardarla acá.');
  }

  _artists(content) {
    const artists = library.artistsList();
    if (!artists.length) { content.innerHTML = emptyState('user', 'Sin artistas', 'Los artistas de tu biblioteca de YouTube Music aparecen acá.'); return; }
    content.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.8rem;">' +
      artists.map((a) => '<div class="sp-card" style="padding:.8rem;cursor:pointer;" data-id="' + a.id + '">' +
        coverHtml(a, '100%') +
        '<div style="font-weight:700;font-size:.85rem;margin-top:.5rem;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(a.name) + '</div></div>').join('') + '</div>';
    content.querySelectorAll('.sp-card').forEach((c) =>
      c.addEventListener('click', () => this.ctx.openArtist(c.dataset.id)));
  }

  _albums(content) {
    const albums = library.albumsList();
    if (!albums.length) { content.innerHTML = emptyState('album', 'Sin álbumes', 'Los álbumes de tu biblioteca de YouTube Music aparecen acá.'); return; }
    content.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.8rem;">' +
      albums.map((a) => '<div class="sp-card" style="padding:.8rem;cursor:pointer;" data-id="' + a.id + '">' +
        coverHtml(a, '100%') +
        '<div style="font-weight:700;font-size:.85rem;margin-top:.5rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(a.title) + '</div>' +
        '<div style="font-size:.72rem;color:var(--player-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(a.artist || '') + '</div></div>').join('') + '</div>';
    content.querySelectorAll('.sp-card').forEach((c) =>
      c.addEventListener('click', () => this.ctx.openAlbum(c.dataset.id)));
  }

  _playlists(content) {
    const playlists = library.playlistsList();
    if (!playlists.length) { content.innerHTML = emptyState('list', 'Sin playlists', 'Creá una playlist local o gestioná las de YouTube Music.'); return; }
    content.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.8rem;">' +
      playlists.map((p) => '<div class="sp-card" style="padding:.8rem;cursor:pointer;" data-id="' + p.id + '">' +
        coverHtml(p.tracks && p.tracks[0] ? p.tracks[0] : { thumb: '' }, '100%') +
        '<div style="font-weight:700;font-size:.85rem;margin-top:.5rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p.name) + '</div>' +
        '<div style="font-size:.72rem;color:var(--player-text-secondary);">' + (p.tracks ? p.tracks.length : 0) + ' canciones</div></div>').join('') + '</div>';
    content.querySelectorAll('.sp-card').forEach((c) =>
      c.addEventListener('click', () => this.ctx.openPlaylist(c.dataset.id)));
  }

  _history(content) {
    this._list(content, library.historyList(), 'clock', 'Sin historial', 'Lo que reproduzcas va a aparecer acá.');
  }

  async _loadRemote(content) {
    if (!content || !content.isConnected) return;
    content.innerHTML = spinner('Conectando con YouTube Music...');
    try {
      const data = await api.library(50);
      library.mergeRemote(data);
      this.remoteLoaded = true;
      toast('Biblioteca de YouTube Music sincronizada', 'success');
    } catch (err) {
      if (content.isConnected) {
        content.innerHTML = emptyState('search', 'YouTube Music no disponible', friendlyError(err) + '<br><br>Tu biblioteca local sigue disponible.');
      }
      return;
    }
    this._load(content);
  }
}
