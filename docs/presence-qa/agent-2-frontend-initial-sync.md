# Agent 2 — Frontend: Initial Presence Sync

## Goal

Fix **BUG-01 (frontend half)**: hydrate `usePresenceStore` with real statuses immediately after the socket connects, so contacts are never incorrectly shown as `offline` on first render.

## Prerequisite

**Agent 1 must be merged first.** This task calls `GET /api/presence` which is created by Agent 1. Confirm the endpoint returns `{ statuses: Record<string, 'online' | 'afk' | 'offline'> }` before proceeding.

## Bug Summary

`usePresenceStore` initialises with `statuses: {}`. `usePresence.getStatus()` falls back to `'offline'` for any userId not yet in the map (`statuses[userId] ?? 'offline'`). Because the backend only emits `presence` events when a user's status **changes**, a newly connected client never learns the current status of already-online peers — they remain `'offline'` in the UI until the peer happens to trigger an activity event.

## Files to touch

| File | Change |
|------|--------|
| `frontend/src/api/presence.api.ts` | Create (new file) — typed API call for `GET /api/presence` |
| `frontend/src/hooks/useSocket.ts` | After socket `connect`, fetch peer statuses and bulk-set the store |
| `frontend/src/store/presence.store.ts` | Add `bulkSetStatuses` action |

## Implementation Steps

### 1. Create `frontend/src/api/presence.api.ts`

```ts
import axios from './axios'; // use the same axios instance as the rest of the API layer

type PresenceStatus = 'online' | 'afk' | 'offline';

export async function fetchPresenceStatuses(
  userIds: string[]
): Promise<Record<string, PresenceStatus>> {
  if (userIds.length === 0) return {};
  const { data } = await axios.get<{ statuses: Record<string, PresenceStatus> }>(
    '/api/presence',
    { params: { userIds: userIds.join(',') } }
  );
  return data.statuses;
}
```

### 2. Add `bulkSetStatuses` to `presence.store.ts`

```ts
interface PresenceState {
  statuses: Record<string, PresenceStatus>;
  setStatus: (userId: string, status: PresenceStatus) => void;
  bulkSetStatuses: (incoming: Record<string, PresenceStatus>) => void; // add this
}

// In the create() call:
bulkSetStatuses: (incoming) =>
  set((state) => ({
    statuses: { ...state.statuses, ...incoming },
  })),
```

### 3. Fetch statuses on socket connect in `useSocket.ts`

After the socket emits `connect`, collect all known peer userIds from `useChatStore` (contacts, room members visible in the store) and call `fetchPresenceStatuses`, then bulk-set the store.

Inside the `socket.on('connect', ...)` handler (which already calls `setConnected(true)`), add:

```ts
socket.on('connect', () => {
  console.log('[Socket] connected', socket.id);
  setConnected(true);

  // Hydrate presence store for all known peers
  void (async () => {
    try {
      const { contacts, rooms, dialogs } = useChatStore.getState();

      const peerIds = new Set<string>();

      // Direct contacts
      for (const c of contacts ?? []) peerIds.add(c._id);

      // Room members stored in the chat store (if available)
      for (const r of rooms ?? []) {
        for (const m of r.members ?? []) peerIds.add(m.userId ?? m._id);
      }

      // Dialog participants
      for (const d of dialogs ?? []) {
        for (const p of d.participants ?? []) {
          if (typeof p === 'string') peerIds.add(p);
          else peerIds.add(p._id);
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

> **Note**: `useChatStore.getState()` is safe to call outside a React component. Adapt the field names (`contacts`, `rooms`, `dialogs`, and their member shapes) to match what the store actually holds — read `frontend/src/store/chat.store.ts` before writing the loop.

## Acceptance Criteria

| ID | Check | Pass condition |
|----|-------|----------------|
| P2-01 | Open app while alice is connected in another tab | Alice's presence dot shows `online` immediately — without alice sending a message |
| P2-02 | Open app while bob has been idle 65 s | Bob shows `afk` immediately |
| P2-03 | Open app while carol is disconnected | Carol shows `offline` |
| P2-04 | Presence dot updates after initial load when status changes | Existing socket event handling still works — `setStatus` on `presence` event |
| P2-05 | No JavaScript errors in console on load | No unhandled promise rejections or type errors |
| P2-06 | `GET /api/presence` called once per socket connect, not on every render | Verify in Network tab: exactly one request per page load |

## Notes

- Do **not** remove the existing `socket.on('presence', ...)` handler — it handles live updates after the initial sync.
- If `useChatStore` does not yet have contacts loaded at the moment `connect` fires (race condition), consider retrying in a `useEffect` that watches `contacts` length, or fetching presence again when the contact list is first populated.
- Keep the fetch inside a try/catch — a failure here must never break the socket connection or crash the app.
- Batch all userIds into a **single** `GET /api/presence` request (max 200 ids per the backend limit).
