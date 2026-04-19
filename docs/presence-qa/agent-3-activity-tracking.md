# Agent 3 — Frontend: Activity Tracking Fixes

## Goal

Fix **BUG-02** and **BUG-03**:
- **BUG-02**: `mousemove` in `Chat.tsx` fires `socket.emit('activity')` on every pixel — no throttle exists despite the code comment claiming otherwise.
- **BUG-03**: Activity is only tracked inside the Chat page. Users on Contacts, Settings, or any other route go AFK after 60 s even while actively using the app.

## Bug Details

### BUG-02 — Unthrottled mousemove

`frontend/src/pages/Chat.tsx` lines 79–86:

```ts
const handler = () => {
  if (socket) socket.emit('activity');
};
// Very coarse: only attach once, throttle within socket hook  ← comment is WRONG
window.addEventListener('mousemove', handler, { passive: true });
```

`useSocket.ts` has **no throttle** for outgoing activity events. Every pixel of mouse movement emits a separate socket message, flooding the backend.

### BUG-03 — Activity scoped to Chat.tsx

The `mousemove` listener is registered inside a `useEffect` in `Chat.tsx`. It only exists while the Chat route is mounted. If the user navigates to `/contacts`, `/profile`, `/sessions`, or any other route, no activity is emitted and the 60 s AFK clock is not reset.

## Files to touch

| File | Change |
|------|--------|
| `frontend/src/pages/Chat.tsx` | Remove the `mousemove` useEffect entirely |
| `frontend/src/hooks/useSocket.ts` | Add a global throttled activity listener here |

## Implementation Steps

### 1. Remove the mousemove useEffect from `Chat.tsx`

Delete the entire block (roughly lines 79–86):

```ts
// DELETE THIS BLOCK:
useEffect(() => {
  const handler = () => {
    if (socket) socket.emit('activity');
  };
  // Very coarse: only attach once, throttle within socket hook
  window.addEventListener('mousemove', handler, { passive: true });
  return () => window.removeEventListener('mousemove', handler);
}, [socket]);
```

### 2. Add a global activity listener in `useSocket.ts`

Inside the `useEffect` that creates the socket (after `socketRef.current = socket`), attach a **throttled** global listener for `mousemove`, `keydown`, and `pointerdown`. Use the same `useRef`-based throttle pattern already present in `MessageInput.tsx`:

```ts
// After: socketRef.current = socket;

const activityThrottle = { current: false };

const emitActivity = () => {
  if (!socketSingleton?.connected || activityThrottle.current) return;
  socketSingleton.emit('activity');
  activityThrottle.current = true;
  setTimeout(() => { activityThrottle.current = false; }, 10_000);
};

window.addEventListener('mousemove', emitActivity, { passive: true });
window.addEventListener('keydown', emitActivity, { passive: true });
window.addEventListener('pointerdown', emitActivity, { passive: true });
```

Clean up in the return of the same `useEffect` (or in the disconnect cleanup):

```ts
return () => {
  window.removeEventListener('mousemove', emitActivity);
  window.removeEventListener('keydown', emitActivity);
  window.removeEventListener('pointerdown', emitActivity);
};
```

> **Important**: use `socketSingleton` (the module-level ref) rather than closing over `socket` to avoid stale closures across re-renders.

### 3. Remove the duplicate `emitActivity` from `MessageInput.tsx`

`MessageInput.tsx` has its own `activityThrottleRef` + `emitActivity` that calls `socket.emit('activity')` on typing events. Once the global listener in `useSocket.ts` is active, typing keystrokes will already trigger it. Remove the `activityThrottleRef`, `emitActivity`, and the calls to `emitActivity()` inside `handleChange` and `handleKeyDown` in `MessageInput.tsx` to avoid double-emitting.

> Only remove the activity parts — leave `emitTyping` and the typing throttle untouched.

## Acceptance Criteria

| ID | Check | Pass condition |
|----|-------|----------------|
| P3-01 | Move mouse rapidly in Chat — check Network/WS tab | At most 1 `activity` frame emitted per 10 s |
| P3-02 | Move mouse on the Contacts page | `activity` event still emitted (≤1 per 10 s) |
| P3-03 | Type on any page | `activity` event emitted |
| P3-04 | Stay idle for 65 s on any page | Server transitions user to `afk`; observer sees status change |
| P3-05 | Move mouse after AFK | Server transitions back to `online` within ≤10 s |
| P3-06 | `Chat.tsx` no longer contains a `mousemove` listener | Verified by code review |
| P3-07 | `MessageInput.tsx` no longer calls `socket.emit('activity')` | Verified by code review |

## Notes

- The 10 s throttle window is chosen to match the existing `activityThrottleRef` pattern in `MessageInput.tsx`. Do not change the backend `AFK_THRESHOLD_MS = 60_000` — the server-side heartbeat interval already re-evaluates every 30 s.
- `pointerdown` covers both mouse clicks and touch taps on mobile, complementing `mousemove` (which does not fire on touch-only devices).
- Do not add `scroll` to the listener set — it triggers too frequently on mobile and is covered by `pointerdown`.
