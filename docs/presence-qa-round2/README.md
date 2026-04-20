# Presence QA — Round 2 Bug Fix Task Plans

**QA date:** 2026-04-20  
**Tester:** Manual QA (code review + live browser testing at http://localhost:3000)  
**Previous reports:** `docs/presence-qa/` (Round 1 — bugs were described but none were fixed)

---

## Round 2 QA Findings

### What changed since Round 1

| Round 1 Bug | Round 1 Status | Round 2 Status | Notes |
|-------------|---------------|----------------|-------|
| BUG-01 — No initial presence REST endpoint | Open | **Still open** | No `presence.routes.ts` created; no `/api/presence` route mounted |
| BUG-02 — Unthrottled `mousemove` | Open | **Fixed** | `Chat.tsx` now throttles activity emission to 10 s |
| BUG-03 — Activity only on Chat page | Open | **Still open** | Listeners remain inside `Chat.tsx`; not moved to `useSocket.ts` |
| BUG-04 — No Page Visibility API | Open | **Partially fixed** | `visibilitychange` added to `Chat.tsx` but missing from `useSocket.ts`; still absent from all other routes |
| BUG-05 — `PresenceDot`/`PresenceStatus` duplication | Open | **Still open** | Still duplicated across 6 files (unchanged) |

---

## Active Bug Index

| ID | Severity | Layer | Title | Assigned Agent |
|----|----------|-------|-------|----------------|
| R2-BUG-01 | Critical | Backend + Frontend | No initial presence sync — contacts always appear offline on load | Agent A |
| R2-BUG-02 | High | Frontend | Activity tracking and Page Visibility still scoped to `Chat.tsx` only | Agent B |
| R2-BUG-03 | Medium | Frontend | `PresenceDot` component and `PresenceStatus` type duplicated in 6 files | Agent C |

---

## Evidence from Live Testing

### TC-2 — No `/api/presence` endpoint (CONFIRMED FAIL)

Network requests observed on app load:
```
POST /api/v1/auth/refresh           200 ✓
GET  /api/v1/rooms/mine             200 ✓
GET  /api/v1/contacts               200 ✓
GET  /api/v1/contacts/requests      200 ✓
GET  /api/v1/dialogs                200 ✓
GET  /api/v1/rooms/invitations/pending 200 ✓
WS   /socket.io/...                 101 ✓
```
**No request to `/api/presence` or `/api/v1/presence` was made.**  
All contacts render with grey (offline) dots regardless of their actual status.

### TC-3 — No activity events on `/contacts` page (CONFIRMED FAIL)

- Navigated to http://localhost:3000/contacts
- Performed mouse movement and keyboard input for 30+ seconds
- **Zero `activity` socket events emitted** (confirmed via DevTools WS inspector)
- Users will go AFK within 60 seconds of leaving the Chat page even if actively browsing other pages

---

## Shared Context

### Stack
- Backend: Express + Socket.IO + MongoDB + Redis (`backend/src/`)
- Frontend: Vite + React + Zustand (`frontend/src/`)
- Presence manager: `backend/src/presence/presence.manager.ts`
- Socket entry: `backend/src/socket/index.ts`
- Presence store: `frontend/src/store/presence.store.ts`
- Presence hook: `frontend/src/hooks/usePresence.ts`
- Socket hook: `frontend/src/hooks/useSocket.ts`
- Activity tracking (current, scoped): `frontend/src/pages/Chat.tsx` lines 79–109

### Key facts verified during QA

1. `backend/src/index.ts` mounts 8 route files — none is a presence route.
2. `backend/src/routes/` contains no `presence.routes.ts` file.
3. `useSocket.ts` registers zero activity or visibility listeners.
4. `Chat.tsx` registers `mousemove`, `keydown`, `focus`, `visibilitychange` inside a `useEffect([socket])` that cleans up when the component unmounts — i.e., when the user navigates away from `/`.
5. `PresenceStatus` is locally defined in: `presence.store.ts`, `usePresence.ts`, `LeftSidebar.tsx`, `RightSidebar.tsx`, `Contacts.tsx`, `ManageRoomModal.tsx`.
6. `PresenceDot` is locally defined in: `LeftSidebar.tsx`, `RightSidebar.tsx`, `Contacts.tsx`, `ManageRoomModal.tsx` — with minor visual inconsistencies (size `w-2 h-2` vs `w-2.5 h-2.5`, missing `title` attribute in `RightSidebar`).

### Environment

```bash
docker compose up --build
```

Two browser profiles (or one normal + one incognito) logged in as different users.

---

## Execution Order

Agent A and Agent C can run in parallel.  
**Agent B depends on Agent A completing** if you want the global `emitActivity` to include the `BroadcastChannel` stretch goal (optional). Core Agent B work is independent.

```
Agent A ──► (Agent B can extend emitActivity after merge, but core work is independent)
Agent C  (independent — touches only UI component files)
```

## Files

- `fix-agent-A-initial-presence.md` — create `GET /api/presence` endpoint + frontend sync on connect
- `fix-agent-B-global-activity.md` — move activity listeners + Page Visibility to `useSocket.ts`
- `fix-agent-C-presence-dot-refactor.md` — extract shared `PresenceDot` component and type
