#!/usr/bin/env bash
# Bring up the production-like Docker stack with HTTPS in front via Caddy.
# Pre-requisite: run ./scripts/dev-https-setup.sh once to generate certs.
#
# Usage:
#   ./scripts/dev-https.sh           # up --build
#   ./scripts/dev-https.sh down      # tear the stack down
#   ./scripts/dev-https.sh logs      # follow combined logs
#   ./scripts/dev-https.sh status    # show container status

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_FILE="${REPO_ROOT}/frontend/certs/dev.crt"
KEY_FILE="${REPO_ROOT}/frontend/certs/dev.key"

if [[ ! -f "$CERT_FILE" || ! -f "$KEY_FILE" ]]; then
  cat <<EOF >&2
Missing local TLS certificate.

Run this first:
  ./scripts/dev-https-setup.sh

Then re-run: $0
EOF
  exit 1
fi

cd "$REPO_ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.dev-https.yml)

case "${1:-up}" in
  up)
    "${COMPOSE[@]}" up --build "${@:2}"
    ;;
  down)
    "${COMPOSE[@]}" down "${@:2}"
    ;;
  logs)
    "${COMPOSE[@]}" logs -f "${@:2}"
    ;;
  status|ps)
    "${COMPOSE[@]}" ps
    ;;
  *)
    "${COMPOSE[@]}" "$@"
    ;;
esac
