# GCP HTTP deploy, HTTPS upgrade, and production CI/CD plan

Deploy target: GCP project `safegroup-prod`, VM `instance-20260518-184524` in `us-central1-f`.

Current public URL: `http://34.173.192.205:3000/`

## Goals

| Goal | Success criteria |
| --- | --- |
| Auto-deploy | Merge/push to `production` triggers GitHub Actions deployment |
| Preserve secrets | Routine deploys do not regenerate JWT/VAPID/TURN secrets |
| Current URL | App remains reachable at `http://34.173.192.205:3000/` |
| Future HTTPS | A friendly domain can be added via Caddy and `PUBLIC_URL` |

## Agent-completed repo steps

- Added `.github/workflows/deploy-production.yml` for pushes to `production`.
- Added `scripts/gcp-deploy.sh` for routine deploys.
- Added `scripts/gcp-bootstrap-env.sh` for one-time VM secret generation.
- Updated `scripts/gcp-deploy-from-mac.sh` to delegate to the safe deploy script.
- Updated `scripts/gcp-remote-install.sh` to support `PUBLIC_URL` and keep sequential builds for the e2-micro VM.
- Updated `docker-compose.yml` so the API receives secrets from `backend/.env` instead of hardcoded Compose values.
- Bound MongoDB and API published ports to `127.0.0.1`; only frontend port `3000` is public.
- Made refresh cookies secure only when `FRONTEND_URL` is HTTPS, so the current HTTP IP works and the later HTTPS domain stays secure.
- Added `deploy/Caddyfile` for the later HTTPS/domain step.

## Human-required setup for CI

1. Create or verify branch `production`.
2. In GCP, create a deploy service account with permission to run `gcloud compute ssh` and `gcloud compute scp` for the VM.
   - Simplest role for the hackathon: `roles/compute.instanceAdmin.v1`.
   - Also ensure the service account can write SSH metadata, or use OS Login roles if OS Login is enabled.
3. Create a JSON key for that service account.
4. Add GitHub repository secrets:

| Secret | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `safegroup-prod` |
| `GCP_INSTANCE` | `instance-20260518-184524` |
| `GCP_ZONE` | `us-central1-f` |
| `GCP_EXTERNAL_IP` | `34.173.192.205` |
| `GCP_SA_KEY` | Service account JSON key |
| `PUBLIC_URL` | Optional now; later `https://app.yourdomain.com` |

5. Bootstrap VM secrets once if `~/da-ad-hackathon/backend/.env` is missing:

```bash
./scripts/gcp-bootstrap-env.sh
```

For HTTPS later:

```bash
PUBLIC_URL=https://app.yourdomain.com ./scripts/gcp-bootstrap-env.sh
```

6. Push or merge into `production`; GitHub Actions should deploy automatically.

## HTTPS and friendly URL plan

Human steps:

1. Reserve a static GCP external IP and attach it to the VM.
2. Add DNS A record: `app.yourdomain.com` -> VM static IP.
3. Open firewall ports `tcp:80` and `tcp:443`.
4. Install Caddy on the VM.
5. Replace the placeholder in `deploy/Caddyfile`.
6. Copy it to `/etc/caddy/Caddyfile` and reload Caddy.
7. Set GitHub secret `PUBLIC_URL=https://app.yourdomain.com`.
8. Run the workflow or `PUBLIC_URL=https://app.yourdomain.com ./scripts/gcp-deploy.sh`.

## Smoke tests

- `curl -I http://34.173.192.205:3000/` returns `200`.
- Register/login works in the browser.
- API proxy works through the frontend, e.g. `/api/v1/...` returns auth-protected responses instead of connection errors.
- After HTTPS setup, `https://app.yourdomain.com` loads without certificate warnings.

## Risks

| Risk | Mitigation |
| --- | --- |
| e2-micro OOM during builds | `scripts/gcp-remote-install.sh` creates 2GB swap and builds sequentially |
| CI overwrites secrets | Tarballs exclude `backend/.env`; deploy script backs it up before extract |
| Missing VM env | Run `scripts/gcp-bootstrap-env.sh` once |
| GitHub Action cannot SSH | Verify service account IAM/metadata/OS Login settings |
