#!/bin/sh
# Keep AP (hotspot) running: prevent NetworkManager from reclaiming wlan0,
# and restart hostapd if it died. Run every 30s from ap-keeper.timer.
# Root.

STATE_DIR="${STATE_DIR:-/run/wifi-provisioning}"
SCRIPT_DIR="${SCRIPT_DIR:-/opt/wifi-provisioning}"
LOG="$STATE_DIR/ap-keeper.log"

log() { echo "$(date -Iseconds) $*" >> "$LOG" 2>/dev/null; logger -t ap-keeper "$*"; }

[ -f "$STATE_DIR/ap-active" ] || exit 0

METHOD=""
[ -f "$STATE_DIR/ap-method" ] && METHOD="$(cat "$STATE_DIR/ap-method")"

if [ "$METHOD" = "hostapd" ]; then
  # Prevent NM from taking wlan0 back
  nmcli device set wlan0 managed no 2>/dev/null || true
  # If hostapd died, restart AP
  if ! pgrep -f "hostapd.*hostapd.conf" >/dev/null 2>&1; then
    log "hostapd not running, restarting AP..."
    "$SCRIPT_DIR/stop-ap.sh" 2>/dev/null || true
    sleep 2
    "$SCRIPT_DIR/start-ap.sh" >> "$LOG" 2>&1 || true
    systemctl start wifi-provisioning-web.service 2>/dev/null || true
  fi
elif [ "$METHOD" = "nm" ]; then
  # If NM dropped the hotspot, bring it back
  if ! nmcli -t -f NAME connection show --active 2>/dev/null | grep -q "AP-Setup"; then
    log "NM hotspot down, bringing AP-Setup back up..."
    nmcli connection up AP-Setup 2>/dev/null || true
  fi
fi
exit 0
