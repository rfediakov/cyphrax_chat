# Online Chat Server

A real-time web chat application supporting public/private rooms, one-to-one messaging, file sharing, contacts, and presence.

## Quick Start

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:3001

## Stack

- **Backend:** Node.js 20, TypeScript, Express, Socket.IO, Mongoose, ioredis
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Axios
- **Infrastructure:** MongoDB 7, Redis 7, Docker Compose

## Development

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
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
