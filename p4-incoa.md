# P4 — Operativo sin soporte (INCOA)

## Orden de ejecución
- [x] **P4-A Accesibilidad** — toggle A-/A+ (--scale) + alto contraste, Esc cierra sidebar/modales, resize >1024 cierra sidebar
- [ ] **P4-D Despliegue Debian** — systemd uvicorn + nginx/Caddy + certbot + backup.sh + doc DESPLIEGUE-DEBIAN.md
- [ ] **P4-B Móvil gama baja** — quitar backdrop-blur en <768px, content-visibility en listas, code-split Sakura (ya lazy)
- [ ] **P4-A2 Sync notas offline real** — IndexedDB como fuente, flush en online con executor apiGuardar*

## Criterios
- eslint 0, vitest 83/83 (flaky sakura por :8000), pytest 27/27, tsc 0, build OK
- Sin regresión en dashboard/foro
