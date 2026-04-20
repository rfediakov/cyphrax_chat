# Agent A — Initial Presence Sync (R2-BUG-01)

## Status

**Critical — Never implemented.** Both the backend REST endpoint and the frontend hydration call are missing. This bug was described in Round 1 (`agent-1-backend-presence-endpoint.md` and `agent-2-frontend-initial-sync.md`) but neither fix was applied.

---

## Bug Summary

`usePresenceStore` initialises with `statuses: {}`. `usePresence.getStatus()` falls back to `'offline'` for any userId not in the map. Because `evaluateAndBroadcastPresence()` only publishes a Socket.IO `presence` event when the computed status **changes**, a newly connected client never learns the current status of already-online peers. They remain grey (offline) until a peer happens to trigger a status-change event naturally.

**Root cause confirmed by:**
- No `backend/src/routes/presence.routes.ts` file exists.
- `backend/src/index.ts` mounts 8 route groups — none for presence.
- `frontend/src/hooks/useSocket.ts` `connect` handler calls only `setConnected(true)`.
- Live browser test: zero requests to `/api/presence` or `/api/v1/presence` observed on page load.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `backend/src/presence/presence.manager.ts` | Add `getPresenceStatuses(userIds)` helper function |
| `backend/src/routes/presence.routes.ts` | **Create** — `GET /api/v1/presence` handler |
| `backend/src/index.ts` | Mount the new router |
| `frontend/src/api/presence.api.ts` | **Create** — typed axios wrapper |
| `frontend/src/store/presence.store.ts` | Add `bulkSetStatuses` action |
| `frontend/src/hooks/useSocket.ts` | Hydrate presence store after socket `connect` |

---

## Implementation

### Step 1 — Add helper to `backend/src/presence/presence.manager.ts`

Append to the **bottom** of the file (do not change any existing functions):

```ts
/**
 * Returns the current evaluated presence status for each userId in the array.
 * Reads Redis directly — does not publish any events.
 */
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

### Step 2 — Create `backend/src/routes/presence.routes.ts`

```ts
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getPresenceStatuses } from '../presence/presence.manager.js';

const router = Router();

/**
 * GET /api/v1/presence?userIds=id1,id2,id3
 * Returns the current presence status for each requested userId.
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  const raw = req.query.userIds as string | undefined;

  if (!raw || raw.trim() === '') {
    res.status(400).json({ error: 'userIds query param is required' });
    return;
  }

  const userIds = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (userIds.length === 0) {
    res.status(400).json({ error: 'userIds must not be empty' });
    return;
  }

  if (userIds.length > 200) {
    res.status(400).json({ error: 'Too many userIds (max 200)' });
    return;
  }

  const statuses = await getPresenceStatuses(userIds);
  res.json({ statuses });
});

export default router;
```

> **Verify the auth middleware import path** — look at how existing routes (e.g. `backend/src/routes/messages.routes.ts`) import the authenticate middleware and use the same path.

### Step 3 — Mount the router in `backend/src/index.ts`

Add the import alongside the existing route imports (around line 10–17):

```ts
import presenceRoutes from './routes/presence.routes.js';
```

Add the mount after the existing `app.use(...)` calls (before the global error handler):

```ts
app.use('/api/v1/presence', presenceRoutes);
```

---

### Step 4 — Create `frontend/src/api/presence.api.ts`

```ts
import axiosInstance from './axios';

export type PresenceStatus = 'online' | 'afk' | 'offline';

export async function fetchPresenceStatuses(
  userIds: string[]
): Promise<Record<string, PresenceStatus>> {
  if (userIds.length === 0) return {};
  const { data } = await axiosInstance.get<{
    statuses: Record<string, PresenceStatus>;
  }>('/api/v1/presence', {
    params: { userIds: userIds.join(',') },
  });
  return data.statuses;
}
```

> Check `frontend/src/api/axios.ts` to confirm the export name of the axios instance before writing this file.

### Step 5 — Add `bulkSetStatuses` to `frontend/src/store/presence.store.ts`

Replace the **entire file** with:

```ts
import { create } from 'zustand';

export type PresenceStatus = 'online' | 'afk' | 'offline';

interface PresenceState {
  statuses: Record<string, PresenceStatus>;
  setStatus: (userId: string, status: PresenceStatus) => void;
  bulkSetStatuses: (incoming: Record<string, PresenceStatus>) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  statuses: {},
  setStatus: (userId, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [userId]: status },
    })),
  bulkSetStatuses: (incoming) =>
    set((state) => ({
      statuses: { ...state.statuses, ...incoming },
    })),
}));
```

### Step 6 — Hydrate presence store on socket connect in `frontend/src/hooks/useSocket.ts`

At the top of `useSocket.ts`, add the imports (after the existing imports):

```ts
import { fetchPresenceStatuses } from '../api/presence.api';
import { useChatStore } from '../store/chat.store';
```

Inside `useSocket()`, add the `bulkSetStatuses` selector alongside the existing `setStatus` selector (around line 76):

```ts
const bulkSetStatuses = usePresenceStore((s) => s.bulkSetStatuses);
```

Then update the `socket.on('connect', ...)` handler (currently around line 105) to call the initial sync **after** `setConnected(true)`:

```ts
socket.on('connect', () => {
  console.log('[Socket] connected', socket.id);
  setConnected(true);

  // Hydrate presence store for all known peers
  void (async () => {
    try {
      const { dialogs } = useChatStore.getState();

      const peerIds = new Set<string>();

      // Collect peer IDs from dialogs (contacts stored locally in sidebar components)
      for (const d of dialogs ?? []) {
        const otherId = d.otherUser?._id ?? d.otherUser?.id;
        if (otherId) peerIds.add(otherId);
        for (const p of d.participants ?? []) {
          if (typeof p === 'string') peerIds.add(p);
        }
      }

      if (peerIds.size === 0) return;

      const statuses = await fetchPresenceStatuses([...peerIds]);
      bulkSetStatuses(statuses);
    } catch (err) {
      console.warn('[Presence] Initial sync failed:', err);
    }
  })();
});
```

> `useChatStore.getState()` is safe to call outside a React component — Zustand supports it. Do **not** call the React hook `useChatStore(...)` here since this runs inside an event callback.

---

## Acceptance Criteria

| ID | Test | Pass Condition |
|----|------|----------------|
| A-01 | `GET /api/v1/presence?userIds=<aliceId>` while alice is connected | `{ statuses: { "<aliceId>": "online" } }` |
| A-02 | `GET /api/v1/presence?userIds=<aliceId>` while alice is idle 65 s | `{ statuses: { "<aliceId>": "afk" } }` |
| A-03 | `GET /api/v1/presence?userIds=<disconnectedId>` | `{ statuses: { "<id>": "offline" } }` |
| A-04 | `GET /api/v1/presence?userIds=<a>,<b>,<c>` | Correct statuses for all three in one response |
| A-05 | `GET /api/v1/presence` without `userIds` param | `400` with descriptive error |
| A-06 | `GET /api/v1/presence?userIds=` (empty) | `400` with descriptive error |
| A-07 | Request without auth token | `401` |
| A-08 | `GET /api/v1/presence?userIds=<201 ids>` | `400` max-exceeded error |
| A-09 | Open app as alice while bob is online in another tab | Bob's dot shows **green (online)** immediately, without bob sending a message |
| A-10 | Open app as alice while bob has been idle 65 s | Bob's dot shows **amber (afk)** on load |
| A-11 | Open app while carol is disconnected | Carol's dot shows **grey (offline)** |
| A-12 | Network tab on load | Exactly **one** `GET /api/v1/presence` request per socket connect |
| A-13 | No console errors | No unhandled promise rejections or type errors |

---

## Notes

- Do **not** change `evaluateAndBroadcastPresence()` or any existing heartbeat/pub-sub logic.
- Use `Promise.all` in `getPresenceStatuses` — do not fetch Redis hashes sequentially.
- The `authenticate` middleware attaches `req.user` — it is already used by existing routes. Copy its import exactly from another route file (e.g. `contacts.routes.ts`).
- If `dialogs` is empty at socket connect time (race condition: the LeftSidebar fetches contacts after connect), the presence store will remain empty until the next `presence` socket event. This is acceptable for this fix scope. A future improvement could re-sync when the dialog list changes.
- The `bulkSetStatuses` action merges into the existing map — it does **not** overwrite. Live `presence` socket events continue to work via `setStatus`.
