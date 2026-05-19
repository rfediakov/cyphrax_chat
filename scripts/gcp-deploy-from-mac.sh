#!/usr/bin/env bash
# Back-compat wrapper. Use scripts/gcp-deploy.sh for routine deploys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/gcp-deploy.sh" "$@"
