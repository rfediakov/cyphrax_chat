# Presence QA — Bug Fix Task Plans

Found during QA of **§2.2 User Presence & Sessions** (Presence States and AFK Rule).  
Full test report: `canvases/presence-qa-report.canvas.tsx`

---

## Bug Index

| ID | Severity | Layer | Title | Agent |
|----|----------|-------|-------|-------|
| BUG-01 | Critical | Frontend + Backend | Contacts appear offline on app load — no initial presence sync | Agent 1 (backend) + Agent 2 (frontend) |
| BUG-02 | High | Frontend | `mousemove` fires hundreds of `activity` events/second — no throttle | Agent 3 |
| BUG-03 | High | Frontend | Activity not tracked outside Chat page — AFK triggers prematurely | Agent 3 |
| BUG-04 | High | Frontend | Page Visibility API not used — tab visibility not tracked | Agent 4 |
| BUG-05 | Medium | Frontend | `PresenceStatus` type and `PresenceDot` duplicated across 6 files | Agent 5 |

---

## Shared Context

### Stack
- Backend: Express + Socket.IO + MongoDB + Redis (`backend/src/`)
- Frontend: Vite + React + Zustand (`frontend/src/`)
- Presence manager: `backend/src/presence/presence.manager.ts`
- Socket entry: `backend/src/socket/index.ts`
- Activity handler: `backend/src/socket/handlers/activity.handler.ts`
- Presence store: `frontend/src/store/presence.store.ts`
- Presence hook: `frontend/src/hooks/usePresence.ts`
- Socket hook: `frontend/src/hooks/useSocket.ts`
- Activity emission (Chat): `frontend/src/pages/Chat.tsx` (lines 79–86)
- Activity emission (input): `frontend/src/components/chat/MessageInput.tsx` (lines 73–86)

### Key behaviour understood before starting

- The backend stores one Redis hash `presence:{userId}` with entries `{socketId → timestamp}`.
- `evaluatePresence()` returns `online` if the most-recent timestamp is within 60 s, `afk` otherwise, `offline` if no entries.
- `evaluateAndBroadcastPresence()` only publishes a change when the cached status key differs from the newly computed one.
- The frontend `usePresenceStore` starts empty; `usePresence.getStatus()` defaults to `'offline'` for any unknown userId.

### Environment

Start the stack before testing:
```bash
docker compose up --build
```

Prepare two browser profiles (or one normal + one incognito) logged in as different users (`alice`, `bob`).

---

## Execution Order

Agent 1 and Agents 3–5 can run in parallel.  
**Agent 2 depends on Agent 1** (it calls the endpoint Agent 1 creates).

```
Agent 1 ──► Agent 2
Agent 3  (independent)
Agent 4  (independent)
Agent 5  (independent, best run last to avoid merge conflicts with Agents 2–4)
```

## Files

- `agent-1-backend-presence-endpoint.md` — create `GET /api/presence` REST endpoint
- `agent-2-frontend-initial-sync.md` — seed the presence store on connect using the new endpoint
- `agent-3-activity-tracking.md` — fix mousemove throttle and globalise the activity listener
- `agent-4-page-visibility.md` — add Page Visibility API and multi-tab coordination
- `agent-5-presence-refactor.md` — extract shared `PresenceDot` component and type
