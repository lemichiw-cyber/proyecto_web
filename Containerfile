# Containerfile — build reproducible de Cherry-Bomb con Podman.
#
# Notas de compatibilidad (importantes si se cambia algo acá):
#  * Sin `RUN --mount=type=cache` ni `# syntax=docker/dockerfile`: Podman usa
#    buildah y NO soporta los cache mounts de BuildKit. Si se agrega uno, el
#    build falla en Podman y funciona en Docker: justo lo contrario de lo que
#    se busca.
#  * Registry explícito (docker.io/library/...) para que funcione sin
#    configurar registries.conf en máquinas rootless.
#  * Node 22 (LTS). Vite 5 declara engines ^18 || >=20; 22 es el piso razonable
#    y evita depender de versiones flotantes como Node 26.
#  * Imagen final sin toolchain de build: sólo Node + `serve`.

# ---------- Etapa 1: build ----------
FROM docker.io/library/node:22-alpine AS builder

WORKDIR /app

# Se copian primero los manifiestos para que la capa de dependencias se
# reutilice mientras no cambien package.json / package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY extract-base64-images.cjs ./

# `tsc` corre dentro de `npm run build`; si falla tipos, falla el build de la
# imagen. No queremos desplegar una imagen con error de tipos.
RUN npm run build

# ---------- Etapa 2: runtime ----------
FROM docker.io/library/node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Sólo dependencias de producción: la app es estática y lo único que se
# ejecuta en runtime es `serve`.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
    && chown -R node:node /app

# La imagen oficial node:22-alpine ya trae el usuario "node" (uid 1000).
# Correr como root dentro de un contenedor es innecesario y un riesgo evitable.
USER node

EXPOSE 8080

# Node 22 trae fetch global, así que el healthcheck no necesita curl ni wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
