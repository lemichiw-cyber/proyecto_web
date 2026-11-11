#!/usr/bin/env bash
# ===================================================================
# install-server.sh — instala Cherry-Bomb en un servidor Debian.
#
# Topología elegida: TODO en el mismo servidor y el mismo dominio.
#   nginx  → sirve la PWA compilada (dist/) en /
#   nginx  → hace proxy de /api al backend FastAPI en 127.0.0.1:8000
#   systemd→ corre el backend como servicio del sistema
#
# Uso:
#   sudo bash ops/server/install-server.sh --dominio cherrybomb.io
#
# Opciones:
#   --dominio DOMINIO     dominio público (ej. cherrybomb.io)
#   --repo URL             URL del repositorio git (por defecto la de GitHub)
#   --ruta DIR             dónde queda el código (por defecto /srv/cherrybomb)
#   --sin-tls              no pedir certificado todavía (deja el sitio en HTTP)
#
# El script es idempotente: se puede volver a ejecutar para actualizar.
# ===================================================================
set -euo pipefail

DOMINIO=""
REPO="https://github.com/lemichiw-cyber/proyecto_web.git"
RUTA="/srv/cherrybomb"
CON_TLS=1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORIGEN="$(cd "$SCRIPT_DIR/../.." && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --dominio) DOMINIO="${2:-}"; shift 2 ;;
    --repo)    REPO="${2:-}"; shift 2 ;;
    --ruta)    RUTA="${2:-}"; shift 2 ;;
    --sin-tls) CON_TLS=0; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: hay que ejecutarlo como root (sudo)." >&2
  exit 1
fi
if [ -z "$DOMINIO" ]; then
  echo "ERROR: falta --dominio (ej: --dominio cherrybomb.io)" >&2
  exit 1
fi

log() { echo "==> $*"; }

# ------------------------------------------------------------------
# 1) Paquetes del sistema
# ------------------------------------------------------------------
log "Instalando paquetes (nginx, python, node, certbot)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
  nginx python3 python3-venv python3-pip python3-dev \
  ca-certificates curl git rsync sudo ssl-cert \
  nodejs npm

# nginx (que corre como www-data) tiene que poder leer la clave del
# certificado. Cuando certbot la reemplaza por la de Let's Encrypt
# (root:root 600) esto deja de hacer falta, pero no molesta.
adduser www-data ssl-cert >/dev/null 2>&1 || true

# Node 18+ hace falta para Vite 5. En Debian 12/13 puede venir Node 18;
# si la versión es muy vieja se usa NodeSource.
if [ "$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ] 2>/dev/null; then
  log "Node es demasiado viejo ($(node -v 2>/dev/null)); instalando Node 22 de NodeSource…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if [ "$CON_TLS" -eq 1 ]; then
  apt-get install -y --no-install-recommends certbot python3-certbot-nginx
fi

# ------------------------------------------------------------------
# 2) Usuario de servicio y directorios
# ------------------------------------------------------------------
if ! id -u cherrybomb >/dev/null 2>&1; then
  log "Creando el usuario de servicio 'cherrybomb'…"
  useradd --system --home-dir "$RUTA" --shell /usr/sbin/nologin cherrybomb
fi

log "Creando directorios…"
mkdir -p "$RUTA" /var/lib/cherrybomb /etc/cherrybomb /var/www/certbot
chown -R cherrybomb:cherrybomb "$RUTA" /var/lib/cherrybomb
chmod 750 /var/lib/cherrybomb /etc/cherrybomb

# ------------------------------------------------------------------
# 3) Código
# ------------------------------------------------------------------
if [ ! -d "$RUTA/.git" ]; then
  log "Clonando el repositorio en $RUTA…"
  echo "Se necesita un token de GitHub (PAT) con permiso de lectura."
  echo "Se puede pegar vacío si el repositorio es público."
  read -r -s -p "Token de GitHub (Enter = público): " GH_TOKEN; echo
  if [ -n "$GH_TOKEN" ]; then
    git clone "https://x-access-token:${GH_TOKEN}@github.com/lemichiw-cyber/proyecto_web.git" "$RUTA"
    # El token NO debe quedar en .git/config (queda visible para cualquiera
    # que lea el repo). Se guarda aparte, en un archivo de root, y se usa un
    # credential helper que lo lee en cada `git pull`.
    install -m 600 -o root -g root /dev/null /etc/cherrybomb/git-token
    printf '%s' "$GH_TOKEN" > /etc/cherrybomb/git-token
    git -C "$RUTA" remote set-url origin "$REPO"
    git -C "$RUTA" config credential.helper \
      '!f() { echo "username=x-access-token"; echo "password=$(cat /etc/cherrybomb/git-token)"; }; f'
    log "Token guardado en /etc/cherrybomb/git-token (600, sólo root)."
  else
    git clone "$REPO" "$RUTA"
  fi
  unset GH_TOKEN
else
  log "Actualizando el código en $RUTA…"
  git -C "$RUTA" pull --ff-only || true
fi

# ------------------------------------------------------------------
# 4) Entorno Python del backend
# ------------------------------------------------------------------
log "Creando el virtualenv del backend…"
python3 -m venv "$RUTA/backend/.venv"
"$RUTA/backend/.venv/bin/pip" install --quiet --upgrade pip
log "Instalando las dependencias del backend…"
"$RUTA/backend/.venv/bin/pip" install --quiet -r "$RUTA/backend/requirements.txt"
chown -R cherrybomb:cherrybomb "$RUTA"

# ------------------------------------------------------------------
# 5) Configuración del backend (secretos)
# ------------------------------------------------------------------
if [ ! -f /etc/cherrybomb/cherrybomb.env ]; then
  log "Creando /etc/cherrybomb/cherrybomb.env (editá la clave de NVIDIA)…"
  sed "s|CHERRYBOMB_DOMAIN|$DOMINIO|g" "$ORIGEN/ops/server/cherrybomb.env.example" \
    > /etc/cherrybomb/cherrybomb.env
  chmod 640 /etc/cherrybomb/cherrybomb.env
  chown root:cherrybomb /etc/cherrybomb/cherrybomb.env
  echo
  echo "  >>> EDITÁ /etc/cherrybomb/cherrybomb.env y poné tu NVIDIA_API_KEY <<<"
  echo "      sudoedit /etc/cherrybomb/cherrybomb.env"
  echo
fi

# ------------------------------------------------------------------
# 6) Servicio systemd
# ------------------------------------------------------------------
log "Instalando la unidad systemd…"
install -m 644 "$ORIGEN/ops/server/systemd/cherrybomb-backend.service" \
  /etc/systemd/system/cherrybomb-backend.service
systemctl daemon-reload
systemctl enable cherrybomb-backend.service >/dev/null
systemctl restart cherrybomb-backend.service

log "Esperando que el backend responda…"
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    echo "    backend OK"
    break
  fi
  sleep 1
done

# ------------------------------------------------------------------
# 7) nginx
# ------------------------------------------------------------------
log "Instalando el sitio de nginx…"
sed "s|CHERRYBOMB_DOMAIN|$DOMINIO|g" "$ORIGEN/ops/server/nginx/cherrybomb.conf" \
  > /etc/nginx/sites-available/cherrybomb
ln -sf /etc/nginx/sites-available/cherrybomb /etc/nginx/sites-enabled/cherrybomb
rm -f /etc/nginx/sites-enabled/default
nginx -t

# ------------------------------------------------------------------
# 8) Build de la PWA (sin VITE_API_BASE: mismo origen)
# ------------------------------------------------------------------
log "Compilando la PWA…"
cd "$RUTA"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund
fi
# Sin VITE_API_BASE: la app usa rutas /api relativas (mismo origen).
VITE_API_BASE="" npm run build
chown -R cherrybomb:cherrybomb "$RUTA/dist"

systemctl reload nginx || systemctl restart nginx

# ------------------------------------------------------------------
# 9) TLS
# ------------------------------------------------------------------
if [ "$CON_TLS" -eq 1 ]; then
  log "Pediendo el certificado de Let's Encrypt…"
  echo "    (el dominio $DOMINIO tiene que apuntar YA a este servidor)"
  certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos --register-unsafely-without-email || {
    echo "AVISO: no se pudo sacar el certificado. Reintentá más tarde con:"
    echo "       sudo certbot --nginx -d $DOMINIO"
  }
  systemctl reload nginx
fi

cat <<EOF

Listo. Estado del despliegue:

  Código      : $RUTA
  Datos       : /var/lib/cherrybomb        (accounts.json, sessions.json)
  Config       : /etc/cherrybomb/cherrybomb.env  (NVIDIA_API_KEY, editable)
  Servicio    : cherrybomb-backend.service  (systemd, 127.0.0.1:8000)
  Sitio       : nginx  →  /srv/cherrybomb/dist  +  proxy /api

  URL         : https://$DOMINIO/

Comandos útiles:

  sudo systemctl status cherrybomb-backend
  sudo journalctl -u cherrybomb-backend -f
  sudo nginx -t && sudo systemctl reload nginx
  sudo bash $RUTA/ops/server/deploy-server.sh     # desplegar una actualización

Recordá:
  1) editá /etc/cherrybomb/cherrybomb.env y poné tu NVIDIA_API_KEY real
  2) si no hay TLS todavía: sudo certbot --nginx -d $DOMINIO
  3) las cuentas se crean desde el panel de admin de la web
EOF
