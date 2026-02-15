#!/bin/bash
# StreamPi: kattava asennus Pi:llä.
# Aja: cd ~/radio-manager && chmod +x scripts/setup-pi.sh && ./scripts/setup-pi.sh
# (radio-manager ja wifi-provisioning pitää olla jo ~/ kopioitu, esim. asenna-pi.sh:lla)
set -e

echo "=== StreamPi-asennus ==="

# 1. Järjestelmäpaketit
echo "[1/6] Järjestelmäpaketit..."
sudo apt-get update -qq
sudo apt-get install -y nodejs npm darkice alsa-utils python3-flask python3-gpiozero network-manager nginx

# 2. StreamPi
echo "[2/6] StreamPi (install.sh)..."
cd ~/radio-manager
chmod +x scripts/install.sh scripts/generate-certs.js scripts/configure.sh scripts/reset-web-login.js 2>/dev/null || true
./scripts/install.sh

# 3. .env
echo "[3/6] .env..."
mkdir -p ~/.radio-manager
cp -n ~/radio-manager/.env.example ~/.radio-manager/.env 2>/dev/null || true

# 4. WiFi-provisioning
echo "[4/6] WiFi-provisioning..."
sudo mkdir -p /opt/wifi-provisioning
sudo cp -r ~/wifi-provisioning/* /opt/wifi-provisioning/
sudo chmod +x /opt/wifi-provisioning/*.sh 2>/dev/null || true
sudo cp /opt/wifi-provisioning/systemd/*.service /etc/systemd/system/ 2>/dev/null || true
sudo cp /opt/wifi-provisioning/systemd/*.timer /etc/systemd/system/ 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl enable wifi-watchdog.timer button-to-ap.service 2>/dev/null || true
sudo systemctl start wifi-watchdog.timer button-to-ap.service 2>/dev/null || true

# 5. Nginx: luo streampi-sivu ja ota käyttöön (ei "Welcome to nginx")
echo "[5/6] Nginx (StreamPi-sivu käyttöön)..."
DATA_DIR="${HOME:-/home/pi}/.radio-manager"
sudo mkdir -p /etc/nginx/ssl
sudo cp "$DATA_DIR/certs/server.pem" "$DATA_DIR/certs/server.key" /etc/nginx/ssl/ 2>/dev/null || true
sudo chmod 644 /etc/nginx/ssl/server.pem /etc/nginx/ssl/server.key 2>/dev/null || true
CERTS_PEM="/etc/nginx/ssl/server.pem"
CERTS_KEY="/etc/nginx/ssl/server.key"
if [ -f ~/radio-manager/config/nginx-streampi.conf ]; then
  sed "s|__CERTS_PEM__|$CERTS_PEM|g;s|__CERTS_KEY__|$CERTS_KEY|g" ~/radio-manager/config/nginx-streampi.conf | sudo tee /etc/nginx/sites-available/streampi > /dev/null
fi
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo ln -sf /etc/nginx/sites-available/streampi /etc/nginx/sites-enabled/streampi 2>/dev/null || true
sudo nginx -t 2>/dev/null && sudo systemctl reload nginx 2>/dev/null || true

# 6. Käynnistä StreamPi
echo "[6/6] Käynnistetään StreamPi..."
sudo systemctl start radio-manager

echo ""
echo "=== Valmis ==="
echo "  Avaa selaimessa: https://$(hostname -I | awk '{print $1}') tai https://$(hostname -I | awk '{print $1}'):8443"
echo "  Kirjautuminen: admin / streamPi"
echo ""
echo "  Lähetyksen asetukset (palvelin, salasana): täytä web-käyttöliittymän Lähetys-välilehdeltä."
