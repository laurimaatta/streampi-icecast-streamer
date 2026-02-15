#!/bin/sh
# Poistaa kaikki tunnetut WiFi-yhteydet laitteelta (NetworkManager).
# Käyttö: sudo /opt/wifi-provisioning/remove-known-networks.sh
#
# VAROITUS: SSH-yhteys katkeaa, kun aktiivinen verkko poistetaan.
# Odota noin 3 min → AP (RaspberryStream-Setup) ilmestyy.
# Yhdistä siihen ja avaa http://10.42.0.1:8080 lisätäksesi uuden verkon.

set -e
NM_CONN_DIR="/etc/NetworkManager/system-connections"

# Aktiivinen yhteys (wlan0) poistetaan viimeisenä
ACTIVE_CONN=""
ACTIVE_CONN=$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: '$2 == "wlan0" {print $1; exit}' 2>/dev/null) || true

# 1) Poista ensin kaikki ei-aktiiviset WiFi-yhteydet
for name in $(nmcli -t -f NAME,TYPE connection show | awk -F: '$2 == "802-11-wireless" {print $1}'); do
  if [ -n "$ACTIVE_CONN" ] && [ "$name" = "$ACTIVE_CONN" ]; then
    echo "Ohitetaan (aktiivinen, poistetaan myöhemmin): $name"
    continue
  fi
  echo "Poistetaan NM-yhteys: $name"
  nmcli connection delete "$name" 2>/dev/null || true
done

# 2) Poista mahdolliset jääneet WiFi-profiilitiedostot
if [ -d "$NM_CONN_DIR" ]; then
  for f in "$NM_CONN_DIR"/*.nmconnection; do
    [ -f "$f" ] || continue
    if grep -qi 'type=wifi\|802-11-wireless' "$f" 2>/dev/null; then
      echo "Poistetaan NM-tiedosto: $f"
      rm -f "$f"
    fi
  done
fi

# 3) Poista aktiivinen yhteys ja irrota wlan0 – SSH katkeaa tähän
if [ -n "$ACTIVE_CONN" ]; then
  echo "Poistetaan aktiivinen yhteys: $ACTIVE_CONN"
  nmcli connection delete "$ACTIVE_CONN" 2>/dev/null || true
fi
echo "Irrotetaan WiFi (wlan0)..."
nmcli device disconnect wlan0 2>/dev/null || true

echo "Valmis. Tunnetut verkot poistettu."
echo "Odota noin 3 min → AP RaspberryStream-Setup ilmestyy (salasana: setup1234)."
echo "Avaa sitten http://10.42.0.1:8080 ja lisää verkko."
