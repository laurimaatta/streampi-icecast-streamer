#!/bin/sh
# Start WiFi access point for provisioning.
# Tries NM hotspot first (works on NM ≥ 1.48); falls back to hostapd+dnsmasq.
# Run as root.
#
# NOTE: set -e is NOT used — we need guaranteed cleanup on failure.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AP_CONF="${AP_CONF:-/etc/wifi-provisioning/ap.conf}"
STATE_DIR="${STATE_DIR:-/run/wifi-provisioning}"
AP_SSID="${AP_SSID:-RaspberryStream-Setup}"
AP_PASSWORD="${AP_PASSWORD:-setup1234}"
AP_CHANNEL="${AP_CHANNEL:-6}"
# hostapd fallback settings
AP_IP="${AP_IP:-192.168.4.1}"

[ -f "$AP_CONF" ] && . "$AP_CONF"
mkdir -p "$STATE_DIR"
LOG="$STATE_DIR/start-ap.log"

log() { echo "$(date -Iseconds) $*" >> "$LOG"; logger -t start-ap "$*"; }

# If AP already active, do nothing
if [ -f "$STATE_DIR/ap-active" ]; then
  log "AP already active, skipping"
  exit 0
fi

log "=== Starting AP: ssid=$AP_SSID ==="

# Scan nearby networks before switching to AP (for the web UI suggestion list)
if command -v nmcli >/dev/null 2>&1; then
  log "Scanning nearby WiFi networks..."
  nmcli -t -f SSID device wifi list 2>/dev/null | sort -u | grep -v '^$' | head -30 \
    > "$STATE_DIR/last-scan.txt" 2>/dev/null || true
fi

# ---- Method 1: NetworkManager hotspot (preferred) ----
log "Trying NM hotspot..."
nmcli connection delete AP-Setup 2>/dev/null || true
sleep 0.5

if nmcli device wifi hotspot \
     con-name AP-Setup \
     ssid "$AP_SSID" \
     password "$AP_PASSWORD" \
     band bg channel "$AP_CHANNEL" >> "$LOG" 2>&1; then
  NM_IP=$(nmcli -g IP4.ADDRESS device show wlan0 2>/dev/null | cut -d/ -f1)
  log "NM hotspot started successfully (IP: ${NM_IP:-10.42.0.1})"
  printf '%s' "1" > "$STATE_DIR/ap-active"
  printf '%s' "nm" > "$STATE_DIR/ap-method"
  printf '%s' "${NM_IP:-10.42.0.1}" > "$STATE_DIR/ap-ip"
  exit 0
fi

log "NM hotspot failed, trying hostapd fallback..."

# ---- Method 2: hostapd + dnsmasq (fallback) ----
cleanup_and_fail() {
  log "CLEANUP after failure: returning wlan0 to NetworkManager"
  pkill -f "dnsmasq.*dnsmasq-ap.conf" 2>/dev/null || true
  pkill -f "hostapd.*hostapd.conf" 2>/dev/null || true
  ip addr flush dev wlan0 2>/dev/null || true
  ip link set wlan0 up 2>/dev/null || true
  nmcli device set wlan0 managed yes 2>/dev/null || true
  systemctl start dnsmasq.service 2>/dev/null || true
  rm -f "$STATE_DIR/ap-active" "$STATE_DIR/ap-method" "$STATE_DIR/ap-ip"
  log "FAIL: $1"
  exit 1
}

if ! command -v hostapd >/dev/null 2>&1; then
  log "ABORT: hostapd not installed and NM hotspot failed"
  exit 1
fi

# Release wlan0 from NetworkManager
log "hostapd: Releasing wlan0 from NetworkManager"
nmcli device set wlan0 managed no >> "$LOG" 2>&1 || true
sleep 1
pkill -f "wpa_supplicant.*wlan0" 2>/dev/null || true
sleep 1

# Static IP
log "hostapd: Configuring wlan0 with static IP $AP_IP"
ip link set wlan0 down >> "$LOG" 2>&1 || true
ip addr flush dev wlan0 >> "$LOG" 2>&1 || true
ip addr add "${AP_IP}/24" dev wlan0 >> "$LOG" 2>&1 || cleanup_and_fail "ip addr add failed"
ip link set wlan0 up >> "$LOG" 2>&1 || cleanup_and_fail "ip link set up failed"
sleep 1

# hostapd config
HOSTAPD_CONF="$STATE_DIR/hostapd.conf"
cat > "$HOSTAPD_CONF" << EOF
interface=wlan0
driver=nl80211
ssid=${AP_SSID}
hw_mode=g
channel=${AP_CHANNEL}
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${AP_PASSWORD}
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
country_code=FI
EOF

# dnsmasq config
DNSMASQ_CONF="$STATE_DIR/dnsmasq-ap.conf"
cat > "$DNSMASQ_CONF" << EOF
interface=wlan0
bind-interfaces
dhcp-range=192.168.4.10,192.168.4.50,255.255.255.0,12h
address=/#/${AP_IP}
EOF

# Stop system dnsmasq so our AP dnsmasq can use wlan0 (no port/DHCP conflict)
systemctl stop dnsmasq.service 2>/dev/null || true
sleep 0.5

# Start dnsmasq
log "hostapd: Starting dnsmasq"
pkill -f "dnsmasq.*dnsmasq-ap.conf" 2>/dev/null || true
sleep 0.5
dnsmasq -C "$DNSMASQ_CONF" --pid-file="$STATE_DIR/dnsmasq-ap.pid" \
  --log-facility="$STATE_DIR/dnsmasq-ap.log" >> "$LOG" 2>&1
if [ $? -ne 0 ]; then
  cleanup_and_fail "dnsmasq failed to start"
fi

# Start hostapd
log "hostapd: Starting hostapd"
hostapd -B -P "$STATE_DIR/hostapd.pid" "$HOSTAPD_CONF" >> "$LOG" 2>&1
if [ $? -ne 0 ]; then
  cleanup_and_fail "hostapd failed to start"
fi

printf '%s' "1" > "$STATE_DIR/ap-active"
printf '%s' "hostapd" > "$STATE_DIR/ap-method"
printf '%s' "$AP_IP" > "$STATE_DIR/ap-ip"
log "hostapd AP started successfully on $AP_SSID ($AP_IP)"
exit 0
