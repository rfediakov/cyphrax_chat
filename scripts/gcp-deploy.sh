#!/usr/bin/env bash
# Routine deploy: upload code, preserve VM backend/.env, run remote install.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/gcp-common.sh
source "$ROOT/scripts/gcp-common.sh"

gcp_require_gcloud

TARBALL="/tmp/da-ad-hackathon-deploy.tar.gz"
gcp_tarball "$ROOT" "$TARBALL"

echo "==> Uploading to ${GCP_INSTANCE}..."
gcloud compute scp "$TARBALL" "${GCP_INSTANCE}:~/da-ad-hackathon-deploy.tar.gz" \
  --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID"
gcloud compute scp "$ROOT/scripts/gcp-remote-install.sh" "${GCP_INSTANCE}:~/gcp-remote-install.sh" \
  --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID"

REMOTE_ENV=""
[[ -n "$PUBLIC_URL" ]] && REMOTE_ENV="PUBLIC_URL=${PUBLIC_URL}"
REMOTE_ENV="${REMOTE_ENV} EXTERNAL_IP=${GCP_EXTERNAL_IP} APP_DIR=\$HOME/da-ad-hackathon"

echo "==> Extracting (preserving backend/.env) and deploying..."
gcloud compute ssh "$GCP_INSTANCE" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" --command="
set -e
mkdir -p ~/da-ad-hackathon/backend
ENV_BACKUP=\"\"
if [[ -f ~/da-ad-hackathon/backend/.env ]]; then
  cp ~/da-ad-hackathon/backend/.env /tmp/da-ad-hackathon-backend.env.bak
  ENV_BACKUP=1
fi
tar xzf ~/da-ad-hackathon-deploy.tar.gz -C ~/da-ad-hackathon
if [[ -n \"\$ENV_BACKUP\" && -f /tmp/da-ad-hackathon-backend.env.bak ]]; then
  mv /tmp/da-ad-hackathon-backend.env.bak ~/da-ad-hackathon/backend/.env
fi
chmod +x ~/gcp-remote-install.sh
${REMOTE_ENV} bash ~/gcp-remote-install.sh 2>&1 | tee -a ~/deploy.log
"

if [[ -n "$PUBLIC_URL" ]]; then
  echo ""
  echo "Deployed. App URL: ${PUBLIC_URL}"
else
  echo ""
  echo "Deployed. App URL: http://${GCP_EXTERNAL_IP}:3000"
fi
echo "Logs on VM: tail -f ~/deploy.log"
