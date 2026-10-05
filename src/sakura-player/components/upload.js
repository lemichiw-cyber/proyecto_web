/* ===================================================================
   Sakura Player — Panel de música local
   Arrastrar y soltar + selección múltiple + metadatos + portada.
   =================================================================== */

import { processLocalFiles } from '../library/local-files.js';
import { library } from '../library/library.js';
import { player } from '../player/player.js';
import { icon, toast, emptyState, spinner } from './ui.js';

export class UploadView {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
  }

  render() {
    return '<div style="display:flex;flex-direction:column;gap:1rem;">' +
      '<div class="sp-dropzone" id="sp-drop">' +
        '<div style="font-size:2rem;margin-bottom:.5rem;">' + icon('upload') + '</div>' +
        '<div style="font-weight:700;margin-bottom:.3rem;">Arrastrá tu música acá</div>' +
        '<div style="font-size:.78rem;color:var(--player-text-secondary);margin-bottom:.8rem;">MP3 · WAV · FLAC · OGG · M4A — selección múltiple</div>' +
        '<button class="sp-btn sp-btn-primary">' + icon('plus') + ' Elegir archivos</button>' +
        '<input type="file" id="sp-file-input" accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac" multiple style="display:none;">' +
      '</div>' +
      '<div id="sp-upload-status"></div>' +
      '<div>' +
        '<div class="sp-panel-title" style="margin-bottom:.6rem;">Archivos en tu biblioteca</div>' +
        '<div id="sp-local-list"></div>' +
      '</div>' +
    '</div>';
  }

  mount() {
    const drop = this.root.querySelector('#sp-drop');
    const input = this.root.querySelector('#sp-file-input');

    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { this._handle(input.files); input.value = ''; });

    ['dragenter', 'dragover'].forEach((evt) =>
      drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((evt) =>
      drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) this._handle(files);
    });

    this._renderLocal();
  }

  async _handle(files) {
    const audioFiles = (files || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name));
    if (!audioFiles.length) {
      toast('No se encontraron archivos de audio válidos', 'error');
      return;
    }
    status.innerHTML = spinner('Leyendo metadatos de ' + audioFiles.length + ' archivo(s)...');
    try {
      const tracks = await processLocalFiles(audioFiles);
      const added = library.addLocalSongs(tracks);
      tracks.forEach((t) => player.registerLocalTrack(t, t.url));
      status.innerHTML = '';
      toast(added ? added + ' canción(es) agregadas a tu biblioteca' : 'Estas canciones ya estaban en tu biblioteca', added ? 'success' : 'info');
      this._renderLocal();
    } catch (err) {
      status.innerHTML = emptyState('upload', 'No se pudieron leer los archivos', 'Verificá que sean archivos de audio válidos.');
    }
  }

  _renderLocal() {
    const list = this.root.querySelector('#sp-local-list');
    const songs = library.state.localSongs || [];
    if (!songs.length) {
      list.innerHTML = emptyState('music', 'Sin archivos locales', 'Los archivos que agregues aparecen acá con su portada y metadatos.');
      return;
    }
    list.innerHTML = '<div style="display:flex;flex-direction:column;gap:.3rem;">' +
      songs.map((t) => '<div class="sp-queue-item" data-id="' + t.id + '">' +
        '<div class="sp-cover" style="width:40px;height:40px;flex:none;">' +
          (t.thumb ? '<img src="' + t.thumb + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
                   : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--player-text-secondary);">' + icon('note') + '</div>') +
        '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (t.title || '') + '</div>' +
        '<div style="font-size:.72rem;color:var(--player-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (t.artist || '') + '</div></div>' +
        '<button class="sp-btn sp-btn-icon" data-play title="Reproducir">' + icon('play') + '</button>' +
        '<button class="sp-btn sp-btn-icon" data-del title="Quitar">' + icon('trash') + '</button>' +
      '</div>').join('') + '</div>';

    list.querySelectorAll('[data-play]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.closest('[data-id]').dataset.id;
        const idx = songs.findIndex((t) => t.id === id);
        if (idx >= 0) this.ctx.playTracks(songs, idx);
      }));
    list.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.closest('[data-id]').dataset.id;
        library.removeLocalSong(id);
        this._renderLocal();
        toast('Archivo quitado de la biblioteca', 'success');
      }));
  }
}
