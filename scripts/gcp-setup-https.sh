#!/usr/bin/env bash
# One-time: install Caddy on the GCP VM, configure TLS for APP_DOMAIN, optional DuckDNS cron.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/gcp-common.sh
source "$ROOT/scripts/gcp-common.sh"

gcp_require_gcloud

APP_DOMAIN="${APP_DOMAIN:-safegroup.duckdns.org}"
CADDYFILE_LOCAL="$ROOT/deploy/caddy/Caddyfile"

if [[ ! -f "$CADDYFILE_LOCAL" ]]; then
  echo "Missing $CADDYFILE_LOCAL"
  exit 1
fi

ENV_FILE="${GCP_ENV_FILE:-$ROOT/deploy/gcp.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source <(grep -E '^(DUCKDNS_TOKEN|DUCKDNS_DOMAIN)=' "$ENV_FILE" 2>/dev/null || true)
  set +a
fi
DUCKDNS_DOMAIN="${DUCKDNS_DOMAIN:-safegroup}"

TMP_CADDY="$(mktemp)"
sed "s/safegroup\\.duckdns\\.org/${APP_DOMAIN}/g" "$CADDYFILE_LOCAL" >"$TMP_CADDY"
trap 'rm -f "$TMP_CADDY"' EXIT

echo "==> Uploading Caddyfile for ${APP_DOMAIN}..."
gcloud --quiet compute scp "$TMP_CADDY" "${GCP_INSTANCE}:~/Caddyfile" \
  --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID"

SSH_DUCKDNS=""
if [[ -n "${DUCKDNS_TOKEN:-}" ]]; then
  SSH_DUCKDNS="
if [[ -n '${DUCKDNS_TOKEN}' ]]; then
  CRON_LINE=\"*/5 * * * * curl -fsS 'https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=' >/dev/null\"
  (crontab -l 2>/dev/null | grep -v duckdns.org || true; echo \"\$CRON_LINE\") | crontab -
  curl -fsS 'https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=' || true
  echo 'DuckDNS cron installed (every 5 min).'
fi
"
fi

echo "==> Installing Caddy and configuring HTTPS on ${GCP_INSTANCE}..."
gcloud --quiet compute ssh "$GCP_INSTANCE" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" --command="
set -euo pipefail
APP_DOMAIN='${APP_DOMAIN}'

if ! command -v caddy >/dev/null 2>&1; then
  echo 'Installing Caddy...'
  sudo apt-get update -qq
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -qq
  sudo apt-get install -y caddy
fi

sudo mkdir -p /etc/caddy
sudo cp ~/Caddyfile /etc/caddy/Caddyfile
sudo chown root:root /etc/caddy/Caddyfile
sudo chmod 644 /etc/caddy/Caddyfile

if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q 'Status: active'; then
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
fi

${SSH_DUCKDNS}

sudo systemctl enable caddy
sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy
sudo systemctl status caddy --no-pager || true

echo ''
echo 'Caddy configured for' \"\$APP_DOMAIN\"
echo 'Ensure DNS points to this VM (${GCP_EXTERNAL_IP}), then open https://'\"\$APP_DOMAIN\"
"

echo ""
echo "Done. Next steps:"
echo "  1. Point ${APP_DOMAIN} DNS to ${GCP_EXTERNAL_IP} (DuckDNS dashboard or DUCKDNS_TOKEN in deploy/gcp.env)"
echo "  2. PUBLIC_URL=https://${APP_DOMAIN} ./scripts/gcp-deploy.sh"
echo "  3. curl -sI https://${APP_DOMAIN}"
