# Technical Specification — Online Chat Server

**Version:** 2.0  
**Based on:** AI_herders_jam_-_requirements_v3.docx  
**Stack:** React · TypeScript · Node.js · MongoDB  
**Target audience:** Implementation agent

---

## 1. Project Overview

Build a classic web-based real-time chat application. The system must support up to **300 simultaneous users**, public/private rooms, one-to-one personal messaging, file sharing, contacts/friends, and basic moderation. The project must be runnable via `docker compose up` from the repository root.

---

## 2. Technology Stack


| Layer                  | Choice                                         | Version / Notes                               |
| ---------------------- | ---------------------------------------------- | --------------------------------------------- |
| Backend runtime        | **Node.js**                                    | ≥ 20 LTS                                      |
| Backend language       | **TypeScript**                                 | ≥ 5.x, strict mode on                         |
| HTTP framework         | **Express**                                    | v4 or v5                                      |
| Real-time transport    | **Socket.IO**                                  | v4 — handles WS + fallback, rooms, namespaces |
| Database               | **MongoDB**                                    | 7.x                                           |
| ODM                    | **Mongoose**                                   | v8 — schemas, validation, middleware hooks    |
| File storage           | **Local filesystem** (`/uploads` volume)       | Per spec §3.4                                 |
| File upload middleware | **Multer**                                     | Size limits enforced before write             |
| Session/Auth           | **JWT** (access + refresh) in HttpOnly cookies | `jsonwebtoken` + `bcrypt`                     |
| Presence / pub-sub     | **Redis**                                      | 7.x — multi-tab presence, Socket.IO adapter   |
| Socket.IO adapter      | `**@socket.io/redis-adapter`**                 | Fan-out across multiple API instances         |
| Containerisation       | **Docker + docker-compose**                    | Required by submission rules                  |
| Frontend               | **React + TypeScript + Vite**                  | v18 + Vite 5                                  |
| Frontend state         | **Zustand** or **React Context**               | Lightweight; no Redux overhead needed         |
| UI components          | **Tailwind CSS**                               | Mobile-first utility classes                  |
| API client             | **Axios** + **socket.io-client**               |                                               |
| Linting / formatting   | **ESLint + Prettier**                          | Shared config across frontend and backend     |


> **If implementing Jabber (advanced):** use `node-xmpp-server` npm package or a **Prosody** sidecar container bridged via external auth.

---

## 3. Architecture

```
Browser (React + Vite SPA)
    │  REST (HTTP/S)   Socket.IO (WSS)
    ▼
[Nginx  —  reverse proxy]
    │
    ├── [Express API server  ◄──► MongoDB]
    │         │
    │         └──► [Redis]  (Socket.IO adapter, presence hash, session TTLs)
    │
    └── /uploads  (Docker volume, local FS)
```

All services defined in `docker-compose.yml`. No Kubernetes required.

---

## 4. MongoDB Collections & Mongoose Schemas

All `_id` fields are MongoDB `ObjectId` (Mongoose default). Timestamps (`createdAt`, `updatedAt`) are enabled via `{ timestamps: true }` on every schema.

> **Important:** MongoDB does not enforce referential integrity. All cascade deletes must be handled in application-layer service code or Mongoose `post('deleteOne')` / `post('deleteMany')` middleware hooks.

---

### 4.1 `users`

```ts
const UserSchema = new Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true },  // immutable
  passwordHash: { type: String, required: true },
  deletedAt:    { type: Date, default: null },   // soft-delete
}, { timestamps: true });

UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
```

`username` is immutable — reject any PUT/PATCH that attempts to change it.

---

### 4.2 `sessions`

```ts
const SessionSchema = new Schema({
  userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash:  { type: String, required: true },   // SHA-256 of the refresh token
  userAgent:  String,
  ipAddress:  String,
  expiresAt:  { type: Date, required: true },
  revokedAt:  { type: Date, default: null },
}, { timestamps: true });

SessionSchema.index({ userId: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-purge
```

---

### 4.3 `friendrequests`

```ts
const FriendRequestSchema = new Schema({
  fromUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  toUser:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message:  { type: String, default: '' },
  status:   { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
}, { timestamps: true });

FriendRequestSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });
FriendRequestSchema.index({ toUser: 1, status: 1 });
```

---

### 4.4 `userbans`

```ts
const UserBanSchema = new Schema({
  blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

UserBanSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
```

---

### 4.5 `rooms`

```ts
const RoomSchema = new Schema({
  name:        { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  visibility:  { type: String, enum: ['public', 'private'], default: 'public' },
  ownerId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

RoomSchema.index({ name: 'text', description: 'text' }); // full-text search for catalog
RoomSchema.index({ visibility: 1 });
```

---

### 4.6 `roommembers`

```ts
const RoomMemberSchema = new Schema({
  roomId:   { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role:     { type: String, enum: ['member', 'admin'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { timestamps: false });

RoomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });
RoomMemberSchema.index({ userId: 1 });
```

---

### 4.7 `roombans`

```ts
const RoomBanSchema = new Schema({
  roomId:   { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  bannedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  bannedAt: { type: Date, default: Date.now },
}, { timestamps: false });

RoomBanSchema.index({ roomId: 1, userId: 1 }, { unique: true });
```

---

### 4.8 `roominvitations`

```ts
const RoomInvitationSchema = new Schema({
  roomId:      { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  invitedBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  invitedUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status:      { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
}, { timestamps: true });

RoomInvitationSchema.index({ roomId: 1, invitedUser: 1 });
RoomInvitationSchema.index({ invitedUser: 1, status: 1 });
```

---

### 4.9 `dialogs`

A personal chat between exactly two users. Create on first DM attempt; reuse if it already exists.

```ts
const DialogSchema = new Schema({
  participants: {
    type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    validate: (v: unknown[]) => v.length === 2,
  },
}, { timestamps: true });

// Enforce uniqueness: sort participant IDs before saving
DialogSchema.index({ participants: 1 }, { unique: true });
```

To find or create a dialog between two users:

```ts
const sorted = [userAId, userBId].sort().map(String);
const dialog = await Dialog.findOneAndUpdate(
  { participants: { $all: sorted, $size: 2 } },
  { $setOnInsert: { participants: sorted } },
  { upsert: true, new: true }
);
```

---

### 4.10 `messages`

```ts
const MessageSchema = new Schema({
  // Exactly one of roomId or dialogId must be set
  roomId:    { type: Schema.Types.ObjectId, ref: 'Room',   default: null },
  dialogId:  { type: Schema.Types.ObjectId, ref: 'Dialog', default: null },
  authorId:  { type: Schema.Types.ObjectId, ref: 'User',   required: true },
  content:   {
    type: String,
    required: true,
    maxlength: 3072,   // 3 KB — validated in bytes in service layer
  },
  replyToId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
  editedAt:  { type: Date, default: null },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

MessageSchema.index({ roomId: 1, createdAt: -1 });
MessageSchema.index({ dialogId: 1, createdAt: -1 });
```

---

### 4.11 `attachments`

```ts
const AttachmentSchema = new Schema({
  messageId:    { type: Schema.Types.ObjectId, ref: 'Message', required: true },
  uploaderId:   { type: Schema.Types.ObjectId, ref: 'User',    required: true },
  originalName: { type: String, required: true },
  storedPath:   { type: String, required: true },   // relative to /uploads
  mimeType:     { type: String },
  fileSize:     { type: Number },                   // bytes
  comment:      { type: String, default: '' },
}, { timestamps: true });

AttachmentSchema.index({ messageId: 1 });
```

---

### 4.12 `lastread`

```ts
const LastReadSchema = new Schema({
  userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Exactly one of roomId or dialogId
  roomId:     { type: Schema.Types.ObjectId, ref: 'Room',   default: null },
  dialogId:   { type: Schema.Types.ObjectId, ref: 'Dialog', default: null },
  lastReadAt: { type: Date, default: Date.now },
}, { timestamps: false });

LastReadSchema.index({ userId: 1, roomId: 1 }, { sparse: true });
LastReadSchema.index({ userId: 1, dialogId: 1 }, { sparse: true });
```

---

## 5. REST API

All endpoints prefixed with `/api/v1`. Authentication via `Authorization: Bearer <accessToken>` header or HttpOnly cookie. All IDs are MongoDB ObjectId strings.

### 5.1 Auth


| Method | Path                           | Description                                                       |
| ------ | ------------------------------ | ----------------------------------------------------------------- |
| POST   | `/auth/register`               | Create account `{ email, username, password }`                    |
| POST   | `/auth/login`                  | Sign in → sets HttpOnly refresh cookie, returns `{ accessToken }` |
| POST   | `/auth/logout`                 | Revoke current session                                            |
| POST   | `/auth/refresh`                | Exchange refresh cookie → new `{ accessToken }`                   |
| POST   | `/auth/password/reset-request` | `{ email }` → send reset link                                     |
| POST   | `/auth/password/reset`         | `{ token, newPassword }`                                          |
| PUT    | `/auth/password/change`        | `{ currentPassword, newPassword }` (authenticated)                |
| DELETE | `/auth/account`                | Delete own account                                                |


### 5.2 Sessions


| Method | Path            | Description                                                      |
| ------ | --------------- | ---------------------------------------------------------------- |
| GET    | `/sessions`     | List active sessions `[{ id, userAgent, ipAddress, createdAt }]` |
| DELETE | `/sessions/:id` | Revoke a specific session                                        |


### 5.3 Users & Contacts


| Method | Path                     | Description                                      |
| ------ | ------------------------ | ------------------------------------------------ |
| GET    | `/users/me`              | Own profile                                      |
| GET    | `/users/search?q=`       | Search users by username (prefix match)          |
| GET    | `/contacts`              | Friend list with current presence                |
| POST   | `/contacts/request`      | `{ toUsername, message? }` — send friend request |
| GET    | `/contacts/requests`     | Pending incoming requests                        |
| PUT    | `/contacts/requests/:id` | `{ action: 'accept'                              |
| DELETE | `/contacts/:userId`      | Remove friend                                    |
| POST   | `/contacts/ban/:userId`  | Ban a user                                       |
| DELETE | `/contacts/ban/:userId`  | Unban a user                                     |


### 5.4 Rooms


| Method | Path                            | Description                                    |
| ------ | ------------------------------- | ---------------------------------------------- |
| GET    | `/rooms/public?q=&page=`        | Search/list public rooms (text search)         |
| POST   | `/rooms`                        | `{ name, description, visibility }`            |
| GET    | `/rooms/:id`                    | Room details                                   |
| PUT    | `/rooms/:id`                    | Update name / description / visibility (owner) |
| DELETE | `/rooms/:id`                    | Delete room (owner)                            |
| POST   | `/rooms/:id/join`               | Join public room                               |
| DELETE | `/rooms/:id/leave`              | Leave room                                     |
| GET    | `/rooms/:id/members`            | Members list with roles and presence           |
| POST   | `/rooms/:id/admins/:userId`     | Promote to admin (owner)                       |
| DELETE | `/rooms/:id/admins/:userId`     | Remove admin (owner)                           |
| POST   | `/rooms/:id/ban/:userId`        | Ban member from room                           |
| DELETE | `/rooms/:id/ban/:userId`        | Unban                                          |
| GET    | `/rooms/:id/bans`               | List bans (admins/owner)                       |
| POST   | `/rooms/:id/invitations`        | `{ username }` invite to private room          |
| PUT    | `/rooms/:id/invitations/:invId` | `{ action: 'accept'                            |


### 5.5 Messages

Cursor-based pagination using `_id` as the cursor (ObjectId is monotonically increasing with creation time).


| Method | Path                                                   | Description                            |
| ------ | ------------------------------------------------------ | -------------------------------------- |
| GET    | `/rooms/:id/messages?before=<objectId>&limit=50`       | Paginated history                      |
| POST   | `/rooms/:id/messages`                                  | `{ content, replyToId? }`              |
| PUT    | `/rooms/:id/messages/:msgId`                           | `{ content }` — edit own message       |
| DELETE | `/rooms/:id/messages/:msgId`                           | Soft-delete                            |
| GET    | `/dialogs`                                             | List dialogs with last message preview |
| GET    | `/dialogs/:userId/messages?before=<objectId>&limit=50` | Dialog history                         |
| POST   | `/dialogs/:userId/messages`                            | `{ content, replyToId? }`              |
| PUT    | `/dialogs/:userId/messages/:msgId`                     | Edit                                   |
| DELETE | `/dialogs/:userId/messages/:msgId`                     | Soft-delete                            |


### 5.6 Attachments


| Method | Path                  | Description                           |
| ------ | --------------------- | ------------------------------------- |
| POST   | `/attachments/upload` | Multipart form; returns `{ id, url }` |
| GET    | `/attachments/:id`    | Auth-gated file download / stream     |


---

## 6. Socket.IO Protocol

Use **Socket.IO v4** with the `**@socket.io/redis-adapter`** so events are broadcast across multiple API instances.

Connection: `wss://host` with `{ auth: { token: '<accessToken>' } }` in Socket.IO handshake options.

### 6.1 Client → Server events

```ts
// User activity (reset AFK timer)
socket.emit('activity')

// Mark room/dialog as read
socket.emit('read', { roomId?: string, dialogId?: string, messageId: string })

// Typing indicator
socket.emit('typing', { roomId?: string, dialogUserId?: string })

// Keepalive (every 30 s)
socket.emit('ping')
```

### 6.2 Server → Client events

```ts
// New message
socket.on('message', (msg: MessagePayload) => {})

// Message was edited
socket.on('message_edited', (msg: MessagePayload) => {})

// Message was deleted
socket.on('message_deleted', ({ id, roomId, dialogId }: DeletedPayload) => {})

// Presence change
socket.on('presence', ({ userId, status }: { userId: string, status: 'online' | 'afk' | 'offline' }) => {})

// Room membership change
socket.on('room_event', ({ event, roomId, userId }: RoomEventPayload) => {})
// event: 'joined' | 'left' | 'banned' | 'unbanned' | 'invited'

// Friend request
socket.on('friend_request', (request: FriendRequestPayload) => {})

// Typing indicator from another user
socket.on('typing', ({ userId, roomId, dialogId }: TypingPayload) => {})
```

### 6.3 Socket.IO Rooms (server-side)

On authenticated connect, join the user to:

- A personal room: `user:<userId>` — for DMs, friend requests, personal notifications
- All chat rooms the user is a member of: `room:<roomId>`
- All dialogs the user participates in: `dialog:<dialogId>`

This way `io.to('room:<id>').emit(...)` fans out to all members automatically.

---

## 7. Presence System

Presence is stored in **Redis** so it works across multiple API pods.

### 7.1 Per-tab tracking (Redis hash)

```
Key:   presence:{userId}
Field: {socketId}
Value: {timestamp ms}
TTL:   90 seconds (reset on every heartbeat)
```

```ts
// On socket connect
await redis.hset(`presence:${userId}`, socketId, Date.now());
await redis.expire(`presence:${userId}`, 90);

// On socket disconnect
await redis.hdel(`presence:${userId}`, socketId);

// On 'ping' event or 'activity' from client
await redis.hset(`presence:${userId}`, socketId, Date.now());
await redis.expire(`presence:${userId}`, 90);
```

### 7.2 AFK detection

Each socket has its own last-activity timestamp in the hash value. On each heartbeat evaluation:

```ts
function evaluatePresence(tabs: Record<string, number>): 'online' | 'afk' | 'offline' {
  const now = Date.now();
  if (Object.keys(tabs).length === 0) return 'offline';
  const anyActive = Object.values(tabs).some(ts => now - ts < 60_000);
  return anyActive ? 'online' : 'afk';
}
```

Client sends `activity` event on mouse move / keypress (throttled to once per 10 s).

### 7.3 Propagation

- On presence change publish to Redis channel `presence_updates`: `{ userId, status }`.
- Subscribed server worker emits `presence` Socket.IO event to all rooms the user belongs to.
- Target: propagation latency < 2 s.

---

## 8. File Storage

- Multer middleware saves to `/uploads/{roomId|dialogId}/{uuid}-{originalName}`.
- `storedPath` in the `attachments` collection stores the path relative to `/uploads`.
- Download handler (`GET /attachments/:id`):
  1. Validate JWT.
  2. Fetch attachment document.
  3. Resolve parent message → check user is member of the room or participant of the dialog.
  4. Stream file using `res.sendFile()`.
- **Size limits** (enforced by Multer before writing to disk):
  - Images (`image/`* MIME): ≤ 3 MB
  - All other files: ≤ 20 MB
- Files survive user removal from a room. They are deleted from disk only when the room or dialog is deleted (handled in a Mongoose `post('deleteOne')` hook on the Room/Dialog model).

---

## 9. Authentication & Session Design

- **Password hashing:** `bcrypt`, `saltRounds = 12`.
- **Access token:** JWT signed with `HS256`, expires in **15 minutes**. Payload: `{ sub: userId, sessionId }`.
- **Refresh token:** Random 48-byte hex string (`crypto.randomBytes(48).toString('hex')`). Stored as `SHA-256(token)` in the `sessions` collection. Sent as an HttpOnly, Secure, SameSite=Strict cookie.
- **Refresh expiry:** 30 days. TTL index on `sessions.expiresAt` handles auto-cleanup.
- **Token rotation:** On `/auth/refresh`, issue a new refresh token and revoke the old one (update `revokedAt`).
- **Multi-session:** Each browser/device has its own `sessions` document. `/auth/logout` sets `revokedAt` only on the current session.
- **Session list:** Return `{ _id, userAgent, ipAddress, createdAt }` — never return the token or hash.
- **Password reset:** Generate a short-lived signed JWT (`expiresIn: '1h'`) as the reset token; embed in the reset link. No separate DB table needed.

---

## 10. AFK / Multi-Tab Logic

```
Tab A connects → socket.id = "abc"
Tab B connects → socket.id = "xyz"

Redis: presence:{userId} = { abc: 1713400000000, xyz: 1713400005000 }

Every 30s, server evaluates:
  tabs = await redis.hgetall(`presence:${userId}`)
  now = Date.now()

  if no keys          → status = 'offline'
  if any ts > now-60s → status = 'online'
  else                → status = 'afk'

On status change → publish to Redis → fan-out Socket.IO 'presence' event
```

A user becomes `offline` only when:

- All sockets disconnect (hash key TTL expires at 90 s, or all fields deleted), **or**
- The hash becomes empty after `HDEL`.

---

## 11. Access Control Rules Summary


| Action                 | Allowed by                                                        |
| ---------------------- | ----------------------------------------------------------------- |
| Send personal message  | Friends only, neither side has banned the other                   |
| Join public room       | Any authenticated user not room-banned                            |
| Join private room      | Invitation only                                                   |
| Edit message           | Author only                                                       |
| Delete message         | Author **or** room admin/owner (room messages); author only (DMs) |
| Promote / demote admin | Room owner                                                        |
| Ban from room          | Room admin or owner                                               |
| Unban from room        | Room admin or owner                                               |
| Delete room            | Room owner only                                                   |
| Download attachment    | Current room member or dialog participant                         |
| View room ban list     | Room admins and owner                                             |


---

## 12. Business Logic Edge Cases

### 12.1 Account deletion cascade

Handle in a `UserService.deleteAccount(userId)` method — do not rely on DB constraints:

```
1. Find all rooms where ownerId === userId → delete each (triggers room deletion cascade)
2. Pull userId from RoomMember documents in all other rooms
3. Update FriendRequest documents referencing userId
4. Delete all Session documents for userId
5. Set user.deletedAt = now (soft delete)
```

### 12.2 Room deletion cascade

Handle in a `RoomService.deleteRoom(roomId)` Mongoose post-hook or service method:

```
1. Delete all Message documents where roomId matches
2. Delete all Attachment documents where messageId matches those messages
3. Delete files from disk (fs.rm)
4. Delete RoomMember, RoomBan, RoomInvitation documents
5. Delete Room document
```

### 12.3 User-to-user ban

```
1. Delete FriendRequest where (fromUser=A,toUser=B) or (fromUser=B,toUser=A) with status='accepted'
2. Create UserBan { blockerId: A, blockedId: B }
3. Existing Dialog documents remain; API enforces read-only by checking ban before POST/PUT/DELETE
```

### 12.4 Room owner cannot leave

`DELETE /rooms/:id/leave` must return `400 Bad Request` if `req.user._id === room.ownerId`.

### 12.5 Message max size

Validate in bytes before saving:

```ts
if (Buffer.byteLength(content, 'utf8') > 3072)
  throw new BadRequestError('Message exceeds 3 KB');
```

### 12.6 Cursor pagination with MongoDB

```ts
const query: FilterQuery<IMessage> = { roomId, deletedAt: null };
if (before) {
  query._id = { $lt: new Types.ObjectId(before) };
}
const messages = await Message.find(query)
  .sort({ _id: -1 })
  .limit(limit)
  .lean();
// Client reverses array for chronological display
```

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
┌─────────────── Top Nav ───────────────────────────────────────────────────────┐
│  Logo | Public Rooms | Private Rooms | Contacts | Sessions | Profile ▼ | Sign out │
├──────────────┬─────────────────────────────┬──────────────────────────────────┤
│ LEFT SIDEBAR │      MAIN CHAT AREA         │  RIGHT SIDEBAR                   │
│ (rooms +     │                             │  (members / context)             │
│  contacts)   │  Message history            │                                  │
│              │  (infinite scroll up)       │  Room info                       │
│  Search bar  │                             │  Owner / admins                  │
│              │  ────── older msgs ──────   │  Member list + presence dots     │
│  ROOMS       │                             │                                  │
│   > Public   │  Message input              │  [Invite user]                   │
│   > Private  │  (emoji | attach | reply)   │  [Manage room]                   │
│              │                             │                                  │
│  CONTACTS    │                      [Send] │                                  │
│  [Create rm] │                             │                                  │
└──────────────┴─────────────────────────────┴──────────────────────────────────┘
```

- After entering a room the rooms list collapses to accordion style.
- Presence indicators: `●` green = online, `◐` amber = AFK, `○` grey = offline.
- Unread badge counter on room/contact names.

### 13.3 Manage Room modal (admin/owner)

Tabbed modal: **Members | Admins | Banned users | Invitations | Settings**

- **Members tab:** searchable list, role column, action buttons (Make admin, Ban, Remove).
- **Admins tab:** list of current admins; owner row has no action buttons.
- **Banned users tab:** username, banned by, date, Unban button.
- **Invitations tab:** invite by username input + Send button.
- **Settings tab:** edit name, description, visibility toggle, Save / Delete room.

---

## 14. Non-Functional Implementation Notes


| Requirement               | Implementation guidance                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| 300 concurrent users      | Node.js single-thread event loop is fine; Socket.IO + Redis adapter scales horizontally if needed |
| Message delivery < 3 s    | Socket.IO push — no polling                                                                       |
| History ≥ 10,000 messages | ObjectId cursor pagination; never `find()` without limit                                          |
| File size limits          | Multer `limits.fileSize` per MIME type group; reject before writing                               |
| No inactivity logout      | No idle session TTL — only `expiresAt` on refresh token                                           |
| Passwords hashed          | `bcrypt` saltRounds=12; never log or return `passwordHash`                                        |
| MongoDB cascade           | No FK constraints; implement cascades in service layer or Mongoose middleware                     |
| Text search for rooms     | Use MongoDB Atlas Search **or** `$text` index on `name` + `description` fields                    |


---

## 15. Docker Compose

```yaml
# docker-compose.yml
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    environment:
      MONGO_INITDB_DATABASE: chat
    volumes:
      - mongo_data:/data/db
    ports:
      - "27017:27017"

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://mongo:27017/chat
      REDIS_URL: redis://redis:6379
      JWT_SECRET: change_me_in_production
      JWT_REFRESH_SECRET: change_me_too
      PORT: 3001
    volumes:
      - uploads:/uploads
    depends_on:
      - mongo
      - redis
    ports:
      - "3001:3001"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - api

volumes:
  mongo_data:
  uploads:
```

### Backend Dockerfile (outline)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Frontend Dockerfile (outline)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## 16. Advanced Feature: Jabber / XMPP (Optional)

Implement only after the core feature set is complete.

### 16.1 Scope

- Users connect to the chat server using any standard Jabber/XMPP client (e.g. Gajim, Pidgin).
- Server-to-server (S2S) federation between two instances.
- Admin UI additions: **XMPP Connection Dashboard** and **Federation Traffic Statistics**.

### 16.2 Recommended approach

Run a **Prosody** sidecar container and bridge authentication to the main app's MongoDB user table using Prosody's [mod_auth_http](https://modules.prosody.im/mod_auth_http) module, pointing it at a dedicated internal endpoint on the Express API.

```
XMPP client ──XMPP──► Prosody sidecar ──HTTP auth──► Express API ──► MongoDB
```

This makes XMPP an integration concern rather than a rewrite.

### 16.3 Docker Compose addition for federation

```yaml
  xmpp_a:
    image: prosody/prosody:latest
    volumes:
      - ./xmpp/prosody-a.cfg.lua:/etc/prosody/prosody.cfg.lua
    ports:
      - "5222:5222"   # client-to-server
      - "5269:5269"   # server-to-server

  xmpp_b:
    image: prosody/prosody:latest
    volumes:
      - ./xmpp/prosody-b.cfg.lua:/etc/prosody/prosody.cfg.lua
    ports:
      - "5223:5222"
      - "5270:5269"
```

### 16.4 Federation load test

- Use `[node-xmpp-client](https://www.npmjs.com/package/@xmpp/client)` in a Node.js script to spawn 50+ clients per server.
- Script: connect 50 clients to `xmpp_a`, 50 to `xmpp_b`, exchange cross-server messages, measure round-trip latency and delivery success rate.
- Save results to `federation-load-test-results.md`.

### 16.5 Admin UI additions

- **XMPP Connection Dashboard:** count of connected XMPP sessions, list of connected JIDs, server uptime.
- **Federation Traffic:** messages per federated domain, error/failure rates, last activity timestamp.

---

## 17. Project Repository Structure

```
/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                  # Bootstrap: Express + Socket.IO + MongoDB + Redis
│       ├── config.ts                 # Env vars with validation
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── sessions.routes.ts
│       │   ├── users.routes.ts
│       │   ├── contacts.routes.ts
│       │   ├── rooms.routes.ts
│       │   ├── messages.routes.ts
│       │   ├── dialogs.routes.ts
│       │   └── attachments.routes.ts
│       ├── socket/
│       │   ├── index.ts              # Socket.IO setup, auth middleware
│       │   └── handlers/             # presence, messaging, typing handlers
│       ├── services/
│       │   ├── auth.service.ts
│       │   ├── room.service.ts
│       │   ├── message.service.ts
│       │   ├── contact.service.ts
│       │   └── presence.service.ts
│       ├── models/                   # Mongoose schemas
│       │   ├── user.model.ts
│       │   ├── session.model.ts
│       │   ├── room.model.ts
│       │   ├── roomMember.model.ts
│       │   ├── roomBan.model.ts
│       │   ├── roomInvitation.model.ts
│       │   ├── dialog.model.ts
│       │   ├── message.model.ts
│       │   ├── attachment.model.ts
│       │   ├── friendRequest.model.ts
│       │   ├── userBan.model.ts
│       │   └── lastRead.model.ts
│       ├── middleware/
│       │   ├── auth.middleware.ts    # JWT verification
│       │   └── upload.middleware.ts  # Multer config with size limits
│       ├── presence/
│       │   └── presence.manager.ts  # Redis HSET/HGETALL logic
│       └── lib/
│           ├── redis.ts             # ioredis client singleton
│           └── errors.ts           # Custom error classes
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Register.tsx
│       │   ├── ForgotPassword.tsx
│       │   ├── ResetPassword.tsx
│       │   ├── Chat.tsx             # Main layout page
│       │   ├── Sessions.tsx
│       │   └── Profile.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── TopNav.tsx
│       │   │   ├── LeftSidebar.tsx
│       │   │   └── RightSidebar.tsx
│       │   ├── chat/
│       │   │   ├── MessageList.tsx
│       │   │   ├── MessageItem.tsx
│       │   │   └── MessageInput.tsx
│       │   └── modals/
│       │       └── ManageRoomModal.tsx
│       ├── hooks/
│       │   ├── useSocket.ts
│       │   ├── usePresence.ts
│       │   ├── useAuth.ts
│       │   └── useInfiniteMessages.ts
│       ├── store/                   # Zustand stores
│       │   ├── auth.store.ts
│       │   ├── chat.store.ts
│       │   └── presence.store.ts
│       └── api/                     # Axios wrappers
│           ├── auth.api.ts
│           ├── rooms.api.ts
│           ├── messages.api.ts
│           └── contacts.api.ts
└── xmpp/                            # (optional) Prosody sidecar configs
    ├── prosody-a.cfg.lua
    └── prosody-b.cfg.lua
```

---

## 18. Implementation Checklist

- `docker compose up` starts all services cleanly from a fresh clone
- All Mongoose models defined with correct indexes
- Registration, login, persistent login (refresh cookie), logout implemented
- Password reset flow implemented (JWT-based reset token)
- Password change (authenticated) implemented
- Session list and per-session revocation implemented
- Account deletion with full cascade implemented
- Friend requests (send, accept, reject, remove) implemented
- User-to-user ban implemented (DMs frozen, friendship terminated)
- Public room catalog with text search implemented
- Private rooms with invitation-only access implemented
- Room creation, settings update, deletion implemented (with cascade)
- Admin/owner role promotion and demotion implemented
- Room ban/unban with correct ban-list visibility implemented
- Room owner cannot leave (returns 400) enforced
- Real-time room messaging via Socket.IO implemented
- Real-time personal (dialog) messaging via Socket.IO implemented
- Message editing with `editedAt` indicator implemented
- Message soft-deletion (author and admin) implemented
- Message replies with quoted content implemented
- Emoji support in message content
- File and image upload via Multer implemented
- Attachment access control (membership-gated download) implemented
- Cascade file deletion when room/dialog deleted
- Presence (online / AFK / offline) with Redis hash tracking implemented
- Multi-tab AFK logic (all tabs idle > 60 s → AFK) implemented
- Presence propagation latency < 2 s verified
- Unread message indicators on rooms and contacts implemented
- Cursor-based infinite scroll for message history implemented
- 3 KB message size limit enforced in bytes
- 20 MB / 3 MB file size limits enforced by Multer
- All admin moderation actions available in modal dialogs
- Mobile-first responsive layout with Tailwind CSS
- (Optional) Prosody XMPP sidecar integrated with HTTP auth bridge
- (Optional) S2S federation docker-compose configuration added
- (Optional) Federation load test script (50+ clients per server) included
- (Optional) XMPP admin dashboard screens added

