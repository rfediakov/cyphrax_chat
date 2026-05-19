# Deploy to Google Cloud VM

This app currently deploys to a GCP VM with Docker Compose.

| Setting | Value |
| --- | --- |
| Project | `safegroup-prod` |
| Instance | `instance-20260518-184524` |
| Zone | `us-central1-f` |
| Current URL | `http://34.173.192.205:3000/` |

## One-time VM secrets

Run once from your machine after `gcloud auth login`:

```bash
./scripts/gcp-bootstrap-env.sh
```

This writes production secrets to `~/da-ad-hackathon/backend/.env` on the VM.
Routine deploys preserve that file.

## Manual deploy from your machine

```bash
./scripts/gcp-deploy.sh
```

For a future HTTPS domain:

```bash
PUBLIC_URL=https://app.yourdomain.com ./scripts/gcp-deploy.sh
```

## Automatic deploy from GitHub

Workflow: `.github/workflows/deploy-production.yml`

Trigger: push or merge to `production`.

Required GitHub secrets:

| Secret | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `safegroup-prod` |
| `GCP_INSTANCE` | `instance-20260518-184524` |
| `GCP_ZONE` | `us-central1-f` |
| `GCP_EXTERNAL_IP` | `34.173.192.205` |
| `GCP_SA_KEY` | GCP service account JSON key |
| `PUBLIC_URL` | Optional now; future `https://app.yourdomain.com` |

Before the first workflow run, make sure `~/da-ad-hackathon/backend/.env` exists on the VM.

The Compose stack only publishes the frontend on all interfaces. MongoDB (`27017`) and the API (`3001`) are bound to `127.0.0.1` for local debugging and are not exposed publicly from the VM.

## VM commands

```bash
gcloud compute ssh instance-20260518-184524 --zone=us-central1-f --project=safegroup-prod

tail -f ~/deploy.log
sudo docker compose -f ~/da-ad-hackathon/docker-compose.yml -f ~/da-ad-hackathon/docker-compose.gcp.yml ps
sudo docker compose -f ~/da-ad-hackathon/docker-compose.yml -f ~/da-ad-hackathon/docker-compose.gcp.yml logs -f api
```

## HTTPS / friendly URL

1. Reserve a static GCP IP and attach it to the VM.
2. Point DNS A record to the static IP.
3. Open firewall ports `80` and `443`.
4. Install Caddy on the VM.
5. Replace the placeholder domain in `deploy/Caddyfile`.
6. Copy/reload Caddy:

```bash
sudo cp ~/da-ad-hackathon/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

7. Set GitHub secret `PUBLIC_URL=https://app.yourdomain.com`.

## Rollback

Revert or cherry-pick on `production`, then push. The workflow will redeploy that commit.
