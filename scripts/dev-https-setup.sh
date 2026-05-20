#!/usr/bin/env bash
# Generate locally-trusted TLS certificates for HTTPS development.
#
# Without this, PWA features that require a "secure context" (service workers,
# push notifications, getUserMedia, geolocation, install prompt) do not work
# when reaching the dev server from another device on the LAN (e.g. a phone)
# over plain http://192.168.x.x — the developer is forced to deploy to staging
# every time. Running this once enables full PWA testing locally.
#
# Usage:
#   ./scripts/dev-https-setup.sh                  # generate / refresh certs
#   ./scripts/dev-https-setup.sh --print-mobile   # print mobile-install hints
#   LAN_IP=10.0.0.5 ./scripts/dev-https-setup.sh  # override auto-detected IP

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${REPO_ROOT}/frontend/certs"
CERT_FILE="${CERT_DIR}/dev.crt"
KEY_FILE="${CERT_DIR}/dev.key"
ROOT_CA_FILE="${CERT_DIR}/rootCA.pem"

LOCAL_HOST_DEFAULT="safegroup.local"
LOCAL_HOST="${LOCAL_HOST:-${LOCAL_HOST_DEFAULT}}"

color() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
info()  { color '1;34' "==> $*"; }
warn()  { color '1;33' "!!  $*"; }
error() { color '1;31' "xx  $*" >&2; }

detect_lan_ip() {
  if [[ -n "${LAN_IP:-}" ]]; then
    echo "$LAN_IP"
    return
  fi

  case "$(uname -s)" in
    Darwin)
      # First active interface with an IPv4 (skip loopback, link-local, docker).
      for iface in en0 en1 en2 en3 en4 en5 en6 en7 en8 en9 en10; do
        ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
        if [[ -n "$ip" && "$ip" != 169.* ]]; then
          echo "$ip"
          return
        fi
      done
      ;;
    Linux)
      ip=$(ip -4 -o addr show scope global 2>/dev/null \
        | awk '{print $4}' \
        | cut -d/ -f1 \
        | grep -Ev '^(127\.|169\.254\.|172\.(1[7-9]|2[0-9]|3[0-1])\.)' \
        | head -n 1)
      echo "${ip:-}"
      return
      ;;
  esac

  echo ""
}

ensure_mkcert() {
  if command -v mkcert >/dev/null 2>&1; then
    return 0
  fi

  error "mkcert is not installed."
  cat <<'EOF'

mkcert generates locally-trusted certificates without browser warnings.
Install it once:

  macOS:    brew install mkcert nss
  Linux:    https://github.com/FiloSottile/mkcert#linux
  Windows:  choco install mkcert    (or scoop install mkcert)

Then re-run this script.
EOF
  return 1
}

print_mobile_hints() {
  local lan_ip="$1"
  cat <<EOF

----------------------------------------------------------------
Test from a phone on the same Wi-Fi network
----------------------------------------------------------------

1. Make sure the phone is on the same network as this machine.

2. Trust the local CA on the device. The root certificate has been
   copied to:

     ${ROOT_CA_FILE}

   Send it to yourself (AirDrop / email / Google Drive) and install:

     iOS:     Settings → General → VPN & Device Management → Install
              Profile, then Settings → General → About → Certificate
              Trust Settings → enable full trust for "mkcert"
     Android: Settings → Security → Encryption & credentials →
              Install a certificate → CA certificate, pick the file

3. Open one of the following on the phone:

     https://${lan_ip}:5173        (Vite dev server, hot reload)
     https://${LOCAL_HOST}:5173    (if you add ${LOCAL_HOST} to the
                                    phone's hosts or local DNS)
     https://${lan_ip}             (production-like Docker stack on
                                    port 443 via Caddy)

   The connection will be HTTPS with a valid trusted certificate,
   so service workers, push, geolocation, mic and camera APIs all
   work as they do in production.
----------------------------------------------------------------
EOF
}

main() {
  local mode="generate"
  if [[ "${1:-}" == "--print-mobile" ]]; then
    mode="print"
  fi

  local lan_ip
  lan_ip="$(detect_lan_ip)"
  if [[ -z "$lan_ip" ]]; then
    warn "Could not auto-detect a LAN IP. Set LAN_IP=<ip> and re-run to include it in the cert."
  else
    info "Detected LAN IP: $lan_ip"
  fi

  if [[ "$mode" == "print" ]]; then
    print_mobile_hints "${lan_ip:-<your-lan-ip>}"
    return 0
  fi

  ensure_mkcert || exit 1

  info "Installing local CA into the system trust store (idempotent)..."
  mkcert -install

  mkdir -p "$CERT_DIR"

  # Identities the cert should cover:
  #  - localhost variants for the dev machine
  #  - the LAN IP for phone testing
  #  - a friendly hostname users can map in /etc/hosts (or via mDNS)
  local hosts=("localhost" "127.0.0.1" "::1" "${LOCAL_HOST}")
  if [[ -n "$lan_ip" ]]; then
    hosts+=("$lan_ip")
  fi

  info "Generating cert for: ${hosts[*]}"
  (
    cd "$CERT_DIR"
    mkcert \
      -cert-file "$(basename "$CERT_FILE")" \
      -key-file "$(basename "$KEY_FILE")" \
      "${hosts[@]}"
  )

  # Copy the mkcert root CA next to the cert so it can be installed on phones.
  local mkcert_caroot
  mkcert_caroot="$(mkcert -CAROOT)"
  if [[ -f "${mkcert_caroot}/rootCA.pem" ]]; then
    cp "${mkcert_caroot}/rootCA.pem" "$ROOT_CA_FILE"
    info "Root CA copied to ${ROOT_CA_FILE} (install on phones to trust the dev cert)"
  fi

  info "Done. Certificate files:"
  ls -la "$CERT_DIR" | sed 's/^/    /'

  print_mobile_hints "${lan_ip:-<your-lan-ip>}"
}

main "$@"
