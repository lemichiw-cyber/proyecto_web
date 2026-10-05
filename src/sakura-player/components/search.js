/* ===================================================================
   Sakura Player — Búsqueda en YouTube Music
   Debounce + AbortController + pestañas por tipo de resultado.
   =================================================================== */

import { api, debounce, friendlyError } from '../api/client.js';
import { player } from '../player/player.js';
import { library } from '../library/library.js';
import { icon, coverHtml, trackRow, emptyState, spinner, toast, escapeHtml } from './ui.js';

const TABS = [
  { id: 'songs', label: 'Canciones' },
  { id: 'artists', label: 'Artistas' },
  { id: 'albums', label: 'Álbumes' },
  { id: 'playlists', label: 'Playlists' },
];

export class SearchView {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // {openPlaylist, openAlbum, openArtist, playTracks}
    this.results = { songs: [], artists: [], albums: [], playlists: [] };
    this.tab = 'songs';
    this.loading = false;
  }

  render() {
    return '<div style="display:flex;flex-direction:column;gap:1rem;">' +
      '<div style="position:relative;">' +
        '<span style="position:absolute;left:.8rem;top:50%;transform:translateY(-50%);color:var(--player-text-secondary);">' + icon('search') + '</span>' +
        '<input id="sp-search-input" class="sp-input" style="width:100%;padding-left:2.4rem;" type="search" placeholder="Buscar en YouTube Music..." autocomplete="off">' +
      '</div>' +
      '<div style="display:flex;gap:.4rem;flex-wrap:wrap;" id="sp-search-tabs">' +
        TABS.map((t) => '<button class="sp-tab' + (t.id === this.tab ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>').join('') +
      '</div>' +
      '<div id="sp-search-results"></div>' +
    '</div>';
  }

  mount() {
    const input = this.root.querySelector('#sp-search-input');
    const results = this.root.querySelector('#sp-search-results');
    const tabs = this.root.querySelector('#sp-search-tabs');

    let controller = null;
    const run = debounce(async (q) => {
      if (!q || q.trim().length < 2) {
        this.results = { songs: [], artists: [], albums: [], playlists: [] };
        this._renderResults(results);
        return;
      }
      if (controller) controller.abort();
      controller = new AbortController();
      this.loading = true;
      results.innerHTML = spinner('Buscando en YouTube Music...');
      try {
        this.results = await api.search(q.trim(), 'all', 20, controller.signal);
      } catch (err) {
        if (err.code !== 'network' || err.message !== 'La solicitud fue cancelada') {
          results.innerHTML = emptyState('search', 'No se pudo buscar', friendlyError(err));
        }
        return;
      } finally {
        this.loading = false;
      }
      this._renderResults(results);
    }, 350);

    input.addEventListener('input', (e) => run(e.target.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run.flush ? run.flush() : run(e.target.value); });

    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this.tab = btn.dataset.tab;
      tabs.querySelectorAll('.sp-tab').forEach((b) => b.classList.toggle('active', b === btn));
      this._renderResults(results);
    });

    this._renderResults(results);
  }

  _renderResults(container) {
    const items = this.results[this.tab] || [];
    if (!items.length) {
      container.innerHTML = emptyState('search', 'Sin resultados', 'Escribí al menos 2 caracteres para buscar en YouTube Music.');
      return;
    }
    if (this.tab === 'songs') {
      container.innerHTML = '<div style="display:flex;flex-direction:column;gap:.3rem;">' +
        items.map((t, i) => trackRow(t, { index: i, actions: this._songActions(t) })).join('') + '</div>';
    } else {
      container.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.8rem;">' +
        items.map((it) => this._card(it)).join('') + '</div>';
    }
    this._bind(container);
  }

  _songActions(track) {
    const fav = library.isFavorite(track.id);
    return '<button class="sp-btn sp-btn-icon" data-act="play" title="Reproducir">' + icon('play') + '</button>' +
      '<button class="sp-btn sp-btn-icon" data-act="queue" title="Agregar a la cola">' + icon('plus') + '</button>' +
      '<button class="sp-btn sp-btn-icon" data-act="fav" title="Favorito">' + icon(fav ? 'heartFill' : 'heart') + '</button>' +
      '<button class="sp-btn sp-btn-icon" data-act="menu" title="Más">' + icon('dots') + '</button>';
  }

  _card(item) {
    const isArtist = this.tab === 'artists';
    const title = isArtist ? item.name : item.title;
    const sub = isArtist ? (item.subscribers || 'Artista') : (item.artist || '');
    return '<div class="sp-card" style="padding:.8rem;cursor:pointer;" data-type="' + this.tab + '" data-id="' + item.id + '">' +
      coverHtml(item, '100%') +
      '<div style="font-weight:700;font-size:.85rem;margin-top:.5rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(title) + '</div>' +
      '<div style="font-size:.72rem;color:var(--player-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(sub) + '</div>' +
    '</div>';
  }

  _bind(container) {
    container.querySelectorAll('[data-act="play"]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.closest('[data-track-id]').dataset.trackId;
        const idx = (this.results.songs || []).findIndex((t) => t.id === id);
        if (idx >= 0) this.ctx.playTracks(this.results.songs, idx);
      }));
    container.querySelectorAll('[data-act="queue"]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.closest('[data-track-id]').dataset.trackId;
        const t = (this.results.songs || []).find((x) => x.id === id);
        if (t) { player.addToQueue(t); toast('Agregada a la cola', 'success'); }
      }));
    container.querySelectorAll('[data-act="fav"]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.closest('[data-track-id]').dataset.trackId;
        const t = (this.results.songs || []).find((x) => x.id === id);
        if (t) { library.toggleFavorite(t); b.innerHTML = icon(library.isFavorite(id) ? 'heartFill' : 'heart'); }
      }));
    container.querySelectorAll('[data-act="menu"]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.closest('[data-track-id]').dataset.trackId;
        const t = (this.results.songs || []).find((x) => x.id === id);
        if (t) this._trackMenu(t, b);
      }));
    container.querySelectorAll('.sp-card').forEach((c) =>
      c.addEventListener('click', () => {
        const type = c.dataset.type;
        const id = c.dataset.id;
        if (type === 'albums') this.ctx.openAlbum(id);
        else if (type === 'artists') this.ctx.openArtist(id);
        else if (type === 'playlists') this.ctx.openPlaylist(id);
      }));
  }

  _trackMenu(track) {
    const menu = document.createElement('div');
    menu.className = 'sp-panel';
    menu.style.cssText = 'position:fixed;z-index:700;min-width:180px;padding:.4rem;right:1rem;bottom:6.5rem;';
    const playlists = library.playlistsList();
    menu.innerHTML =
      '<div class="sp-panel-title" style="padding:.3rem .5rem;">Agregar a playlist</div>' +
      (playlists.length
        ? playlists.map((p) => '<button class="sp-btn" style="width:100%;justify-content:flex-start;margin-top:.3rem;" data-pl="' + p.id + '">' + escapeHtml(p.name) + '</button>').join('')
        : '<div style="font-size:.78rem;color:var(--player-text-secondary);padding:.4rem .5rem;">No tenés playlists locales.</div>') +
      '<button class="sp-btn" style="width:100%;justify-content:flex-start;margin-top:.3rem;" data-new>＋ Nueva playlist</button>';
    document.body.appendChild(menu);
    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
    menu.querySelectorAll('[data-pl]').forEach((b) =>
      b.addEventListener('click', () => {
        library.addToPlaylist(b.dataset.pl, track);
        toast('Agregada a la playlist', 'success');
        menu.remove();
      }));
    menu.querySelector('[data-new]').addEventListener('click', () => {
      menu.remove();
      this.ctx.promptNewPlaylist(track);
    });
  }
}
