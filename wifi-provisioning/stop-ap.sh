#!/bin/sh
# Stop WiFi access point and return wlan0 to NetworkManager for client mode.
# Run as root.

STATE_DIR="${STATE_DIR:-/run/wifi-provisioning}"
LOG="$STATE_DIR/stop-ap.log"

log() { echo "$(date -Iseconds) $*" >> "$LOG" 2>/dev/null; logger -t stop-ap "$*"; }

log "Stopping AP..."

METHOD=""
[ -f "$STATE_DIR/ap-method" ] && METHOD="$(cat "$STATE_DIR/ap-method")"

if [ "$METHOD" = "nm" ] || nmcli -t -f NAME connection show --active 2>/dev/null | grep -q "AP-Setup"; then
  # ---- NM hotspot ----
  log "Stopping NM hotspot (AP-Setup)"
  nmcli connection down AP-Setup 2>/dev/null || true
  nmcli connection delete AP-Setup 2>/dev/null || true
  sleep 1
  # NM auto-reconnects to known networks
  nmcli device connect wlan0 2>/dev/null || true
else
  # ---- hostapd + dnsmasq ----
  log "Stopping hostapd + dnsmasq"
  if [ -f "$STATE_DIR/hostapd.pid" ]; then
    kill "$(cat "$STATE_DIR/hostapd.pid")" 2>/dev/null || true
    rm -f "$STATE_DIR/hostapd.pid"
  fi
  pkill -f "hostapd.*hostapd.conf" 2>/dev/null || true

  if [ -f "$STATE_DIR/dnsmasq-ap.pid" ]; then
    kill "$(cat "$STATE_DIR/dnsmasq-ap.pid")" 2>/dev/null || true
    rm -f "$STATE_DIR/dnsmasq-ap.pid"
  fi
  pkill -f "dnsmasq.*dnsmasq-ap.conf" 2>/dev/null || true

  ip addr flush dev wlan0 2>/dev/null || true
  ip link set wlan0 down 2>/dev/null || true
  sleep 1

  nmcli device set wlan0 managed yes 2>/dev/null || true
  sleep 1
  ip link set wlan0 up 2>/dev/null || true
  nmcli device connect wlan0 2>/dev/null || true
fi

# Clean state files
rm -f "$STATE_DIR/ap-active" "$STATE_DIR/ap-method" "$STATE_DIR/ap-ip"

log "AP stopped, wlan0 returned to NetworkManager"
exit 0
