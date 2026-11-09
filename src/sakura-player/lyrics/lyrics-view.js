/* ===================================================================
   Sakura Player — Vista de Letras Sincronizadas
   
   Muestra la letra de la canción actual sincronizada con el tiempo de
   reproducción. Resalta la línea actual y la palabra activa (karaoke)
   cuando el proveedor (Lyrica) entrega timestamps de palabra.
   
   Soporta dos formatos de palabras:
   - LRC:    { text, startTime, endTime }
   - Lyrica: { word, start, end }
   
   Se integra con el Player mediante el evento 'time' y con el cliente
   de letras para buscar y cachear letras por track.
   =================================================================== */

import { player } from '../player/player.js';
import { api } from '../api/client.js';
import {
  parseLrc,
  currentLineIndex,
  currentWordIndex,
} from './lrc-parser.js';
import { fetchLyrics } from './lyrics-client.js';
import { icon, escapeHtml, toast } from '../components/ui.js';

const _CACHE = new Map(); // trackId -> { entries, syncedLyrics, plainLyrics, source, words }

export class LyricsView {
  constructor(root) {
    this.root = root;
    this.el = null;
    this._handlers = {};
    this._currentTrackId = null;
    this._entries = [];
    this._loading = false;
    this._error = null;
    this._raf = null;
    this._lineEl = null;
    this._translated = false;
    this._translatedText = '';
    this._source = null; // 'lrclib' | 'lyrica' | 'youtube'
    this._wordsByLine = new Map(); // lineIndex -> array de palabras normalizadas
  }

  render() {
    return '<div id="sp-lyrics" class="sp-lyrics"></div>';
  }

  mount() {
    this._unbind();
    this.el = this.root.querySelector('#sp-lyrics');
    if (!this.el) return;

    this._handlers.trackchange = () => this._onTrackChange();
    this._handlers.time = (s) => this._onTime(s.currentTime);
    player.on('trackchange', this._handlers.trackchange);
    player.on('time', this._handlers.time);

    this._render();
  }

  destroy() {
    this._unbind();
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.el) this.el.innerHTML = '';
  }

  _unbind() {
    player.off('trackchange', this._handlers.trackchange);
    player.off('time', this._handlers.time);
    this._handlers = {};
  }

  /* ---------------- track change ---------------- */
  async _onTrackChange() {
    const t = player.current();
    if (!t) {
      this._currentTrackId = null;
      this._entries = [];
      this._error = null;
      this._source = null;
      this._wordsByLine.clear();
      this._render();
      return;
    }

    const id = t.id || t.title || '';
    if (id === this._currentTrackId && this._entries.length > 0) {
      this._error = null;
      this._render();
      return;
    }

    this._currentTrackId = id;
    this._entries = [];
    this._translatedLines = [];
    this._translated = false;
    this._translatedText = '';
    this._source = null;
    this._wordsByLine.clear();
    this._error = null;
    this._loading = true;
    this._render();

    try {
      // 1) Intentar letras desde el backend FastAPI (LrcLib o Lyrica)
      let data = null;
      try {
        const backendData = await api.lyrics(t);
        if (backendData && (backendData.syncedLyrics || backendData.plainLyrics)) {
          const source = backendData.source || 'lrclib';
          const syncLevel = backendData.sync_level || 'line';
          let entries = [];

          // Procesar palabras de Lyrica (word-level) si existen
          let wordsByLine = new Map();
          if (backendData.words && Array.isArray(backendData.words)) {
            backendData.words.forEach((lineObj, lineIdx) => {
              const lineWords = lineObj.words || [];
              const normalized = lineWords.map((w) => ({
                text: w.word || w.text || '',
                startTime: w.start || w.startTime || 0,
                endTime: w.end || w.endTime || 0,
              }));
              wordsByLine.set(lineIdx, normalized);
            });
          }

          if (backendData.syncedLyrics) {
            entries = parseLrc(backendData.syncedLyrics);
            // Si Lyrica devolvió palabras, inyectarlas en las entradas correspondientes
            if (wordsByLine.size > 0) {
              entries.forEach((e, i) => {
                const wl = wordsByLine.get(i);
                if (wl && wl.length > 0) {
                  e.words = wl;
                }
              });
            }
          } else if (backendData.plainLyrics) {
            // Letras sin sincronizar: crear entradas ficticias
            const lines = backendData.plainLyrics.split('\n').filter((l) => l.trim());
            entries = lines.map((text, i) => ({
              time: i * 5, // tiempo aproximado
              text,
              words: null,
            }));
          }

          data = {
            source,
            syncLevel,
            syncedLyrics: backendData.syncedLyrics || null,
            plainLyrics: backendData.plainLyrics || null,
            entries,
            wordsByLine,
          };
        }
      } catch (e) {
        // Backend no disponible o sin letras, continuar al fallback
      }

      // 2) Fallback: consulta directa a LrcLib / YouTube subtitles
      if (!data || !data.entries || data.entries.length === 0) {
        data = await fetchLyrics(t);
      }

      this._entries = data.entries || [];
      this._source = data.source || 'lrclib';
      this._wordsByLine = data.wordsByLine || new Map();
      // Inyectar palabras en las entradas si no las tienen
      this._entries.forEach((e, i) => {
        if (!e.words) {
          const wl = this._wordsByLine.get(i);
          if (wl) e.words = wl;
        }
      });
      this._error = this._entries.length === 0 ? 'synced_only' : null;
      this._loading = false;
      this._render();
    } catch (e) {
      this._loading = false;
      if (e.code === 'not_found') {
        this._error = 'not_found';
      } else {
        this._error = 'api';
      }
      this._render();
    }
  }

  /* ---------------- tiempo de reproducción ---------------- */
  _onTime(currentTime) {
    if (!this._entries.length) return;

    const idx = currentLineIndex(this._entries, currentTime);
    const entry = this._entries[idx];

    // Resaltar palabra activa dentro de la línea
    let wordIdx = -1;
    if (entry && entry.words && entry.words.length) {
      wordIdx = currentWordIndex(this._entries, idx, currentTime);
    }

    this._renderLine(idx, entry, wordIdx);
  }

  /* ---------------- renderizado ---------------- */
  _render() {
    if (!this.el) return;

    if (this._loading) {
      this.el.innerHTML = this._loadingHtml();
      return;
    }

    if (this._error === 'not_found') {
      this.el.innerHTML = this._notFoundHtml();
      return;
    }

    if (this._error === 'api') {
      this.el.innerHTML = this._errorHtml('No se pudieron cargar las letras');
      return;
    }

    if (!this._entries.length) {
      this.el.innerHTML = this._noSyncedHtml();
      return;
    }

    this.el.innerHTML = this._listHtml();
    this._lineEl = this.el.querySelector('.sp-lyrics-line');
    // Renderizar la línea actual (puede ser -1 al inicio)
    this._renderLine(currentLineIndex(this._entries, player.currentTime() || 0));

    // Bind del botón de traducir
    const btnTranslate = this.el.querySelector('#sp-lyrics-translate');
    if (btnTranslate) {
      btnTranslate.onclick = () => this._toggleTranslate();
    }
    const btnClose = this.el.querySelector('#sp-lyrics-close');
    if (btnClose) {
      btnClose.onclick = () => {
        const sp = window.getSakuraPlayer ? window.getSakuraPlayer() : null;
        if (sp) { sp.view = 'player'; sp._renderView(); }
      };
    }
  }

  async _toggleTranslate() {
    if (this._translated) {
      this._translated = false;
      this._translatedLines = [];
      this._render();
      return;
    }

    const originalText = this._entries.map((e) => e.text).join('\n');
    if (!originalText.trim()) return;

    try {
      const translated = await api.translateLyrics(originalText, 'es');
      if (translated) {
        this._translatedLines = translated.split('\n');
        this._translated = true;
        this._render();
      }
    } catch (e) {
      toast('No se pudo traducir la letra: ' + (e.message || 'error desconocido'), 'error');
    }
  }

  _renderLine(activeIdx, entry, wordIdx) {
    if (!this.el) return;

    const lines = this.el.querySelectorAll('.sp-lyrics-line');
    lines.forEach((el, i) => {
      const isActive = i === activeIdx;
      el.classList.toggle('sp-lyrics-active', isActive);
      el.setAttribute('aria-current', isActive ? 'true' : 'false');

      if (isActive && entry) {
        const lineText = this._translated && this._translatedLines[activeIdx]
          ? this._translatedLines[activeIdx]
          : entry.text;

        // Si hay palabras con timestamp, resaltar la palabra activa (solo en original)
        if (!this._translated && entry.words && entry.words.length && wordIdx >= 0) {
          el.innerHTML = this._highlightWords(entry, wordIdx);
        } else {
          el.innerHTML = escapeHtml(lineText);
        }
        // Scroll suave a la línea activa
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* noop */ }
      } else if (!isActive) {
        const lineText = this._translated && this._translatedLines[i]
          ? this._translatedLines[i]
          : (el.dataset.text || '');
        el.innerHTML = escapeHtml(lineText);
      }
    });
  }

  _highlightWords(entry, activeWordIdx) {
    return entry.words
      .map((w, i) => {
        const active = i === activeWordIdx;
        return active
          ? `<mark class="sp-lyrics-word-active">${escapeHtml(w.text)}</mark>`
          : `<span class="sp-lyrics-word">${escapeHtml(w.text)}</span>`;
      })
      .join(' ');
  }

  _listHtml() {
    const sourceLabel = this._sourceMap(this._source);
    return `
      <div class="sp-lyrics-header">
        <div class="sp-lyrics-title">${this._translated ? 'Letra traducida' : 'Letra sincronizada'}</div>
        <div style="display:flex;align-items:center;gap:.4rem;">
          <span class="sp-lyrics-source" title="Proveedor de letras">${sourceLabel}</span>
          ${this._translated
            ? '<button class="sp-btn sp-btn-icon" id="sp-lyrics-translate" title="Mostrar original" aria-label="Mostrar letra original">' + icon('close') + '</button>'
            : '<button class="sp-btn sp-btn-icon" id="sp-lyrics-translate" title="Traducir letra" aria-label="Traducir letra">' + icon('translate') + '</button>'}
          <button class="sp-btn sp-btn-icon sp-lyrics-close" id="sp-lyrics-close" title="Cerrar letras" aria-label="Cerrar letras">${icon('close')}</button>
        </div>
      </div>
      <div class="sp-lyrics-list" role="region" aria-label="Letra de la canción" tabindex="0">
        ${this._entries.map((e, i) => `
          <div class="sp-lyrics-line" data-index="${i}" data-text="${escapeHtml(e.text).replace(/"/g, '&quot;')}" aria-label="Línea ${i + 1}">
            ${escapeHtml(this._translated && this._translatedLines ? this._translatedLines[i] || '' : e.text)}
          </div>
        `).join('')}
      </div>
    `;
  }

  _sourceMap(source) {
    const map = {
      'lrclib': '📚 LrcLib',
      'lyrica': '🎵 Lyrica (multi-provider)',
      'youtube': '▶ YouTube',
    };
    return map[source] || '📝 Letras';
  }

  _loadingHtml() {
    return `
      <div class="sp-lyrics-empty">
        <div class="sp-lyrics-icon">${icon('music')}</div>
        <div class="sp-lyrics-text">Cargando letra sincronizada…</div>
      </div>
    `;
  }

  _notFoundHtml() {
    return `
      <div class="sp-lyrics-empty">
        <div class="sp-lyrics-icon">${icon('close')}</div>
        <div class="sp-lyrics-text">No se encontró letra sincronizada para esta canción.</div>
      </div>
    `;
  }

  _noSyncedHtml() {
    return `
      <div class="sp-lyrics-empty">
        <div class="sp-lyrics-icon">${icon('disc')}</div>
        <div class="sp-lyrics-text">Esta canción no tiene letra sincronizada disponible.</div>
      </div>
    `;
  }

  _errorHtml(msg) {
    return `
      <div class="sp-lyrics-empty">
        <div class="sp-lyrics-icon">${icon('alert')}</div>
        <div class="sp-lyrics-text">${escapeHtml(msg)}</div>
      </div>
    `;
  }
}
