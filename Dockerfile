# Dockerfile — Backend FastAPI (Sakura Player + Cherry-Bomb accounts)
# Usado por Railway para desplegar SOLO el backend en backend/.
# El frontend se sirve desde Netlify; este contenedor NO lo incluye.

FROM python:3.12-slim

# yt-dlp puede necesitar ffmpeg para streaming; ffmpeg mantiene la imagen ligera
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias primero (capa cacheada)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Código del backend
COPY backend/ ./

# Puerto por defecto (Railway inyecta PORT)
ENV PORT=8000
EXPOSE 8000

# Healthcheck simple contra /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/health',timeout=4)"

# Arranca uvicorn en 0.0.0.0:$PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
