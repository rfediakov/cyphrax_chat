#!/usr/bin/env bash
# Quick checks for HTTPS + domain setup.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/gcp-common.sh
source "$ROOT/scripts/gcp-common.sh"

DOMAIN="${APP_DOMAIN:-safegroup.duckdns.org}"
URL="https://${DOMAIN}"
FAIL=0

echo "==> DNS: ${DOMAIN}"
IP="$(dig +short "$DOMAIN" | tail -1 || true)"
if [[ -z "$IP" ]]; then
  echo "FAIL: No A record. Register at https://www.duckdns.org → subdomain safegroup → IP ${GCP_EXTERNAL_IP}"
  FAIL=1
elif [[ "$IP" != "$GCP_EXTERNAL_IP" ]]; then
  echo "WARN: ${DOMAIN} → ${IP} (expected ${GCP_EXTERNAL_IP})"
  FAIL=1
else
  echo "OK: ${DOMAIN} → ${IP}"
fi

echo ""
echo "==> HTTPS: ${URL}"
HTTPS_OK=0
if curl -fsSI --connect-timeout 15 "$URL" 2>/dev/null | head -1 | grep -qE '200|301|302|308'; then
  HTTPS_OK=1
elif command -v python3 >/dev/null 2>&1 && python3 -c "import urllib.request as u; r=u.urlopen('${URL}', timeout=15); assert 200 <= r.status < 400" 2>/dev/null; then
  HTTPS_OK=1
elif echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" -brief 2>/dev/null | grep -q 'Verification: OK'; then
  HTTPS_OK=1
fi

if [[ "$HTTPS_OK" -eq 1 ]]; then
  echo "OK: TLS responds (curl, Python, or OpenSSL check passed)"
  curl -fsSI --connect-timeout 15 "$URL" 2>/dev/null | head -5 || true
else
  echo "FAIL: HTTPS not ready (DNS or Caddy cert). On VM: sudo journalctl -u caddy -n 30"
  FAIL=1
fi

echo ""
echo "==> Port 3000 (should be closed from internet)"
if curl -fsSI --connect-timeout 3 "http://${GCP_EXTERNAL_IP}:3000/" 2>/dev/null | head -1 | grep -q 200; then
  echo "WARN: :3000 is still reachable publicly"
else
  echo "OK: :3000 not reachable (or timed out)"
fi

exit "$FAIL"
