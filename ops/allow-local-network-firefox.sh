#!/usr/bin/env bash
# ===================================================================
# allow-local-network-firefox.sh
#
# Firefox 138+ (y las versiones actuales) bloquean, por defecto, que una
# página servida por HTTPS acceda a un servicio de tu propia máquina
# (127.0.0.1). Es la función "Local Network Access" (LNA). Con el permiso
# denegado, la web de GitHub Pages (https) no puede hablar con el backend
# de la laptop (http://127.0.0.1:8000) y el login falla con
# "NetworkError when attempting to fetch resource".
#
# Este script desactiva esa restricción en los perfiles de Firefox:
#     network.lna.enabled = false
#
# Alternativa sin tocar la configuración: en Firefox, cuando aparece el
# aviso "Permitir acceso a la red local", aceptarlo (queda recordado).
#
# Uso:
#   bash ops/allow-local-network-firefox.sh            # muestra y aplica
#   bash ops/allow-local-network-firefox.sh --show     # solo muestra
#
# Cerrá Firefox antes de ejecutarlo (las preferencias se leen al inicio).
# ===================================================================
set -u

SOLO_MOSTRAR=0
[ "${1:-}" = "--show" ] && SOLO_MOSTRAR=1

PREF='user_pref("network.lna.enabled", false);'

# Perfiles de Firefox (snap, flatpak y instalación normal)
perfiles=()
for d in "$HOME"/.mozilla/firefox/*/; do
  [ -f "$d/prefs.js" ] && perfiles+=("${d%/}")
done
for d in "$HOME"/.var/app/org.mozilla.firefox*/.mozilla/firefox/*/; do
  [ -f "$d/prefs.js" ] && perfiles+=("${d%/}")
done
for d in "$HOME"/snap/firefox/common/.mozilla/firefox/*/; do
  [ -f "$d/prefs.js" ] && perfiles+=("${d%/}")
done

if [ "${#perfiles[@]}" -eq 0 ]; then
  echo "No se encontró ningún perfil de Firefox en este usuario."
  echo "Si usás otro navegador, en Chrome/Chromium: Configuración →"
  echo "Privacidad y seguridad → Acceso a la red local → Permitir."
  exit 0
fi

for perfil in "${perfiles[@]}"; do
  echo "Perfil: $perfil"
  if grep -q 'network.lna.enabled' "$perfil/user.js" 2>/dev/null; then
    echo "  ya está configurado: $(grep 'network.lna.enabled' "$perfil/user.js")"
  else
    echo "  estado actual: $(grep -o 'network.lna.enabled[^;]*;' "$perfil/prefs.js" 2>/dev/null || echo '(sin definir)')"
    if [ "$SOLO_MOSTRAR" -eq 0 ]; then
      printf '%s\n' "$PREF" >> "$perfil/user.js"
      echo "  aplicado -> $PREF"
    else
      echo "  (--show: no se modificó nada)"
    fi
  fi
done

echo
echo "Cerrá y volvé a abrir Firefox para que el cambio tome efecto."
