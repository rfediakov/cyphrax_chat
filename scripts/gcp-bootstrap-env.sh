#!/usr/bin/env bash
# One-time: upload local deploy/gcp.env to the VM as ~/da-ad-hackathon/backend/.env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/gcp-common.sh
source "$ROOT/scripts/gcp-common.sh"

gcp_require_gcloud

ENV_FILE="${GCP_ENV_FILE:-$ROOT/deploy/gcp.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy deploy/gcp.env.example to deploy/gcp.env and fill in production secrets."
  exit 1
fi

echo "==> Uploading secrets to ${GCP_INSTANCE} as ~/da-ad-hackathon/backend/.env ..."
gcloud --quiet compute ssh "$GCP_INSTANCE" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" --command="
set -e
mkdir -p ~/da-ad-hackathon/backend
"
gcloud --quiet compute scp "$ENV_FILE" "${GCP_INSTANCE}:~/da-ad-hackathon/backend/.env" \
  --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID"

echo "Done. VM env file: ~/da-ad-hackathon/backend/.env"
echo "Run ./scripts/gcp-deploy.sh to build and start services."
