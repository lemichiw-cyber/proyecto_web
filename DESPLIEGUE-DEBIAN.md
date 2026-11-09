# DESPLIEGUE-DEBIAN — Cherry-Bomb en el INCOA

## 1. Backend (systemd)
Creá `/etc/systemd/system/cherrybomb.service`:
[Unit]
Description=Cherry-Bomb FastAPI
After=network.target
[Service]
WorkingDirectory=/home/cherrybomb/proyecto_web/backend
Environment=SAKURA_ENV=production
Environment=SAKURA_CORS_ORIGINS=https://cherrybomb.duckdns.org,https://api.cherrybomb.duckdns.org
Environment=SAKURA_COOKIE_SECURE=1
ExecStart=/home/cherrybomb/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
User=cherrybomb
[Install]
WantedBy=multi-user.target

sudo systemctl enable --now cherrybomb

## 2. Frontend estático + TLS
Opción Tunnel (recomendado): cloudflared con ingress 8080(dist) y 8000(api).
Opción Nginx: sirve dist/ y reverse-proxy /api -> 127.0.0.1:8000, Certbot para TLS.

## 3. Backup diario
sudo mkdir -p /var/backups/cherrybomb
# cron: 0 2 * * * /home/cherrybomb/proyecto_web/scripts/backup.sh
## 4. Verificación
curl https://api.cherrybomb.duckdns.org/api/health
