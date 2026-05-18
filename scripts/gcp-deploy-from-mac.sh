#!/usr/bin/env bash
# Back-compat wrapper — use scripts/gcp-deploy.sh directly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/gcp-deploy.sh" "$@"
