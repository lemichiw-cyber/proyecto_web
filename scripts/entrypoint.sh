#!/bin/sh
# Entrypoint del contenedor. Deliberadamente POSIX sh y sin dependencias:
# la imagen final sólo trae Node y las dependencias de producción.
#
# La validación vive acá (y no en start.mjs) para poder usar `exec`: así
# `serve` queda como PID 1 y recibe SIGTERM directamente de Podman, en vez
# de que haya un proceso Node intermedio que lo reenvíe.
set -eu

PORT="${PORT:-8080}"

case "$PORT" in
  ''|*[!0-9]*)
    echo "[entrypoint] PORT inválido: \"$PORT\". Debe ser un entero entre 1 y 65535." >&2
    exit 1
    ;;
esac

if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo "[entrypoint] PORT fuera de rango: $PORT. Debe estar entre 1 y 65535." >&2
  exit 1
fi

if [ ! -d /app/dist ]; then
  echo "[entrypoint] No existe /app/dist. La imagen se construyó sin artefactos." >&2
  exit 1
fi

echo "[entrypoint] Sirviendo /app/dist en 0.0.0.0:$PORT"
exec serve dist -l "tcp://0.0.0.0:$PORT" -s
