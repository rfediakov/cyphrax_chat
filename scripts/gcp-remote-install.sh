#!/usr/bin/env bash
# Run on the GCP VM after project files are in ~/da-ad-hackathon
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/da-ad-hackathon}"
EXTERNAL_IP="${EXTERNAL_IP:-}"

cd "$APP_DIR"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Installing Docker (includes Compose plugin)..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  if ! groups "$USER" | grep -q docker; then
    echo ">>> Log out of SSH, log back in, then re-run this script."
    exit 0
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose is not available after install."
  exit 1
fi

if [[ -z "$EXTERNAL_IP" ]]; then
  EXTERNAL_IP=$(curl -fsS -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)
fi
if [[ -z "$EXTERNAL_IP" ]]; then
  echo "Set EXTERNAL_IP to your VM public IP and re-run."
  exit 1
fi

if [[ ! -f backend/.env ]]; then
  echo "ERROR: backend/.env missing. Copy it from your machine before running this script."
  exit 1
fi

# Ensure FRONTEND_URL matches public URL
if grep -q '^FRONTEND_URL=' backend/.env; then
  sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=http://${EXTERNAL_IP}:3000|" backend/.env
else
  echo "FRONTEND_URL=http://${EXTERNAL_IP}:3000" >> backend/.env
fi

echo "Building and starting mongo, redis, api, frontend (no coturn)..."
docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d --build mongo redis api frontend

echo ""
echo "Done. Open: http://${EXTERNAL_IP}:3000"
docker compose -f docker-compose.yml -f docker-compose.gcp.yml ps
