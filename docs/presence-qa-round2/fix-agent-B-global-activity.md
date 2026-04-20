# Agent B — Global Activity Tracking + Page Visibility (R2-BUG-02)

## Status

**High — Partially fixed in the wrong place.** Round 1 BUG-03 and BUG-04 were partially addressed by adding throttled `mousemove`, `keydown`, `focus`, and `visibilitychange` listeners **inside `Chat.tsx`**. However, the fix was supposed to land in `useSocket.ts` so it works on **all routes**. As a result:

- On `/contacts`, `/profile`, `/sessions`, `/public-rooms` — no activity events are emitted.
- Users on any page other than `/` will go AFK after 60 s even if they are actively interacting with the app.
- The `Chat.tsx` implementation needs to be cleaned up (activity logic removed, keeping only its `visibilitychange`-aware `handleVisibility` semantics consolidated into `useSocket.ts`).

---

## Bug Evidence

### Current code in `Chat.tsx` (lines 79–109) — SHOULD BE REMOVED

```tsx
// Activity tracking: mouse, keyboard, and page visibility — throttled to 10s
useEffect(() => {
  if (!socket) return;

  const THROTTLE_MS = 10_000;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emitActivity = () => {
    if (timer) return;
    socket.emit('activity');
    timer = setTimeout(() => {
      timer = null;
    }, THROTTLE_MS);
  };

  const handleVisibility = () => {
    if (!document.hidden) emitActivity();
  };

  window.addEventListener('mousemove', emitActivity, { passive: true });
  window.addEventListener('keydown', emitActivity, { passive: true });
  window.addEventListener('focus', emitActivity);
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    window.removeEventListener('mousemove', emitActivity);
    window.removeEventListener('keydown', emitActivity);
    window.removeEventListener('focus', emitActivity);
    document.removeEventListener('visibilitychange', handleVisibility);
    if (timer) clearTimeout(timer);
  };
}, [socket]);
```

This block is cleaned up when Chat.tsx unmounts (i.e., user navigates away from `/`). Activity is then **never** emitted from `/contacts`, `/profile`, etc.

### Current `useSocket.ts` — has NO activity listeners

After `socketRef.current = socket` (around line 103) there are zero activity-related event listeners in `useSocket.ts`. The entire activity system depends on the user being on the Chat route.

### Browser-test confirmation

Navigating to `http://localhost:3000/contacts` and moving the mouse / typing for 30+ seconds: **zero `activity` events visible in the WS inspector**.

---

## Files to Modify

| File | Action |
|------|--------|
| `frontend/src/hooks/useSocket.ts` | Add global throttled `mousemove`, `keydown`, `pointerdown`, `visibilitychange` listeners |
| `frontend/src/pages/Chat.tsx` | Remove the entire activity-tracking `useEffect` block (lines 79–109) |
| `frontend/src/components/chat/MessageInput.tsx` | Remove the `activityThrottleRef` + `emitActivity` + its call in `handleChange` |

---

## Implementation

### Step 1 — Add global activity listeners in `useSocket.ts`

Read the current `useSocket.ts` first. Inside the `useEffect([accessToken])` block, **after** `socketRef.current = socket` and **before** the first `socket.on(...)` registration, insert:

```ts
// ── Global activity tracking (works on all routes) ──────────────────────────
let activityTimer: ReturnType<typeof setTimeout> | null = null;

const emitActivity = () => {
  // Do not emit if socket is not connected or tab is hidden
  if (!socketSingleton?.connected) return;
  if (document.visibilityState !== 'visible') return;
  if (activityTimer) return;

  socketSingleton.emit('activity');
  activityTimer = setTimeout(() => {
    activityTimer = null;
  }, 10_000);
};

const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    emitActivity();
  }
};

window.addEventListener('mousemove', emitActivity, { passive: true });
window.addEventListener('keydown', emitActivity, { passive: true });
window.addEventListener('pointerdown', emitActivity, { passive: true });
document.addEventListener('visibilitychange', onVisibilityChange);
```

Then update the existing cleanup `return () => { ... }` at the bottom of the same `useEffect` to also remove these listeners:

```ts
return () => {
  // Only disconnect if token changes (i.e., this cleanup is for re-connect)
  // Do not disconnect on every render
  window.removeEventListener('mousemove', emitActivity);
  window.removeEventListener('keydown', emitActivity);
  window.removeEventListener('pointerdown', emitActivity);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (activityTimer) clearTimeout(activityTimer);
};
```

> **Use `socketSingleton` (the module-level reference), not the local `socket` variable**, inside `emitActivity`. This avoids stale-closure issues if the socket reference changes between renders.

> **`pointerdown`** covers mouse clicks and touch taps on mobile — complementing `mousemove` which does not fire on touch-only devices.

---

### Step 2 — Remove the activity `useEffect` from `Chat.tsx`

Delete the entire block from `Chat.tsx` (currently lines 79–109):

```tsx
// DELETE THIS ENTIRE BLOCK:
// Activity tracking: mouse, keyboard, and page visibility — throttled to 10s
useEffect(() => {
  if (!socket) return;
  // ... (the full block including return cleanup)
}, [socket]);
```

No other changes to `Chat.tsx` are needed.

---

### Step 3 — Remove duplicate activity emission from `MessageInput.tsx`

`MessageInput.tsx` has its own `activityThrottleRef` + `emitActivity` that fires on typing. Now that `keydown` is handled globally, this is redundant and causes double-emission.

Remove:
1. The `activityThrottleRef` ref declaration (around line 35)
2. The `emitActivity` callback (around lines 74–81)
3. The `emitActivity()` call inside `handleChange` (around line 86)

> Leave `emitTyping` and the typing throttle (`typingThrottleRef`) completely untouched — only remove the activity-related code.

---

## Acceptance Criteria

| ID | Test | Pass Condition |
|----|------|----------------|
| B-01 | Move mouse rapidly on `/` (Chat page) — check WS inspector | At most **1** `activity` frame per 10 s |
| B-02 | Move mouse on `/contacts` page | `activity` event emitted (≤1 per 10 s) — **was failing before this fix** |
| B-03 | Move mouse on `/profile` page | `activity` event emitted (≤1 per 10 s) |
| B-04 | Move mouse on `/sessions` page | `activity` event emitted (≤1 per 10 s) |
| B-05 | Type in message input on Chat page | `activity` emitted (≤1 per 10 s); no double-emit |
| B-06 | Stay idle for 65 s on any page | Backend transitions user to `afk`; observer sees status change |
| B-07 | Move mouse after AFK on any page | Backend transitions back to `online` within ≤10 s |
| B-08 | Switch to another browser tab (hide app) | No `activity` events emitted from hidden tab |
| B-09 | Return to app tab after >10 s away | `activity` emitted immediately on `visibilitychange`; observer sees `online` |
| B-10 | `Chat.tsx` code review | **No** `mousemove`, `keydown`, or `visibilitychange` listeners remain in `Chat.tsx` |
| B-11 | `MessageInput.tsx` code review | **No** `socket.emit('activity')` call remains in `MessageInput.tsx` |

---

## Notes

- The 10 s throttle matches the existing `THROTTLE_MS` constant — do not change the backend `AFK_THRESHOLD_MS = 60_000`.
- The `visibilityState !== 'visible'` guard inside `emitActivity` prevents background tabs from emitting activity via `keydown`/`mousemove` (this matters for cross-tab scenarios where focus events can fire).
- After this fix, the only remaining multi-tab gap is: if the user is active in **tab B** while **tab A** is hidden, tab A's socket will still go AFK after 60 s. This is the stretch `BroadcastChannel` scenario from the original BUG-04 spec — it is out of scope for this task.
- `pointerdown` is preferred over `click` because it fires before `click` and also covers touch events.
