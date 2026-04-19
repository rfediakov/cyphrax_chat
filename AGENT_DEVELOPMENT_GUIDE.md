# Agent Development Guide — Online Chat Server

**Version:** 1.0  
**Project:** Real-time web chat application (hackathon submission)  
**Primary reference:** `TECHNICAL_SPEC.md` (read it fully before starting any phase)  
**Secondary reference:** `AI_herders_jam_-_requirements_v3.docx` (original requirements)

---

## How to Use This Guide

This document defines **8 sequential phases**, each assigned to a dedicated agent. Phases must be completed **in order** because later phases depend on artifacts produced by earlier ones. A human reviewer **manually approves** the output of each phase before the next agent starts.

### Ground rules for every agent

1. **Read `TECHNICAL_SPEC.md` fully before writing a single line of code.** It is the single source of truth for schemas, API contracts, Socket.IO events, business logic edge cases, and file structure.
2. **Follow the prescribed repository structure** from TECHNICAL_SPEC.md §17 exactly. Do not invent new folders.
3. **TypeScript strict mode is mandatory** on both backend and frontend.
4. **Mobile-first layout** — all UI uses Tailwind CSS utility classes, starting from mobile breakpoints.
5. **Do not use `!important`** in CSS/Tailwind unless there is no other option.
6. **DRY / KISS / SOLID** — extract shared logic into services, hooks, or utilities. Avoid copy-paste.
7. After completing your phase, **update the checklist** at the bottom of this guide with a tick and a one-line note per item.
8. If you encounter an ambiguity not covered by the spec, **make the safest/most conventional choice and leave a `// TODO(agent-N):` comment** explaining the decision.

---

## Agent Roster & Responsibility Map

| # | Agent name              | Output                                         | Depends on |
|---|-------------------------|------------------------------------------------|------------|
| 1 | **Scaffolding Agent**   | Repo skeleton, Docker, tooling                 | —          |
| 2 | **Data Layer Agent**    | Mongoose models, Redis client, DB bootstrap    | Phase 1    |
| 3 | **Auth Agent**          | Auth + session routes, JWT middleware          | Phase 2    |
| 4 | **Core API Agent**      | Contacts, Rooms, Messages, Attachments routes  | Phase 3    |
| 5 | **Real-time Agent**     | Socket.IO server, presence system              | Phase 4    |
| 6 | **Frontend Foundation Agent** | Stores, API layer, auth pages, router  | Phase 5    |
| 7 | **Frontend Chat Agent** | Main layout, MessageList, MessageInput, real-time wiring | Phase 6 |
| 8 | **Frontend Features Agent** | Room management, contacts, sessions, profile, unread badges | Phase 7 |

**Optional Phase 9** (only if phases 1–8 are passing `docker compose up`):

| # | Agent name              | Output                                         |
|---|-------------------------|------------------------------------------------|
| 9 | **XMPP/Jabber Agent**   | Prosody sidecar, federation, load test, admin UI screens |

---

## Phase 1 — Scaffolding Agent

**Goal:** Create the full repository skeleton so that `docker compose up` builds and starts all containers (even if the app returns 404s on all routes).

### Tasks

#### 1.1 Repository structure

Create the following directory tree (empty placeholder files are fine for now):

```
/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── config.ts
│       ├── routes/         (empty)
│       ├── socket/         (empty)
│       ├── services/       (empty)
│       ├── models/         (empty)
│       ├── middleware/     (empty)
│       ├── presence/       (empty)
│       └── lib/            (empty)
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── pages/          (empty)
        ├── components/     (empty)
        ├── hooks/          (empty)
        ├── store/          (empty)
        └── api/            (empty)
```

#### 1.2 docker-compose.yml

Implement exactly as specified in TECHNICAL_SPEC.md §15. Services: `mongo`, `redis`, `api`, `frontend`.

#### 1.3 Backend scaffold

- `package.json` — dependencies: `express`, `socket.io`, `mongoose`, `ioredis`, `@socket.io/redis-adapter`, `jsonwebtoken`, `bcrypt`, `multer`, `cors`, `cookie-parser`, `dotenv`. Dev: `typescript`, `@types/*`, `ts-node`, `nodemon`, `eslint`, `prettier`.
- `tsconfig.json` — `strict: true`, `target: ES2022`, `module: NodeNext`, `outDir: dist`.
- `src/index.ts` — bootstrap placeholder that starts Express on `PORT` env var and logs "Server running".
- `src/config.ts` — reads and validates all env vars; throws on startup if required vars are missing.
- `.env.example` — list all required env vars with placeholder values.

#### 1.4 Frontend scaffold

- `package.json` — dependencies: `react`, `react-dom`, `react-router-dom`, `zustand`, `axios`, `socket.io-client`, `emoji-picker-react`. Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `autoprefixer`, `postcss`, `eslint`, `prettier`.
- `tsconfig.json` — strict mode, `jsx: react-jsx`.
- `vite.config.ts` — React plugin; proxy `/api` and `/socket.io` to `http://api:3001` (for dev); output `dist/`.
- `tailwind.config.ts` — content paths cover `./src/**/*.{ts,tsx}`.
- `nginx.conf` — implement as specified in TECHNICAL_SPEC.md §15 nginx.conf section.
- `src/main.tsx` — renders `<App />`.
- `src/App.tsx` — placeholder returning `<div>Chat App</div>`.

#### 1.5 Dockerfiles

Implement exactly as specified in TECHNICAL_SPEC.md §15.

#### 1.6 ESLint + Prettier

- Shared `.eslintrc.json` and `.prettierrc` at repo root, extended by each workspace.
- Rules: `@typescript-eslint/recommended`, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`.

### Acceptance criteria (human reviewer checklist)

- [ ] `docker compose up --build` completes without errors.
- [ ] `curl http://localhost:3001/` returns any response (even 404) — API container is alive.
- [ ] `curl http://localhost:3000/` returns the React HTML shell.
- [ ] `docker compose down -v` cleans up cleanly.
- [ ] TypeScript compiles (`npm run build`) without errors in both workspaces.

---

## Phase 2 — Data Layer Agent

**Goal:** Implement all Mongoose schemas and the Redis/MongoDB connection bootstrap. No routes yet.

**Prerequisite:** Phase 1 accepted.

### Tasks

#### 2.1 Database connections (`src/lib/`)

- `redis.ts` — create and export a singleton `ioredis` client. Read `REDIS_URL` from config. Implement retry-on-error logic. Log connection status.
- `mongo.ts` — connect Mongoose using `MONGODB_URI`. Log connection status. Enable `autoIndex: true` in development, `false` in production.

Wire both into `src/index.ts` so they connect on startup before Express begins listening.

#### 2.2 Custom errors (`src/lib/errors.ts`)

```ts
export class AppError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export class BadRequestError extends AppError { constructor(msg: string) { super(400, msg); } }
export class UnauthorizedError extends AppError { constructor(msg = 'Unauthorized') { super(401, msg); } }
export class ForbiddenError extends AppError { constructor(msg = 'Forbidden') { super(403, msg); } }
export class NotFoundError extends AppError { constructor(msg = 'Not found') { super(404, msg); } }
export class ConflictError extends AppError { constructor(msg: string) { super(409, msg); } }
```

Add an Express error-handling middleware in `src/index.ts` that catches `AppError` instances and returns `{ error: message }` JSON.

#### 2.3 Mongoose models (`src/models/`)

Implement **all 12 models** exactly as specified in TECHNICAL_SPEC.md §4. Each file exports its Mongoose model and its TypeScript interface.

| File | Schema | Key constraints |
|------|--------|-----------------|
| `user.model.ts` | `users` | email unique+lowercase, username unique+immutable, soft-delete via `deletedAt` |
| `session.model.ts` | `sessions` | TTL index on `expiresAt` |
| `friendRequest.model.ts` | `friendrequests` | compound unique `(fromUser, toUser)` |
| `userBan.model.ts` | `userbans` | compound unique `(blockerId, blockedId)` |
| `room.model.ts` | `rooms` | name unique, text index on `name + description` |
| `roomMember.model.ts` | `roommembers` | compound unique `(roomId, userId)` |
| `roomBan.model.ts` | `roombans` | compound unique `(roomId, userId)` |
| `roomInvitation.model.ts` | `roominvitations` | index on `(roomId, invitedUser)` |
| `dialog.model.ts` | `dialogs` | participants always sorted before save; unique index |
| `message.model.ts` | `messages` | indexes on `(roomId, createdAt)` and `(dialogId, createdAt)` |
| `attachment.model.ts` | `attachments` | index on `messageId` |
| `lastRead.model.ts` | `lastread` | sparse indexes on `(userId, roomId)` and `(userId, dialogId)` |

#### 2.4 Model integration test (manual)

Insert a `User` document via Mongoose REPL (`docker exec -it <api> node`) and verify it appears in MongoDB. Confirm TTL index on sessions is registered.

### Acceptance criteria

- [ ] `docker compose up` — API container starts, connects to MongoDB and Redis without errors.
- [ ] All 12 model files exist in `src/models/`.
- [ ] Each model is importable and TypeScript compiles cleanly.
- [ ] MongoDB `show collections` reveals all 12 collections (lazy-created on first insert, but indexes registered).
- [ ] `AppError` hierarchy is in place and the global error handler returns structured JSON.

---

## Phase 3 — Auth Agent

**Goal:** Implement the full authentication system: registration, login, logout, token refresh, password management, session management, account deletion.

**Prerequisite:** Phase 2 accepted.

### Tasks

#### 3.1 Auth middleware (`src/middleware/auth.middleware.ts`)

- `requireAuth` — extracts JWT access token from `Authorization: Bearer <token>` header **or** `accessToken` cookie. Verifies signature and expiry. Attaches `req.user = { _id, sessionId }`. Calls `next()` or throws `UnauthorizedError`.
- `optionalAuth` — same but does not reject if no token is present.

#### 3.2 Auth service (`src/services/auth.service.ts`)

Implement all business logic here; routes are thin wrappers.

| Method | Description |
|--------|-------------|
| `register({ email, username, password })` | Hash password with `bcrypt(saltRounds=12)`, create User. Throw `ConflictError` if email or username taken. |
| `login({ email, password })` | Verify password. Create Session document (store `SHA-256(refreshToken)`). Return `{ accessToken, refreshToken }`. |
| `logout(sessionId)` | Set `session.revokedAt = now`. |
| `refreshTokens(rawRefreshToken, sessionId)` | Hash token, find non-revoked, non-expired session. Rotate: create new session, revoke old. Return new pair. |
| `requestPasswordReset(email)` | Generate short-lived JWT reset token (`expiresIn: '1h'`). Log the reset URL (no email transport needed — log to console). |
| `resetPassword(resetToken, newPassword)` | Verify JWT. Hash new password. Save. |
| `changePassword(userId, currentPassword, newPassword)` | Verify current password first. |
| `deleteAccount(userId)` | Implement cascade as specified in TECHNICAL_SPEC.md §12.1. |

**Token details (from spec §9):**
- Access token: HS256, `{ sub: userId, sessionId }`, expires 15 min.
- Refresh token: `crypto.randomBytes(48).toString('hex')`, stored as `SHA-256(token)` in DB, sent as HttpOnly Secure SameSite=Strict cookie, expires 30 days.

#### 3.3 Auth routes (`src/routes/auth.routes.ts`)

Wire all endpoints from TECHNICAL_SPEC.md §5.1:

```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout          (requireAuth)
POST /api/v1/auth/refresh
POST /api/v1/auth/password/reset-request
POST /api/v1/auth/password/reset
PUT  /api/v1/auth/password/change (requireAuth)
DELETE /api/v1/auth/account       (requireAuth)
```

#### 3.4 Session routes (`src/routes/sessions.routes.ts`)

```
GET    /api/v1/sessions        (requireAuth) → list sessions (exclude tokenHash)
DELETE /api/v1/sessions/:id    (requireAuth) → revoke specific session
```

#### 3.5 Users routes (`src/routes/users.routes.ts`)

```
GET /api/v1/users/me           (requireAuth) → own profile
GET /api/v1/users/search?q=    (requireAuth) → prefix match on username, max 20 results
```

#### 3.6 Mount routes

In `src/index.ts`, mount all route modules under `/api/v1`.

### Acceptance criteria

- [ ] `POST /api/v1/auth/register` creates a user; duplicate email/username returns 409.
- [ ] `POST /api/v1/auth/login` returns `{ accessToken }` and sets the refresh cookie.
- [ ] `POST /api/v1/auth/refresh` (with valid cookie) rotates tokens.
- [ ] `POST /api/v1/auth/logout` revokes the current session.
- [ ] `PUT /api/v1/auth/password/change` requires valid current password.
- [ ] `GET /api/v1/sessions` lists active sessions without exposing token hashes.
- [ ] `DELETE /api/v1/auth/account` removes the user and all owned rooms cascade.
- [ ] Protected routes return 401 without a valid token.
- [ ] TypeScript compiles cleanly.

---

## Phase 4 — Core API Agent

**Goal:** Implement the full REST API for contacts/friends, rooms, messages (room + dialog), and file attachments.

**Prerequisite:** Phase 3 accepted.

### Tasks

#### 4.1 Contact service + routes (`src/services/contact.service.ts`, `src/routes/contacts.routes.ts`)

Endpoints (all `requireAuth`):

```
GET    /api/v1/contacts                → friend list
POST   /api/v1/contacts/request        → send friend request { toUsername, message? }
GET    /api/v1/contacts/requests       → pending incoming requests
PUT    /api/v1/contacts/requests/:id   → { action: 'accept' | 'reject' }
DELETE /api/v1/contacts/:userId        → remove friend
POST   /api/v1/contacts/ban/:userId    → ban user (§12.3 cascade)
DELETE /api/v1/contacts/ban/:userId    → unban user
```

**User-ban cascade (§12.3):** When A bans B — delete accepted FriendRequest documents, create UserBan. Do NOT delete the Dialog. After the ban, POST/PUT/DELETE on dialog messages must return 403.

#### 4.2 Room service + routes (`src/services/room.service.ts`, `src/routes/rooms.routes.ts`)

Endpoints:

```
GET    /api/v1/rooms/public?q=&page=   → paginated public room catalog (text search)
POST   /api/v1/rooms                   → create room; creator becomes owner + member
GET    /api/v1/rooms/:id               → room details
PUT    /api/v1/rooms/:id               → update (owner only)
DELETE /api/v1/rooms/:id               → delete + cascade (§12.2, owner only)
POST   /api/v1/rooms/:id/join          → join public room (not banned)
DELETE /api/v1/rooms/:id/leave         → leave (owner returns 400)
GET    /api/v1/rooms/:id/members       → member list with roles
POST   /api/v1/rooms/:id/admins/:userId     → promote to admin (owner)
DELETE /api/v1/rooms/:id/admins/:userId     → demote admin (owner)
POST   /api/v1/rooms/:id/ban/:userId        → ban + remove member (admin/owner)
DELETE /api/v1/rooms/:id/ban/:userId        → unban (admin/owner)
GET    /api/v1/rooms/:id/bans               → ban list (admins/owner only)
POST   /api/v1/rooms/:id/invitations        → { username } invite to private room
PUT    /api/v1/rooms/:id/invitations/:invId → { action: 'accept' | 'reject' }
```

**Key business logic:**
- "Remove member" is implemented as a ban: call the same code path as `POST /ban/:userId` (TECHNICAL_SPEC.md §11).
- Room deletion cascade (§12.2): delete messages → delete attachments → delete files from disk → delete RoomMember/RoomBan/RoomInvitation → delete Room.
- Owner cannot leave (§12.4): `DELETE /rooms/:id/leave` returns 400 if caller is owner.

#### 4.3 Message service + routes (`src/services/message.service.ts`, `src/routes/messages.routes.ts`, `src/routes/dialogs.routes.ts`)

Room messages:

```
GET    /api/v1/rooms/:id/messages?before=<objectId>&limit=50  → cursor-paginated history
POST   /api/v1/rooms/:id/messages                             → { content, replyToId? }
PUT    /api/v1/rooms/:id/messages/:msgId                      → { content } (author only)
DELETE /api/v1/rooms/:id/messages/:msgId                      → soft-delete (author or admin)
```

Dialog messages:

```
GET    /api/v1/dialogs                                         → list dialogs with last message preview
GET    /api/v1/dialogs/:userId/messages?before=&limit=50       → cursor-paginated history
POST   /api/v1/dialogs/:userId/messages                        → { content, replyToId? } (friends only, no ban)
PUT    /api/v1/dialogs/:userId/messages/:msgId                 → edit (author only)
DELETE /api/v1/dialogs/:userId/messages/:msgId                 → soft-delete (author only)
```

**Cursor pagination (§12.6):** Use `_id < before` with `sort({ _id: -1 }).limit(limit)`. Client reverses the result for chronological display.

**Message size (§12.5):** Validate `Buffer.byteLength(content, 'utf8') > 3072` and throw `BadRequestError`.

**Dialog find-or-create (§4.9):** Sort participant IDs before upsert.

#### 4.4 Attachment middleware + routes (`src/middleware/upload.middleware.ts`, `src/routes/attachments.routes.ts`)

- Multer config: store to `/uploads/{roomId|dialogId}/{uuid}-{originalName}`. Limits: images ≤ 3 MB, other files ≤ 20 MB (check MIME type in `fileFilter`).
- `POST /api/v1/attachments/upload` — upload file; create Attachment document; return `{ id, url }`.
- `GET /api/v1/attachments/:id` — auth-gated download (verify membership/participation per §8). Stream with `res.sendFile()`.
- Ensure `/uploads` is mapped to the Docker volume defined in docker-compose.

### Acceptance criteria

- [ ] Full CRUD for rooms works end-to-end with `curl` or a REST client.
- [ ] Room deletion cascade removes messages, attachments, and files from disk.
- [ ] Message cursor pagination returns results in reverse chronological order, limited to `limit`.
- [ ] 3 KB message limit returns 400; valid message saves and returns 201.
- [ ] File upload enforces size limits; image > 3 MB returns 413.
- [ ] Attachment download returns 403 if caller is not a room member.
- [ ] User-ban freezes DM posting but leaves dialog history visible.
- [ ] TypeScript compiles cleanly.

---

## Phase 5 — Real-time Agent

**Goal:** Implement Socket.IO server with the Redis adapter, presence system, and all real-time event handlers.

**Prerequisite:** Phase 4 accepted.

### Tasks

#### 5.1 Socket.IO server setup (`src/socket/index.ts`)

- Attach Socket.IO v4 to the existing Express HTTP server.
- Apply the `@socket.io/redis-adapter` using the Redis client from `src/lib/redis.ts`.
- Configure CORS to allow the frontend origin.

#### 5.2 Socket authentication middleware

In the Socket.IO connection handler, before `connection` is emitted:
- Read `socket.handshake.auth.token` (access token).
- Verify JWT. If invalid, call `next(new Error('Unauthorized'))` to reject the connection.
- Attach `socket.data.userId` and `socket.data.sessionId`.

#### 5.3 On authenticated connect

1. Join personal room: `socket.join(\`user:${userId}\`)`.
2. Look up all rooms the user is a member of → join `room:<roomId>` for each.
3. Look up all dialogs the user participates in → join `dialog:<dialogId>` for each.
4. Update Redis presence hash (§7.1): `HSET presence:{userId} {socketId} {timestamp}`, `EXPIRE presence:{userId} 90`.
5. Evaluate and broadcast presence change if status changed.

#### 5.4 Client → server event handlers (`src/socket/handlers/`)

| Event | Handler |
|-------|---------|
| `activity` | Update Redis timestamp for this socket; re-evaluate and broadcast presence |
| `ping` | Same as `activity` — reset heartbeat TTL |
| `typing` | Broadcast `typing` event to the room or dialog (excluding sender) |
| `read` | Upsert `LastRead` document for `{ userId, roomId|dialogId, lastReadAt: now }` |

#### 5.5 Presence manager (`src/presence/presence.manager.ts`)

Implement the logic from TECHNICAL_SPEC.md §7:

```ts
// evaluatePresence function
function evaluatePresence(tabs: Record<string, number>): 'online' | 'afk' | 'offline'

// publishPresence — write to Redis pub/sub channel "presence_updates"
// subscribePresence — listen and emit Socket.IO "presence" event to affected rooms
```

Schedule server-side evaluation every 30 seconds per connected user (or on each heartbeat event).

#### 5.6 On disconnect

1. `HDEL presence:{userId} {socketId}`.
2. Re-evaluate presence; broadcast if changed.
3. Leave all Socket.IO rooms (automatic on disconnect).

#### 5.7 Server → client events

Ensure all REST mutation routes emit the corresponding Socket.IO events:

| REST action | Socket.IO event | Target room |
|-------------|-----------------|-------------|
| POST message to room | `message` | `room:<roomId>` |
| PUT message (room) | `message_edited` | `room:<roomId>` |
| DELETE message (room) | `message_deleted` | `room:<roomId>` |
| POST message to dialog | `message` | `dialog:<dialogId>` |
| PUT/DELETE dialog message | `message_edited` / `message_deleted` | `dialog:<dialogId>` |
| Friend request sent | `friend_request` | `user:<toUserId>` |
| Room join/leave/ban/unban/invite | `room_event` | `room:<roomId>` |
| Presence change | `presence` | All rooms user belongs to |

Emit from the service layer (inject `io` instance) or via an event emitter pattern.

### Acceptance criteria

- [ ] Two browser tabs can open WebSocket connections and exchange messages in real time.
- [ ] Presence: Tab A active → online. Tab A idle 60 s → AFK. Tab A closed → offline (within 90 s).
- [ ] Multi-tab: Tab A active, Tab B idle → still online overall.
- [ ] `typing` event appears to other users in the room within < 1 s.
- [ ] `read` event updates `LastRead` in MongoDB.
- [ ] All message CRUD REST calls emit the correct Socket.IO events to the correct rooms.
- [ ] Unauthenticated Socket.IO connection is rejected.
- [ ] TypeScript compiles cleanly.

---

## Phase 6 — Frontend Foundation Agent

**Goal:** Implement the Zustand stores, Axios API layer, Socket.IO client hook, React Router, and all unauthenticated pages (Login, Register, ForgotPassword, ResetPassword).

**Prerequisite:** Phase 5 accepted (backend is fully functional).

### Tasks

#### 6.1 Zustand stores (`src/store/`)

**`auth.store.ts`**
```ts
interface AuthState {
  accessToken: string | null;
  user: { _id: string; username: string; email: string } | null;
  setAuth: (token: string, user: AuthState['user']) => void;
  clearAuth: () => void;
}
```

**`chat.store.ts`**
```ts
interface ChatState {
  activeRoomId: string | null;
  activeDialogUserId: string | null;
  rooms: Room[];        // user's rooms
  dialogs: Dialog[];    // user's dialogs with last message preview
  // messages keyed by roomId or dialogId
  messages: Record<string, Message[]>;
  unreadCounts: Record<string, number>; // roomId|dialogId → count
  setActiveRoom: (id: string | null) => void;
  setActiveDialog: (userId: string | null) => void;
  appendMessage: (contextId: string, msg: Message) => void;
  prependMessages: (contextId: string, msgs: Message[]) => void;
  updateMessage: (contextId: string, msg: Message) => void;
  softDeleteMessage: (contextId: string, msgId: string) => void;
  incrementUnread: (contextId: string) => void;
  clearUnread: (contextId: string) => void;
}
```

**`presence.store.ts`**
```ts
interface PresenceState {
  statuses: Record<string, 'online' | 'afk' | 'offline'>; // userId → status
  setStatus: (userId: string, status: 'online' | 'afk' | 'offline') => void;
}
```

#### 6.2 API layer (`src/api/`)

Use Axios with a base URL of `/api/v1`. Apply a request interceptor to inject the `Authorization: Bearer <accessToken>` header from the auth store. Apply a response interceptor to attempt one token refresh on 401, then retry.

| File | Exports |
|------|---------|
| `auth.api.ts` | `register`, `login`, `logout`, `refreshToken`, `requestPasswordReset`, `resetPassword`, `changePassword`, `deleteAccount` |
| `rooms.api.ts` | `getPublicRooms`, `createRoom`, `getRoom`, `updateRoom`, `deleteRoom`, `joinRoom`, `leaveRoom`, `getMembers`, `promoteAdmin`, `demoteAdmin`, `banMember`, `unbanMember`, `getBans`, `sendInvitation`, `respondToInvitation` |
| `messages.api.ts` | `getRoomMessages`, `sendRoomMessage`, `editRoomMessage`, `deleteRoomMessage`, `getDialogs`, `getDialogMessages`, `sendDialogMessage`, `editDialogMessage`, `deleteDialogMessage` |
| `contacts.api.ts` | `getContacts`, `sendFriendRequest`, `getPendingRequests`, `respondToRequest`, `removeFriend`, `banUser`, `unbanUser` |
| `attachments.api.ts` | `uploadAttachment`, `getAttachmentUrl` |
| `sessions.api.ts` | `getSessions`, `revokeSession` |

#### 6.3 Socket.IO client hook (`src/hooks/useSocket.ts`)

```ts
// Connects once when accessToken is available.
// Reconnects automatically on token refresh.
// Exposes: socket, connected
// On 'message' → chat.store.appendMessage + unread increment (if not active context)
// On 'message_edited' → chat.store.updateMessage
// On 'message_deleted' → chat.store.softDeleteMessage
// On 'presence' → presence.store.setStatus
// On 'room_event' → refresh room member list if relevant room is active
// On 'friend_request' → show toast notification
// On 'typing' → set ephemeral typing state (auto-clear after 3 s)
```

#### 6.4 React Router (`src/App.tsx`)

```
/login              → <Login />         (public)
/register           → <Register />      (public)
/forgot-password    → <ForgotPassword /> (public)
/reset-password     → <ResetPassword /> (public)
/                   → <Chat />          (requireAuth, redirect to /login if not)
/sessions           → <Sessions />      (requireAuth)
/profile            → <Profile />       (requireAuth)
*                   → redirect to /
```

#### 6.5 Unauthenticated pages

Implement matching the wireframes in TECHNICAL_SPEC.md §13.1. Use Tailwind. Mobile-first.

- **`Login.tsx`** — Email, Password, "Keep me signed in" checkbox, Sign in button, "Forgot password?" link.
- **`Register.tsx`** — Email, Username, Password, Confirm Password, "Create account" button.
- **`ForgotPassword.tsx`** — Email input, "Send reset link" button. On success show confirmation text.
- **`ResetPassword.tsx`** — Read `?token=` from URL. New password + confirm. On success redirect to `/login`.

#### 6.6 Presence and auth hooks

- `src/hooks/useAuth.ts` — wraps auth store + API; exposes `login`, `logout`, `register`, `currentUser`.
- `src/hooks/usePresence.ts` — reads `presence.store`; provides `getStatus(userId)`.

### Acceptance criteria

- [ ] `npm run build` produces no TypeScript or Vite errors.
- [ ] `/login` renders correctly on mobile (375 px) and desktop.
- [ ] Successful login stores the access token and redirects to `/`.
- [ ] Navigating to `/` without a token redirects to `/login`.
- [ ] Password reset request logs the reset URL to the API console.
- [ ] The Axios interceptor retries a failed request after a successful token refresh.
- [ ] The Socket.IO hook connects and logs "connected" after login.

---

## Phase 7 — Frontend Chat Agent

**Goal:** Build the main chat layout with real-time messaging, infinite scroll, typing indicators, message actions (edit, delete, reply), file uploads, and emoji support.

**Prerequisite:** Phase 6 accepted.

### Tasks

#### 7.1 Main layout (`src/pages/Chat.tsx`, `src/components/layout/`)

Implement the three-column layout from TECHNICAL_SPEC.md §13.2:

```
TopNav (full width)
+----------------+---------------------------+--------------------+
| LeftSidebar    | MessageList               | RightSidebar       |
| (rooms +       | (center, fills height)    | (members/context)  |
| contacts)      +---------------------------+                    |
|                | MessageInput (bottom)     |                    |
+----------------+---------------------------+--------------------+
```

**`TopNav.tsx`** — Logo, navigation links (Public Rooms, Private Rooms, Contacts, Sessions, Profile dropdown, Sign out).

**`LeftSidebar.tsx`**
- Search bar (filter rooms/contacts client-side).
- ROOMS section: expandable accordion — Public subsection, Private subsection. Each room shows name + unread badge.
- CONTACTS section: contact list with presence dots (● green / ◐ amber / ○ grey).
- "Create room" button.
- When a room/dialog is active the sidebar collapses to accordion style.

**`RightSidebar.tsx`**
- Room info (name, description, visibility, owner).
- Admins list.
- Members list with presence dots. Member count.
- "Invite user" button (admin/owner only).
- "Manage room" button (admin/owner only).

#### 7.2 Message list (`src/components/chat/MessageList.tsx`, `src/hooks/useInfiniteMessages.ts`)

- Renders messages chronologically (oldest top, newest bottom).
- **Infinite scroll upward** — when the user scrolls to within 200 px of the top, fetch the next page using the cursor (oldest visible `_id` as `before` param). Prepend to list without jumping scroll position.
- **Auto-scroll to bottom** when new messages arrive and the user is already at the bottom. Do NOT auto-scroll if the user has scrolled up.
- Show "Loading older messages…" spinner at the top during fetch.

**`MessageItem.tsx`**
- Display: avatar/username, timestamp, message content.
- If `replyToId` is set: show a quoted preview of the parent message above the content.
- If `editedAt` is set: show a small grey "(edited)" label.
- If `deletedAt` is set: show "(message deleted)" placeholder; hide attachments.
- Context menu on hover (desktop) / long-press (mobile): "Reply", "Edit" (own messages), "Delete" (own + admin).
- Attachment preview: images shown inline (thumbnail); other files shown as a download card with filename + size.

#### 7.3 Message input (`src/components/chat/MessageInput.tsx`)

- Auto-expanding textarea (grows with content, max 5 rows).
- **Emoji picker** — `emoji-picker-react` opens on emoji button click. Selected emoji appended to text.
- **File attachment** — file input triggered by paperclip button. On file selected, POST to `/api/v1/attachments/upload`. Include returned attachment ID in the message POST payload.
- **Paste to upload** — listen for `paste` events; if `clipboardData.files` contains an image, upload it automatically.
- **Reply preview** — when replying, show a dismissible banner above the input: "Replying to @username: <excerpt>".
- **Send on Enter** (Shift+Enter for newline). Send button always visible.
- **Typing indicator** — emit `typing` event to socket on each keystroke (throttled to once per second). Display `"@username is typing…"` when received.
- **Activity tracking** — on mousemove/keypress emit `activity` to socket (throttled to once per 10 s).

#### 7.4 Real-time wiring

Ensure the `useSocket` hook's event listeners update the chat store so the UI re-renders automatically:
- New message → append to `chat.store.messages[contextId]`.
- Edited message → update in place (keep position).
- Deleted message → update `deletedAt` in place (show placeholder).
- Presence update → `presence.store.setStatus`.

### Acceptance criteria

- [ ] Opening a room loads the last 50 messages (or fewer if history is shorter).
- [ ] Scrolling to the top loads older messages without breaking scroll position.
- [ ] Sending a message appears for the sender immediately and for another logged-in user in real time (< 3 s).
- [ ] Editing a message updates it in place for all users with an "(edited)" label.
- [ ] Soft-deleting a message shows the placeholder for all users.
- [ ] Replying shows a quoted preview correctly.
- [ ] Emoji picker inserts emoji into the text.
- [ ] Uploading an image (≤ 3 MB) sends and displays inline.
- [ ] Typing indicator appears for other users and disappears after 3 s of inactivity.
- [ ] Presence dots update within 2 s of a user going AFK or coming online.
- [ ] The layout is usable on a 375 px mobile screen.

---

## Phase 8 — Frontend Features Agent

**Goal:** Complete all remaining frontend features: room management modal, public room catalog, contact management, sessions page, profile page, and unread badge counts.

**Prerequisite:** Phase 7 accepted.

### Tasks

#### 8.1 ManageRoom modal (`src/components/modals/ManageRoomModal.tsx`)

Tabbed modal, accessible only to room admin/owner. Tabs per TECHNICAL_SPEC.md §13.3:

**Members tab**
- Searchable list. Columns: Username, Status (presence dot), Role, Actions.
- Owner row: no action buttons.
- Admin row: "Remove admin" + "Ban" buttons (owner only sees "Remove admin").
- Member row: "Make admin" + "Ban" + "Remove from room" buttons.
- "Remove from room" calls `POST /rooms/:id/ban/:userId` (treated as ban per spec).

**Admins tab**
- List current admins with a "Remove admin" button (except owner).

**Banned users tab**
- Columns: Username, Banned by, Date/time, "Unban" button.

**Invitations tab**
- Input: "Invite by username" + "Send invite" button. Calls `POST /rooms/:id/invitations`.

**Settings tab**
- Editable fields: Room name, Description, Visibility toggle (Public/Private).
- "Save changes" button (calls `PUT /rooms/:id`).
- "Delete room" button with a confirmation dialog (calls `DELETE /rooms/:id`, then closes modal and navigates home).

#### 8.2 Public rooms catalog page (accessible from TopNav "Public Rooms")

- Full-page view with a search input (debounced, calls `GET /rooms/public?q=`).
- Room cards: name, description, member count, join/view button.
- Pagination (load more button or infinite scroll).
- "Joined" badge for rooms the user already belongs to.

#### 8.3 Contacts & friend requests

In `LeftSidebar` contacts section:
- Each contact shows presence dot + username + unread DM badge.
- Right-click / long-press context menu: "Send message", "Remove friend", "Ban user".

Contacts page (accessible from TopNav):
- List of friends with presence.
- "Add contact" input — search by username → send friend request.
- Pending requests section — "Accept" / "Reject" buttons. Accept/reject calls `PUT /contacts/requests/:id`.
- Banned users section — "Unban" button.

Incoming friend request arrives via `friend_request` Socket.IO event → show a toast/notification with Accept/Reject actions.

#### 8.4 Sessions page (`src/pages/Sessions.tsx`)

- Table: Browser/device info (userAgent), IP address, Created at, "Revoke" button.
- Current session highlighted (no revoke button for it, only "Sign out" via auth).
- Calls `GET /api/v1/sessions` and `DELETE /api/v1/sessions/:id`.

#### 8.5 Profile page (`src/pages/Profile.tsx`)

- Display: username (immutable — shown as plain text), email.
- "Change password" section: current password, new password, confirm — calls `PUT /api/v1/auth/password/change`.
- "Delete account" section: confirmation checkbox + "Delete account" button — calls `DELETE /api/v1/auth/account`, then redirects to `/login`.

#### 8.6 Unread badge system

- When a `message` Socket.IO event arrives for a room/dialog the user is **not** currently viewing, call `chat.store.incrementUnread(contextId)`.
- Display the count as a badge on the room/contact name in the sidebar (e.g., `(3)` in amber).
- When the user opens a room/dialog, call `chat.store.clearUnread(contextId)` and emit `read` to the socket with the latest `messageId`.

#### 8.7 Room invitations (receiving)

When a `room_event` event arrives with `event: 'invited'`:
- Show a toast: "You have been invited to #room-name. [Accept] [Reject]".
- Accept/Reject calls `PUT /api/v1/rooms/:id/invitations/:invId`.
- On accept, the room appears in the Private Rooms section of the sidebar.

### Acceptance criteria

- [ ] Manage Room modal opens for admin/owner; all 5 tabs render and work.
- [ ] Banning a member from the Members tab removes them and adds them to Banned tab.
- [ ] Room deletion from Settings tab cascades and removes the room from the sidebar.
- [ ] Public room catalog search returns results and allows joining.
- [ ] Sending a friend request and accepting it via the Contacts page adds the friend.
- [ ] Unread badge increments for rooms the user is not currently viewing.
- [ ] Opening the room clears the unread badge.
- [ ] Sessions page lists and allows revoking individual sessions.
- [ ] Profile page allows password change; wrong current password returns an error.
- [ ] Account deletion cascade confirmed: user, owned rooms, messages all gone.
- [ ] Layout is usable on 375 px mobile.
- [ ] `docker compose up` — full application works end-to-end.

---

## Phase 9 — XMPP/Jabber Agent (Optional)

**Start only after:** All phases 1–8 are complete and `docker compose up` passes all Phase 8 acceptance criteria.

**Goal:** Integrate Prosody XMPP sidecar, enable S2S federation, write a load test, and add admin UI screens.

### Tasks

#### 9.1 Prosody sidecar containers

Add `xmpp_a` and `xmpp_b` services to `docker-compose.yml` per TECHNICAL_SPEC.md §16.3.

#### 9.2 HTTP auth bridge

Add an internal Express endpoint (not in `/api/v1`, e.g., `/internal/xmpp/auth`) that accepts Prosody `mod_auth_http` requests and validates against the `users` MongoDB collection.

#### 9.3 Prosody config

Write `xmpp/prosody-a.cfg.lua` and `xmpp/prosody-b.cfg.lua`. Configure `mod_auth_http` pointing to the API container. Configure S2S federation between the two instances.

#### 9.4 Federation load test

Write `xmpp/load-test.js` (Node.js script using `@xmpp/client`):
- Connect 50 clients to `xmpp_a`, 50 to `xmpp_b`.
- Exchange cross-server messages.
- Measure round-trip latency and delivery success rate.
- Save results to `federation-load-test-results.md`.

#### 9.5 Admin UI screens

Add two new pages, accessible only to authenticated users from the TopNav:

**XMPP Connection Dashboard** — connected JID count, list of connected JIDs, server uptime.  
**Federation Traffic** — messages per federated domain, error/failure rates, last activity timestamp.

### Acceptance criteria

- [ ] `docker compose up` starts both Prosody containers.
- [ ] A Jabber client (e.g., Gajim) can connect to `xmpp_a` using chat server credentials.
- [ ] A message from `xmpp_a` user reaches an `xmpp_b` user (federation).
- [ ] Load test script runs without crashing; `federation-load-test-results.md` contains real data.
- [ ] Admin XMPP dashboard renders connected sessions.

---

## Implementation Checklist

Track overall progress here. Each agent should mark items complete as they finish.

### Infrastructure
- [x] `docker compose up` starts all services from a fresh clone — scaffolded by Phase 1 Scaffolding Agent
- [x] Backend Dockerfile multi-stage build works — multi-stage node:20-alpine → node:20-alpine per spec §15
- [x] Frontend Dockerfile + nginx serves React SPA with correct routing — multi-stage build + nginx.conf with SPA fallback

### Backend — Data Layer
- [x] All 12 Mongoose models defined with correct indexes — implemented in src/models/ matching TECHNICAL_SPEC.md §4
- [x] Redis client connected with retry logic — singleton with exponential backoff in src/lib/redis.ts
- [x] MongoDB connected — src/lib/mongo.ts; autoIndex=true in dev, false in prod
- [x] Custom AppError hierarchy in place — AppError, BadRequest, Unauthorized, Forbidden, NotFound, Conflict in src/lib/errors.ts
- [x] Global Express error handler returns structured JSON — registered in src/index.ts; returns { error: message }

### Backend — Auth
- [x] Registration with unique email + username — `src/services/auth.service.ts` register(), ConflictError on duplicate email/username
- [x] Login → access token + refresh cookie — login() issues JWT access token + HttpOnly SameSite=Strict refresh cookie
- [x] Persistent login via refresh token rotation — refreshTokens() revokes old session, issues new one
- [x] Logout (current session only) — logout() sets revokedAt on current session only
- [x] Password reset flow (JWT-based, console-logged reset link) — requestPasswordReset() logs URL to console; resetPassword() verifies JWT
- [x] Password change (authenticated) — changePassword() verifies current password first
- [x] Session list (no token hash exposed) — GET /sessions selects -tokenHash; includes isCurrent flag
- [x] Per-session revocation — DELETE /sessions/:id; cannot revoke current session (use /logout)
- [x] Account deletion with full cascade — deleteAccount() deletes owned rooms+messages+attachments, removes memberships, soft-deletes user

### Backend — Core API
- [x] Friend requests (send, accept, reject, remove) — `src/services/contact.service.ts` + `src/routes/contacts.routes.ts`
- [x] User-to-user ban (DMs frozen, friendship terminated) — §12.3 cascade: deletes FriendRequest docs, creates UserBan; DM sending throws 403
- [x] Public room catalog with text search — `GET /api/v1/rooms/public?q=&page=` with MongoDB `$text` search
- [x] Private rooms with invitation-only access — invitation flow via `POST /rooms/:id/invitations` + `PUT /rooms/:id/invitations/:invId`
- [x] Room creation, settings update, deletion (with cascade) — §12.2 cascade: messages → attachments → files on disk → members/bans/invitations → room
- [x] Admin/owner role promotion and demotion — `POST/DELETE /rooms/:id/admins/:userId` (owner only)
- [x] Room ban/unban (remove-member = ban) — single code path in `banMember()`; removes from RoomMember + creates RoomBan
- [x] Room owner cannot leave (returns 400) — `DELETE /rooms/:id/leave` returns 400 if caller is owner
- [x] Cursor-based pagination for room and dialog messages — `_id < before`, `sort({ _id: -1 }).limit(limit)`, `nextCursor` in response
- [x] Message editing with `editedAt` — `PUT /rooms/:id/messages/:msgId` and `PUT /dialogs/:userId/messages/:msgId`
- [x] Message soft-deletion (author and admin) — sets `deletedAt`; content replaced with `[deleted]` in responses
- [x] Message replies with `replyToId` — accepted in POST body and stored on message document
- [x] 3 KB message byte-length limit enforced — `Buffer.byteLength(content, 'utf8') > 3072` → 400
- [x] File upload via Multer (20 MB / 3 MB limits) — `src/middleware/upload.middleware.ts`; image > 3 MB returns 413 in route handler
- [x] Attachment access control (membership-gated download) — `GET /api/v1/attachments/:id` checks RoomMember / Dialog participation
- [x] Cascade file deletion when room/dialog deleted — `room.service.ts` `cascadeDeleteRoomMessages()` unlinks files from disk

### Backend — Real-time
- [x] Socket.IO with Redis adapter — `src/socket/index.ts`; `createAdapter(pubClient, subClient)` attached to HTTP server
- [x] Socket auth middleware (reject unauthenticated connections) — JWT verified in `io.use()`; invalid tokens call `next(new Error('Unauthorized'))`
- [x] On connect: join personal room + all room/dialog rooms — `user:<id>`, `room:<id>`, `dialog:<id>` joined on authenticated connection
- [x] Presence (online / AFK / offline) with Redis hash — `presence:<userId>` hash with `socketId→timestamp`; TTL 90 s; in `src/presence/presence.manager.ts`
- [x] Multi-tab AFK logic (all tabs idle > 60 s → AFK) — `evaluatePresence()` checks max timestamp across all sockets; < 60 s → online, else → afk
- [x] Presence propagation latency < 2 s — Redis pub/sub `presence_updates` channel; `subscribePresence()` fans out to all room/dialog channels
- [x] `typing` event broadcast (excluding sender) — `src/socket/handlers/typing.handler.ts`; `socket.to(target).emit('typing', ...)`
- [x] `read` event updates LastRead — `src/socket/handlers/read.handler.ts`; upserts `LastRead` document for room or dialog
- [x] All REST mutations emit corresponding Socket.IO events — `getIo()` used in all message/room/contacts routes; `message`, `message_edited`, `message_deleted`, `room_event`, `friend_request` emitted to correct Socket.IO rooms

### Frontend — Foundation
- [x] Zustand stores (auth, chat, presence) — `src/store/{auth,chat,presence}.store.ts`; auth persists user to localStorage; chat holds messages/rooms/dialogs/unread; presence holds per-user status
- [x] Axios client with token injection + refresh interceptor — `src/api/axios.ts`; Bearer token injected from auth store; 401 triggers one refresh attempt with queue-based retry
- [x] Socket.IO hook with all event handlers — `src/hooks/useSocket.ts`; connects on token availability; handles `message`, `message_edited`, `message_deleted`, `presence`, `room_event`, `friend_request`, `typing`
- [x] React Router with auth guard — `src/App.tsx`; `RequireAuth` → `/login`; `PublicOnly` → `/`; routes for all auth pages + placeholder Chat/Sessions/Profile
- [x] Login page — `src/pages/Login.tsx`; email + password + keep-signed-in checkbox; error display; link to register/forgot-password
- [x] Register page — `src/pages/Register.tsx`; email + username + password + confirm; client-side password match validation
- [x] ForgotPassword page — `src/pages/ForgotPassword.tsx`; email input; success confirmation text; links back to sign-in
- [x] ResetPassword page — `src/pages/ResetPassword.tsx`; reads `?token=` from URL; new password + confirm; on success redirects to `/login`

### Frontend — Chat
- [ ] Three-column main layout (LeftSidebar / MessageList / RightSidebar)
- [ ] Message list with cursor-based infinite scroll
- [ ] Auto-scroll to bottom; no forced scroll when reading history
- [ ] Reply quoted preview in MessageItem
- [ ] "(edited)" indicator in MessageItem
- [ ] "(message deleted)" placeholder in MessageItem
- [ ] Attachment inline preview (images) and download card (files)
- [ ] MessageInput with emoji picker
- [ ] MessageInput with file upload button
- [ ] MessageInput with paste-to-upload
- [ ] MessageInput reply banner
- [ ] Typing indicator (emit + display)
- [ ] Activity tracking (emit on interaction, throttled)
- [ ] Real-time message CRUD via socket events

### Frontend — Features
- [ ] ManageRoom modal — Members tab
- [ ] ManageRoom modal — Admins tab
- [ ] ManageRoom modal — Banned users tab
- [ ] ManageRoom modal — Invitations tab
- [ ] ManageRoom modal — Settings tab (save + delete)
- [ ] Public rooms catalog with search
- [ ] Contacts/friends list with presence dots in sidebar
- [ ] Friend request send + accept/reject flow
- [ ] Unread badge counters on rooms and contacts
- [ ] Clear unread on chat open + emit `read`
- [ ] Room invitation toast (accept/reject)
- [ ] Sessions page
- [ ] Profile page (password change + account delete)
- [ ] Mobile-first responsive layout

### Optional — XMPP
- [ ] Prosody sidecar containers in docker-compose
- [ ] HTTP auth bridge endpoint
- [ ] S2S federation configured
- [ ] Federation load test script + results file
- [ ] XMPP Connection Dashboard UI
- [ ] Federation Traffic Statistics UI

---

## Shared Conventions for All Agents

### Error response format

```json
{ "error": "Human-readable message" }
```

Always use the `AppError` subclasses. Never `res.status(500).send('Internal error')` — let the global handler do it.

### Pagination response format (messages)

```json
{
  "data": [ /* Message[] */ ],
  "nextCursor": "<objectId or null>"
}
```

`nextCursor` is the `_id` of the oldest message in the page (pass it as `before` for the next page). `null` means no more history.

### Timestamp handling

All dates are returned as ISO 8601 strings from the API. The frontend uses JavaScript `Date` objects internally.

### Soft-delete pattern

`deletedAt: null` = not deleted. `deletedAt: <Date>` = deleted. API endpoints never physically remove message rows; they set `deletedAt`. The API should still return soft-deleted messages in history (so replies can quote them), but with content replaced by a placeholder string `"[deleted]"` and all attachments hidden.

### IDs

All IDs returned from the API are MongoDB `ObjectId` hex strings (24 characters). Never expose internal Mongo `_id` as `id` without mapping — use `.lean()` and remap `_id → id` in a response serializer.

```ts
// Recommended response serializer utility
function toPublic<T extends { _id: unknown }>(doc: T) {
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}
```

### Environment variables

All required env vars are documented in `.env.example`. Each agent that adds a new var must add it to `.env.example` and validate it in `src/config.ts`.

### Commit message convention

```
feat(phase-N): short description of what was built
fix(phase-N): short description of what was fixed
```

---

*This guide was generated from `AI_herders_jam_-_requirements_v3.docx` and `TECHNICAL_SPEC.md` v2.1.*
