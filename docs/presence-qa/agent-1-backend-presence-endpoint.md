# Agent 1 — Backend: Presence Snapshot Endpoint

## Goal

Fix **BUG-01 (backend half)**: add a REST endpoint that returns the current presence status of one or more users by reading the Redis presence hashes directly. This enables the frontend to hydrate its presence store on first load instead of waiting for status-change events.

## Bug Summary

`evaluateAndBroadcastPresence()` in `presence.manager.ts` only publishes a Socket.IO event when the computed status **differs** from the cached status. A newly connected client therefore never receives the current statuses of peers who are already online — they all appear `offline` until a status-change event happens to fire.

## Files to touch

| File | Change |
|------|--------|
| `backend/src/presence/presence.manager.ts` | Export a new `getPresenceStatuses(userIds)` helper |
| `backend/src/routes/presence.routes.ts` | Create (new file) — `GET /api/presence` handler |
| `backend/src/app.ts` (or equivalent entry) | Mount the new router at `/api/presence` |

## Implementation Steps

### 1. Add helper to `presence.manager.ts`

Add a function that accepts an array of userIds and returns their current computed statuses without publishing any events:

```ts
export async function getPresenceStatuses(
  userIds: string[]
): Promise<Record<string, PresenceStatus>> {
  const result: Record<string, PresenceStatus> = {};
  await Promise.all(
    userIds.map(async (userId) => {
      const tabs = await getPresenceTabs(userId);
      result[userId] = evaluatePresence(tabs);
    })
  );
  return result;
}
```

### 2. Create `backend/src/routes/presence.routes.ts`

```ts
import { Router } from 'express';
import { getPresenceStatuses } from '../presence/presence.manager.js';
import { authenticate } from '../middleware/auth.middleware.js'; // use existing auth middleware

const router = Router();

// GET /api/presence?userIds=id1,id2,id3
router.get('/', authenticate, async (req, res) => {
  const raw = req.query.userIds as string | undefined;
  if (!raw) return res.status(400).json({ error: 'userIds query param is required' });

  const userIds = raw.split(',').map((id) => id.trim()).filter(Boolean);
  if (userIds.length === 0) return res.status(400).json({ error: 'userIds must not be empty' });
  if (userIds.length > 200) return res.status(400).json({ error: 'Too many userIds (max 200)' });

  const statuses = await getPresenceStatuses(userIds);
  return res.json({ statuses });
});

export default router;
```

### 3. Mount the router

In the Express app setup (check `backend/src/app.ts` or `backend/src/index.ts` for where other `/api/*` routes are mounted), add:

```ts
import presenceRouter from './routes/presence.routes.js';
// ...
app.use('/api/presence', presenceRouter);
```

## Acceptance Criteria

| ID | Check | Pass condition |
|----|-------|----------------|
| P1-01 | `GET /api/presence?userIds=<aliceId>` while alice is connected | Returns `{ statuses: { "<aliceId>": "online" } }` |
| P1-02 | `GET /api/presence?userIds=<aliceId>` while alice is idle 65 s | Returns `{ statuses: { "<aliceId>": "afk" } }` |
| P1-03 | `GET /api/presence?userIds=<disconnectedId>` | Returns `{ statuses: { "<id>": "offline" } }` |
| P1-04 | `GET /api/presence?userIds=<a>,<b>,<c>` (3 different users) | Returns correct statuses for all three in one response |
| P1-05 | `GET /api/presence` without `userIds` param | `400` with descriptive error |
| P1-06 | `GET /api/presence?userIds=` (empty string) | `400` with descriptive error |
| P1-07 | Request without valid auth token | `401` |
| P1-08 | `GET /api/presence?userIds=<201 ids>` | `400` max-exceeded error |

## Notes

- Do **not** change the existing pub/sub or heartbeat logic.
- Use `Promise.all` — do not fetch Redis hashes sequentially.
- The `authenticate` middleware already validates the JWT and attaches `req.user`; import it from wherever it is used by existing routes (e.g. `messages.routes.ts`).
- This endpoint is read-only; no write to Redis occurs here.

## Handoff to Agent 2

Once this endpoint is live and returning correct data, Agent 2 will call it from the frontend immediately after the socket connects. Confirm the response shape is exactly `{ statuses: Record<string, 'online' | 'afk' | 'offline'> }`.
