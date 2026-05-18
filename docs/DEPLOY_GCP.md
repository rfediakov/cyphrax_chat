# GCP production deployment

VM: `instance-20260518-184524` · Zone: `us-central1-f` · Project: `safegroup-prod`

## URLs

| Stage | URL |
|-------|-----|
| Current (HTTP) | http://34.173.192.205:3000 |
| Target (HTTPS) | `https://app.<your-domain>` — set `PUBLIC_URL` |

## Scripts

| Script | When |
|--------|------|
| `scripts/gcp-bootstrap-env.sh` | **Once** — create `backend/.env` on VM (JWT, VAPID) |
| `scripts/gcp-deploy.sh` | Every release — upload code, keep VM secrets |
| `scripts/gcp-remote-install.sh` | Called on VM — Docker build/up |
| `scripts/gcp-deploy-from-mac.sh` | Alias for `gcp-deploy.sh` |

### First-time secrets (local machine)

```bash
gcloud auth login
gcloud config set project safegroup-prod

# HTTP only (IP)
./scripts/gcp-bootstrap-env.sh

# Or with your future HTTPS URL
PUBLIC_URL=https://app.yourdomain.com ./scripts/gcp-bootstrap-env.sh
```

### Routine deploy (local)

```bash
PUBLIC_URL=https://app.yourdomain.com ./scripts/gcp-deploy.sh
```

Without `PUBLIC_URL`, deploy uses `http://<VM_IP>:3000` for `FRONTEND_URL`.

## HTTPS (Caddy)

1. Point DNS **A** record to the VM static IP.
2. Open firewall **tcp:80**, **tcp:443**.
3. Edit `deploy/Caddyfile` — replace `app.REPLACE_WITH_YOUR_DOMAIN.example.com`.
4. On the VM:

```bash
sudo apt install -y caddy   # https://caddyserver.com/docs/install
sudo cp ~/da-ad-hackathon/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

5. Set `FRONTEND_URL` and redeploy API:

```bash
PUBLIC_URL=https://app.yourdomain.com ./scripts/gcp-deploy.sh
# or on VM only:
sed -i 's|^FRONTEND_URL=.*|FRONTEND_URL=https://app.yourdomain.com|' ~/da-ad-hackathon/backend/.env
cd ~/da-ad-hackathon && sudo docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d api
```

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/deploy-production.yml`  
Trigger: push to **`production`** branch.

### Required GitHub secrets

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | `safegroup-prod` |
| `GCP_INSTANCE` | `instance-20260518-184524` |
| `GCP_ZONE` | `us-central1-f` |
| `GCP_SA_KEY` | Service account JSON (if not using WIF) |
| `PUBLIC_URL` | `https://app.yourdomain.com` |

Optional (Workload Identity Federation): `GCP_WIF_PROVIDER`, `GCP_SA_EMAIL`.

Bootstrap secrets on the VM **before** the first CI run:

```bash
PUBLIC_URL=https://app.yourdomain.com ./scripts/gcp-bootstrap-env.sh
```

## Ops on the VM

```bash
gcloud compute ssh instance-20260518-184524 --zone=us-central1-f --project=safegroup-prod

tail -f ~/deploy.log
sudo docker compose -f ~/da-ad-hackathon/docker-compose.yml -f ~/da-ad-hackathon/docker-compose.gcp.yml ps
sudo docker compose -f ~/da-ad-hackathon/docker-compose.yml -f ~/da-ad-hackathon/docker-compose.gcp.yml logs -f api
```

## Rollback

Push a previous commit to `production`, or on the VM checkout an older tarball and run `gcp-remote-install.sh`.

## See also

- [`gcp-https-and-cicd-plan.md`](./gcp-https-and-cicd-plan.md) — full human/agent checklists
