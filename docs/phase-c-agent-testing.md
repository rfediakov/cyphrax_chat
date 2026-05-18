# Phase C — Battery Status & Device Telemetry: Agent Test Plan

**Phase:** C — Battery Status & Device Telemetry  
**Branch:** `feature/phase-c-battery-telemetry`  
**Scope:** `batteryStatus.ts`, `networkStatus.ts`, `useTelemetry` hook, `BatteryIndicator` component, telemetry REST API, Redis cache, low-battery push notification, privacy setting enforcement.

---

## Prerequisites

- `docker compose up --build` is running; all services (`mongo`, `redis`, `api`, `frontend`) healthy.
- At least **three** registered test users: `alice`, `bob`, `carol`.
- At least one shared room (e.g. `#family`) with all three as members.
- `alice` has a valid push subscription registered (`POST /api/v1/push/subscribe`) so low-battery notifications can be verified.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` set in `.env` (or push tests are skipped and noted).
- A REST client (`curl`, HTTPie, or Postman) and direct Redis/Mongo access available.

---

## C.1 — Battery API Service (`batteryStatus.ts`)

| ID | Test | Expected |
|----|------|----------|
| C1-01 | Import `getBattery()` in a browser context with Battery API support (Firefox or Chromium fork) | Returns an object `{ level, charging, chargingTime, dischargingTime }` with `level` in `[0, 1]` |
| C1-02 | Import `getBattery()` in a browser that has removed the Battery API (Chrome on HTTPS) | Returns `null` without throwing |
| C1-03 | Call `watchBattery(cb)` in a supported browser; simulate a level change via DevTools or test harness | Callback fires with updated `BatteryInfo`; no duplicate events |
| C1-04 | Call `watchBattery(cb)`; invoke the returned unsubscribe function; simulate a battery event | Callback is **not** called after unsubscribe |
| C1-05 | Import `getBattery()` in a non-browser (SSR/Node) environment | Returns `null` without throwing (guards `typeof navigator`) |

---

## C.2 — Network Status Service (`networkStatus.ts`)

| ID | Test | Expected |
|----|------|----------|
| C2-01 | Call `getNetworkInfo()` in a browser with `navigator.connection` available | Returns `{ online, effectiveType, downlink, saveData }` with no undefined values |
| C2-02 | Call `getNetworkInfo()` in a browser without `navigator.connection` | Returns `{ online: true/false, effectiveType: 'unknown', downlink: null, saveData: false }` |
| C2-03 | Call `watchNetworkInfo(cb)`; go offline (DevTools → Offline) | Callback fires with `{ online: false }` |
| C2-04 | Restore online while `watchNetworkInfo` is active | Callback fires with `{ online: true }` |
| C2-05 | Invoke the unsubscribe function returned by `watchNetworkInfo` | No further callbacks fire on subsequent network changes |

---

## C.3 — REST API: `POST /api/v1/telemetry`

All requests authenticated as `alice` (Bearer token).

| ID | Test | Expected |
|----|------|----------|
| C3-01 | `POST /api/v1/telemetry` with full valid body `{ battery: { level: 0.8, charging: false, chargingTime: null, dischargingTime: 7200 }, network: { online: true, effectiveType: '4g', downlink: 10, saveData: false }, recordedAt: <ISO> }` | `200 { ok: true }` |
| C3-02 | Repeat C3-01; check MongoDB `telemetries` collection | Only **one** document for `alice` (upsert behaviour); `battery.level` is `0.8` |
| C3-03 | After C3-01, inspect Redis | `battery:<aliceId>` key exists; `TTL ≤ 120`; value matches submitted payload |
| C3-04 | `POST /api/v1/telemetry` with `battery` only (omit `network`) | `200 { ok: true }`; persisted with default network values |
| C3-05 | `POST /api/v1/telemetry` with `network` only (omit `battery`) | `200 { ok: true }`; persisted with `battery` fields set to `null` |
| C3-06 | `POST /api/v1/telemetry` with neither `battery` nor `network` | `400` bad request error |
| C3-07 | `POST /api/v1/telemetry` unauthenticated (no token) | `401` |
| C3-08 | `POST /api/v1/telemetry` with `battery.level = 0.1, charging: false` (below 15%) | `200`; `bob` and `carol` (room members) receive a push notification titled "Low Battery Warning" |
| C3-09 | `POST /api/v1/telemetry` with `battery.level = 0.1, charging: true` (below 15% but charging) | `200`; **no** push notification sent (charging, not draining) |
| C3-10 | `POST /api/v1/telemetry` with `battery.level = 0.2` (exactly at threshold) | `200`; **no** push notification (threshold is `< 0.15`, not `≤`) |

---

## C.4 — REST API: `GET /api/v1/telemetry/live?roomId=`

All requests authenticated as `alice`.

| ID | Test | Expected |
|----|------|----------|
| C4-01 | Seed telemetry for `bob` and `carol` (via POST); `GET /api/v1/telemetry/live?roomId=<familyId>` as `alice` | Returns array with entries for `bob` and `carol`; each has `userId`, `username`, `battery`, `network`, `recordedAt` |
| C4-02 | Redis has a fresh `battery:<bobId>` key | Entry in response uses Redis cached value (verify `recordedAt` matches last POST) |
| C4-03 | Expire Redis key manually (`DEL battery:<bobId>`) before request | Entry for `bob` falls back to MongoDB document |
| C4-04 | `GET /api/v1/telemetry/live` without `roomId` param | `400` bad request |
| C4-05 | `GET /api/v1/telemetry/live?roomId=<id>` as `dave` (not a room member) | `400` or `403` error; no telemetry returned |
| C4-06 | Set `bob`'s `privacyBattery` to `'nobody'` via `PATCH /api/v1/users/me` (or direct DB update); repeat C4-01 | Bob's entry is **absent** from the response |
| C4-07 | Set `bob`'s `privacyBattery` to `'everyone'`; repeat C4-01 | Bob's entry is **present** in the response |
| C4-08 | `GET /api/v1/telemetry/live` unauthenticated | `401` |

---

## C.5 — Socket Event: `telemetry_update`

Use two authenticated socket connections (`alice` and `bob`) in the same room.

| ID | Test | Expected |
|----|------|----------|
| C5-01 | `bob` POSTs telemetry; `alice` (in same room) is listening on `telemetry_update` | `alice` receives the event with `{ userId: bobId, battery, network, recordedAt }` |
| C5-02 | `alice` POSTs telemetry while `dave` (not in any shared room) is connected | `dave` does **not** receive `telemetry_update` event |
| C5-03 | `bob`'s `privacyBattery = 'nobody'`; `bob` POSTs telemetry | Server emits event to room (privacy is checked at GET, not at POST emit — confirm behaviour) |

---

## C.6 — `useTelemetry` Hook (Integration)

These tests exercise the hook behaviour in a running browser session. Use browser DevTools or a test harness.

| ID | Test | Expected |
|----|------|----------|
| C6-01 | Mount `useTelemetry` in a component; wait 30 s | `POST /api/v1/telemetry` fired once at mount and once after 30 s interval (verify in Network tab) |
| C6-02 | While hook is mounted, toggle DevTools → Offline; wait for a battery or network change event | Request is **not** sent via HTTP; instead, an action appears in IndexedDB `safegroup-offline` queue with `type: 'telemetry_update'` |
| C6-03 | Go back online after C6-02 | Queued telemetry is flushed by the offline sync mechanism |
| C6-04 | Open DevTools → Network → WS frames; observe after mounting hook | `telemetry_update` socket emit visible in WS frames on each POST |
| C6-05 | Mount hook with `activeRoomId = '<familyId>'` | On mount, `GET /api/v1/telemetry/live?roomId=<familyId>` is fired; `useTelemetryStore` is populated |

---

## C.7 — Redis Cache Behaviour

Direct Redis checks (`redis-cli` or equivalent).

| ID | Test | Expected |
|----|------|----------|
| C7-01 | After `POST /api/v1/telemetry`, run `TTL battery:<aliceId>` | Value is ≤ 120 and > 0 |
| C7-02 | Run `GET battery:<aliceId>` | JSON string with `userId`, `battery`, `network`, `recordedAt` |
| C7-03 | Post telemetry twice in rapid succession | `battery:<aliceId>` value updated to the second POST; TTL reset to ~120 |
| C7-04 | Wait 121 s (or manually expire); run `EXISTS battery:<aliceId>` | Key no longer exists (`0`) |

---

## C.8 — MongoDB TTL Index

| ID | Test | Expected |
|----|------|----------|
| C8-01 | Inspect `telemetries` collection indexes | A TTL index on `recordedAt` with `expireAfterSeconds: 604800` (7 days) exists |
| C8-02 | Insert a document with `recordedAt` 8 days in the past (manual DB insert) | Document is removed by the TTL reaper within the next TTL check cycle (≤ 60 s in dev) |
| C8-03 | Normal documents with recent `recordedAt` | Not removed after 30 s |

---

## C.9 — `privacyBattery` Field on User Model

| ID | Test | Expected |
|----|------|----------|
| C9-01 | Create a new user via `POST /api/v1/auth/register` | User document in MongoDB has `privacyBattery: 'nobody'` (default) |
| C9-02 | Update `privacyBattery` to `'everyone'` via direct DB write or user settings API | Reflected in subsequent `GET /api/v1/telemetry/live` responses |
| C9-03 | Attempt to set `privacyBattery` to an invalid value (e.g. `'public'`) | Mongoose validation rejects; document not saved |

---

## C.10 — Low Battery Push Notification

| ID | Test | Expected |
|----|------|----------|
| C10-01 | `alice` has an active push subscription; `bob` (room member) POSTs `battery.level = 0.09, charging: false` | `alice` receives a system push notification: title "Low Battery Warning", body contains bob's username and battery % |
| C10-02 | Push notification `tag` field | `low-battery:<bobId>` — prevents duplicate stacking for the same user |
| C10-03 | `bob` POSTs `battery.level = 0.09, charging: false` again within seconds | No duplicate push (browser deduplicates via `tag`) |
| C10-04 | No push subscriptions exist for room members | `sendPushToUser` returns silently; no 500 error |
| C10-05 | VAPID keys not configured | Push skipped silently; telemetry still saved; no 500 error |

---

## End-to-End Scenario

**Objective:** Full telemetry lifecycle from browser to Redis to socket to push.

1. Register `alice`, `bob`, `carol`; create room `#family`.
2. Subscribe `alice`'s push endpoint via `POST /api/v1/push/subscribe`.
3. `bob` POSTs `{ battery: { level: 0.8, charging: false, ... }, network: { ... } }` to `/api/v1/telemetry`.
4. Verify: Redis `battery:<bobId>` key set; MongoDB upserted; `alice`'s socket receives `telemetry_update`.
5. `alice` calls `GET /api/v1/telemetry/live?roomId=<familyId>` → receives bob's entry.
6. `bob`'s `privacyBattery` changed to `'nobody'` → repeat step 5 → bob absent.
7. `bob` POSTs `{ battery: { level: 0.05, charging: false } }` → `alice` receives push "Low Battery Warning — 5%".
8. Bob posts while offline (IndexedDB enqueue) → goes online → telemetry flushes → visible in live endpoint.

**Pass criteria:** All steps succeed without 500 errors; Redis TTLs set correctly; push delivered; privacy filter respected.

---

## Acceptance Criteria Checklist

- [ ] `getBattery()` returns `null` gracefully on unsupported browsers.
- [ ] `watchBattery()` fires callback on change; unsubscribe stops callbacks.
- [ ] `POST /api/v1/telemetry` upserts MongoDB document (one doc per user, not append-only).
- [ ] `POST /api/v1/telemetry` caches in Redis with TTL 120 s.
- [ ] `POST /api/v1/telemetry` emits `telemetry_update` to all shared room members via Socket.IO.
- [ ] `GET /api/v1/telemetry/live?roomId=` returns latest telemetry for visible room members.
- [ ] `privacyBattery = 'nobody'` hides a user from live endpoint responses.
- [ ] Low battery (< 15%, discharging) triggers push notification to room members.
- [ ] Charging below 15% does **not** trigger push notification.
- [ ] Telemetry queued in IndexedDB when offline; flushed on reconnect.
- [ ] MongoDB TTL index set to 7 days on `recordedAt`.
- [ ] Redis key TTL is ≤ 120 s.
- [ ] Unauthenticated requests return `401`.
- [ ] Missing `battery` and `network` both absent returns `400`.
- [ ] `docker compose up` — full application works end-to-end.
