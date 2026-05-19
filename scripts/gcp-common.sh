#!/usr/bin/env bash
# Shared defaults for GCP deploy helpers. Override via environment variables.

GCP_PROJECT_ID="${GCP_PROJECT_ID:-safegroup-prod}"
GCP_INSTANCE="${GCP_INSTANCE:-instance-20260518-184524}"
GCP_ZONE="${GCP_ZONE:-us-central1-f}"
GCP_EXTERNAL_IP="${GCP_EXTERNAL_IP:-34.173.192.205}"
PUBLIC_URL="${PUBLIC_URL:-}"

export PATH="/opt/homebrew/bin:/opt/homebrew/share/google-cloud-sdk/bin:${PATH:-}"
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

gcp_require_gcloud() {
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "Install gcloud: brew install --cask gcloud-cli"
    exit 1
  fi

  if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
    echo "Run: gcloud auth login"
    exit 1
  fi

  gcloud config set project "$GCP_PROJECT_ID" >/dev/null
}

gcp_tarball() {
  local root="$1"
  local out="$2"

  tar czf "$out" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='backend/.env' \
    --exclude='backend/.env.gcp' \
    --exclude='deploy/gcp.env' \
    --exclude='*.log' \
    -C "$root" .
}
