#!/usr/bin/env node
/**
 * start.mjs — Lanzador de producción, igual en Linux, macOS y Windows.
 *
 * Existe por un bug concreto: el script anterior era
 *     "start": "serve dist -l $PORT -s"
 * `$PORT` es sintaxis de shell POSIX. En Windows (cmd.exe) NO se expande, así
 * que `serve` recibía la cadena literal "$PORT" y moría con:
 *     Error: Unknown --listen endpoint scheme (protocol): undefined
 * Además `serve` no lee process.env.PORT por su cuenta: sin -l siempre usa 3000.
 *
 * Este script resuelve el puerto, valida, y arranca `serve` pasando por
 * process.execPath para no depender de .cmd ni de shell (que es lo que rompe
 * en Windows).
 */
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_PORT = 3000;
// `??` sólo cubre null/undefined. Un host que exporta PORT="" (o con
// espacios) es un caso real, y eso debe significar "usá el default", no
// "puerto inválido".
const rawPort = (process.env.PORT ?? '').trim() || String(DEFAULT_PORT);

if (!/^\d+$/.test(rawPort)) {
  console.error(
    `[start] PORT inválido: "${rawPort}". Debe ser un número entero entre 1 y 65535.`
  );
  process.exit(1);
}

const port = Number(rawPort);
if (port < 1 || port > 65535) {
  console.error(`[start] PORT fuera de rango: ${port}. Debe estar entre 1 y 65535.`);
  process.exit(1);
}

const dist = join(root, 'dist');
if (!existsSync(dist)) {
  console.error('[start] No existe la carpeta "dist/".');
  console.error('[start] Ejecutá "npm run build" antes de "npm start".');
  process.exit(1);
}

// Resolvemos el entrypoint real de serve en vez de llamar al shim del PATH:
// en Windows ese shim es serve.cmd y no se puede spawnear sin shell.
let serveEntry;
try {
  serveEntry = join(dirname(require.resolve('serve/package.json')), 'build', 'main.js');
} catch {
  console.error('[start] Falta la dependencia "serve". Ejecutá "npm ci" o "npm install".');
  process.exit(1);
}

const args = [serveEntry, 'dist', '-l', `tcp://0.0.0.0:${port}`, '-s'];
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error(`[start] No se pudo arrancar serve: ${err.message}`);
  process.exit(1);
});

console.log(`[start] Sirviendo dist/ en http://localhost:${port} (SPA con fallback a index.html)`);
