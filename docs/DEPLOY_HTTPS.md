# HTTPS and domain (SafeGroup on GCP)

Production URL: **https://safegroup.duckdns.org**

| Setting | Value |
| --- | --- |
| Domain | `safegroup.duckdns.org` (free DuckDNS) |
| VM static IP | `34.63.158.53` (see `GCP_EXTERNAL_IP` in [scripts/gcp-common.sh](../scripts/gcp-common.sh)) |
| TLS | Caddy + Let's Encrypt (automatic) |

## Architecture

```
Browser → Caddy (:443/:80 on VM host) → 127.0.0.1:3000 (Docker frontend nginx) → /api, /socket.io → API container
```

## One-time checklist

### 1. DNS (human)

1. Create account at https://www.duckdns.org
2. Subdomain: **safegroup** → `safegroup.duckdns.org`
3. Set IP to the VM static IP (`34.63.158.53`)
4. Optional: add to `deploy/gcp.env` (gitignored):

   ```env
   DUCKDNS_DOMAIN=safegroup
   DUCKDNS_TOKEN=your-token
   ```

5. Verify: `dig +short safegroup.duckdns.org` → must return the VM IP

### 2. GCP firewall (human)

This project does **not** ship Google’s default `default-allow-http` / `default-allow-https` rules. Without **tcp:80** and **tcp:443**, Let’s Encrypt cannot reach the VM and TLS will fail.

```bash
gcloud compute instances add-tags instance-20260518-184524 \
  --zone=us-central1-f --project=safegroup-prod --tags=http-server,https-server

gcloud compute firewall-rules create safegroup-allow-http \
  --project=safegroup-prod --direction=INGRESS --priority=1000 \
  --network=default --action=ALLOW --rules=tcp:80 \
  --source-ranges=0.0.0.0/0 --target-tags=http-server \
  --description='HTTP for Caddy ACME and redirect' 2>/dev/null || true

gcloud compute firewall-rules create safegroup-allow-https \
  --project=safegroup-prod --direction=INGRESS --priority=1000 \
  --network=default --action=ALLOW --rules=tcp:443 \
  --source-ranges=0.0.0.0/0 --target-tags=https-server \
  --description='HTTPS for Caddy' 2>/dev/null || true
```

If the rules already exist, the `create` commands will fail harmlessly (`|| true`).

### 3. Caddy on VM

From repo root:

```bash
chmod +x scripts/*.sh
./scripts/gcp-setup-https.sh
```

### 4. Deploy with HTTPS URL

```bash
PUBLIC_URL=https://safegroup.duckdns.org ./scripts/gcp-deploy.sh
```

Or rely on defaults:

```bash
./scripts/gcp-deploy.sh   # uses APP_DOMAIN from gcp-common.sh when PUBLIC_URL is unset
```

Update local `deploy/gcp.env`:

```env
FRONTEND_URL=https://safegroup.duckdns.org
```

## Verification

```bash
./scripts/gcp-verify-https.sh
```

| Check | Command | Expected |
| --- | --- | --- |
| TLS | `curl -sI https://safegroup.duckdns.org` | `200` |
| HTTP redirect | `curl -sI http://safegroup.duckdns.org` | `301`/`308` to HTTPS |
| Port 3000 closed | `curl -sI http://34.63.158.53:3000` | Connection refused |
| Caddy logs | `gcloud compute ssh ... --command="sudo journalctl -u caddy -n 50"` | No ACME errors |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Certificate / ACME failure | DNS must point to VM; ports 80/443 open; check `journalctl -u caddy` |
| CORS / WebSocket errors | Redeploy with `PUBLIC_URL=https://safegroup.duckdns.org`; check `FRONTEND_URL` in VM `backend/.env` |
| Site only on `:3000` | Run `./scripts/gcp-setup-https.sh`; ensure [docker-compose.gcp.yml](../docker-compose.gcp.yml) binds `127.0.0.1:3000` |

## WebRTC / TURN (later)

The GCP overlay disables `coturn` on e2-micro (`profiles: [turn]`). Voice/video may need TURN with UDP firewall rules — separate from basic HTTPS.
