#!/usr/bin/env bash
# One-time bootstrap: generate production secrets and upload backend/.env to the VM.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/gcp-common.sh
source "$ROOT/scripts/gcp-common.sh"

gcp_require_gcloud

if [[ -n "$PUBLIC_URL" ]]; then
  FRONTEND_URL="${PUBLIC_URL%/}"
else
  FRONTEND_URL="http://${GCP_EXTERNAL_IP}:3000"
  echo "PUBLIC_URL not set; using ${FRONTEND_URL}."
fi

JWT_SECRET="$(openssl rand -hex 32)"
JWT_REFRESH="$(openssl rand -hex 32)"
TURN_PASSWORD="$(openssl rand -hex 24)"
VAPID="$(cd "$ROOT/backend" && npx --yes web-push generate-vapid-keys 2>/dev/null)"
VAPID_PUBLIC="$(echo "$VAPID" | awk '/Public Key:/{getline; print}')"
VAPID_PRIVATE="$(echo "$VAPID" | awk '/Private Key:/{getline; print}')"

ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT

cat >"$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3001
MONGODB_URI=mongodb://mongo:27017/chat
REDIS_URL=redis://redis:6379
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH}
UPLOAD_DIR=/uploads
FRONTEND_URL=${FRONTEND_URL}
VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_CONTACT=mailto:admin@safegroup.local
TURN_USERNAME=safegroup
TURN_PASSWORD=${TURN_PASSWORD}
EOF

echo "==> Uploading backend/.env to ${GCP_INSTANCE} (overwrites existing VM env)..."
gcloud --quiet compute ssh "$GCP_INSTANCE" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" \
  --command="mkdir -p ~/da-ad-hackathon/backend"

gcloud --quiet compute scp "$ENV_FILE" "${GCP_INSTANCE}:~/da-ad-hackathon/backend/.env" \
  --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID"

echo "Done. Secrets are on the VM only."
echo "FRONTEND_URL=${FRONTEND_URL}"
