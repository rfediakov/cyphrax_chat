#!/usr/bin/env bash
# Run on your Mac from the repo root after: gcloud auth login && gcloud config set project YOUR_PROJECT
set -euo pipefail

INSTANCE="${INSTANCE:-instance-20260518-184524}"
ZONE="${ZONE:-us-central1-f}"
EXTERNAL_IP="${EXTERNAL_IP:-34.173.192.205}"
REMOTE_USER="${REMOTE_USER:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/opt/homebrew/share/google-cloud-sdk/bin:$PATH"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Install gcloud: brew install --cask gcloud-cli"
  exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  echo "Run: gcloud auth login"
  exit 1
fi

GCLOUD_SSH=(gcloud compute ssh "$INSTANCE" --zone="$ZONE")
if [[ -n "$REMOTE_USER" ]]; then
  GCLOUD_SSH=(gcloud compute ssh "${REMOTE_USER}@${INSTANCE}" --zone="$ZONE")
fi

echo "==> Creating backend/.env for production..."
JWT_SECRET="$(openssl rand -hex 32)"
JWT_REFRESH="$(openssl rand -hex 32)"
TURN_PASS="$(openssl rand -hex 24)"
VAPID="$(cd backend && npx --yes web-push generate-vapid-keys 2>/dev/null)"
VAPID_PUBLIC="$(echo "$VAPID" | awk '/Public Key:/{getline; print}')"
VAPID_PRIVATE="$(echo "$VAPID" | awk '/Private Key:/{getline; print}')"

cat > backend/.env.deploy <<EOF
NODE_ENV=production
PORT=3001
MONGODB_URI=mongodb://mongo:27017/chat
REDIS_URL=redis://redis:6379
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH}
UPLOAD_DIR=/uploads
FRONTEND_URL=http://${EXTERNAL_IP}:3000
VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_CONTACT=mailto:admin@safegroup.local
EOF

echo "==> Packaging project (excluding node_modules, .git)..."
TARBALL="/tmp/da-ad-hackathon-deploy.tar.gz"
tar czf "$TARBALL" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='backend/.env' \
  --exclude='*.log' \
  -C "$ROOT" .

echo "==> Uploading to VM..."
gcloud compute scp "$TARBALL" "${INSTANCE}:~/da-ad-hackathon-deploy.tar.gz" --zone="$ZONE"
gcloud compute scp backend/.env.deploy "${INSTANCE}:~/da-ad-hackathon/backend/.env" --zone="$ZONE" 2>/dev/null || {
  gcloud compute ssh "$INSTANCE" --zone="$ZONE" --command="mkdir -p ~/da-ad-hackathon/backend"
  gcloud compute scp backend/.env.deploy "${INSTANCE}:~/da-ad-hackathon/backend/.env" --zone="$ZONE"
}
gcloud compute scp scripts/gcp-remote-install.sh "${INSTANCE}:~/gcp-remote-install.sh" --zone="$ZONE"

echo "==> Extracting and installing on VM..."
gcloud compute ssh "$INSTANCE" --zone="$ZONE" --command='
  set -e
  mkdir -p ~/da-ad-hackathon
  tar xzf ~/da-ad-hackathon-deploy.tar.gz -C ~/da-ad-hackathon
  chmod +x ~/gcp-remote-install.sh
  EXTERNAL_IP='"$EXTERNAL_IP"' APP_DIR=~/da-ad-hackathon bash ~/gcp-remote-install.sh
'

rm -f backend/.env.deploy

echo ""
echo "Deployed. App URL: http://${EXTERNAL_IP}:3000"
echo "Secrets are in ~/da-ad-hackathon/backend/.env on the VM."
