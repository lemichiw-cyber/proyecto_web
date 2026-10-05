/* ===================================================================
   Sakura Player — Utilidades de UI (toast, diálogos, iconos, tarjetas)
   =================================================================== */

import { formatTime } from '../library/local-files.js';

/* ---------------- toast ---------------- */
let toastEl = null;
let toastTimer = null;

export function toast(message, type = 'info') {
  // Reutiliza el toast de proyecto_web si existe
  const existing = document.getElementById('toast');
  if (existing) {
    clearTimeout(toastTimer);
    existing.textContent = message;
    existing.className = 'toast toast-' + (type === 'info' ? 'success' : type) + ' show';
    toastTimer = setTimeout(() => existing.classList.remove('show'), 3200);
    return;
  }
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'sp-toast';
    document.body.appendChild(toastEl);
  }
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = 'sp-toast show' + (type === 'error' ? ' sp-toast-error' : type === 'success' ? ' sp-toast-success' : '');
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

/* ---------------- diálogos ---------------- */
export function dialog({ title, body, actions }) {
  const overlay = document.createElement('div');
  overlay.className = 'sp-dialog-overlay';
  const box = document.createElement('div');
  box.className = 'sp-dialog';
  box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem;">' +
    '<h3 style="margin:0;font-size:1rem;">' + escapeHtml(title) + '</h3>' +
    '<button class="sp-btn sp-btn-icon" data-close aria-label="Cerrar">✕</button></div>';
  const content = document.createElement('div');
  content.innerHTML = body;
  box.appendChild(content);

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem;flex-wrap:wrap;';
  (actions || [{ label: 'Cerrar', value: null }]).forEach((a) => {
    const btn = document.createElement('button');
    btn.className = 'sp-btn' + (a.primary ? ' sp-btn-primary' : '');
    btn.textContent = a.label;
    btn.addEventListener('click', () => {
      const value = a.onClick ? a.onClick(content) : undefined;
      if (a.keepOpen) return;
      overlay.remove();
      if (a.value !== undefined) a.value(value);
    });
    footer.appendChild(btn);
  });
  box.appendChild(footer);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  box.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
  const first = box.querySelector('input,select,textarea');
  if (first) first.focus();
  return { overlay, content, box };
}

export function confirmDialog(message, title = 'Confirmar') {
  return new Promise((resolve) => {
    dialog({
      title,
      body: '<p style="margin:0;">' + escapeHtml(message) + '</p>',
      actions: [
        { label: 'Cancelar', value: () => resolve(false) },
        { label: 'Eliminar', primary: true, value: () => resolve(true) },
      ],
    });
  });
}

export function promptDialog(title, placeholder = '', defaultValue = '') {
  return new Promise((resolve) => {
    dialog({
      title,
      body: '<input class="sp-input" style="width:100%;" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(defaultValue) + '">',
      actions: [
        { label: 'Cancelar', value: () => resolve(null) },
        { label: 'Guardar', primary: true, value: (c) => { const i = c.querySelector('input'); return i ? i.value.trim() : null; } },
      ],
    });
  });
}

/* ---------------- iconos SVG ---------------- */
const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 6l8.5 6L6 18zM16 6h2v12h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18 6l-8.5 6L18 18zM6 6h2v12H6z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  repeatOne: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="15" font-size="8" fill="currentColor" stroke="none" text-anchor="middle">1</text></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  queue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 6h13M3 11h13M3 16h9"/><path d="M18 14l4 3-4 3" fill="none"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M12 5v14M5 12h14"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  disc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  album: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="4"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
  eq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M9 6l6 6-6 6"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
};

export function icon(name) {
  return ICONS[name] || ICONS.music;
}

/* ---------------- tarjetas ---------------- */
export function coverHtml(track, size = '56px') {
  const src = track.thumb || '';
  const inner = src
    ? '<img src="' + src + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
    : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--player-text-secondary);">' + icon('note') + '</div>';
  return '<div class="sp-cover" style="width:' + size + ';height:' + size + ';">' + inner + '</div>';
}

export function trackRow(track, { index, actions } = {}) {
  const fav = track.fav ? ' fav' : '';
  return '<div class="sp-queue-item' + fav + '" data-track-id="' + track.id + '">' +
    (index !== undefined ? '<span style="font-size:.72rem;color:var(--player-text-secondary);min-width:1.4rem;text-align:right;">' + (index + 1) + '</span>' : '') +
    coverHtml(track, '40px') +
    '<div style="flex:1;min-width:0;">' +
      '<div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(track.title) + '</div>' +
      '<div style="font-size:.72rem;color:var(--player-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(track.artist || '') + (track.album ? ' · ' + escapeHtml(track.album) : '') + '</div>' +
    '</div>' +
    (track.durationText || track.duration ? '<span style="font-size:.72rem;color:var(--player-text-secondary);">' + (track.durationText || formatTime(track.duration)) + '</span>' : '') +
    (actions || '') +
  '</div>';
}

export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function emptyState(iconName, title, hint) {
  return '<div class="sp-empty"><div class="sp-empty-icon">' + icon(iconName) + '</div>' +
    '<div style="font-weight:700;margin-bottom:.3rem;">' + escapeHtml(title) + '</div>' +
    '<div style="font-size:.8rem;">' + escapeHtml(hint || '') + '</div></div>';
}

export function spinner(text) {
  return '<div style="display:flex;align-items:center;justify-content:center;gap:.7rem;padding:2rem;color:var(--player-text-secondary);">' +
    '<div class="sp-spinner"></div><span style="font-size:.85rem;">' + escapeHtml(text || 'Cargando...') + '</span></div>';
}
