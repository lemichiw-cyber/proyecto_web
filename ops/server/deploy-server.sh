#!/usr/bin/env bash
# ===================================================================
# deploy-server.sh — despliega una actualización en el servidor Debian.
#
#   sudo bash /srv/cherrybomb/ops/server/deploy-server.sh
#
# Qué hace:
#   1. git pull (rápido, sin cambios)
#   2. npm ci + build de la PWA (sin VITE_API_BASE → mismo origen)
#   3. reinicia el backend y recarga nginx
#   4. comprueba que /api/health responde
#
# Los datos (cuentas y sesiones) viven en /var/lib/cherrybomb: NO se
# tocan al desplegar.
# ===================================================================
set -euo pipefail

RUTA="${RUTA:-/srv/cherrybomb}"
log() { echo "==> $*"; }

cd "$RUTA"

# --- 1) Código ------------------------------------------------------
log "Actualizando el código…"
git pull --ff-only

# --- 2) Dependencias y build ---------------------------------------
log "Instalando dependencias del frontend…"
npm ci --no-audit --no-fund

log "Compilando la PWA…"
# Sin VITE_API_BASE: la app usa rutas /api relativas (mismo origen).
VITE_API_BASE="" npm run build

chown -R cherrybomb:cherrybomb "$RUTA/dist"

# --- 3) Backend -----------------------------------------------------
log "Reiniciando el backend…"
systemctl restart cherrybomb-backend.service

log "Esperando que el backend responda…"
ok=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    ok=1
    echo "    backend OK"
    break
  fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "ERROR: el backend no respondió. Mirá el log:" >&2
  echo "       journalctl -u cherrybomb-backend -n 50 --no-pager" >&2
  exit 1
fi

# --- 4) nginx -------------------------------------------------------
log "Recargando nginx…"
nginx -t
systemctl reload nginx

log "Despliegue terminado: https://$(grep -m1 -oP 'server_name\s+\K[^;]+' /etc/nginx/sites-available/cherrybomb | awk '{print $1}')/"
