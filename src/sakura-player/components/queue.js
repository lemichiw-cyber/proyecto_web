/* ===================================================================
   Sakura Player — Cola de reproducción
   =================================================================== */

import { player } from '../player/player.js';
import { icon, emptyState, escapeHtml } from './ui.js';

export class QueueView {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
  }

  render() {
    return '<div style="display:flex;flex-direction:column;gap:1rem;">' +
      '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">' +
        '<button class="sp-btn" id="sp-q-clear">Limpiar cola</button>' +
        '<button class="sp-btn" id="sp-q-shuffle">' + icon('shuffle') + ' Shuffle</button>' +
        '<span style="font-size:.78rem;color:var(--player-text-secondary);margin-left:auto;" id="sp-q-count"></span>' +
      '</div>' +
      '<div id="sp-q-list"></div>' +
    '</div>';
  }

  mount() {
    this.root.querySelector('#sp-q-clear').addEventListener('click', () => {
      player.clearQueue();
      this._render();
    });
    this.root.querySelector('#sp-q-shuffle').addEventListener('click', () => {
      const q = player.queue.slice().sort(() => Math.random() - 0.5);
      player.setQueue(q, player.index);
      this._render();
    });
    player.on('queue', () => this._render());
    player.on('trackchange', () => this._render());
    this._render();
  }

  _render() {
    const list = this.root.querySelector('#sp-q-list');
    const q = player.queue;
    this.root.querySelector('#sp-q-count').textContent = q.length + ' en cola';
    if (!q.length) {
      list.innerHTML = emptyState('queue', 'La cola está vacía', 'Reproducí una canción o agregá desde la búsqueda.');
      return;
    }
    list.innerHTML = '<div style="display:flex;flex-direction:column;gap:.3rem;">' +
      q.map((t, i) => '<div class="sp-queue-item' + (i === player.index ? ' current' : '') + '" data-id="' + t.id + '" data-index="' + i + '">' +
        '<span style="font-size:.72rem;color:var(--player-text-secondary);min-width:1.4rem;text-align:right;">' + (i + 1) + '</span>' +
        '<div class="sp-cover" style="width:36px;height:36px;flex:none;">' +
          (t.thumb ? '<img src="' + t.thumb + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
                   : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--player-text-secondary);">' + icon('note') + '</div>') +
        '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(t.title) + '</div>' +
        '<div style="font-size:.7rem;color:var(--player-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(t.artist || '') + '</div></div>' +
        '<button class="sp-btn sp-btn-icon" data-rm title="Quitar">' + icon('trash') + '</button>' +
      '</div>').join('') + '</div>';

    list.querySelectorAll('.sp-queue-item').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-rm]')) return;
        const i = +row.dataset.index;
        player.setQueue(player.queue, i);
        player.play();
      });
    });
    list.querySelectorAll('[data-rm]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = +b.closest('[data-index]').dataset.index;
        player.removeFromQueue(i);
      }));
  }
}
