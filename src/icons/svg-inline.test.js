/* ===================================================================
   svg-inline.test.js — los SVG en base64 deben ser XML válido.

   Several íconos estaban embebidos como data URI con `width`/`height`
   duplicados ("<svg width=\"20\" height=\"20\" ... width=\"24\"
   height=\"24\" ...>"). Eso es XML INVÁLIDO: el navegador descarta el
   ícono y lo dibuja como un quadradito vacío (□). Pasaba en los
   diálogos y en varios botones de la app.

   Este test recorre los fuentes, decodifica cada SVG embebido y verifica
   que la etiqueta <svg> no repita atributos.
   =================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const RAIZ = join(process.cwd(), 'src');
const BASE64_SVG = /data:image\/svg\+xml;base64,([A-Za-z0-9+/=]{40,})/g;

/** Archivos con SVG embebido: index.html y todo el JS de src/. */
function archivos() {
  const lista = [join(process.cwd(), 'index.html')];
  (function recorrer(dir) {
    for (const entrada of readdirSync(dir)) {
      const ruta = join(dir, entrada);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (['.js', '.ts', '.html'].includes(extname(ruta))) lista.push(ruta);
    }
  })(RAIZ);
  return lista;
}

/** Atributos repetidos en la etiqueta de apertura <svg>. */
function atributosRepetidos(svg) {
  const m = svg.match(/<svg\b[^>]*>/);
  if (!m) return [];
  const tag = m[0];
  const nombres = [];
  for (const a of tag.matchAll(/([a-zA-Z_:][-\w:.]*)\s*=\s*["'][^"']*["']/g)) {
    nombres.push(a[1]);
  }
  return nombres.filter((n, i) => nombres.indexOf(n) !== i);
}

describe('svg-inline — SVG embebidos en base64', () => {
  const encontrados = [];

  for (const archivo of archivos()) {
    const txt = readFileSync(archivo, 'utf8');
    let m;
    BASE64_SVG.lastIndex = 0;
    while ((m = BASE64_SVG.exec(txt)) !== null) {
      const svg = Buffer.from(m[1], 'base64').toString('utf8');
      const linea = txt.slice(0, m.index).split('\n').length;
      encontrados.push({ archivo: archivo.replace(process.cwd() + '/', ''), linea, svg });
    }
  }

  it('hay SVG embebidos que verificar', () => {
    expect(encontrados.length).toBeGreaterThan(10);
  });

  it('ninguno repite atributos en la etiqueta <svg>', () => {
    const malos = encontrados
      .filter((e) => atributosRepetidos(e.svg).length > 0)
      .map((e) => `${e.archivo}:${e.linea} → ${atributosRepetidos(e.svg).join(', ')}`);
    expect(malos).toEqual([]);
  });

  it('todos tienen el namespace de SVG', () => {
    const malos = encontrados
      .filter((e) => !e.svg.includes('xmlns="http://www.w3.org/2000/svg"'))
      .map((e) => `${e.archivo}:${e.linea}`);
    expect(malos).toEqual([]);
  });
});
