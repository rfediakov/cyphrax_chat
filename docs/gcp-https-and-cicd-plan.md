# GCP HTTPS, friendly URL, and production CI/CD

Deploy target: GCP project `safegroup-prod`, VM `instance-20260518-184524` (zone `us-central1-f`), app via Docker Compose on port **3000**.

---

## Goals

| Goal | Success criteria |
|------|------------------|
| HTTPS | Valid TLS cert; no browser warnings |
| Friendly URL | e.g. `https://app.<yourdomain.com>` (no IP, no `:3000`) |
| Auto-deploy | Push to `production` → deploy to VM without manual SSH |
| Safe deploys | Secrets on VM preserved; JWT not rotated each release |

---

## Architecture

```
Browser
  → https://app.<domain> (443)
  → Caddy on VM (Let's Encrypt)
  → http://127.0.0.1:3000 (frontend container / nginx)
       → /api, /socket.io → api container
  → mongo, redis (internal Docker network)
```

Repo scripts: `docker-compose.yml`, `docker-compose.gcp.yml`, `scripts/gcp-deploy.sh`, `scripts/gcp-remote-install.sh`.

---

# Track 1 — HTTPS and domain (Human + Agent)

## Human checklist

### 1. Domain and DNS

- [ ] Choose hostname (e.g. `app.safegroup.com`).
- [ ] Reserve **static external IP** in GCP (same region as VM); attach to `instance-20260518-184524`.
- [ ] DNS **A record**: `app` → static IP.
- [ ] Verify: `dig +short app.<domain>` returns the IP.
- [ ] Set GitHub secret `PUBLIC_URL` = `https://app.<domain>` (no trailing slash).

### 2. GCP firewall

- [ ] Ingress **tcp:80** and **tcp:443**.
- [ ] Keep **tcp:3000** only for debugging (optional).

### 3. Caddy on VM (first time)

SSH: `gcloud compute ssh instance-20260518-184524 --zone=us-central1-f --project=safegroup-prod`

- [ ] Install Caddy: https://caddyserver.com/docs/install
- [ ] Copy `deploy/Caddyfile`, replace `app.REPLACE_WITH_YOUR_DOMAIN.example.com` with your hostname.
- [ ] `sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy`
- [ ] Confirm cert: `journalctl -u caddy -f`

### 4. Application env on VM

- [ ] `~/da-ad-hackathon/backend/.env` has `FRONTEND_URL=https://app.<domain>`.
- [ ] Restart API after change (see [`DEPLOY_GCP.md`](./DEPLOY_GCP.md)).

### 5. Smoke tests

- [ ] `https://app.<domain>` loads SPA.
- [ ] Register / login, chat, WebSocket.
- [ ] HTTP redirects to HTTPS.

## Agent checklist (Track 1)

- [x] `deploy/Caddyfile` template
- [x] `docs/DEPLOY_GCP.md`
- [x] `scripts/gcp-remote-install.sh` — `PUBLIC_URL` support
- [x] Deploy scripts preserve VM `backend/.env`
- [x] `frontend/nginx.conf` — `X-Forwarded-Proto`
- [x] Express `trust proxy` in production

---

# Track 2 — CI/CD from `production` branch (Human + Agent)

## Human checklist

### 1. Git branch

- [ ] Create and push `production` branch.
- [ ] Optional: branch protection.

### 2. GCP service account

- [ ] SA e.g. `github-deploy-safegroup@safegroup-prod.iam.gserviceaccount.com`.
- [ ] Roles: ability to SSH/SCP to the VM (`compute.instanceAdmin.v1` or narrower + OS Login).
- [ ] **Preferred:** Workload Identity Federation.
- [ ] **Alternative:** JSON key → `GCP_SA_KEY` secret.

### 3. GitHub repository secrets

| Secret | Example |
|--------|---------|
| `GCP_PROJECT_ID` | `safegroup-prod` |
| `GCP_INSTANCE` | `instance-20260518-184524` |
| `GCP_ZONE` | `us-central1-f` |
| `PUBLIC_URL` | `https://app.<domain>` |
| `GCP_SA_KEY` | JSON key (if not using WIF) |
| `GCP_WIF_PROVIDER` | WIF provider resource (optional) |
| `GCP_SA_EMAIL` | Deploy SA email (WIF) |

Never commit `backend/.env` or JWT/VAPID keys.

### 4. First pipeline run

- [ ] Push to `production`; confirm Actions green.
- [ ] Verify `https://app.<domain>`.

## Agent checklist (Track 2)

- [x] `scripts/gcp-bootstrap-env.sh` — one-time secrets on VM
- [x] `scripts/gcp-deploy.sh` — routine deploy
- [x] `.github/workflows/deploy-production.yml`
- [x] `gcp-deploy-from-mac.sh` delegates to `gcp-deploy.sh`

---

# Execution order

```
1. Human:  domain + static IP + DNS
2. Agent:  Caddyfile, deploy doc, scripts (this branch)
3. Human:  Caddy on VM + PUBLIC_URL + HTTPS smoke test
4. Human:  GCP SA + GitHub secrets + production branch
5. CI:     first deploy from production
```

---

# Known risks

| Risk | Mitigation |
|------|------------|
| e2-micro OOM | 2GB swap; sequential `docker compose build` |
| CI overwrites secrets | Tarball excludes `backend/.env`; restore backup on VM after extract |
| CORS / Socket.IO | `FRONTEND_URL` must match browser origin exactly |
| Long builds | Workflow `timeout-minutes: 45` |

---

# Agent handoff

> Implement or verify Track 1/2 checklists in repo scripts and workflows. Use `PUBLIC_URL` placeholder until human sets GitHub secret. Never commit secrets.
