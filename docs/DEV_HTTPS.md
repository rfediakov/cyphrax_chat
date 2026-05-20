# Local HTTPS for PWA development

SafeGroup is a PWA that depends on a number of **secure-context-only** browser
APIs:

| Feature | Code | Secure context required |
| --- | --- | --- |
| Service worker (offline cache, background updates) | `vite-plugin-pwa` | yes (localhost or HTTPS) |
| Push notifications | [`frontend/src/lib/pushNotifications.ts`](../frontend/src/lib/pushNotifications.ts) | yes |
| Microphone capture (PTT, voice messages) | [`frontend/src/lib/mediaRecorder.ts`](../frontend/src/lib/mediaRecorder.ts) | yes |
| WebRTC mic/camera | [`frontend/src/lib/webrtc.ts`](../frontend/src/lib/webrtc.ts) | yes |
| Geolocation (family location, SOS) | [`frontend/src/lib/geolocation.ts`](../frontend/src/lib/geolocation.ts) | yes (most browsers) |
| Install prompt / Add to Home Screen | manifest | yes |

`http://localhost` is treated as secure by browsers, but `http://192.168.1.42`
is **not** — so reaching the dev server from a phone over Wi-Fi disables
every feature in the table. The historical workaround was to push every
change to `https://safegroup.duckdns.org` and test in production. This guide
removes that round trip.

## What you get

Two complementary HTTPS modes that share one trusted certificate:

| Mode | Command | Use it for |
| --- | --- | --- |
| **Vite dev (HTTPS)** | `npm run dev:https` (in `frontend/`) | Fast iteration: hot reload + PWA-in-dev. |
| **Docker stack (HTTPS)** | `./scripts/dev-https.sh` | Production-like verification before deploy. |

Both serve a certificate that is trusted by:

- The dev machine (after `mkcert -install`, automatic).
- Any phone on the same Wi-Fi that imports the mkcert root CA once.

## One-time setup

### 1. Install mkcert

```bash
brew install mkcert nss            # macOS
# Linux:   https://github.com/FiloSottile/mkcert#linux
# Windows: choco install mkcert
```

### 2. Generate certificates

From the repo root:

```bash
./scripts/dev-https-setup.sh
```

This:

- installs the mkcert root CA into the local system trust store (idempotent),
- detects your LAN IP (override with `LAN_IP=10.0.0.5 ./scripts/dev-https-setup.sh`),
- writes `frontend/certs/dev.crt` + `frontend/certs/dev.key`,
- copies `frontend/certs/rootCA.pem` so you can install the CA on phones,
- prints mobile-trust instructions.

`frontend/certs/` is gitignored — certs and the private key never leave the
machine.

### 3. (Optional) Friendly hostname

The cert covers `safegroup.local`. To use it, add a hosts entry on each
device:

```bash
# macOS / Linux dev machine
echo "127.0.0.1  safegroup.local" | sudo tee -a /etc/hosts

# Phone: typically requires a local DNS server or apps like
# "Hosts Go" (Android) / Surge (iOS). Or just use the LAN IP.
```

### 4. (Optional) Trust the root CA on a phone

1. AirDrop / email / Drive the file `frontend/certs/rootCA.pem` to the device.
2. **iOS**: Open the profile → Settings → General → VPN & Device Management
   → Install. Then Settings → General → About → Certificate Trust Settings
   → enable full trust for *mkcert development CA*.
3. **Android**: Settings → Security → Encryption & credentials → Install a
   certificate → CA certificate → pick the file.

After this, the phone sees the dev server as a fully-trusted HTTPS origin
and all PWA features work exactly as in production.

## Mode A — Vite dev (fast iteration)

Run the API on the host (e.g. `cd backend && npm run dev`), then in another
terminal:

```bash
cd frontend
npm run dev:https
```

Outputs:

```
  ➜  Local:    https://localhost:5173/
  ➜  Network:  https://192.168.1.42:5173/
  ➜  Network:  https://safegroup.local:5173/
```

What this mode enables:

- HTTPS via the mkcert cert (no browser warnings).
- `--host` so phones on the LAN can connect.
- `VITE_HTTPS=1` flips `vite-plugin-pwa` `devOptions.enabled` to `true`, so
  the service worker is active and push subscriptions register.
- API proxy points at `http://localhost:3001` (override with
  `VITE_API_TARGET=...`).

If `frontend/certs/` is empty, Vite falls back to
[`@vitejs/plugin-basic-ssl`](https://github.com/vitejs/vite-plugin-basic-ssl)
so HTTPS still works on `localhost`. LAN devices will see a warning and
service workers will refuse to register on them — that's the signal to run
`./scripts/dev-https-setup.sh`.

## Mode B — Docker stack (production-like)

When you need to validate the actual built bundle (real service worker, real
manifest, real cache behaviour):

```bash
./scripts/dev-https.sh           # docker compose up --build with HTTPS overlay
./scripts/dev-https.sh logs      # tail logs
./scripts/dev-https.sh down      # stop
```

This brings up the full stack (`mongo`, `redis`, `api`, `frontend`) plus a
**Caddy** container that:

- Listens on `:80` (redirect → HTTPS) and `:443` (TLS) on every interface.
- Serves the mkcert cert from `frontend/certs/`.
- Reverse-proxies to the `frontend` nginx container.

Then open:

- `https://localhost`
- `https://safegroup.local` (if you added the hosts entry)
- `https://<your-lan-ip>` from a phone

This is the only mode that exercises the **production** service worker, so
use it as the last check before deploying to staging.

## File map

| Path | Purpose |
| --- | --- |
| `scripts/dev-https-setup.sh` | mkcert installer + cert generator |
| `scripts/dev-https.sh` | wrapper around the Docker HTTPS overlay |
| `frontend/vite.config.ts` | HTTPS-aware dev config, PWA-in-dev toggle |
| `frontend/certs/` (gitignored) | locally-issued certs |
| `docker-compose.dev-https.yml` | overlay adding a Caddy reverse proxy |
| `deploy/caddy/Caddyfile.local` | Caddy config consuming the local cert |

## Troubleshooting

**Phone shows "Not secure".** Install `rootCA.pem` on the phone (see step 4).
The dev machine's trust store doesn't propagate.

**Service worker refuses to register on the LAN IP.** You're either still on
HTTP, or the phone hasn't trusted the mkcert CA. Confirm the address starts
with `https://` and that the lock icon shows the certificate as valid.

**Port 443 already in use.** Stop any other local web server (e.g. another
Caddy or nginx) before `./scripts/dev-https.sh`.

**`mkcert -install` asks for sudo.** That's normal — it's writing to the
system trust store. Approve once; subsequent runs are no-ops.

**Network changes, LAN IP changed.** Re-run `./scripts/dev-https-setup.sh`
(or `LAN_IP=<new-ip> ./scripts/dev-https-setup.sh`) — it regenerates the
cert with the new SAN.
