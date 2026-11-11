#!/usr/bin/env bash
# ===================================================================
# rebuild-app.sh
#
# Recompila la PWA (dist/) y reinicia el backend local para que sirva
# la versión nueva en http://127.0.0.1:8000/.
#
# Uso:
#   bash ops/rebuild-app.sh
#
# Pensado para después de un `git pull` en la laptop.
# ===================================================================
set -eu

RUTA_PROYECTO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RUTA_PROYECTO"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm no está instalado." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "==> npm ci (instalando dependencias)"
  npm ci
fi

echo "==> npm run build"
npm run build

if systemctl --user list-unit-files cherrybomb-backend.service >/dev/null 2>&1; then
  echo "==> reiniciando cherrybomb-backend.service"
  systemctl --user restart cherrybomb-backend.service
  sleep 3
  systemctl --user --no-pager status cherrybomb-backend.service | head -6 || true
fi

echo
echo "Listo. La app quedó servida en http://127.0.0.1:8000/"
