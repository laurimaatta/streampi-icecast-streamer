#!/bin/bash
# Deploy Radio Manager to Raspberry Pi and run install.
# Usage: ./deploy.sh [host]
#   host: SSH target (default: pi, or set PI_HOST)
# Ensure the Pi is on the same network and reachable (e.g. ssh pi works).

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
PI_HOST="${1:-${PI_HOST:-pi}}"
REMOTE_DIR="/home/user/radio-manager"

echo "Deploying to $PI_HOST (remote path: $REMOTE_DIR)"

# Copy files (exclude node_modules; install will run npm on Pi)
rsync -avz --exclude node_modules --exclude .git ./radio-manager/ "$PI_HOST:$REMOTE_DIR/"

# Run install on Pi
ssh "$PI_HOST" "cd $REMOTE_DIR && chmod +x scripts/install.sh scripts/generate-certs.js && ./scripts/install.sh"

echo ""
echo "Starting radio-manager service..."
ssh "$PI_HOST" "sudo systemctl start radio-manager"

echo ""
echo "Done. Open https://raspberrypi.local:8443 or https://\$(ssh $PI_HOST hostname -I | awk '{print \$1}'):8443"
