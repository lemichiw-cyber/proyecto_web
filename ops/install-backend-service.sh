#!/usr/bin/env bash
# ===================================================================
# install-backend-service.sh
#
# Instala el backend de Cherry-Bomb como servicio de systemd de USUARIO
# en la laptop, junto con el control automático por inactividad:
#
#   * la laptop está activa  → backend encendido en http://127.0.0.1:8000
#   * la laptop está inactiva → backend apagado (tras 5 min de gracia)
#
# Uso:
#   bash ops/install-backend-service.sh [--ruta /home/tu/proyecto_web]
#
# Requisitos: systemd de usuario (systemctl --user) y Python 3 con uvicorn.
# ===================================================================
set -eu

RUTA_PROYECTO="$(cd "$(dirname "$0")/.." && pwd)"
if [ "${1:-}" = "--ruta" ]; then
  RUTA_PROYECTO="${2:?--ruta necesita la ruta del proyecto}"
fi

RUTA_PROYECTO="$(cd "$RUTA_PROYECTO" && pwd)"
BACKEND="$RUTA_PROYECTO/backend"

if [ ! -f "$BACKEND/main.py" ]; then
  echo "ERROR: no existe $BACKEND/main.py (ruta: $RUTA_PROYECTO)" >&2
  exit 1
fi

PY="$(command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "ERROR: no se encontró python3" >&2
  exit 1
fi

if ! "$PY" -c "import uvicorn" >/dev/null 2>&1; then
  echo "AVISO: uvicorn no está instalado para $PY. Instalalo con:"
  echo "       $PY -m pip install --user uvicorn fastapi"
fi

mkdir -p "$HOME/.config/systemd/user" "$HOME/.local/bin" "$HOME/.local/state/cherrybomb-backend"

# --- Servicio del backend --------------------------------------------
sed "s#^WorkingDirectory=.*#WorkingDirectory=$BACKEND#" \
    "$RUTA_PROYECTO/ops/systemd/cherrybomb-backend.service" \
    > "$HOME/.config/systemd/user/cherrybomb-backend.service"

# --- Script de control ----------------------------------------------
install -m 0755 "$RUTA_PROYECTO/ops/cherrybomb-backend-control.sh" \
    "$HOME/.local/bin/cherrybomb-backend-control.sh"

cp "$RUTA_PROYECTO/ops/systemd/cherrybomb-backend-control.service" \
   "$HOME/.config/systemd/user/cherrybomb-backend-control.service"
cp "$RUTA_PROYECTO/ops/systemd/cherrybomb-backend-control.timer" \
   "$HOME/.config/systemd/user/cherrybomb-backend-control.timer"

systemctl --user daemon-reload
systemctl --user enable --now cherrybomb-backend.service
systemctl --user enable --now cherrybomb-backend-control.timer

cat <<EOF

Listo.

  Servicio   : cherrybomb-backend.service   (http://127.0.0.1:8000)
  Control    : cherrybomb-backend-control.timer (cada 1 min)

Comandos útiles:
  systemctl --user status cherrybomb-backend.service
  systemctl --user restart cherrybomb-backend.service
  systemctl --user stop cherrybomb-backend.service
  systemctl --user list-timers cherrybomb-backend-control.timer
  journalctl --user -u cherrybomb-backend.service -f
  journalctl --user -t cherrybomb-backend-control -f

Nota: si cerrás sesión y querés que el backend siga disponible,
       activá el linger:  loginctl enable-linger "$USER"
EOF
