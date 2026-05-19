# Deploy to Google Cloud VM

| Setting | Value |
| --- | --- |
| Project | `safegroup-prod` |
| Instance | `instance-20260518-184524` |
| Zone | `us-central1-f` |
| Static IP | `34.63.158.53` |
| App URL (HTTPS) | https://safegroup.duckdns.org |

See [DEPLOY_HTTPS.md](DEPLOY_HTTPS.md) for TLS, DuckDNS, and Caddy setup.

## Environment files (important)

| File | Committed? | Purpose |
| --- | --- | --- |
| `deploy/gcp.env.example` | Yes | Safe template with placeholders |
| `deploy/gcp.env` | **No** (gitignored) | Your real production secrets (local only) |
| `~/da-ad-hackathon/backend/.env` on VM | **No** | Runtime env used by Docker Compose |

Do **not** keep a duplicate `backend/.env.gcp`. Use only `deploy/gcp.env` locally.

Routine deploys **never** upload `deploy/gcp.env`; they preserve the existing VM `backend/.env`.

## One-time setup

1. Copy the template and fill in secrets:

   ```bash
   cp deploy/gcp.env.example deploy/gcp.env
   # edit deploy/gcp.env (include FRONTEND_URL=https://safegroup.duckdns.org)
   ```

2. Upload secrets to the VM (creates `backend/.env` on the server):

   ```bash
   chmod +x scripts/*.sh
   ./scripts/gcp-bootstrap-env.sh
   ```

3. HTTPS (once): DNS + firewall + Caddy — follow [DEPLOY_HTTPS.md](DEPLOY_HTTPS.md), then:

   ```bash
   ./scripts/gcp-setup-https.sh
   ```

## Routine deploy

From the repo root (after `gcloud auth login`):

```bash
PUBLIC_URL=https://safegroup.duckdns.org ./scripts/gcp-deploy.sh
```

`PUBLIC_URL` updates `FRONTEND_URL` on the VM (CORS and Socket.IO). If omitted, `APP_DOMAIN` from [scripts/gcp-common.sh](../scripts/gcp-common.sh) is used as `https://safegroup.duckdns.org`.

## VM debugging

```bash
gcloud compute ssh instance-20260518-184524 --zone=us-central1-f --project=safegroup-prod
tail -f ~/deploy.log
sudo systemctl status caddy
sudo docker compose -f ~/da-ad-hackathon/docker-compose.yml -f ~/da-ad-hackathon/docker-compose.gcp.yml ps
```
