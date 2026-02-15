#!/bin/sh
# Check connectivity; if no default route for several cycles, start AP + provisioning web UI.
# Run as root (e.g. from systemd).

set -e
STATE_DIR="${STATE_DIR:-/run/wifi-provisioning}"
CHECK_INTERVAL="${CHECK_INTERVAL:-90}"
FAILED_CHECKS_BEFORE_AP="${FAILED_CHECKS_BEFORE_AP:-2}"
SCRIPT_DIR="${SCRIPT_DIR:-/opt/wifi-provisioning}"
AP_SSID="${AP_SSID:-RaspberryStream-Setup}"

mkdir -p "$STATE_DIR"

# If we're already in AP mode (e.g. restarted), don't re-run connectivity check
if [ -f "$STATE_DIR/ap-active" ]; then
  exit 0
fi

# Count consecutive failures (no default route)
failed_file="$STATE_DIR/connectivity-failures"
failed=0
[ -f "$failed_file" ] && failed="$(cat "$failed_file")"

if ip route show default 2>/dev/null | grep -q .; then
  # We have a default route; reset failure count
  echo 0 > "$failed_file"
  exit 0
fi

failed=$((failed + 1))
echo "$failed" > "$failed_file"

if [ "$failed" -lt "$FAILED_CHECKS_BEFORE_AP" ]; then
  exit 0
fi

logger -t wifi-watchdog "No connectivity for ${failed} cycles, starting AP"
# Start AP (this drops current WiFi client connection!)
"$SCRIPT_DIR/start-ap.sh" || exit 1

# Start provisioning web UI (separate systemd service)
/usr/bin/systemctl start wifi-provisioning-web.service 2>/dev/null || true

exit 0
