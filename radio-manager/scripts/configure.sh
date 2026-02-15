#!/bin/bash
# StreamPi configure: ask hostname, IP, user, ALSA card.
# Writes install.conf (do not commit). Run before install.sh on the Pi or before deploy.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONF_FILE="${INSTALL_CONF:-$INSTALL_ROOT/install.conf}"

echo "StreamPi configuration"
echo "Values are written to: $CONF_FILE"
echo ""

# Defaults from environment or current system
def_hostname="${CERT_HOSTNAME:-$(hostname 2>/dev/null || echo 'raspberrypi.local')}"
def_user="${STREAMPI_USER:-$USER}"
def_user="${def_user:-pi}"

read -p "Hostname for certificate and URL [$def_hostname]: " input_hostname
CERT_HOSTNAME="${input_hostname:-$def_hostname}"

read -p "IP address(es) for certificate SAN, comma-separated (e.g. 10.0.0.5,192.168.1.10) [optional]: " input_ip
CERT_IP="${input_ip}"

read -p "Run StreamPi as user [$def_user]: " input_user
RUN_AS_USER="${input_user:-$def_user}"

read -p "ALSA sound card number (0 or 1, often 1 for IQaudIO) [0]: " input_alsa
ALSA_CARD="${input_alsa:-0}"

# Write install.conf (key=value, no spaces)
mkdir -p "$(dirname "$CONF_FILE")"
: > "$CONF_FILE"
echo "CERT_HOSTNAME=$CERT_HOSTNAME" >> "$CONF_FILE"
echo "CERT_IP=$CERT_IP" >> "$CONF_FILE"
echo "RUN_AS_USER=$RUN_AS_USER" >> "$CONF_FILE"
echo "ALSA_CARD=$ALSA_CARD" >> "$CONF_FILE"

echo ""
echo "Configuration saved to $CONF_FILE"
echo "Run ./scripts/install.sh to install (install.sh will read this file)."
