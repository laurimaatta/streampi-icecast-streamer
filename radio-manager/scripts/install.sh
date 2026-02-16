#!/bin/bash
# StreamPi installation script for Raspberry Pi (run on the Pi as the user who will run the service, with sudo).
# Reads install.conf if present (from configure.sh). Optionally: ./install.sh [username] or STREAMPI_USER=pi ./install.sh
set -e

INSTALL_DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="${INSTALL_DIR_SCRIPT%/*}"
CONF_FILE="${INSTALL_CONF:-$INSTALL_ROOT/install.conf}"

# Load install.conf if present
if [ -f "$CONF_FILE" ]; then
  echo "Reading $CONF_FILE"
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^# ]] && continue
    [[ -z "${line// }" ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    export "$key"="$val"
  done < "$CONF_FILE"
fi

ARG_USER="${1:-$STREAMPI_USER}"
RUN_AS_USER="${ARG_USER:-$RUN_AS_USER}"
RUN_AS_USER="${RUN_AS_USER:-$USER}"
RUN_AS_USER="${RUN_AS_USER:-pi}"

# ALSA card: use install.conf if set; else auto-detect (IQaudIO is often card 1)
if [ -z "$ALSA_CARD" ] || [ "$ALSA_CARD" = "0" ]; then
  if amixer -c 0 scontrols 2>/dev/null | grep -qE "Aux|ADC|Capture"; then
    ALSA_CARD=0
  elif amixer -c 1 scontrols 2>/dev/null | grep -qE "Aux|ADC|Capture"; then
    ALSA_CARD=1
    echo "ALSA: äänikortti 1 (IQaudIO) havaittu, käytetään sitä."
  else
    ALSA_CARD="${ALSA_CARD:-0}"
  fi
fi
export ALSA_CARD

HOME_DIR=$(getent passwd "$RUN_AS_USER" 2>/dev/null | cut -d: -f6) || HOME_DIR="/home/$RUN_AS_USER"
INSTALL_DIR="${INSTALL_DIR:-$HOME_DIR/radio-manager}"
DATA_DIR="${RADIO_MANAGER_DATA:-$HOME_DIR/.radio-manager}"
CERTS_DIR="$DATA_DIR/certs"

echo "StreamPi install: run as user $RUN_AS_USER, install dir $INSTALL_DIR, data dir $DATA_DIR, ALSA card $ALSA_CARD"

# Ensure install dir exists and has app files
if [ ! -f "$INSTALL_DIR/package.json" ]; then
  echo "Error: Run this from the project root or set INSTALL_DIR to the copied radio-manager path."
  exit 1
fi

# Dirs and permissions
sudo mkdir -p "$DATA_DIR"/{backups,logs,certs}
sudo chown -R "$RUN_AS_USER:$RUN_AS_USER" "$DATA_DIR"

# Node deps (skip optional on Pi to avoid native build issues)
cd "$INSTALL_DIR"
npm install --omit=optional 2>/dev/null || true
npm install 2>/dev/null || true

# Certificates (use hostname and IP from install.conf / env)
export CERT_HOSTNAME="${CERT_HOSTNAME:-$(hostname 2>/dev/null || echo 'raspberrypizero.local')}"
export CERT_IP="${CERT_IP:-}"
GEN_CERT="y"
if [ -f "$CERTS_DIR/server.pem" ]; then
  read -p "HTTPS certificate already exists. Regenerate? (y/n) [n]: " GEN_CERT
  GEN_CERT="${GEN_CERT:-n}"
fi
if [ "$GEN_CERT" = "y" ]; then
  echo "Generating HTTPS certificate (hostname=$CERT_HOSTNAME)..."
  RADIO_MANAGER_DATA="$DATA_DIR" node scripts/generate-certs.js "$CERTS_DIR"
  chmod 600 "$CERTS_DIR/server.key" 2>/dev/null || true
else
  echo "Using existing certificates in $CERTS_DIR"
fi
read -p "Show instructions for installing the CA certificate in your browser (to remove security warning)? (y/n) [y]: " SHOW_CA_INSTRUCTIONS
SHOW_CA_INSTRUCTIONS="${SHOW_CA_INSTRUCTIONS:-y}"

# App config: web login always admin / streamPi (change password in UI)
APP_CONFIG_FILE="$DATA_DIR/app-config.json"
DEF_WEB_USER="admin"
DEF_WEB_PASSWORD="streamPi"
echo "Setting web UI login (admin / streamPi) – change password in System tab after first login."
node -e "
  const fs = require('fs');
  const crypto = require('crypto');
  const path = process.argv[1];
  const username = process.argv[2];
  const password = process.argv[3];
  let cfg = { streamingMode: 'SWITCH', auth: null };
  try {
    const existing = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (existing.streamingMode) cfg.streamingMode = existing.streamingMode;
  } catch (e) {}
  cfg.auth = { username: username, passwordHash: crypto.createHash('sha256').update(password).digest('hex') };
  fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
" "$APP_CONFIG_FILE" "$DEF_WEB_USER" "$DEF_WEB_PASSWORD"
sudo chown "$RUN_AS_USER:$RUN_AS_USER" "$APP_CONFIG_FILE"

# systemd: radio-manager (data dir and paths must match the user running the service)
sudo cp "$INSTALL_DIR/systemd/radio-manager.service" /etc/systemd/system/
sudo sed -i "s|__RUN_AS_USER__|$RUN_AS_USER|g" /etc/systemd/system/radio-manager.service
sudo sed -i "s|__INSTALL_DIR__|$INSTALL_DIR|g" /etc/systemd/system/radio-manager.service
sudo sed -i "s|__DATA_DIR__|$DATA_DIR|g" /etc/systemd/system/radio-manager.service
sudo sed -i "s|__ALSA_CARD__|$ALSA_CARD|g" /etc/systemd/system/radio-manager.service
sudo systemctl daemon-reload
sudo systemctl enable radio-manager.service
echo "radio-manager.service enabled."

# systemd: darkice (runs as same user as radio-manager, matching SD card working version)
sudo cp "$INSTALL_DIR/systemd/darkice.service" /etc/systemd/system/
sudo sed -i "s|__RUN_AS_USER__|$RUN_AS_USER|g" /etc/systemd/system/darkice.service
sudo systemctl daemon-reload
echo "darkice.service installed (not enabled by default; Radio Manager controls it)."

# Disable PipeWire (Raspberry Pi OS default audio server locks ALSA; DarkIce needs direct access)
echo "Disabling PipeWire so DarkIce can use ALSA directly..."
RUN_UID=$(id -u "$RUN_AS_USER")
sudo -u "$RUN_AS_USER" XDG_RUNTIME_DIR="/run/user/$RUN_UID" systemctl --user mask pipewire pipewire-pulse wireplumber pipewire.socket pipewire-pulse.socket 2>/dev/null || true
sudo -u "$RUN_AS_USER" XDG_RUNTIME_DIR="/run/user/$RUN_UID" systemctl --user stop pipewire pipewire-pulse wireplumber 2>/dev/null || true
# If processes still run (e.g. no user session), force stop
if command -v killall >/dev/null 2>&1; then
  sudo killall -9 pipewire wireplumber pipewire-pulse 2>/dev/null || true
fi
echo "PipeWire disabled. ALSA is available for DarkIce."

# systemd: darkice-gpio (placeholders __INSTALL_DIR__, __RUN_AS_USER__)
sudo cp "$INSTALL_DIR/systemd/darkice-gpio.service" /etc/systemd/system/
sudo sed -i "s|__INSTALL_DIR__|$INSTALL_DIR|g" /etc/systemd/system/darkice-gpio.service
sudo sed -i "s|__RUN_AS_USER__|$RUN_AS_USER|g" /etc/systemd/system/darkice-gpio.service
sudo systemctl daemon-reload
echo "darkice-gpio.service installed (not enabled by default)."

# ALSA: when using card 1 (IQaudIO), set it as system default so Darkice gets the device without conflict
if [ "$ALSA_CARD" = "1" ]; then
  echo "ALSA: asetetaan kortti 1 oletukseksi (/etc/asound.conf)..."
  sudo tee /etc/asound.conf << 'ASOUNDEOF'
# StreamPi: IQaudIO (card 1) as default so Darkice and ALSA use it
defaults.ctl.card 1
defaults.pcm.card 1
defaults.pcm.device 0
ASOUNDEOF
fi

# ALSA mixer: enable IQaudIO Codec Zero (DA7213) input routing for Aux capture
# Without these, the codec stays in standby and arecord/DarkIce get no audio data.
echo "ALSA: asetetaan IQaudIO-mikserin reititys (Aux → ADC capture)..."
amixer -c "$ALSA_CARD" cset name='AUX Jack Switch' on               2>/dev/null || true
amixer -c "$ALSA_CARD" cset name='Aux Switch' on,on                 2>/dev/null || true
amixer -c "$ALSA_CARD" cset name='Mixin Left Aux Left Switch' on    2>/dev/null || true
amixer -c "$ALSA_CARD" cset name='Mixin Right Aux Right Switch' on  2>/dev/null || true
amixer -c "$ALSA_CARD" cset name='Mixin PGA Switch' on,on           2>/dev/null || true
amixer -c "$ALSA_CARD" cset name='ADC Switch' on,on                 2>/dev/null || true
sudo alsactl store 2>/dev/null || true
echo "ALSA mikseri: Aux-reitti ja ADC aktiivinen, tila tallennettu."

# Disable Pi built-in audio (snd_bcm2835) to avoid conflict with IQaudIO HAT
BOOT_CONF="/boot/firmware/config.txt"
[ -f "$BOOT_CONF" ] || BOOT_CONF="/boot/config.txt"
if [ -f "$BOOT_CONF" ] && grep -q '^dtparam=audio=on' "$BOOT_CONF" 2>/dev/null; then
  echo "ALSA: poistetaan sisäänäänen käytöstä (dtparam=audio=off) – vaatii käynnistyksen."
  sudo sed -i 's/^dtparam=audio=on/dtparam=audio=off/' "$BOOT_CONF"
fi

# Sudoers: allow RUN_AS_USER to run systemctl, write darkice.cfg, and alsactl
SUDOERS_FILE="/etc/sudoers.d/radio-manager"
sudo tee "$SUDOERS_FILE" << EOF
# StreamPi: allow controlling DarkIce and GPIO service, writing config, ALSA state
$RUN_AS_USER ALL=(ALL) NOPASSWD: /bin/systemctl start darkice.service, /bin/systemctl stop darkice.service, /bin/systemctl restart darkice.service, /bin/systemctl start darkice-gpio.service, /bin/systemctl stop darkice-gpio.service, /bin/systemctl status darkice.service, /bin/systemctl status darkice-gpio.service
$RUN_AS_USER ALL=(ALL) NOPASSWD: /usr/bin/alsactl *
$RUN_AS_USER ALL=(ALL) NOPASSWD: /usr/sbin/alsactl *
# Allow writing /etc/darkice.cfg via tee (stdin from StreamPi; allow both common paths)
$RUN_AS_USER ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/darkice.cfg
$RUN_AS_USER ALL=(ALL) NOPASSWD: /bin/tee /etc/darkice.cfg
EOF
sudo chmod 440 "$SUDOERS_FILE"
echo "Sudoers rule installed: $SUDOERS_FILE"

# If install was run as different user (e.g. root or deploy), ensure run-as user owns install dir
CURRENT_USER="${SUDO_USER:-$USER}"
if [ -n "$CURRENT_USER" ] && [ "$CURRENT_USER" != "$RUN_AS_USER" ]; then
  echo "Chowning $INSTALL_DIR to $RUN_AS_USER (install was run as $CURRENT_USER)"
  sudo chown -R "$RUN_AS_USER:$RUN_AS_USER" "$INSTALL_DIR"
fi

# Nginx reverse proxy (port 80 -> HTTPS, 443 -> 8443) – asenna jos puuttuu
if ! command -v nginx >/dev/null 2>&1; then
  echo "Installing nginx (enables https://<IP> and http://<IP> without :8443)..."
  sudo apt-get update -qq 2>/dev/null || true
  sudo apt-get install -y nginx 2>/dev/null || { echo "Could not install nginx; run: sudo apt install nginx"; }
  sudo systemctl enable nginx 2>/dev/null || true
  sudo systemctl start nginx 2>/dev/null || true
fi
if command -v nginx >/dev/null 2>&1; then
  NGINX_SITE="/etc/nginx/sites-available/streampi"
  NGINX_SSL_DIR="/etc/nginx/ssl"
  # Copy certs so nginx (www-data) can read them
  sudo mkdir -p "$NGINX_SSL_DIR"
  sudo cp "$DATA_DIR/certs/server.pem" "$DATA_DIR/certs/server.key" "$NGINX_SSL_DIR/" 2>/dev/null || true
  sudo chmod 644 "$NGINX_SSL_DIR/server.pem" "$NGINX_SSL_DIR/server.key" 2>/dev/null || true
  CERTS_PEM="$NGINX_SSL_DIR/server.pem"
  CERTS_KEY="$NGINX_SSL_DIR/server.key"
  # (Re)create streampi site so cert paths are correct
  echo "Installing nginx site for StreamPi (port 443 -> 8443)..."
  NGINX_TEMPLATE="$INSTALL_DIR/config/nginx-streampi.conf"
  if [ -f "$NGINX_TEMPLATE" ]; then
    sed "s|__CERTS_PEM__|$CERTS_PEM|g;s|__CERTS_KEY__|$CERTS_KEY|g" "$NGINX_TEMPLATE" | sudo tee "$NGINX_SITE" > /dev/null
  else
    if [ ! -f "$NGINX_SITE" ]; then
      sudo tee "$NGINX_SITE" > /dev/null << NGINXEOF
# StreamPi: proxy HTTPS from 443 to local 8443
server {
    listen 80 default_server;
    server_name _;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate $CERTS_PEM;
    ssl_certificate_key $CERTS_KEY;
    location / {
        proxy_pass https://127.0.0.1:8443;
        proxy_ssl_verify off;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF
    fi
  fi
  echo "Enabling StreamPi site and disabling nginx default..."
  sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  sudo ln -sf /etc/nginx/sites-available/streampi /etc/nginx/sites-enabled/streampi 2>/dev/null || true
  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx 2>/dev/null || sudo systemctl restart nginx 2>/dev/null || echo "Could not reload nginx"
  else
    echo "Nginx config test failed. Check: sudo nginx -t"
  fi
else
  echo "Nginx could not be installed. Run manually: sudo apt install nginx && sudo systemctl start nginx"
fi

echo ""
echo "Installation complete (StreamPi runs as user: $RUN_AS_USER)."
echo "  Start: sudo systemctl start radio-manager"
echo "  Logs:  journalctl -u radio-manager -f"
echo "  URL:   https://$CERT_HOSTNAME:8443 or https://<IP>:8443 (with nginx: https://<IP> or http://<IP>)"
echo "  To reconfigure: ./scripts/configure.sh then ./scripts/install.sh"
if [ "$SHOW_CA_INSTRUCTIONS" = "y" ]; then
  echo ""
  echo "================================================================================"
  echo "  HTTPS CA-SERTIFIKAATIN ASENNUS (selain lopettaa varoituksen)"
  echo "================================================================================"
  echo ""
  echo "1. Kopioi CA-tiedosto Pi:ltä omalle koneellesi:"
  echo "   scp $RUN_AS_USER@<Pi-IP>:$CERTS_DIR/ca/ca.pem ./ca.pem"
  echo ""
  echo "2. Asenna ca.pem luotettavana juurivarmenteen myöntäjänä:"
  echo ""
  echo "   Chrome:  Asetukset → Tietosuoja ja turvallisuus → Turvallisuus →"
  echo "            Sertifikaatit → Valtuutetut juurivarmenteen myöntäjät → Tuo → valitse ca.pem"
  echo ""
  echo "   Firefox: Asetukset → Privacy & Security → Certificates → View Certificates →"
  echo "            Authorities → Import → valitse ca.pem → rasti \"Trust this CA\""
  echo ""
  echo "   Windows: Kaksoisklikkaa ca.pem → Asenna sertifikaatti → Paikallinen tietokone →"
  echo "            Sijoita kaikki sertifikaatit seuraavaan säilöön → Selaa →"
  echo "            Valitse \"Luetut juurivarmenteen myöntäjät\" → Valmis"
  echo ""
  echo "3. Käynnistä selain uudelleen ja avaa https://<Pi-IP> tai https://<Pi-IP>:8443"
  echo "   (käytä samaa osoitetta kuin sertifikaatissa: hostname tai IP)"
  echo ""
  echo "================================================================================"
fi
