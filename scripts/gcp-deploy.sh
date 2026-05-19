#!/usr/bin/env bash
# Routine deploy: upload code, preserve VM backend/.env, rebuild/restart services.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/gcp-common.sh
source "$ROOT/scripts/gcp-common.sh"

gcp_require_gcloud

TARBALL="/tmp/da-ad-hackathon-deploy.tar.gz"
gcp_tarball "$ROOT" "$TARBALL"

echo "==> Uploading source bundle to ${GCP_INSTANCE}..."
gcloud --quiet compute scp "$TARBALL" "${GCP_INSTANCE}:~/da-ad-hackathon-deploy.tar.gz" \
  --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID"
gcloud --quiet compute scp "$ROOT/scripts/gcp-remote-install.sh" "${GCP_INSTANCE}:~/gcp-remote-install.sh" \
  --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID"

REMOTE_PUBLIC_ENV=""
if [[ -n "$PUBLIC_URL" ]]; then
  REMOTE_PUBLIC_ENV="PUBLIC_URL=${PUBLIC_URL%/}"
fi

echo "==> Extracting on VM (clean tree), preserving backend/.env, and deploying..."
gcloud --quiet compute ssh "$GCP_INSTANCE" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" --command="
set -e
ENV_BACKUP=
if [[ -f ~/da-ad-hackathon/backend/.env ]]; then
  cp ~/da-ad-hackathon/backend/.env /tmp/da-ad-hackathon-backend.env.bak
  ENV_BACKUP=1
fi
rm -rf ~/da-ad-hackathon
mkdir -p ~/da-ad-hackathon
tar xzf ~/da-ad-hackathon-deploy.tar.gz -C ~/da-ad-hackathon
mkdir -p ~/da-ad-hackathon/backend
if [[ -n \"\$ENV_BACKUP\" && -f /tmp/da-ad-hackathon-backend.env.bak ]]; then
  mv /tmp/da-ad-hackathon-backend.env.bak ~/da-ad-hackathon/backend/.env
fi
if [[ ! -f ~/da-ad-hackathon/backend/.env ]]; then
  echo 'ERROR: ~/da-ad-hackathon/backend/.env is missing.'
  echo 'Run once: ./scripts/gcp-bootstrap-env.sh'
  exit 1
fi
chmod +x ~/gcp-remote-install.sh
set -o pipefail
${REMOTE_PUBLIC_ENV} EXTERNAL_IP=${GCP_EXTERNAL_IP} APP_DIR=\$HOME/da-ad-hackathon bash ~/gcp-remote-install.sh 2>&1 | tee -a ~/deploy.log
"

if [[ $? -ne 0 ]]; then
  echo "ERROR: Remote deploy failed. Check: gcloud compute ssh ${GCP_INSTANCE} -- tail -50 ~/deploy.log"
  exit 1
fi

if [[ -n "$PUBLIC_URL" ]]; then
  echo "Deployed. App URL: ${PUBLIC_URL%/}"
else
  echo "Deployed. App URL: http://${GCP_EXTERNAL_IP}:3000"
fi
echo "Logs on VM: tail -f ~/deploy.log"
