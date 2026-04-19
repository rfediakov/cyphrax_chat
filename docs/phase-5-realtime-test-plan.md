# Phase 5 — Real-time Agent: Test Plan

**Branch:** `feature/phase-5-realtime`  
**Depends on:** Phase 4 (Core API) accepted  
**Reference:** `AGENT_DEVELOPMENT_GUIDE.md` §Phase 5, `TECHNICAL_SPEC.md` §7

---

## Prerequisites

1. `docker compose up --build` completes without errors.
2. MongoDB and Redis containers are healthy.
3. At least **two registered user accounts** exist (User A and User B).
4. User A and User B are **accepted friends** (required for DM tests).
5. At least one **public room** exists with both users as members.
6. A WebSocket test client is available (e.g. [Hoppscotch WS](https://hoppscotch.io), `wscat`, or the Socket.IO Admin UI).

### Helper — obtain an access token

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"Password1!"}' | jq -r .accessToken)
```

---

## TC-01: Unauthenticated connection rejected

| Step | Expected |
|------|----------|
| Connect to `ws://localhost:3001/socket.io/?EIO=4&transport=websocket` without sending `auth.token` | Server closes the connection immediately with error `"Unauthorized"` |
| Connect with an expired or invalid JWT in `auth.token` | Connection rejected with `"Unauthorized"` |

**Pass criteria:** No socket ID is assigned; client receives error event.

---

## TC-02: Authenticated connection + room/dialog join

| Step | Expected |
|------|----------|
| Connect with a valid access token: `{ auth: { token: "<accessToken>" } }` | Connection established; socket ID assigned |
| Inspect server logs | Log line: `[Socket] Connected: userId=<id> socketId=<id>` |
| Verify Redis | `HGETALL presence:<userId>` returns `{ "<socketId>": "<timestamp>" }` |
| Verify socket rooms (via Socket.IO admin or logs) | Socket has joined `user:<userId>`, `room:<roomId>` for each membership, `dialog:<dialogId>` for each dialog |

---

## TC-03: Real-time room message delivery

| Step | Expected |
|------|----------|
| Open two Socket.IO connections — User A (Tab A) and User B (Tab B), both members of Room X | Both connected |
| POST a message as User A: `POST /api/v1/rooms/<roomId>/messages` with `{ "content": "hello room" }` | HTTP 201 response |
| Observe Tab B | Receives `message` event: `{ message: { id, content: "hello room", roomId, authorId, ... } }` within < 1 s |
| Tab A also observes | Also receives `message` event (sender is included in `room:<roomId>` channel) |

---

## TC-04: Real-time dialog message delivery

| Step | Expected |
|------|----------|
| Open Socket.IO connections for User A and User B | Both connected |
| POST a DM from A to B: `POST /api/v1/dialogs/<userBId>/messages` with `{ "content": "hey B" }` | HTTP 201 response |
| Observe User B's socket | Receives `message` event on `dialog:<dialogId>` channel: `{ message: { content: "hey B", ... } }` |

---

## TC-05: Message edited event

| Step | Expected |
|------|----------|
| With Tab B listening on Room X | — |
| Tab A edits a room message: `PUT /api/v1/rooms/<roomId>/messages/<msgId>` with `{ "content": "edited" }` | HTTP 200 |
| Observe Tab B | Receives `message_edited` event: `{ message: { id: <msgId>, content: "edited", editedAt: <date>, ... } }` |

---

## TC-06: Message deleted event

| Step | Expected |
|------|----------|
| With Tab B listening on Room X | — |
| Tab A soft-deletes a message: `DELETE /api/v1/rooms/<roomId>/messages/<msgId>` | HTTP 200 |
| Observe Tab B | Receives `message_deleted` event: `{ messageId: <msgId>, roomId: <roomId> }` |

---

## TC-07: Typing indicator

| Step | Expected |
|------|----------|
| User A emits: `socket.emit('typing', { roomId: '<roomId>' })` | — |
| Observe User B's socket (same room) | Receives `typing` event: `{ userId: <userAId>, roomId: <roomId> }` within < 1 s |
| User A does NOT receive the typing event | `socket.to()` excludes the emitting socket |
| Test with dialog: `socket.emit('typing', { dialogId: '<dialogId>' })` | User B receives `typing` with `dialogId` |

---

## TC-08: Read event updates LastRead

| Step | Expected |
|------|----------|
| User A emits: `socket.emit('read', { roomId: '<roomId>' })` | — |
| Query MongoDB: `db.lastread.findOne({ userId: ObjectId('<userAId>'), roomId: ObjectId('<roomId>') })` | Document exists with `lastReadAt` close to now |
| User A emits: `socket.emit('read', { dialogId: '<dialogId>' })` | Upsert for dialog context |
| Query MongoDB again | `lastReadAt` updated |

---

## TC-09: Presence — online status on connect

| Step | Expected |
|------|----------|
| User A has no active connections | `HGETALL presence:<userAId>` → empty or expired |
| User A connects | Presence hash populated; `presence_updates` Redis channel receives `{ userId, status: "online" }` |
| Other members of Room X (User B) receive | `presence` event: `{ userId: <userAId>, status: "online" }` |

---

## TC-10: Presence — AFK after 60 s idle

| Step | Expected |
|------|----------|
| User A is connected but sends NO `activity` or `ping` events | — |
| Wait 65+ seconds | Server's 30 s interval re-evaluates presence; timestamp in hash is > 60 s old |
| User B receives | `presence` event: `{ userId: <userAId>, status: "afk" }` |

*Shortcut for testing: temporarily lower `AFK_THRESHOLD_MS` in `presence.manager.ts` to 5000 ms.*

---

## TC-11: Presence — activity resets to online

| Step | Expected |
|------|----------|
| User A is in AFK state | — |
| User A emits: `socket.emit('activity')` OR `socket.emit('ping')` | Handler calls `updatePresenceHeartbeat` + `evaluateAndBroadcastPresence` |
| User B receives | `presence` event: `{ userId: <userAId>, status: "online" }` |

---

## TC-12: Presence — multi-tab logic

| Step | Expected |
|------|----------|
| User A opens **Tab A** (active) and **Tab B** (immediately idle) | Redis hash has two socket entries |
| Both tabs connected → overall status | `online` (Tab A has recent timestamp) |
| Close Tab A (disconnect) | `HDEL presence:<userAId> <tabASocketId>` runs |
| Tab B is still connected but idle > 60 s | Re-evaluation: only Tab B left, timestamp old → status: `afk` |
| Close Tab B | Hash empty → status: `offline` |
| User B observes throughout | Receives correct `presence` events at each transition |

---

## TC-13: Presence — offline on disconnect

| Step | Expected |
|------|----------|
| User A has exactly one connection | — |
| User A disconnects (closes browser tab or calls `socket.disconnect()`) | `removePresenceSocket` called; presence hash entry deleted |
| Within 90 s | User B receives `presence` event: `{ userId: <userAId>, status: "offline" }` |
| Verify Redis | `HGETALL presence:<userAId>` → empty |

---

## TC-14: Room events — join/leave

| Step | Expected |
|------|----------|
| User C (not yet a member) calls `POST /api/v1/rooms/<roomId>/join` | HTTP 200 |
| Users already in Room X receive | `room_event` event: `{ event: "member_joined", userId: <userCId>, roomId }` |
| User C calls `DELETE /api/v1/rooms/<roomId>/leave` | HTTP 200 |
| Room X members receive | `room_event` event: `{ event: "member_left", userId: <userCId>, roomId }` |

---

## TC-15: Room events — ban/unban

| Step | Expected |
|------|----------|
| Owner bans User B: `POST /api/v1/rooms/<roomId>/ban/<userBId>` | HTTP 200 |
| Room members receive | `room_event`: `{ event: "member_banned", userId: <userBId>, roomId }` |
| Owner unbans: `DELETE /api/v1/rooms/<roomId>/ban/<userBId>` | HTTP 200 |
| Room members receive | `room_event`: `{ event: "member_unbanned", userId: <userBId>, roomId }` |

---

## TC-16: Room events — delete broadcasts before cascade

| Step | Expected |
|------|----------|
| Members listening on Room X | — |
| Owner deletes the room: `DELETE /api/v1/rooms/<roomId>` | HTTP 200 |
| Members receive **before** the room is gone | `room_event`: `{ event: "deleted", roomId }` |
| Room X no longer exists in MongoDB | Verified via GET returning 404 |

---

## TC-17: Friend request notification

| Step | Expected |
|------|----------|
| User B's socket is connected | — |
| User A sends a friend request: `POST /api/v1/contacts/request` with `{ "toUsername": "userB" }` | HTTP 201 |
| User B receives | `friend_request` event on their personal `user:<userBId>` channel: `{ fromUserId: <userAId> }` |

---

## TC-18: Room invitation notification

| Step | Expected |
|------|----------|
| User B's socket is connected | — |
| Admin invites User B to a private room: `POST /api/v1/rooms/<roomId>/invitations` with `{ "username": "userB" }` | HTTP 201 |
| User B receives | `room_event`: `{ event: "invited", roomId, invitationId }` on `user:<userBId>` channel |
| User B accepts: `PUT /api/v1/rooms/<roomId>/invitations/<invId>` with `{ "action": "accept" }` | HTTP 200 |
| Room members receive | `room_event`: `{ event: "member_joined", userId: <userBId>, roomId }` |

---

## TC-19: TypeScript compilation

| Step | Expected |
|------|----------|
| `cd backend && npm run build` | Exit code 0; zero TypeScript errors |

---

## TC-20: End-to-end smoke test (two browser windows)

| Step | Expected |
|------|----------|
| Open two incognito browser windows | — |
| Window 1: register + login as User A | JWT obtained |
| Window 2: register + login as User B | JWT obtained |
| Both connect WebSocket with their tokens | Both sockets establish |
| A and B become friends, join the same room | Via REST API calls |
| User A sends a message via REST | User B receives `message` socket event in < 3 s |
| User A emits `typing` | User B receives `typing` event in < 1 s |
| User A goes idle 60 s | User B receives `presence` → `afk` |
| User A emits `activity` | User B receives `presence` → `online` |
| User A closes connection | User B receives `presence` → `offline` within 90 s |

---

## Acceptance Criteria Mapping

| Guide criterion | Test case(s) |
|-----------------|-------------|
| Two browser tabs exchange messages in real time | TC-03, TC-04, TC-20 |
| Presence: active → online, idle 60 s → AFK, closed → offline | TC-09, TC-10, TC-13, TC-20 |
| Multi-tab: Tab A active + Tab B idle → still online | TC-12 |
| `typing` event < 1 s | TC-07 |
| `read` event updates LastRead in MongoDB | TC-08 |
| All message CRUD REST → correct Socket.IO events | TC-03, TC-04, TC-05, TC-06 |
| Unauthenticated connection rejected | TC-01 |
| TypeScript compiles cleanly | TC-19 |
