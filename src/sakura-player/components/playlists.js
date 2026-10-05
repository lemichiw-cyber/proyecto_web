/* ===================================================================
   Sakura Player — Playlists (locales + YouTube Music)
   Crear, renombrar, eliminar, agregar/quitar canciones, reordenar.
   =================================================================== */

import { player } from '../player/player.js';
import { library } from '../library/library.js';
import { api, friendlyError } from '../api/client.js';
import { icon, coverHtml, trackRow, emptyState, spinner, toast, escapeHtml, confirmDialog, promptDialog } from './ui.js';

export class PlaylistView {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.playlistId = null;
  }

  render() {
    return '<div style="display:flex;flex-direction:column;gap:1rem;">' +
      '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">' +
        '<button class="sp-btn sp-btn-primary" id="sp-pl-new">' + icon('plus') + ' Nueva playlist</button>' +
        '<button class="sp-btn" id="sp-pl-youtube">' + icon('search') + ' De YouTube Music</button>' +
      '</div>' +
      '<div id="sp-pl-content"></div>' +
    '</div>';
  }

  mount() {
    this.root.querySelector('#sp-pl-new').addEventListener('click', () => this._create());
    this.root.querySelector('#sp-pl-youtube').addEventListener('click', () => this._fromYoutube());
    this._listPlaylists();
  }

  _listPlaylists() {
    const content = this.root.querySelector('#sp-pl-content');
    const playlists = library.playlistsList();
    if (!playlists.length) {
      content.innerHTML = emptyState('list', 'No tenés playlists', 'Creá una nueva playlist para organizar tu música.');
      return;
    }
    content.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.8rem;">' +
      playlists.map((p) => '<div class="sp-card" style="padding:.8rem;cursor:pointer;" data-id="' + p.id + '">' +
        coverHtml(p.tracks && p.tracks[0] ? p.tracks[0] : { thumb: '' }, '100%') +
        '<div style="font-weight:700;font-size:.85rem;margin-top:.5rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p.name) + '</div>' +
        '<div style="font-size:.72rem;color:var(--player-text-secondary);">' + (p.tracks ? p.tracks.length : 0) + ' canciones</div>' +
        '<div style="display:flex;gap:.3rem;margin-top:.5rem;">' +
          '<button class="sp-btn sp-btn-icon" data-play title="Reproducir">' + icon('play') + '</button>' +
          '<button class="sp-btn sp-btn-icon" data-shuffle title="Shuffle">' + icon('shuffle') + '</button>' +
          '<button class="sp-btn sp-btn-icon" data-edit title="Editar">' + icon('edit') + '</button>' +
          '<button class="sp-btn sp-btn-icon" data-del title="Eliminar">' + icon('trash') + '</button>' +
        '</div></div>').join('') + '</div>';

    content.querySelectorAll('.sp-card').forEach((card) => {
      const id = card.dataset.id;
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        this.open(id);
      });
      card.querySelector('[data-play]').addEventListener('click', () => {
        const pl = library.getPlaylist(id);
        if (pl && pl.tracks.length) this.ctx.playTracks(pl.tracks, 0);
      });
      card.querySelector('[data-shuffle]').addEventListener('click', () => {
        const pl = library.getPlaylist(id);
        if (pl && pl.tracks.length) {
          player.shuffle = true;
          this.ctx.playTracks(pl.tracks.slice().sort(() => Math.random() - 0.5), 0);
        }
      });
      card.querySelector('[data-edit]').addEventListener('click', () => this._edit(id));
      card.querySelector('[data-del]').addEventListener('click', () => this._delete(id));
    });
  }

  open(id) {
    this.playlistId = id;
    const content = this.root.querySelector('#sp-pl-content');
    const pl = library.getPlaylist(id);
    if (!pl) { this._listPlaylists(); return; }
    const rows = pl.tracks.map((t, i) => trackRow(t, { index: i, actions:
      '<button class="sp-btn sp-btn-icon" data-up title="Subir">' + '↑' + '</button>' +
      '<button class="sp-btn sp-btn-icon" data-down title="Bajar">' + '↓' + '</button>' +
      '<button class="sp-btn sp-btn-icon" data-rm title="Quitar">' + icon('trash') + '</button>'
    })).join('');
    content.innerHTML =
      '<button class="sp-btn" id="sp-pl-back" style="margin-bottom:.6rem;">← Volver</button>' +
      '<div class="sp-panel" style="padding:1rem;display:flex;gap:1rem;align-items:center;margin-bottom:.8rem;">' +
        coverHtml(pl.tracks && pl.tracks[0] ? pl.tracks[0] : { thumb: '' }, '72px') +
        '<div><div style="font-weight:800;font-size:1.05rem;">' + escapeHtml(pl.name) + '</div>' +
        '<div style="font-size:.78rem;color:var(--player-text-secondary);">' + pl.tracks.length + ' canciones' +
        (pl.description ? ' · ' + escapeHtml(pl.description) : '') + '</div></div>' +
        '<div style="margin-left:auto;display:flex;gap:.4rem;">' +
          '<button class="sp-btn sp-btn-primary" id="sp-pl-play">' + icon('play') + ' Reproducir</button>' +
          '<button class="sp-btn" id="sp-pl-shuffle">' + icon('shuffle') + '</button>' +
        '</div></div>' +
      (pl.tracks.length ? '<div style="display:flex;flex-direction:column;gap:.3rem;">' + rows + '</div>'
        : emptyState('list', 'Playlist vacía', 'Buscá canciones y agregalas con el menú ⋯'));

    content.querySelector('#sp-pl-back').addEventListener('click', () => this._listPlaylists());
    content.querySelector('#sp-pl-play').addEventListener('click', () => this.ctx.playTracks(pl.tracks, 0));
    content.querySelector('#sp-pl-shuffle').addEventListener('click', () => {
      player.shuffle = true;
      this.ctx.playTracks(pl.tracks.slice().sort(() => Math.random() - 0.5), 0);
    });
    content.querySelectorAll('[data-up]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = +b.closest('[data-track-id]').dataset.index;
        library.moveTrackInPlaylist(id, i, i - 1);
        this.open(id);
      }));
    content.querySelectorAll('[data-down]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = +b.closest('[data-track-id]').dataset.index;
        library.moveTrackInPlaylist(id, i, i + 1);
        this.open(id);
      }));
    content.querySelectorAll('[data-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = +b.closest('[data-track-id]').dataset.index;
        library.removeFromPlaylist(id, pl.tracks[i].id);
        this.open(id);
      }));
  }

  async _create() {
    const name = await promptDialog('Nueva playlist', 'Nombre de la playlist');
    if (!name) return;
    const pl = library.createPlaylist(name);
    toast('Playlist creada', 'success');
    this.open(pl.id);
  }

  async _edit(id) {
    const pl = library.getPlaylist(id);
    if (!pl) return;
    const name = await promptDialog('Renombrar playlist', 'Nombre', pl.name);
    if (name === null) return;
    library.renamePlaylist(id, name);
    toast('Playlist actualizada', 'success');
    this.open(id);
  }

  async _delete(id) {
    if (await confirmDialog('¿Eliminar esta playlist?', 'Eliminar playlist')) {
      library.deletePlaylist(id);
      toast('Playlist eliminada', 'success');
      this._listPlaylists();
    }
  }

  _fromYoutube() {
    const content = this.root.querySelector('#sp-pl-content');
    content.innerHTML = spinner('Buscando playlists en YouTube Music...');
    // Busca playlists públicas populares como punto de partida
    api.search('mix', 'playlists', 12)
      .then((res) => {
        const items = res.playlists || [];
        if (!items.length) {
          content.innerHTML = emptyState('list', 'Sin playlists', 'No se encontraron playlists públicas.');
          return;
        }
        content.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.8rem;">' +
          items.map((p) => '<div class="sp-card" style="padding:.8rem;cursor:pointer;" data-id="' + p.id + '">' +
            coverHtml(p, '100%') +
            '<div style="font-weight:700;font-size:.85rem;margin-top:.5rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p.title) + '</div>' +
            '<div style="font-size:.72rem;color:var(--player-text-secondary);">' + escapeHtml(p.author || '') + '</div></div>').join('') + '</div>';
        content.querySelectorAll('.sp-card').forEach((c) =>
          c.addEventListener('click', () => this.ctx.openPlaylist(c.dataset.id)));
      })
      .catch((err) => {
        content.innerHTML = emptyState('list', 'YouTube Music no disponible', friendlyError(err));
      });
  }
}
