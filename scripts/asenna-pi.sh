#!/bin/bash
# StreamPi: asennus Puhtaalle Raspbianille (ajetaan paikalliselta koneelta).
# Käyttö: ./scripts/asenna-pi.sh [user@]host [--copy-only]
#   Oletus: kopioi ja aja setup-pi.sh Pi:llä (koko asennus etänä).
#   --copy-only  Vain kopioi tiedostot; asennus ajetaan Pi:llä käsin.
#
# Esim: ./scripts/asenna-pi.sh pi@raspberrypi.local
#       ./scripts/asenna-pi.sh pi@raspberrypi.local --copy-only
#
# Edellyttää: ssh, scp. Pi:llä pitää olla SSH ja verkko (aseta WiFi SD-kortille tai yhdistä ensin).

set -e
DO_SETUP=1
HOST=""
for arg in "$@"; do
  if [ "$arg" = "--copy-only" ]; then
    DO_SETUP=0
  else
    [ -z "$HOST" ] && HOST="$arg"
  fi
done
HOST="${HOST:-user@raspberrypi.local}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Kohde: $HOST"
echo "Kopioidaan radio-manager ja wifi-provisioning..."
scp -r "$REPO_ROOT/radio-manager" "$REPO_ROOT/wifi-provisioning" "$HOST:~/"

if [ "$DO_SETUP" = "1" ]; then
  echo ""
  echo "Ajetaan setup-pi.sh Pi:llä..."
  ssh -t "$HOST" "cd ~/radio-manager && chmod +x scripts/setup-pi.sh && ./scripts/setup-pi.sh"
  echo ""
  echo "Avaa selaimessa: https://$(echo $HOST | cut -d@ -f2):8443"
else
  echo ""
  echo "Kopio valmis. Kirjaudu Pi:lle ja aja asennus:"
  echo "  cd ~/radio-manager && chmod +x scripts/setup-pi.sh && ./scripts/setup-pi.sh"
  echo ""
  echo "Tai aja asennus etänä ilman --copy-only:"
  echo "  ./scripts/asenna-pi.sh $HOST"
fi
