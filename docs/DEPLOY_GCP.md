# Deploy to Google Cloud VM

| Setting | Value |
| --- | --- |
| Project | `safegroup-prod` |
| Instance | `instance-20260518-184524` |
| Zone | `us-central1-f` |
| App URL | `http://34.173.192.205:3000/` |

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
   # edit deploy/gcp.env
   ```

2. Upload secrets to the VM (creates `backend/.env` on the server):

   ```bash
   chmod +x scripts/*.sh
   ./scripts/gcp-bootstrap-env.sh
   ```

## Routine deploy

From the repo root (after `gcloud auth login`):

```bash
./scripts/gcp-deploy.sh
```

Optional HTTPS domain later:

```bash
PUBLIC_URL=https://app.yourdomain.com ./scripts/gcp-deploy.sh
```

## VM debugging

```bash
gcloud compute ssh instance-20260518-184524 --zone=us-central1-f --project=safegroup-prod
tail -f ~/deploy.log
sudo docker compose -f ~/da-ad-hackathon/docker-compose.yml -f ~/da-ad-hackathon/docker-compose.gcp.yml ps
```
