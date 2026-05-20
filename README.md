# Online Chat Server

A real-time web chat application supporting public and private rooms, direct messages, file sharing, contacts, and presence.

## Prerequisites

- **Docker:** Docker Compose v2 (recommended for running the full stack)
- **Local development (optional):** Node.js 20+, npm, plus MongoDB 7 and Redis 7 reachable at the URLs in `backend/.env`

## Quick start

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

- **Frontend:** http://localhost:3000  
- **API:** http://localhost:3001  

The Compose file sets placeholder JWT secrets for local use. Change `JWT_SECRET` and `JWT_REFRESH_SECRET` (and any other secrets) before a real deployment.

## Stack

- **Backend:** Node.js 20, TypeScript, Express, Socket.IO, Mongoose, ioredis  
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Axios  
- **Infrastructure:** MongoDB 7, Redis 7, Docker Compose  

## Development

### Backend (host)

Requires MongoDB and Redis (for example `docker compose up -d mongo redis`).

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Frontend (host)

```bash
cd frontend
npm install
npm run dev
```

Set `FRONTEND_URL` in `backend/.env` to the URL Vite prints (often `http://localhost:5173`), not `http://localhost:3000`, when the API runs on the host and the UI runs via `npm run dev`.

The Vite dev proxy is configured for the Docker service name `api`. If you run the API on your machine at `localhost:3001`, set `VITE_API_TARGET=http://localhost:3001` (or point the `/api` and `/socket.io` proxy targets in `frontend/vite.config.ts` at `http://localhost:3001`).

### Local HTTPS (PWA features on the phone)

Service workers, push notifications, `getUserMedia` and geolocation only work
in a secure context. `http://localhost` qualifies, `http://<lan-ip>` does
not — so testing on a phone normally requires deploying. To unblock that
locally:

```bash
./scripts/dev-https-setup.sh      # one-time: install mkcert CA + issue certs
cd frontend && npm run dev:https  # Vite dev server over HTTPS, bound to LAN
# or, for the production-like stack:
./scripts/dev-https.sh
```

See [`docs/DEV_HTTPS.md`](docs/DEV_HTTPS.md) for the full walkthrough,
including how to trust the local CA on iOS / Android.

### Lint and format

```bash
cd backend && npm run lint    # or npm run format
cd frontend && npm run lint   # or npm run format
```

## Architecture

```
Browser (React SPA)
  ├── REST (HTTP)  →  Express API (port 3001)
  │                       ├── MongoDB (port 27017)
  │                       └── Redis   (port 6379)
  ├── Socket.IO (WS)  →  Express API (port 3001)
  └── Static assets  →  Frontend Nginx (port 3000)
```

## Documentation

- [`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md) — API contracts, schemas, Socket.IO events, and implementation details  
- [`AGENT_DEVELOPMENT_GUIDE.md`](AGENT_DEVELOPMENT_GUIDE.md) — phased build guide for multi-agent / hackathon workflows  
- [`docs/DEPLOY_GCP.md`](docs/DEPLOY_GCP.md) — GCP VM deploy, secrets (`deploy/gcp.env`), and bootstrap workflow  
- [`docs/DEPLOY_HTTPS.md`](docs/DEPLOY_HTTPS.md) — HTTPS domain (`https://safegroup.duckdns.org`), Caddy, DuckDNS  
- [`docs/DEV_HTTPS.md`](docs/DEV_HTTPS.md) — local HTTPS dev for PWA testing (service worker, push, mic, geolocation) on phones over LAN  
