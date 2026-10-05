/* ===================================================================
   Sakura Player — Biblioteca (canciones, artistas, álbumes, favoritos,
   playlists e historial). Combina YouTube Music + archivos locales.
   =================================================================== */

import { player } from '../player/player.js';

const LS_KEY = 'sp_library_v1';

const EMPTY = {
  favorites: [],   // tracks
  history: [],     // tracks con playedAt
  localSongs: [],  // metadatos de archivos locales
  playlists: [],   // playlists locales {id,name,description,tracks[],createdAt}
};

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return Object.assign({}, EMPTY, obj || {});
  } catch (e) {
    return { ...EMPTY };
  }
}

function save(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* sin storage */ }
}

class Library {
  constructor() {
    this.state = load();
    this._listeners = {};
    // Sincroniza favoritos/historial del motor de audio
    this.state.favorites = player.favorites.size ? [...player.favorites].map((id) => ({ id })) : this.state.favorites;
  }

  on(evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); return this; }
  emit(evt, payload) { (this._listeners[evt] || []).forEach((fn) => fn(payload)); }
  _commit() { save(this.state); }

  /* ---------------- canciones ---------------- */
  allSongs() {
    const yt = this.state.favorites.filter((t) => t.source !== 'local');
    const local = this.state.localSongs;
    return [...local, ...yt];
  }

  getSong(id) {
    return this.allSongs().find((t) => t.id === id) || null;
  }

  /* ---------------- favoritos ---------------- */
  isFavorite(id) { return this.state.favorites.some((t) => t.id === id); }

  async toggleFavorite(track) {
    const isFav = this.isFavorite(track.id);
    if (isFav) {
      this.state.favorites = this.state.favorites.filter((t) => t.id !== track.id);
    } else {
      this.state.favorites.unshift(track);
    }
    player.toggleFavorite(track);
    this._commit();
    this.emit('favorites', this.state.favorites);
    return !isFav;
  }

  favoritesList() { return this.state.favorites; }

  /* ---------------- historial ---------------- */
  historyList() { return this.state.history; }

  pushHistory(track) {
    this.state.history = this.state.history.filter((t) => t.id !== track.id);
    this.state.history.unshift({ ...track, playedAt: Date.now() });
    this.state.history = this.state.history.slice(0, 200);
    this._commit();
    this.emit('history', this.state.history);
  }

  clearHistory() {
    this.state.history = [];
    this._commit();
    this.emit('history', this.state.history);
  }

  /* ---------------- artistas / álbumes ---------------- */
  artistsList() { return this.state.artists || []; }
  albumsList() { return this.state.albums || []; }

  setArtists(artists) { this.state.artists = artists; this._commit(); this.emit('artists', artists); }
  setAlbums(albums) { this.state.albums = albums; this._commit(); this.emit('albums', albums); }

  /* ---------------- archivos locales ---------------- */
  addLocalSongs(tracks) {
    const existing = new Set(this.state.localSongs.map((t) => t.id));
    const fresh = tracks.filter((t) => !existing.has(t.id));
    this.state.localSongs = [...this.state.localSongs, ...fresh];
    this._commit();
    this.emit('localSongs', this.state.localSongs);
    return fresh.length;
  }

  removeLocalSong(id) {
    this.state.localSongs = this.state.localSongs.filter((t) => t.id !== id);
    this._commit();
    this.emit('localSongs', this.state.localSongs);
  }

  /* ---------------- playlists locales ---------------- */
  createPlaylist(name, description = '') {
    const pl = {
      id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || 'Mi playlist',
      description,
      tracks: [],
      createdAt: Date.now(),
      source: 'local',
    };
    this.state.playlists.unshift(pl);
    this._commit();
    this.emit('playlists', this.state.playlists);
    return pl;
  }

  renamePlaylist(id, name, description) {
    const pl = this.state.playlists.find((p) => p.id === id);
    if (!pl) return null;
    if (name !== undefined) pl.name = name;
    if (description !== undefined) pl.description = description;
    this._commit();
    this.emit('playlists', this.state.playlists);
    return pl;
  }

  deletePlaylist(id) {
    this.state.playlists = this.state.playlists.filter((p) => p.id !== id);
    this._commit();
    this.emit('playlists', this.state.playlists);
  }

  getPlaylist(id) { return this.state.playlists.find((p) => p.id === id) || null; }

  addToPlaylist(id, track) {
    const pl = this.getPlaylist(id);
    if (!pl) return false;
    if (!pl.tracks.some((t) => t.id === track.id)) {
      pl.tracks.push(track);
      this._commit();
      this.emit('playlists', this.state.playlists);
    }
    return true;
  }

  removeFromPlaylist(id, trackId) {
    const pl = this.getPlaylist(id);
    if (!pl) return false;
    pl.tracks = pl.tracks.filter((t) => t.id !== trackId);
    this._commit();
    this.emit('playlists', this.state.playlists);
    return true;
  }

  moveTrackInPlaylist(id, from, to) {
    const pl = this.getPlaylist(id);
    if (!pl || from === to) return false;
    const [item] = pl.tracks.splice(from, 1);
    pl.tracks.splice(to, 0, item);
    this._commit();
    this.emit('playlists', this.state.playlists);
    return true;
  }

  playlistsList() { return this.state.playlists; }

  /* ---------------- fusión con YouTube Music ---------------- */
  mergeRemote(data) {
    // data: {songs, artists, albums, playlists} del backend
    if (data.songs) {
      const ids = new Set(this.state.favorites.map((t) => t.id));
      const fresh = data.songs.filter((t) => !ids.has(t.id));
      this.state.favorites = [...this.state.favorites, ...fresh];
    }
    if (data.artists) this.state.artists = data.artists;
    if (data.albums) this.state.albums = data.albums;
    if (data.playlists) {
      const ids = new Set(this.state.playlists.map((p) => p.id));
      const fresh = data.playlists.filter((p) => !ids.has(p.id));
      this.state.playlists = [...this.state.playlists, ...fresh];
    }
    this._commit();
    this.emit('change', this.state);
  }
}

export const library = new Library();
