#!/usr/bin/env bash
# Paste/run this ON the GCP VM (browser SSH) if deploy-from-mac cannot connect yet.
set -euo pipefail

EXTERNAL_IP="${EXTERNAL_IP:-34.173.192.205}"
APP_DIR="$HOME/da-ad-hackathon"

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo ">>> Log out of SSH, log back in, then run this script again."
  exit 0
fi

if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y docker-compose-plugin 2>/dev/null || sudo apt-get install -y docker-compose-v2
fi

mkdir -p "$APP_DIR"

if [[ ! -f "$APP_DIR/docker-compose.yml" ]]; then
  echo "Project not found in $APP_DIR"
  echo "From your Mac (after gcloud auth login), run:"
  echo "  ./scripts/gcp-deploy-from-mac.sh"
  echo "Or upload da-ad-hackathon-deploy-full.tar.gz via SSH 'Upload file' to ~/, then:"
  echo "  tar xzf ~/da-ad-hackathon-deploy-full.tar.gz -C $APP_DIR --strip-components=1"
  exit 1
fi

cd "$APP_DIR"

if [[ -f backend/.env ]]; then
  sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=http://${EXTERNAL_IP}:3000|" backend/.env
fi

docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d --build mongo redis api frontend

echo "App: http://${EXTERNAL_IP}:3000"
docker compose -f docker-compose.yml -f docker-compose.gcp.yml ps
