# Atajos para los comandos de desarrollo y de la imagen.
# Funcionan en Linux y macOS de forma nativa; en Windows, con Git Bash o WSL.
# (Make no viene con Windows: si no lo tenés, usá los comandos npm/podman
#  directo, están documentados en el README.)

IMAGE  ?= cherry-bomb
TAG    ?= local
PORT   ?= 8080
CONTAINER ?= cherry-bomb

.DEFAULT_GOAL := help

.PHONY: help
help: ## Muestra esta ayuda
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ---------- Desarrollo ----------

.PHONY: install
install: ## Instala dependencias con npm ci (respeta package-lock.json)
	npm ci

.PHONY: dev
dev: ## Servidor de desarrollo con recarga en caliente (puerto 5173)
	npm run dev

.PHONY: build
build: ## Compila a dist/
	npm run build

.PHONY: start
start: ## Sirve dist/ con el launcher cross-platform (respeta $$PORT)
	npm start

.PHONY: test
test: ## Corre los tests
	npm test

.PHONY: lint
lint: ## Corre eslint
	npm run lint

# ---------- Imagen ----------

.PHONY: image
image: ## Construye la imagen con Podman
	podman build -t $(IMAGE):$(TAG) -f Containerfile .

.PHONY: run
run: image ## Construye y levanta la app en http://localhost:$(PORT)
	podman run --rm -it --name $(CONTAINER) \
	  -p $(PORT):8080 \
	  -e PORT=8080 \
	  $(IMAGE):$(TAG)

.PHONY: compose-up
compose-up: ## Levanta con compose (equivale a `podman compose up`)
	podman compose up --build -d

.PHONY: compose-down
compose-down: ## Baja los contenedores de compose
	podman compose down

.PHONY: shell
shell: ## Abre una shell dentro del contenedor corriendo
	podman exec -it $(CONTAINER) sh

.PHONY: logs
logs: ## Sigue los logs del contenedor
	podman logs -f $(CONTAINER)

.PHONY: health
health: ## Consulta el estado de salud del contenedor
	@podman inspect --format '{{.State.Health.Status}}' $(CONTAINER)

# ---------- Calidad ----------

.PHONY: verify
verify: ## Comprueba que el build sirve todo: assets, fuentes y precache
	node scripts/verify-build.mjs

.PHONY: clean
clean: ## Borra dist/ y las imágenes de este proyecto
	rm -rf dist
	- podman rmi $(IMAGE):$(TAG) 2>/dev/null || true
