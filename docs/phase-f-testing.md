# Phase F — Audio & Video Calls (WebRTC) — Test Plan

**Branch:** `phase-f`  
**Date:** May 2026  
**Prerequisites:** `docker compose up` completes without errors, two different browser sessions (Alice & Bob) are logged in.

---

## Section 1 — Human Tester Checklist

> Run each item manually in two browser windows (or two devices on the same network).

### 1.1 Setup

- [ ] `docker compose up --build` starts all services (mongo, redis, api, frontend, **coturn**)
- [ ] No startup errors in `docker compose logs`
- [ ] `GET /api/v1/calls/ice-config` returns JSON with `iceServers` array (at minimum the two Google STUN entries)

### 1.2 ICE Config Endpoint

| # | Step | Expected |
|---|------|----------|
| 1 | Open DevTools → Network → call `/api/v1/calls/ice-config` with a valid Bearer token | HTTP 200, body has `iceServers` array |
| 2 | Call the endpoint without an auth token | HTTP 401 |

### 1.3 Incoming Call Modal — UI

| # | Step | Expected |
|---|------|----------|
| 1 | From Alice's session emit `call_incoming` event via the JS console: `socketSingleton.emit(...)` — or trigger it from Bob | Full-screen modal with caller name, call type icon appears |
| 2 | Observe audio output | Repeated beep ringtone plays |
| 3 | Wait 30 seconds without interacting | Modal disappears automatically (auto-decline) |
| 4 | Re-trigger the modal, click **Decline** | Modal closes instantly, ringtone stops |
| 5 | Re-trigger, click **Answer** | Modal closes, `ActiveCallOverlay` appears |

### 1.4 Audio Call — End-to-End (1-1)

> Requires microphone permission. Use two browser profiles or two devices.

| # | Step | Expected |
|---|------|----------|
| 1 | Alice (Caller): Initiate an audio call to Bob | Alice sees `ActiveCallOverlay` with "Connecting…", Bob sees `IncomingCallModal` |
| 2 | Bob: click **Answer** | Both see `ActiveCallOverlay`; timer starts; microphone audio is transmitted |
| 3 | Speak into Alice's mic | Bob hears audio (and vice versa) |
| 4 | Alice: click **Mute** button | Microphone icon changes; Bob no longer hears Alice |
| 5 | Alice: click **Mute** again to unmute | Audio restored |
| 6 | Alice: click **End Call** (📵) | Both overlays disappear; call status → `ended` in DB |
| 7 | Bob initiates a call back | Same flow works in reverse (callee becomes caller) |

### 1.5 Video Call — End-to-End (1-1)

| # | Step | Expected |
|---|------|----------|
| 1 | Alice initiates a **video** call | Camera permission prompt appears; Alice's local feed visible in PiP |
| 2 | Bob answers | Bob's remote video appears on Alice's screen (and vice versa) |
| 3 | Alice: click **Cam off** (📷) | Local video PiP disappears; Bob sees a blank/avatar in place of Alice's video |
| 4 | Alice: click **Cam on** | Video resumes |
| 5 | Alice: minimize the call (⌟ button) | Floating PiP button appears bottom-right with elapsed time |
| 6 | Click the floating PiP button | Full overlay restores |
| 7 | End call | Clean teardown |

### 1.6 Group Call (mesh, ≤ 8 members)

| # | Step | Expected |
|---|------|----------|
| 1 | Create a room with 3 members (Alice, Bob, Carol) | All three are room members |
| 2 | Alice initiates a room audio call (`roomId` provided) | Bob & Carol both see `IncomingCallModal` |
| 3 | Both Bob and Carol answer | All three are in audio call |
| 4 | Create a room with 9+ members; Alice initiates a room call | Error toast: "Group calls are limited to 8 participants" |

### 1.7 Edge Cases

| # | Step | Expected |
|---|------|----------|
| 1 | Bob declines Alice's call | Alice sees toast "Call declined"; overlay closes |
| 2 | During a call, close Bob's browser tab | After a few seconds Alice's overlay closes (disconnect cleanup) |
| 3 | Alice calls Bob while Bob is already in a call | Bob's `IncomingCallModal` appears; Bob can decline |
| 4 | Call with no TURN server configured (`TURN_HOST=localhost`) | STUN-only ICE; call may not work over strict NAT (expected; document limitation) |
| 5 | Offline user is called | `call_incoming` is not delivered (socket not connected); call stays in `ringing` then `missed` |

### 1.8 Call History

| # | Step | Expected |
|---|------|----------|
| 1 | After several calls, `GET /api/v1/calls/history` | Returns array sorted by `createdAt` descending |
| 2 | Each entry has `status` of `ended`, `declined`, or `missed` | Correct statuses |
| 3 | `?limit=2&offset=0` | Returns exactly 2 entries |

---

## Section 2 — Agent Test Plan

> Instructions for an AI agent running automated tests against a locally running stack (`docker compose up`).

### 2.1 Environment Setup

```bash
BASE_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3000"
```

Register two test accounts and log in to obtain access tokens:

```bash
# Register Alice
ALICE_TOKEN=$(curl -s -X POST $BASE_URL/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice_f","email":"alice_f@test.com","password":"Test1234!"}' \
  | jq -r '.accessToken')

# Register Bob
BOB_TOKEN=$(curl -s -X POST $BASE_URL/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"bob_f","email":"bob_f@test.com","password":"Test1234!"}' \
  | jq -r '.accessToken')
```

### 2.2 REST Endpoint Tests

#### T-01 — ICE Config (authenticated)

```bash
RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  $BASE_URL/api/v1/calls/ice-config)
# Assert: RESULT == 200

BODY=$(curl -s -H "Authorization: Bearer $ALICE_TOKEN" \
  $BASE_URL/api/v1/calls/ice-config)
# Assert: body contains "iceServers" key
# Assert: body contains at least one entry with urls "stun:stun.l.google.com:19302"
echo $BODY | jq '.iceServers | length > 0'
```

#### T-02 — ICE Config (unauthenticated)

```bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/v1/calls/ice-config)
# Assert: CODE == 401
```

#### T-03 — Call History (empty, then populated)

```bash
# Initially empty
HISTORY=$(curl -s -H "Authorization: Bearer $ALICE_TOKEN" \
  $BASE_URL/api/v1/calls/history)
echo $HISTORY | jq '.calls | length'   # should be 0

# (After T-04 runs) call history should have entries
HISTORY=$(curl -s -H "Authorization: Bearer $ALICE_TOKEN" \
  "$BASE_URL/api/v1/calls/history?limit=5&offset=0")
echo $HISTORY | jq '.calls | length'   # >= 1
```

#### T-04 — Call History Pagination

```bash
HISTORY=$(curl -s -H "Authorization: Bearer $ALICE_TOKEN" \
  "$BASE_URL/api/v1/calls/history?limit=1&offset=0")
# Assert: calls array length == 1

HISTORY2=$(curl -s -H "Authorization: Bearer $ALICE_TOKEN" \
  "$BASE_URL/api/v1/calls/history?limit=100&offset=0")
# Assert: calls array length <= 100
```

### 2.3 Socket.IO Signalling Tests

> Use a test script with `socket.io-client` to simulate the signalling flow.

**Test script skeleton (Node.js / TypeScript):**

```ts
import { io } from 'socket.io-client';

const alice = io('http://localhost:3001', { auth: { token: ALICE_TOKEN } });
const bob   = io('http://localhost:3001', { auth: { token: BOB_TOKEN   } });

// T-05: call_invite → call_incoming
alice.emit('call_invite', { calleeId: BOB_USER_ID, type: 'audio' });
bob.once('call_incoming', (payload) => {
  // Assert: payload.callId is a UUID string
  // Assert: payload.type === 'audio'
  // Assert: payload.callerId === ALICE_USER_ID

  // T-06: call_answer → call_answered
  bob.emit('call_answer', { callId: payload.callId });
  alice.once('call_answered', (ack) => {
    // Assert: ack.callId === payload.callId

    // T-07: webrtc_offer relay
    alice.emit('webrtc_offer', { callId: payload.callId, targetUserId: BOB_USER_ID, sdp: { type: 'offer', sdp: 'v=0...' } });
    bob.once('webrtc_offer', (offerPayload) => {
      // Assert: offerPayload.from === ALICE_USER_ID
      // Assert: offerPayload.sdp.type === 'offer'

      // T-08: webrtc_answer relay
      bob.emit('webrtc_answer', { callId: payload.callId, targetUserId: ALICE_USER_ID, sdp: { type: 'answer', sdp: 'v=0...' } });
      alice.once('webrtc_answer', (answerPayload) => {
        // Assert: answerPayload.from === BOB_USER_ID

        // T-09: webrtc_ice relay
        alice.emit('webrtc_ice', { callId: payload.callId, targetUserId: BOB_USER_ID, candidate: { candidate: 'a=candidate...' } });
        bob.once('webrtc_ice', (icePayload) => {
          // Assert: icePayload.from === ALICE_USER_ID

          // T-10: call_end
          alice.emit('call_end', { callId: payload.callId });
          bob.once('call_ended', (endPayload) => {
            // Assert: endPayload.callId === payload.callId
            // Assert: endPayload.endedBy === ALICE_USER_ID
          });
        });
      });
    });
  });
});
```

#### T-11 — call_decline flow

```ts
alice.emit('call_invite', { calleeId: BOB_USER_ID, type: 'video' });
bob.once('call_incoming', ({ callId }) => {
  bob.emit('call_decline', { callId });
  alice.once('call_declined', (payload) => {
    // Assert: payload.callId === callId
    // Assert: payload.by === BOB_USER_ID
  });
});
```

#### T-12 — Group call participant limit enforcement

```ts
// Create a room with 9+ members first (via REST API)
// Then:
alice.emit('call_invite', { roomId: LARGE_ROOM_ID, type: 'audio' });
alice.once('call_error', (payload) => {
  // Assert: payload.message contains "8 participants"
});
```

#### T-13 — Disconnect cleanup — missed call

```ts
// Alice calls Bob; Bob's socket disconnects immediately (or doesn't connect)
alice.emit('call_invite', { calleeId: OFFLINE_BOB_USER_ID, type: 'audio' });
alice.once('call_initiated', async ({ callId }) => {
  // Wait 1 s then disconnect Alice
  await sleep(1000);
  alice.disconnect();
  // After reconnect, check call history via REST
  const history = await fetch('/api/v1/calls/history', { headers: { Authorization: `Bearer ${ALICE_TOKEN}` } });
  const { calls } = await history.json();
  const call = calls.find(c => c.callId === callId);
  // Assert: call.status === 'missed' || call.status === 'ended'
});
```

### 2.4 TypeScript Compilation Gate

```bash
# Backend — must exit 0
cd backend && npx tsc --noEmit

# Frontend — only pre-existing leaflet errors allowed; Phase F files must compile cleanly
cd frontend && npx tsc --noEmit 2>&1 | grep -v "leaflet\|react-leaflet"
# Assert: no output (exit 0 after filtering)
```

### 2.5 Checklist Summary for Agent

| ID | Test | Pass Criterion |
|----|------|---------------|
| T-01 | ICE config (auth) | HTTP 200 + `iceServers` array present |
| T-02 | ICE config (no auth) | HTTP 401 |
| T-03 | Call history empty | `calls.length === 0` before any calls |
| T-04 | Call history pagination | Respects `limit` / `offset` params |
| T-05 | `call_invite` → `call_incoming` | `call_incoming` received on callee socket |
| T-06 | `call_answer` → `call_answered` | `call_answered` received on caller socket |
| T-07 | `webrtc_offer` relay | Offer received on callee socket with correct `from` |
| T-08 | `webrtc_answer` relay | Answer received on caller socket |
| T-09 | `webrtc_ice` relay | ICE candidate received on correct peer socket |
| T-10 | `call_end` | Both sockets receive `call_ended` |
| T-11 | `call_decline` | Caller receives `call_declined` |
| T-12 | Group call > 8 members | `call_error` emitted to caller |
| T-13 | Disconnect cleanup | Call status → `missed`/`ended` in DB after socket disconnect |
| T-14 | Backend TypeScript | `tsc --noEmit` exits 0 |
| T-15 | Frontend TypeScript | No Phase F errors after filtering pre-existing leaflet issues |

---

## Section 3 — Known Limitations / Out of Scope

- **SFU for groups > 8:** Mesh WebRTC is used. For larger groups, a media server (mediasoup/Janus) would be needed.
- **TURN credential validity window:** Credentials are time-limited (default 1 hour). Under load, pre-fetch the ICE config before the call starts.
- **Speaker toggle (earpiece ↔ speaker):** Requires the Web Audio API `setSinkId()` which is gated behind permissions in some browsers. Not implemented in this phase.
- **Push notification to offline callee:** The call handler emits a Socket.IO event to the callee's personal room. If the callee has no active socket, the event is dropped. Web Push for offline notification is a future enhancement.
- **Call recording / PSTN bridging:** Out of scope.
