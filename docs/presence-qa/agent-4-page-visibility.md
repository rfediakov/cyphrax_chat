# Agent 4 — Frontend: Page Visibility API

## Goal

Fix **BUG-04**: implement the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) so that:
1. When a hidden tab becomes visible again, an `activity` event is emitted immediately (resets the AFK clock without waiting for the next mouse movement).
2. When a tab is hidden, activity emission is suppressed (avoids reporting activity from a background tab).
3. *(Stretch)* Activity in any same-origin tab keeps the user online across all their tabs via `BroadcastChannel`.

## Spec

> §2.2.2 — A user is considered AFK if they have not interacted with **any of their open browser tabs** for more than 1 minute. If the user is active in at least one tab, they are considered online.

No `visibilitychange` or `document.hidden` usage exists anywhere in the frontend codebase.

## Files to touch

| File | Change |
|------|--------|
| `frontend/src/hooks/useSocket.ts` | Add `visibilitychange` listener + optional `BroadcastChannel` |

## Prerequisite

Agent 3 should be merged first, or at minimum coordinated with, because this task extends the same `emitActivity` function in `useSocket.ts`. If merging in parallel, resolve the conflict by integrating both changes into a single `emitActivity` implementation.

## Implementation Steps

### 1. Emit `activity` on tab becoming visible

Inside the `useEffect` in `useSocket.ts` where the global activity listeners are attached (after Agent 3's changes), add:

```ts
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    emitActivity();
  }
};

document.addEventListener('visibilitychange', onVisibilityChange);
```

And clean up:

```ts
document.removeEventListener('visibilitychange', onVisibilityChange);
```

### 2. Guard `emitActivity` to skip emission when tab is hidden

Modify the `emitActivity` function to short-circuit when the document is not visible:

```ts
const emitActivity = () => {
  if (!socketSingleton?.connected) return;
  if (document.visibilityState !== 'visible') return; // add this guard
  if (activityThrottle.current) return;
  socketSingleton.emit('activity');
  activityThrottle.current = true;
  setTimeout(() => { activityThrottle.current = false; }, 10_000);
};
```

### 3. (Stretch) Cross-tab coordination via `BroadcastChannel`

This implements the spec requirement that activity in **any** open tab keeps the user online. When one tab emits `activity` to the server, it also broadcasts to sibling tabs so they reset their throttle and don't incorrectly go AFK.

```ts
const channel = new BroadcastChannel('presence_activity');

// When we emit activity, also tell sibling tabs
const emitActivity = () => {
  if (!socketSingleton?.connected) return;
  if (document.visibilityState !== 'visible') return;
  if (activityThrottle.current) return;
  socketSingleton.emit('activity');
  activityThrottle.current = true;
  channel.postMessage('activity');
  setTimeout(() => { activityThrottle.current = false; }, 10_000);
};

// When a sibling tab reports activity, reset our throttle clock
// (we don't re-emit to server — the active tab already did that)
channel.onmessage = () => {
  activityThrottle.current = true;
  setTimeout(() => { activityThrottle.current = false; }, 10_000);
};
```

Clean up on socket disconnect / effect cleanup:

```ts
channel.close();
```

> `BroadcastChannel` is supported in all modern browsers (Chrome 54+, Firefox 38+, Safari 15.4+). Check [caniuse.com/broadcastchannel](https://caniuse.com/broadcastchannel) if the project targets older browsers; if not supported, skip step 3 and note it in the PR.

## Acceptance Criteria

| ID | Check | Pass condition |
|----|-------|----------------|
| P4-01 | Tab is visible — user is active | `activity` emitted normally (≤1 per 10 s) |
| P4-02 | Switch to another browser tab (hide this tab) | No `activity` events emitted from hidden tab |
| P4-03 | Return to app tab after > 10 s away | `activity` emitted immediately on `visibilitychange`; observer sees user go back to `online` |
| P4-04 | Two tabs open — user active in tab A (tab B hidden) | User stays `online`; tab B's socket also does not emit activity |
| P4-05 | Two tabs open — user active in tab B while tab A is hidden | Tab A resets its AFK clock (stretch: via BroadcastChannel); user stays `online` overall |
| P4-06 | All tabs hidden for 65 s | User transitions to `afk` |
| P4-07 | All tabs closed | User transitions to `offline` |

## Notes

- Steps 1 and 2 are required; step 3 (BroadcastChannel) is a stretch goal. Mark clearly in the PR which parts are implemented.
- Do not change any backend code — this is purely a frontend change.
- `document.visibilityState` is always `'visible'` in Node/jsdom test environments; mock it if unit tests are added.
