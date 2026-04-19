# Agent 2 — Contacts, Friend Requests, and DM Permissions — QA report

**Date:** 2026-04-20  
**Environment:** Docker Compose — API `http://localhost:3001`, stack running per user workspace  
**Method:** `curl` against live `/api/v1` endpoints with freshly registered users; code review for UI-only case A2-13. Browser UI was not driven for every step; Contacts page and `RightSidebar` were reviewed in source for A2-13.

**Reference plan:** [multi-agent-plans/agent-2-contacts-dms.md](multi-agent-plans/agent-2-contacts-dms.md)

---

## Summary

| ID    | Result   | Notes |
| ----- | -------- | ----- |
| A2-01 | **Pass** | `POST /contacts/request` with `toUsername` → `201`, request appears in recipient’s `GET /contacts/requests`. |
| A2-02 | **Pass** | Optional `message` stored; visible on incoming request payload (`message` field). |
| A2-03 | **Pass** | After `PUT /contacts/requests/:id` with `accept`, both users list each other on `GET /contacts`. |
| A2-04 | **Pass** | After `reject`, `GET /contacts` empty for both sides (no friendship). |
| A2-05 | **Pass** | `DELETE /contacts/:userId` removes friendship; both contact lists empty. |
| A2-06 | **Pass** | `POST /contacts/ban/:userId` clears friend from list; friendship no longer in `GET /contacts`. |
| A2-07 | **Pass** | Banned user’s `POST /contacts/request` toward banner → `403`, `{"error":"Cannot send friend request to this user"}`. |
| A2-08 | **Pass** | Mutual friends, no ban: `POST /dialogs/:userId/messages` → `201`. |
| A2-09 | **Pass** | Not friends: `POST /dialogs/:userId/messages` → `403`, `You must be friends to send a direct message`. |
| A2-10 | **Partial** | History still readable (`GET /dialogs/:userId/messages` → `200`). New messages blocked (`POST` → `403`). **However** dialog is not read-only: `PUT` and `DELETE` on messages still succeed after ban — see **BUG-A2-001**, **BUG-A2-003**. |
| A2-11 | **Pass** | Banned side `POST /dialogs/.../messages` → `403`, `Messaging is blocked between these users`. |
| A2-12 | **Pass** | `DELETE /contacts/ban/:userId`, new request + accept, `POST` DM → `201`. |
| A2-13 | **Blocked** | Room member list / `RightSidebar` exposes private-room **invitation** by username, not **friend request** from a member row. No equivalent of “add friend from room roster” found in `RightSidebar.tsx` / `ManageRoomModal.tsx`. |

---

## Bugs / issues for follow-up

### BUG-A2-001 — Dialog not read-only after user ban: message edit still allowed

**Severity:** High (contradicts TECHNICAL_SPEC §12.3 / AGENT_DEVELOPMENT_GUIDE: POST/PUT/DELETE on dialog messages should return `403` after a user-to-user ban.)

**Reproduced (API):**

1. Users G and H become friends; G sends a DM (message id `msgId`).
2. G calls `POST /api/v1/contacts/ban/:hUserId`.
3. G calls `PUT /api/v1/dialogs/:hUserId/messages/:msgId` with new `content`.

**Observed:** `200` and message content updated.

**Root cause (code):** `sendDialogMessage` calls `requireFriends` (ban + friendship). `getDialogMessages` does not. `editDialogMessage` and `deleteDialogMessage` do **not** call `requireFriends` / ban checks — see `backend/src/services/message.service.ts` (`editDialogMessage`, `deleteDialogMessage`).

**Expected:** `403` with a clear error (e.g. messaging blocked / read-only dialog).

---

### BUG-A2-002 — Former friends can still read full DM history without friendship

**Severity:** Medium–High (privacy / product: “DM only between friends” is enforced on send, not on read.)

**Reproduced (API):**

1. Users become friends, exchange a DM, then `DELETE /contacts/:friendId` (remove friend, no ban).
2. Caller `GET /api/v1/dialogs/:formerFriendUserId/messages`.

**Observed:** `200` with full prior transcript.

**Root cause (code):** `getDialogMessages` only resolves/creates the `Dialog` and loads `Message` documents; it never enforces `requireFriends` or ban checks.

**Expected (suggested):** Return `403` (or `404`) when users are not accepted friends or a ban exists; optionally still allow read in narrowly defined cases if product differs — align with spec.

---

### BUG-A2-003 — Deleting own DM still allowed after user ban

**Severity:** High (same §12.3 expectation as BUG-A2-001.)

**Reproduced (API):**

1. Friends + DM from A to B; A bans B.
2. A `DELETE /api/v1/dialogs/:bUserId/messages/:msgId` for A’s own message.

**Observed:** `200`, `{"message":"Message deleted"}`.

**Root cause:** `deleteDialogMessage` does not apply ban/friendship gate.

**Expected:** `403`.

---

## Evidence (representative)

- Friend request with message: `GET /contacts/requests` includes `"message": "Optional note from Carol"` (A2-02).
- Non-friend DM: `403` + `You must be friends to send a direct message` (A2-09).
- After ban: `GET /dialogs/:userId/messages` → `200` with prior rows; `POST` → `403` `Messaging is blocked between these users` (A2-10 messaging half; edit/delete gaps in bugs above).
- Banned user friend request: `403` + `Cannot send friend request to this user` (A2-07).

---

## Files touched by findings (for implementers)

| Area | Path |
| ---- | ---- |
| DM read/write rules | `backend/src/services/message.service.ts` (`getDialogMessages`, `editDialogMessage`, `deleteDialogMessage`) |
| Dialog listing | `backend/src/services/message.service.ts` (`getDialogs`) — may still list dialogs after friendship removal (verify product intent) |
| Contacts / ban | `backend/src/services/contact.service.ts` (ban cascade behavior matches spec for FriendRequest removal) |
| Room UI | `frontend/src/components/layout/RightSidebar.tsx` — no friend-request-from-member action (A2-13) |

---

## Notes for re-test after fixes

1. Re-run A2-10 with: after ban, `PUT` and `DELETE` on dialog messages must return `403` from both participants where applicable.
2. Re-run A2-09 extended: after `removeFriend`, confirm whether `GET /dialogs/.../messages` should be denied (if BUG-A2-002 is accepted).
3. If A2-13 is required by product, add UI + API wiring or document as out of scope.
