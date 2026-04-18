# Technical Specification — Online Chat Server

**Version:** 1.0  
**Based on:** AI_herders_jam_-_requirements_v3.docx  
**Target audience:** Implementation agent

---

## 1. Project Overview

Build a classic web-based real-time chat application. The system must support up to **300 simultaneous users**, public/private rooms, one-to-one personal messaging, file sharing, contacts/friends, and basic moderation. The project must be runnable via `docker compose up` from the repository root.

---

## 2. Recommended Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend language | **Node.js (TypeScript)** or **Python (FastAPI)** | Wide ecosystem for WebSockets, JWT, XMPP libs |
| Real-time transport | **WebSocket** (via `ws` / `socket.io` / `websockets`) | Required for presence and live messaging |
| HTTP framework | **Express** (Node) / **FastAPI** (Python) | REST endpoints for auth, rooms, history |
| Database | **PostgreSQL** | Relational data with good JSON support |
| ORM | **Prisma** (Node) / **SQLAlchemy** (Python) | Schema migrations, type safety |
| File storage | **Local filesystem** (`/uploads` volume) | Per spec §3.4 |
| Session/Auth | **JWT** (access + refresh) stored in HttpOnly cookies | Persistent login across browser close |
| Presence/pub-sub | **Redis** | Coordinating multi-tab presence, pub/sub for WS message fan-out |
| Containerisation | **Docker + docker-compose** | Required by submission rules |
| Frontend | **React + TypeScript + Vite** | Fast SPA, easy WS integration |
| UI components | **Tailwind CSS + shadcn/ui** or **Chakra UI** | Mobile-first layout |

> **If implementing Jabber (advanced):** use `node-xmpp-server` (Node) or `slixmpp`/`aioxmpp` (Python) for the XMPP layer.

---

## 3. Architecture

```
Browser (React SPA)
    │  REST (HTTP/S)   WebSocket (WSS)
    ▼
[Nginx reverse proxy / gateway]
    │
    ├── [Chat API server]  ◄──► [PostgreSQL]
    │        │
    │        └──► [Redis]  (pub/sub, presence, session store)
    │
    └── [Static file server / upload endpoint]
              │
              └── /uploads volume (local FS)
```

All services defined in `docker-compose.yml`. No Kubernetes required.

---

## 4. Database Schema

### 4.1 Users

```sql
users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  username      TEXT UNIQUE NOT NULL,  -- immutable
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ            -- soft-delete marker
)
```

### 4.2 Sessions

```sql
sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,           -- hashed refresh token
  user_agent  TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
)
```

### 4.3 Friends / Contacts

```sql
friend_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   UUID REFERENCES users(id) ON DELETE CASCADE,
  to_user     UUID REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT,
  status      TEXT CHECK (status IN ('pending','accepted','rejected')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (from_user, to_user)
)

user_bans (
  blocker_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
)
```

### 4.4 Rooms

```sql
rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  visibility  TEXT CHECK (visibility IN ('public','private')) DEFAULT 'public',
  owner_id    UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
)

room_members (
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT CHECK (role IN ('member','admin')) DEFAULT 'member',
  joined_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
)

room_bans (
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  banned_by   UUID REFERENCES users(id),
  banned_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
)

room_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  invited_by  UUID REFERENCES users(id),
  invited_user UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  status      TEXT CHECK (status IN ('pending','accepted','rejected'))
)
```

### 4.5 Messages

```sql
messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID REFERENCES rooms(id) ON DELETE CASCADE,  -- NULL = personal DM
  dialog_id     UUID REFERENCES dialogs(id) ON DELETE CASCADE, -- NULL = room msg
  author_id     UUID REFERENCES users(id),
  content       TEXT CHECK (length(content) <= 3072),  -- 3 KB UTF-8
  reply_to_id   UUID REFERENCES messages(id),
  edited_at     TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
)
-- Index for pagination
CREATE INDEX idx_messages_room_created ON messages(room_id, created_at DESC);
CREATE INDEX idx_messages_dialog_created ON messages(dialog_id, created_at DESC);
```

### 4.6 Personal Dialogs

```sql
dialogs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a      UUID REFERENCES users(id) ON DELETE CASCADE,
  user_b      UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (LEAST(user_a::text, user_b::text), GREATEST(user_a::text, user_b::text))
)
```

### 4.7 Attachments

```sql
attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    UUID REFERENCES messages(id) ON DELETE CASCADE,
  uploader_id   UUID REFERENCES users(id),
  original_name TEXT NOT NULL,
  stored_path   TEXT NOT NULL,          -- relative path under /uploads
  mime_type     TEXT,
  file_size     BIGINT,
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
)
```

### 4.8 Unread Tracking

```sql
last_read (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  room_id     UUID,    -- NULL if dialog
  dialog_id   UUID,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, COALESCE(room_id, dialog_id))
)
```

---

## 5. REST API

All endpoints are prefixed with `/api/v1`. Authentication uses JWT access token in `Authorization: Bearer <token>` header (or HttpOnly cookie for browser clients).

### 5.1 Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create account (email, username, password) |
| POST | `/auth/login` | Sign in → returns access + refresh tokens |
| POST | `/auth/logout` | Invalidate current session |
| POST | `/auth/refresh` | Exchange refresh token for new access token |
| POST | `/auth/password/reset-request` | Send reset link email |
| POST | `/auth/password/reset` | Set new password via reset token |
| PUT | `/auth/password/change` | Change password (authenticated) |
| DELETE | `/auth/account` | Delete own account |

### 5.2 Sessions

| Method | Path | Description |
|---|---|---|
| GET | `/sessions` | List active sessions (browser, IP) |
| DELETE | `/sessions/:id` | Revoke a session |

### 5.3 Users & Contacts

| Method | Path | Description |
|---|---|---|
| GET | `/users/me` | Get own profile |
| GET | `/users/search?q=` | Search users by username |
| GET | `/contacts` | Get friend list with presence |
| POST | `/contacts/request` | Send friend request `{ to_username, message? }` |
| GET | `/contacts/requests` | Pending incoming requests |
| PUT | `/contacts/requests/:id` | Accept / reject request `{ action }` |
| DELETE | `/contacts/:userId` | Remove friend |
| POST | `/contacts/ban/:userId` | Ban user |
| DELETE | `/contacts/ban/:userId` | Unban user |

### 5.4 Rooms

| Method | Path | Description |
|---|---|---|
| GET | `/rooms/public?q=` | List/search public rooms |
| POST | `/rooms` | Create room `{ name, description, visibility }` |
| GET | `/rooms/:id` | Get room details |
| PUT | `/rooms/:id` | Update room settings (owner only) |
| DELETE | `/rooms/:id` | Delete room (owner only) |
| POST | `/rooms/:id/join` | Join public room |
| DELETE | `/rooms/:id/leave` | Leave room |
| GET | `/rooms/:id/members` | List members with roles and statuses |
| POST | `/rooms/:id/admins/:userId` | Promote to admin |
| DELETE | `/rooms/:id/admins/:userId` | Remove admin |
| POST | `/rooms/:id/ban/:userId` | Ban user from room |
| DELETE | `/rooms/:id/ban/:userId` | Unban user |
| GET | `/rooms/:id/bans` | List room bans |
| POST | `/rooms/:id/invitations` | Invite user to private room `{ username }` |
| PUT | `/rooms/:id/invitations/:invId` | Accept/reject invitation |

### 5.5 Messages

| Method | Path | Description |
|---|---|---|
| GET | `/rooms/:id/messages?before=<cursor>&limit=50` | Paginated history (cursor-based) |
| POST | `/rooms/:id/messages` | Send message |
| PUT | `/rooms/:id/messages/:msgId` | Edit own message |
| DELETE | `/rooms/:id/messages/:msgId` | Delete message |
| GET | `/dialogs` | List personal dialogs |
| GET | `/dialogs/:userId/messages?before=<cursor>&limit=50` | Dialog history |
| POST | `/dialogs/:userId/messages` | Send personal message |
| PUT | `/dialogs/:userId/messages/:msgId` | Edit own DM |
| DELETE | `/dialogs/:userId/messages/:msgId` | Delete DM |

### 5.6 Attachments

| Method | Path | Description |
|---|---|---|
| POST | `/attachments/upload` | Upload file, returns `{ id, url }` |
| GET | `/attachments/:id` | Download attachment (auth + access check) |

---

## 6. WebSocket Protocol

Single persistent WS connection per browser tab: `wss://host/ws?token=<access_token>`

### 6.1 Client → Server events

```jsonc
// Mark message read
{ "type": "read", "roomId": "...", "messageId": "..." }

// Typing indicator
{ "type": "typing", "roomId": "...", "dialogUserId": "..." }

// Heartbeat / presence ping (every 30s)
{ "type": "ping" }
```

### 6.2 Server → Client events

```jsonc
// New message delivered
{ "type": "message", "payload": { ...messageObject } }

// Message edited
{ "type": "message_edited", "payload": { ...messageObject } }

// Message deleted
{ "type": "message_deleted", "payload": { "id": "...", "roomId": "..." } }

// Presence update
{ "type": "presence", "payload": { "userId": "...", "status": "online|afk|offline" } }

// Room membership change
{ "type": "room_event", "payload": { "event": "joined|left|banned|unbanned", "roomId": "...", "userId": "..." } }

// Friend request notification
{ "type": "friend_request", "payload": { ...requestObject } }

// Typing indicator
{ "type": "typing", "payload": { "userId": "...", "roomId": "...", "dialogUserId": "..." } }
```

---

## 7. Presence System

Presence is coordinated through **Redis**.

### 7.1 Per-tab tracking

- On WS connect: `HSET presence:{userId} {tabId} {timestamp}` + `EXPIRE presence:{userId} 90`
- Every 30s heartbeat from client resets the TTL: `HSET presence:{userId} {tabId} {now}` + `EXPIRE presence:{userId} 90`
- On disconnect: `HDEL presence:{userId} {tabId}`

### 7.2 AFK detection

- Client sends `{ "type": "activity" }` events on any user interaction.
- If no activity event received for a tab for >60s, server marks that tab as AFK in Redis.
- Computed presence: if **any** tab has activity within 60s → `online`; if all tabs idle >60s → `afk`; if hash key missing (TTL expired or all tabs removed) → `offline`.

### 7.3 Propagation

- On presence change, publish to Redis channel `presence_updates`.
- Subscribed workers fan-out WS `presence` events to all users who share a room or contact with the changed user.
- Target latency: <2 seconds (per spec §3.2).

---

## 8. File Storage

- Files stored under a Docker volume mounted at `/uploads` inside the API container.
- Directory structure: `/uploads/{roomId|dialog}/{attachmentId}/{original_name}`
- On each download request:
  1. Verify JWT is valid.
  2. Check user is current member of room or participant of dialog.
  3. Stream file from disk.
- **Size limits** enforced at upload time: images ≤ 3 MB, other files ≤ 20 MB.
- Files are **not deleted** when a user is removed from a room. They are deleted only when the room itself is deleted (cascade DELETE on `attachments`, with a post-delete hook to remove files from disk).

---

## 9. Authentication & Session Design

- **Password hashing:** bcrypt with cost factor ≥ 12.
- **Access token:** JWT, short-lived (15 min), signed with HS256 or RS256.
- **Refresh token:** opaque random token (UUID v4), stored as `token_hash` (SHA-256) in `sessions` table. HttpOnly, Secure, SameSite=Strict cookie.
- **Persistent login:** Refresh token valid for 30 days. On each token refresh, optionally rotate the refresh token (sliding window).
- **Multi-session:** Each browser has its own session row. Logout deletes only that row.
- **Session list endpoint** returns `{ id, user_agent, ip_address, created_at, last_used_at }` — do not expose raw tokens.

---

## 10. AFK / Multi-Tab Logic

```
Browser Tab A ──ping/activity──► WS handler ──► Redis HSET presence:{uid} tabA now
Browser Tab B ──ping/activity──► WS handler ──► Redis HSET presence:{uid} tabB now

Presence evaluator (runs on each heartbeat or disconnect):
  tabs = HGETALL presence:{uid}
  now = current time
  active_tabs   = [t for t in tabs if now - tabs[t] < 60s]
  inactive_tabs = [t for t in tabs if now - tabs[t] >= 60s]

  if len(tabs) == 0:           status = "offline"
  elif len(active_tabs) > 0:   status = "online"
  else:                        status = "afk"
```

---

## 11. Access Control Rules Summary

| Action | Allowed by |
|---|---|
| Send personal message | Friends only, neither side banned the other |
| Join public room | Any authenticated user unless room-banned |
| Join private room | Invitation only |
| Edit message | Author only |
| Delete message | Author **or** room admin/owner |
| Promote/demote admin | Room owner |
| Ban from room | Room admin or owner |
| Unban from room | Room admin or owner |
| Delete room | Room owner only |
| Download attachment | Current room member or dialog participant |
| View room ban list | Room admins and owner |

---

## 12. Business Logic Edge Cases

1. **Account deletion cascade:**
   - Delete all rooms owned by the user (cascade messages, files, memberships).
   - Remove user from all other rooms' member lists.
   - Remove all sessions.
   - Soft-delete or hard-delete user row (choose one, be consistent).

2. **Room deletion cascade:**
   - Delete all `messages`, `attachments` (DB rows).
   - Delete files from disk (implement post-delete hook or deferred cleanup job).
   - Delete `room_members`, `room_bans`, `room_invitations`.

3. **User-to-user ban:**
   - Terminate friendship (delete `friend_requests` row where status='accepted').
   - Existing dialog messages remain in DB but API returns them as read-only (no POST/PUT/DELETE allowed).
   - Block new friend requests and new DMs between the pair.

4. **Room owner cannot leave:**
   - Owner must transfer ownership or delete the room. API must return 400 if owner attempts to leave.

5. **Message max size:**
   - Reject messages where `content` length > 3072 bytes (not characters). Return 422.

6. **Infinite scroll pagination:**
   - Use cursor-based pagination: `?before=<message_id>&limit=50`.
   - Return messages in **descending** `created_at` order (newest first on API, client reverses for display).

---

## 13. UI Layout Specification

Following the wireframes in the requirements:

### 13.1 Unauthenticated screens
- `/login` — Email + password + "Keep me signed in" checkbox
- `/register` — Email, username, password, confirm password
- `/forgot-password` — Email input → send reset link
- `/reset-password?token=...` — New password form

### 13.2 Main application layout (authenticated)

```
┌─────────────── Top Nav ───────────────────────────────────────────┐
│  Logo | Public Rooms | Private Rooms | Contacts | Sessions | Profile ▼ | Sign out │
├─────────────┬────────────────────────────┬────────────────────────┤
│ LEFT SIDEBAR│     MAIN CHAT AREA         │   RIGHT SIDEBAR        │
│ (rooms +    │                            │  (members / context)   │
│  contacts)  │                            │                        │
│             │  Message history           │  Room info             │
│ Search bar  │  (infinite scroll up)      │  Owner, admins         │
│             │                            │  Member list           │
│ ROOMS       │  ─────────────────         │  with presence dots    │
│  > Public   │                            │                        │
│  > Private  │  Message input             │  [Invite user]         │
│             │  (emoji, attach, reply)    │  [Manage room]         │
│ CONTACTS    │                            │                        │
│  list with  │                            │                        │
│  presence   │                            │                        │
│ [Create rm] │  [Send]                    │                        │
└─────────────┴────────────────────────────┴────────────────────────┘
```

- After entering a room the rooms list collapses to accordion style.
- Presence indicators: green dot = online, amber = AFK, grey = offline.
- Unread badge counter on room/contact names.

### 13.3 Manage Room modal (admin/owner)

Tabbed modal with: **Members | Admins | Banned users | Invitations | Settings**

- **Members tab:** searchable list, role column, action buttons (Make admin, Ban, Remove).
- **Admins tab:** list of current admins; owner marked as immutable.
- **Banned users tab:** banned username, banned by, date, Unban button.
- **Invitations tab:** invite by username input.
- **Settings tab:** edit name, description, visibility toggle, Save / Delete room.

---

## 14. Non-Functional Implementation Notes

| Requirement | Implementation guidance |
|---|---|
| 300 concurrent users | Node.js event loop or Python async handles this comfortably; no special tuning needed at this scale |
| Message delivery <3s | WebSocket push; no polling |
| History ≥ 10,000 msgs | Cursor pagination; never load all at once |
| File size limits | Enforce in middleware before writing to disk |
| No inactivity logout | Do not set session idle timeout; only expiry-based TTL on refresh token |
| Passwords hashed | bcrypt / argon2; never store plaintext |

---

## 15. Docker Compose Structure

```yaml
# docker-compose.yml (outline)
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: chat
      POSTGRES_USER: chat
      POSTGRES_PASSWORD: secret
    volumes:
      - db_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  api:
    build: ./backend
    environment:
      DATABASE_URL: postgres://chat:secret@db:5432/chat
      REDIS_URL: redis://redis:6379
      JWT_SECRET: change_me
    volumes:
      - uploads:/uploads
    depends_on: [db, redis]
    ports:
      - "3001:3001"

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on: [api]

volumes:
  db_data:
  uploads:
```

---

## 16. Advanced Feature: Jabber / XMPP (Optional)

Implement only after core features are complete.

### 16.1 Scope
- Users connect to the server via any Jabber/XMPP client (Gajim, Pidgin, etc.).
- Server-to-server (S2S) federation between two instances.
- Admin UI screens: **XMPP Connection Dashboard** and **Federation Traffic Statistics**.

### 16.2 Integration approach

**Node.js:** `node-xmpp-server` or `prosody` sidecar container  
**Python:** `slixmpp` / `aioxmpp` / embed a `Prosody` or `ejabberd` sidecar

Recommended: run **ejabberd or Prosody as a sidecar** in docker-compose and bridge authentication to the main app's user table via an external auth module. This is an integration, not a rewrite.

### 16.3 Docker Compose addition for federation

```yaml
  xmpp_a:
    image: prosody:latest
    environment:
      LOCAL_DOMAIN: server-a.chat
    volumes:
      - ./xmpp/prosody-a.cfg.lua:/etc/prosody/prosody.cfg.lua

  xmpp_b:
    image: prosody:latest
    environment:
      LOCAL_DOMAIN: server-b.chat
    volumes:
      - ./xmpp/prosody-b.cfg.lua:/etc/prosody/prosody.cfg.lua
```

### 16.4 Load test for federation

- Use `slixmpp` or `tsung` to simulate 50+ clients on each server.
- Script: connect 50 clients to `xmpp_a`, 50 to `xmpp_b`, send cross-server messages, measure delivery latency and success rate.
- Report results in `federation-load-test-results.md`.

### 16.5 Admin UI additions
- **XMPP Connection Dashboard:** online XMPP clients count, connected JIDs, uptime.
- **Federation Traffic:** messages sent/received per federated domain, error rates.

---

## 17. Project Repository Structure (Suggested)

```
/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts          # entry point
│   │   ├── routes/           # REST route handlers
│   │   ├── ws/               # WebSocket handler
│   │   ├── services/         # business logic
│   │   ├── db/               # ORM models + migrations
│   │   ├── middleware/        # auth, upload limits
│   │   └── presence/         # Redis presence manager
│   └── package.json
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/            # Login, Register, Chat, Sessions, Profile
│   │   ├── components/       # Sidebar, MessageList, MessageInput, Modals
│   │   ├── hooks/            # useWebSocket, usePresence, useAuth
│   │   └── api/              # REST client wrappers
│   └── package.json
└── xmpp/                     # (optional) XMPP sidecar configs
```

---

## 18. Checklist for the Implementing Agent

- [ ] `docker compose up` starts all services cleanly from a fresh clone
- [ ] Registration, login, persistent login, logout implemented
- [ ] Password reset flow implemented
- [ ] Session list and per-session logout implemented
- [ ] Friend requests (send, accept, reject, remove) implemented
- [ ] User-to-user ban implemented (DMs frozen, friendship terminated)
- [ ] Public room catalog with search implemented
- [ ] Private rooms with invitation-only access implemented
- [ ] Room creation, settings, deletion implemented
- [ ] Admin/owner role management implemented
- [ ] Room ban/unban implemented
- [ ] Real-time messaging in rooms (WebSocket) implemented
- [ ] Real-time personal messaging (WebSocket) implemented
- [ ] Message editing with "edited" indicator implemented
- [ ] Message deletion (author and admin) implemented
- [ ] Message replies with visual quote implemented
- [ ] Emoji support in messages implemented
- [ ] File and image upload/download implemented
- [ ] Attachment access control (membership-gated) implemented
- [ ] Presence (online/AFK/offline) with multi-tab logic implemented
- [ ] Presence propagation latency <2s verified
- [ ] Unread message indicators on rooms and contacts implemented
- [ ] Infinite scroll for message history implemented
- [ ] 3 KB message size limit enforced
- [ ] 20 MB / 3 MB file size limits enforced
- [ ] All moderation actions available in modal dialogs
- [ ] Mobile-first responsive layout implemented
- [ ] (Optional) XMPP/Jabber sidecar integrated
- [ ] (Optional) Federation load test script included
