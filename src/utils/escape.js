/* ===================================================================
   escape.js — HTML escaping utility
   Escapes & < > " ' for safe use in HTML content and attributes.
   =================================================================== */

/**
 * Escapes HTML special characters for safe use in HTML content and attributes.
 * Escapes: & < > " '
 * Returns empty string for null/undefined.
 * @param {string|null|undefined} s - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  if (typeof s !== 'string') s = String(s);
  return s
    .replace(/&/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escapes HTML and replaces newlines with <br> for safe use in HTML content.
 * @param {string|null|undefined} s - String to escape
 * @returns {string} Escaped string with newlines as <br>
 */
export function escapeHtmlWithBr(s) {
  if (s === null || s === undefined) return '';
  if (typeof s !== 'string') s = String(s);
  return s
    .replace(/&/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}
