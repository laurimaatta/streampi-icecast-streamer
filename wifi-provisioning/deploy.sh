#!/bin/sh
# Deploy wifi-provisioning to Pi. Usage: ./deploy.sh [ssh_target]
# Default ssh target: pi

set -e
TARGET="${1:-pi}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Step 1: Install required packages ==="
ssh "$TARGET" "sudo apt-get update -qq && sudo apt-get install -y -qq python3-flask python3-gpiozero iw 2>&1 | tail -5"

echo "=== Step 2: Copy files ==="
tar cf - -C "$SCRIPT_DIR" --exclude='.git' --exclude='__pycache__' --exclude='deploy.sh' . \
  | ssh "$TARGET" "mkdir -p /tmp/wifi-provisioning-deploy && tar xf - -C /tmp/wifi-provisioning-deploy"

ssh "$TARGET" "sudo mkdir -p /opt/wifi-provisioning /etc/wifi-provisioning && \
  sudo cp -r /tmp/wifi-provisioning-deploy/* /opt/wifi-provisioning/ && \
  rm -rf /tmp/wifi-provisioning-deploy && \
  sudo chmod +x /opt/wifi-provisioning/*.sh /opt/wifi-provisioning/*.py"

echo "=== Step 3: Install systemd units ==="
ssh "$TARGET" "\
  sudo cp /opt/wifi-provisioning/systemd/wifi-watchdog.service /etc/systemd/system/ && \
  sudo cp /opt/wifi-provisioning/systemd/wifi-watchdog.timer /etc/systemd/system/ && \
  sudo cp /opt/wifi-provisioning/systemd/wifi-provisioning-web.service /etc/systemd/system/ && \
  sudo cp /opt/wifi-provisioning/systemd/button-to-ap.service /etc/systemd/system/ && \
  sudo systemctl daemon-reload"

echo "=== Step 4: Disable WiFi power management ==="
ssh "$TARGET" "sudo mkdir -p /etc/NetworkManager/conf.d && \
  echo '[connection]
wifi.powersave = 2' | sudo tee /etc/NetworkManager/conf.d/wifi-powersave-off.conf > /dev/null"

echo "=== Step 5: Enable and start services ==="
ssh "$TARGET" "\
  sudo systemctl enable wifi-watchdog.timer button-to-ap.service && \
  sudo systemctl restart wifi-watchdog.timer && \
  sudo systemctl restart button-to-ap.service && \
  echo 'Services enabled and started OK'"

# If hostapd/dnsmasq are installed from a previous attempt, ensure they are not auto-starting
ssh "$TARGET" "sudo systemctl disable hostapd 2>/dev/null || true; \
  sudo systemctl stop hostapd 2>/dev/null || true; \
  sudo systemctl mask hostapd.service 2>/dev/null || true; \
  sudo systemctl disable dnsmasq 2>/dev/null || true; \
  sudo systemctl stop dnsmasq 2>/dev/null || true; \
  sudo systemctl mask dnsmasq.service 2>/dev/null || true" 2>/dev/null

# Clean up any leftover NM hotspot from earlier attempts
ssh "$TARGET" "sudo rm -f /etc/NetworkManager/system-connections/Hotspot*.nmconnection* 2>/dev/null; \
  sudo nmcli connection delete AP-Setup 2>/dev/null || true; \
  sudo nmcli connection reload 2>/dev/null || true"

echo ""
echo "=== Deploy complete ==="
echo "AP mode uses NM hotspot (with hostapd fallback if installed)."
echo "Test: press GPIO27 button or wait for watchdog."
