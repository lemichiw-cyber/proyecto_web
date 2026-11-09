#!/usr/bin/env bash
set -euo pipefail
DST=/var/backups/cherrybomb
mkdir -p "$DST"
TS=$(date +%F-%H%M)
tar czf "$DST/cherrybomb-${TS}.tar.gz" -C /home/cherrybomb/proyecto_web/backend accounts.json sessions.json audit.log foro_reportes.json 2>/dev/null || true
find "$DST" -type f -mtime +30 -delete || true
echo "backup $DST/cherrybomb-${TS}.tar.gz ok"
