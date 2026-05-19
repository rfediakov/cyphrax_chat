#!/usr/bin/env bash
# Run ON the GCP VM when code is already present in ~/da-ad-hackathon.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/da-ad-hackathon}"

if [[ ! -f "$APP_DIR/docker-compose.yml" ]]; then
  echo "Project not found in $APP_DIR."
  echo "From your machine run: ./scripts/gcp-deploy.sh"
  exit 1
fi

exec env APP_DIR="$APP_DIR" bash "$APP_DIR/scripts/gcp-remote-install.sh"
