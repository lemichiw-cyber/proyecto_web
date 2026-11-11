#!/usr/bin/env bash
# ===================================================================
# cherrybomb-backend-control.sh
#
# Enciende o apaga el backend de Cherry-Bomb según si la persona está
# ACTIVA en la laptop:
#
#   * activa   → el backend queda escuchando en http://127.0.0.1:8000
#   * inactiva (idle / pantalla bloqueada / sesión cerrada) → se apaga
#     después de un grace period (por defecto 5 minutos) para no cortar
#     requests en curso.
#
# Se ejecuta cada minuto desde el timer de systemd de usuario
# (cherrybomb-backend-control.timer).
#
# Detección de inactividad (cualquiera de estas señales):
#   1. org.freedesktop.ScreenSaver.GetActive  (hypridle en Hyprland)
#   2. loginctl show-session <sid> -p IdleHint
#   3. loginctl show-session <sid> -p LockedHint
# ===================================================================
set -u

SERVICE="${CHERRYBOMB_SERVICE:-cherrybomb-backend.service}"
IDLE_STOP_MINUTES="${CHERRYBOMB_IDLE_STOP_MINUTES:-5}"
# "activo" / "inactivo": fuerza el estado (solo para pruebas).
FORCE_STATE="${CHERRYBOMB_FORCE_STATE:-}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/cherrybomb-backend"
IDLE_SINCE_FILE="$STATE_DIR/idle-since"
LOG_TAG="cherrybomb-backend-control"

mkdir -p "$STATE_DIR"

log() {
  logger -t "$LOG_TAG" -- "$*" 2>/dev/null || echo "[$LOG_TAG] $*"
}

uid="$(id -u)"

# --- Sesiones gráficas de este usuario --------------------------------
# loginctl list-sessions: SESSION UID USER SEAT TTY IDLE SINCE
# Se ignoran las sesiones "manager" (la del user manager no es gráfica).
sesiones=()
while read -r sid s_uid rest; do
  [ -n "${sid:-}" ] || continue
  [ "$s_uid" = "$uid" ] || continue
  clase="$(loginctl show-session "$sid" -p Class --value 2>/dev/null || echo user)"
  [ "$clase" = "user" ] || continue
  sesiones+=("$sid")
done < <(loginctl list-sessions --no-legend 2>/dev/null)

# "activo" si AL MENOS una sesión gráfica está activa y no está idle.
estado="inactivo"
for sid in "${sesiones[@]:-}"; do
  [ -n "$sid" ] || continue
  active="$(loginctl show-session "$sid" -p Active --value 2>/dev/null || echo no)"
  [ "$active" = "yes" ] || continue

  estado_sesion="activo"

  # 1) Screensaver de la sesión (hypridle expone org.freedesktop.ScreenSaver)
  if command -v busctl >/dev/null 2>&1; then
    val="$(timeout 3 busctl --user call org.freedesktop.ScreenSaver \
            /org/freedesktop/ScreenSaver org.freedesktop.ScreenSaver GetActive \
            2>/dev/null | grep -o 'true' || true)"
    [ "$val" = "true" ] && estado_sesion="inactivo"
  fi

  # 2) y 3) IdleHint / LockedHint de logind
  ih="$(loginctl show-session "$sid" -p IdleHint --value 2>/dev/null || echo no)"
  lh="$(loginctl show-session "$sid" -p LockedHint --value 2>/dev/null || echo no)"
  [ "$ih" = "yes" ] && estado_sesion="inactivo"
  [ "$lh" = "yes" ] && estado_sesion="inactivo"

  # Si esta sesión está activa y despierta, el usuario está presente.
  [ "$estado_sesion" = "activo" ] && estado="activo"
done

# --- Anulación manual (pruebas) --------------------------------------
case "$FORCE_STATE" in
  activo|inactivo) estado="$FORCE_STATE" ;;
esac

# --- Política de encendido/apagado -----------------------------------
if [ "$estado" = "activo" ]; then
  rm -f "$IDLE_SINCE_FILE"
  if systemctl --user is-active --quiet "$SERVICE"; then
    exit 0
  fi
  if systemctl --user start "$SERVICE" 2>/dev/null; then
    log "sesión activa: backend encendido"
  else
    log "ERROR: no se pudo arrancar $SERVICE"
  fi
  exit 0
fi

# Estado inactivo: apagar recién después del grace period.
ahora="$(date +%s)"
if [ ! -f "$IDLE_SINCE_FILE" ]; then
  # Primera detección de inactividad: se anota el momento y se sigue.
  echo "$ahora" > "$IDLE_SINCE_FILE"
  log "sesión inactiva: esperando ${IDLE_STOP_MINUTES} min antes de apagar"
fi

desde="$(cat "$IDLE_SINCE_FILE" 2>/dev/null || echo "$ahora")"
case "$desde" in
  ''|*[!0-9]*) desde="$ahora" ;;
esac
transcurrido=$((ahora - desde))
limite=$((IDLE_STOP_MINUTES * 60))

if [ "$transcurrido" -ge "$limite" ]; then
  if systemctl --user is-active --quiet "$SERVICE"; then
    systemctl --user stop "$SERVICE" 2>/dev/null \
      && log "sesión inactiva ${transcurrido}s: backend apagado"
  fi
  rm -f "$IDLE_SINCE_FILE"
else
  log "sesión inactiva ${transcurrido}s (< ${limite}s): el backend sigue encendido"
fi
exit 0
