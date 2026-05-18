# Phase D — Push-to-Talk (PTT): Agent Test Plan

**Phase:** D — Push-to-Talk  
**Scope:** `usePTT` hook, `PTTAudioQueue`, `PTTButton` component, backend `ptt.handler.ts`, Redis lock enforcement, binary socket transport, offline guard, vibration.

---

## Prerequisites

- `docker compose up --build` is running; all services (`mongo`, `redis`, `api`, `frontend`) healthy.
- At least **three** registered test users: `alice`, `bob`, `carol`.
- At least one shared room `#family` with all three as members.
- A REST client (`curl`, HTTPie, or Postman) and direct Redis access (`redis-cli`) available.
- Access tokens for `alice`, `bob`, and `carol` obtained via `POST /api/v1/auth/login`.
- A WebSocket test client (e.g. `wscat`, `socket.io-client` Node script, or Postman WebSocket) to emit/receive raw events.

---

## D.1 — Redis PTT Lock

| ID | Test | Expected |
|----|------|----------|
| D1-01 | After `alice` emits `ptt_start { roomId, sessionId }`, run `redis-cli GET ptt:{roomId}` | Returns JSON `{ "userId": alice_id, "sessionId": "…" }` |
| D1-02 | TTL of the key immediately after `ptt_start` | `redis-cli TTL ptt:{roomId}` returns 28–30 (within 30s window) |
| D1-03 | While alice is transmitting, emit `ptt_chunk { roomId, sessionId, chunk }` | `redis-cli TTL ptt:{roomId}` resets back to 30 on each chunk |
| D1-04 | After `alice` emits `ptt_end { roomId, sessionId }` | `redis-cli EXISTS ptt:{roomId}` returns `0` |
| D1-05 | Alice forcibly disconnects mid-transmission (close socket tab) | Key is deleted within 2s; `bob` receives `ptt_end` event |
| D1-06 | Emit `ptt_chunk` with a `sessionId` that does not match the stored lock | Chunk is **silently dropped**; `bob` does not receive a `ptt_chunk` event |
| D1-07 | Emit `ptt_end` with a `sessionId` that does not match the stored lock | Lock is **not deleted**; no `ptt_end` broadcast to room |

---

## D.2 — PTT Lock Exclusivity (One Speaker Per Room)

| ID | Test | Expected |
|----|------|----------|
| D2-01 | Alice starts PTT in `#family`; Bob also emits `ptt_start` | Bob receives `ptt_busy { roomId, userId: alice_id }`; Alice's lock remains |
| D2-02 | Alice ends PTT; Bob immediately emits `ptt_start` again | Bob acquires lock; room members receive `ptt_start` from bob |
| D2-03 | Alice starts PTT in `#family`; Carol starts PTT in a **different** room `#team` | Both locks coexist independently; no cross-room interference |
| D2-04 | User who holds the lock emits `ptt_start` again with the same `sessionId` | Lock is refreshed (not rejected); no duplicate `ptt_start` broadcast |

---

## D.3 — Room Membership Guard

| ID | Test | Expected |
|----|------|----------|
| D3-01 | A user who is **not** a member of `#family` emits `ptt_start { roomId: family_id }` | Event is silently ignored; no Redis key set; no broadcast |
| D3-02 | A user who is **not** a member emits `ptt_chunk` with a valid-looking sessionId | Chunk silently dropped |

---

## D.4 — Binary Chunk Relay

| ID | Test | Expected |
|----|------|----------|
| D4-01 | Alice emits `ptt_chunk` with an `ArrayBuffer` payload (e.g. 1 KB of zeros) | Bob and Carol each receive `ptt_chunk { sessionId, senderId: alice_id, chunk }` where `chunk` is an `ArrayBuffer` (not base64 string) |
| D4-02 | Alice does **not** receive her own `ptt_chunk` event | `socket.to(room)` excludes the sender; alice's client receives no echo |
| D4-03 | Alice emits 10 rapid chunks (< 10ms apart) | All 10 chunks arrive at Bob in **send order** (Socket.IO TCP ordering guarantee) |
| D4-04 | Chunk size = 0 bytes | Backend drops the emit silently (frontend `usePTT` guards `e.data.size === 0`; confirm nothing is forwarded) |

---

## D.5 — `PTTAudioQueue` Unit Behaviour

| ID | Test | Expected |
|----|------|----------|
| D5-01 | Instantiate `PTTAudioQueue`; call `enqueue(validOpusWebmBuffer)` | `AudioContext.decodeAudioData` resolves; buffer is scheduled and `playing` transitions to `true` |
| D5-02 | Enqueue 3 buffers in rapid succession before first buffer finishes playing | All 3 are queued; `playNext` is called sequentially via `onended` |
| D5-03 | Call `flush()` while a buffer is queued but not yet playing | `queue` is cleared; `playing` is reset to `false` |
| D5-04 | Call `enqueue()` with a corrupt/invalid `ArrayBuffer` | `decodeAudioData` rejects; warning logged; queue state unchanged (no crash) |
| D5-05 | Call `destroy()` | `AudioContext.close()` is called; further `enqueue` calls create a fresh context without error |

---

## D.6 — `usePTT` Hook State Transitions

Verify via React Testing Library or manual browser DevTools inspection of React state.

| ID | Test | Expected |
|----|------|----------|
| D6-01 | Initial mount with `socket=null` | `isTransmitting=false`, `isReceiving=false`, `isBusy=false`, `activeSpeaker=null` |
| D6-02 | Call `startTransmitting(roomId)` when mic permission granted | `isTransmitting` becomes `true`; `ptt_start` emitted on socket |
| D6-03 | Call `stopTransmitting()` | `isTransmitting` becomes `false`; `ptt_end` emitted on socket; vibration fires |
| D6-04 | Socket receives `ptt_start { userId: bob, sessionId }` | `isReceiving=true`, `isBusy=true`, `activeSpeaker = { userId: bob, sessionId }` |
| D6-05 | Socket receives `ptt_end` | `isReceiving=false`, `isBusy=false`, `activeSpeaker=null`, `audioQueue.flush()` called |
| D6-06 | Socket receives `ptt_busy { roomId, userId }` | `isBusy=true` |
| D6-07 | Call `startTransmitting` when `isBusy=true` | Function returns immediately without emitting `ptt_start` or starting `MediaRecorder` |
| D6-08 | Call `startTransmitting` when `isOnline=false` | Function returns immediately; no MediaRecorder created |
| D6-09 | Component unmounts while transmitting | `MediaRecorder.stop()` called; stream tracks stopped; `PTTAudioQueue.destroy()` called |
| D6-10 | `roomId` prop changes to a new room while hook is mounted | Old listeners for previous room do not fire; new room listeners are correctly attached |

---

## D.7 — Offline Guard

| ID | Test | Expected |
|----|------|----------|
| D7-01 | DevTools → Offline; attempt `startTransmitting` | Function returns early; `MediaRecorder` never created; no `getUserMedia` call |
| D7-02 | While offline, `PTTButton` is rendered | Button has `disabled` attribute; `title` tooltip reads "Offline — PTT unavailable" |
| D7-03 | Restore online; attempt `startTransmitting` | Transmission begins normally |

---

## D.8 — Vibration Feedback

| ID | Test | Expected |
|----|------|----------|
| D8-01 | `startTransmitting` succeeds | `navigator.vibrate(50)` called once at start |
| D8-02 | `stopTransmitting` called | `navigator.vibrate(50)` called once at stop |
| D8-03 | Receiving PTT (`ptt_start` event fires on listener side) | No vibration call on the receiving side |

---

## D.9 — Codec Selection

| ID | Test | Expected |
|----|------|----------|
| D9-01 | In a browser that supports `audio/webm;codecs=opus` | `MediaRecorder` is created with `mimeType = 'audio/webm;codecs=opus'` |
| D9-02 | In a browser that only supports `audio/webm` (no Opus codec declared) | Fallback to `audio/webm`; recording still starts |
| D9-03 | In a browser that supports neither MIME type | `getSupportedMime()` returns `null`; `startTransmitting` logs a warning and returns early without crashing |

---

## D.10 — End-to-End Socket Flow (Integration)

Use two Node.js `socket.io-client` scripts authenticated as `alice` and `bob`, both in `#family`.

| ID | Test | Expected |
|----|------|----------|
| D10-01 | Alice emits `ptt_start`; Bob checks event | Bob receives `{ roomId, userId: alice_id, sessionId }` |
| D10-02 | Alice emits a 500-byte `ArrayBuffer` chunk; Bob checks | Bob receives binary `chunk` with `senderId = alice_id` |
| D10-03 | Alice emits `ptt_end`; Bob checks | Bob receives `{ roomId, userId: alice_id, sessionId }` |
| D10-04 | Alice emits `ptt_start`; Carol (third member) checks | Carol also receives `ptt_start` broadcast |
| D10-05 | Alice emits `ptt_start`; Alice checks own events | Alice does **not** receive `ptt_start` echo on her own socket |
| D10-06 | Full round-trip timing: emit `ptt_start` → receive `ptt_start` at Bob | Latency < 100ms on localhost |
