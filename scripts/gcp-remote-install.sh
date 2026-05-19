#!/usr/bin/env bash
# Run on the GCP VM after project files are in ~/da-ad-hackathon
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/da-ad-hackathon}"
EXTERNAL_IP="${EXTERNAL_IP:-}"
PUBLIC_URL="${PUBLIC_URL:-}"

# e2-micro has 1GB RAM — parallel npm builds OOM without swap
if [[ ! -f /swapfile ]]; then
  echo "Adding 2GB swap for Docker builds..."
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

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

if ! sudo docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose is not available after install."
  exit 1
fi

if [[ -n "$PUBLIC_URL" ]]; then
  FRONTEND_URL="${PUBLIC_URL%/}"
elif [[ -z "$EXTERNAL_IP" ]]; then
  EXTERNAL_IP=$(curl -fsS -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)
fi

if [[ -z "${FRONTEND_URL:-}" && -n "$EXTERNAL_IP" ]]; then
  FRONTEND_URL="http://${EXTERNAL_IP}:3000"
fi

if [[ -z "${FRONTEND_URL:-}" ]]; then
  echo "Set PUBLIC_URL or EXTERNAL_IP and re-run."
  exit 1
fi

if [[ ! -f backend/.env ]]; then
  echo "ERROR: backend/.env missing on VM."
  echo "Run once from your machine: ./scripts/gcp-bootstrap-env.sh"
  exit 1
fi

if grep -q '^FRONTEND_URL=' backend/.env; then
  sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=${FRONTEND_URL}|" backend/.env
else
  echo "FRONTEND_URL=${FRONTEND_URL}" >> backend/.env
fi

DC="sudo docker compose -f docker-compose.yml -f docker-compose.gcp.yml"

echo "Stopping previous stack..."
$DC down --remove-orphans 2>/dev/null || true

echo "Starting data services..."
$DC up -d mongo redis

echo "Building API (sequential — saves RAM on e2-micro)..."
$DC build api
$DC up -d api

echo "Building frontend..."
$DC build frontend
$DC up -d frontend

echo ""
echo "Done. Open: ${FRONTEND_URL}"
$DC ps
