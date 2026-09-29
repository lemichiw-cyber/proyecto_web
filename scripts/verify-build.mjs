#!/usr/bin/env node
/**
 * verify-build.mjs — regresión de despliegue.
 *
 * Sirve dist/ en un subdirectorio y en la raíz, y comprueba que TODAS las
 * referencias (index.html, url() del CSS y entradas del precache) respondan
 * 200. Es exactamente el chequeo que faltaba y por eso los 404 de
 * `base: '/'` llegaron a producción dos veces: ninguna prueba unitaria lo
 * detecta, porque el bug no está en el código sino en cómo se compone la URL.
 *
 * Uso:  node scripts/verify-build.mjs
 * Sale con código 1 si algo falla, para poder engancharlo a CI.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('[verify] No existe dist/. Ejecutá "npm run build" primero.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function safeJoin(base, target) {
  const p = resolve(base, '.' + (target.startsWith('/') ? target : '/' + target));
  return p.startsWith(base) ? p : null;
}

function handler(base) {
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = safeJoin(base, decodeURIComponent(url.pathname));
    if (!file) {
      res.writeHead(403).end('403');
      return;
    }
    // Directorio -> index.html dentro
    if (existsSync(file) && readFileSync && extname(file) === '') {
      file = join(file, 'index.html');
    }
    if (!existsSync(file) || extname(file) === '') {
      // Fallback SPA, igual que `serve -s`
      file = join(base, 'index.html');
    }
    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('404');
    }
  };
}

function listen(base) {
  return new Promise((r) => {
    const s = createServer(handler(base));
    s.listen(0, '127.0.0.1', () => r(s));
  });
}

async function get(url) {
  try {
    const r = await fetch(url);
    return { status: r.status, len: (await r.arrayBuffer()).byteLength };
  } catch (e) {
    return { status: `ERR:${e.message.slice(0, 30)}`, len: 0 };
  }
}

function refsFrom(html) {
  return new Set(
    [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => !/^(data:|https?:|#|mailto:)/.test(u))
  );
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const htmlRefs = refsFrom(html);

const cssRefs = new Set();
const assetsDir = join(dist, 'assets');
if (existsSync(assetsDir)) {
  for (const f of await readdir(assetsDir)) {
    if (!f.endsWith('.css')) continue;
    const css = readFileSync(join(assetsDir, f), 'utf8');
    for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
      const u = m[1].trim().replace(/^['"]|['"]$/g, '');
      if (!u.startsWith('data:')) cssRefs.add(u);
    }
  }
}

const swRefs = new Set();
const swFile = join(dist, 'sw.js');
if (existsSync(swFile)) {
  for (const m of readFileSync(swFile, 'utf8').matchAll(/url:"([^"]+)"/g)) swRefs.add(m[1]);
}

const scenarios = [
  { label: 'SUBDIR  (GitHub Pages /proyecto_web/)', prefix: '/proyecto_web/' },
  { label: 'RAÍZ    (Render, localhost)', prefix: '/' },
];

let failures = 0;
const servers = [];

for (const { label, prefix } of scenarios) {
  // Para el escenario subdir montamos dist/ dentro de un dir con subcarpeta.
  const base = prefix === '/' ? dist : join(dist, '..', '__verify_subdir__', 'proyecto_web');
  if (prefix !== '/') {
    const { mkdir, rm } = await import('node:fs/promises');
    await rm(join(dist, '..', '__verify_subdir__'), { recursive: true, force: true });
    await mkdir(base, { recursive: true });
    await (await import('node:fs/promises')).cp(dist, base, { recursive: true });
  }
  const srv = await listen(base);
  servers.push(srv);
  const port = srv.address().port;
  const origin = `http://127.0.0.1:${port}`;

  const bad = [];
  let total = 0;
  for (const r of htmlRefs) {
    total++;
    const res = await get(origin + prefix + r.replace(/^\.\//, ''));
    if (res.status !== 200) bad.push(`index.html → ${r} (${res.status})`);
  }
  const cssBase = origin + prefix + 'assets/';
  for (const r of cssRefs) {
    total++;
    const res = await get(cssBase + r.replace(/^\.\//, ''));
    if (res.status !== 200) bad.push(`css url() → ${r} (${res.status})`);
  }
  for (const r of swRefs) {
    total++;
    const res = await get(origin + prefix + r);
    if (res.status !== 200) bad.push(`sw precache → ${r} (${res.status})`);
  }

  console.log(`${bad.length ? '✗' : '✓'} ${label}  ${total} referencias`);
  for (const b of bad.slice(0, 12)) console.log(`    ${b}`);
  if (bad.length > 12) console.log(`    … y ${bad.length - 12} más`);
  failures += bad.length;
}

for (const s of servers) s.close();
const { rm } = await import('node:fs/promises');
await rm(join(dist, '..', '__verify_subdir__'), { recursive: true, force: true });

if (failures) {
  console.error(`\n[verify] ${failures} referencias rotas.`);
  process.exit(1);
}
console.log('\n[verify] Todas las referencias responden 200 en ambos escenarios.');
