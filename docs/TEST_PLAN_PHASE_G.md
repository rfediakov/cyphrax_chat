# Phase G — SOS / Danger Alert System — Test Plan

**Branch:** `feature/phase-g-sos`  
**Covers:** G.1–G.8 (SOSButton, SOS Store, Alert UI, Distress messages, Map markers, Backend handler, Offline SOS)

---

## Prerequisites

- Docker Compose stack is running (`docker compose up --build`)
- At least **two browser sessions** are open (User A and User B), both logged in and members of the **same room**
- The active chat has a room selected (activeRoomId is set) — open the Chat page and select a room
- (Optional) Enable location sharing in the Map page for both users so SOS markers appear with real coordinates

---

## Section 1 — SOSButton Visibility (G.1)

| # | Step | Expected |
|---|------|----------|
| 1.1 | Log in as User A | SOS button is visible at bottom-right, above the bottom nav bar (`position: fixed, bottom: 80px, right: 16px`) |
| 1.2 | Navigate to Map, Chat, Contacts, Profile pages | SOS button remains visible on every page |
| 1.3 | Scroll the chat message list up | SOS button stays in fixed position, does not scroll |
| 1.4 | Resize browser to mobile viewport (375px wide) | Button is fully visible and not obscured by nav elements |

---

## Section 2 — SOS Activation Gesture (G.1, G.4)

| # | Step | Expected |
|---|------|----------|
| 2.1 | **Tap** the SOS button briefly (< 1 second) | Nothing happens — accidental press prevention works |
| 2.2 | **Press and hold** the SOS button for ~1 second then release | Progress ring partially fills, then resets — no SOS triggered |
| 2.3 | **Press and hold** for the full 2 seconds | Distress message picker slides up from the bottom |
| 2.4 | In the message picker, observe the options | Three preset messages visible: "I'm in danger", "Medical emergency", "I'm lost" |
| 2.5 | Tap "I'm lost" | Message is selected (turns red/highlighted) |
| 2.6 | Tap "Send SOS Now" | Picker closes, SOS button turns solid red and pulses; SOS is emitted |

---

## Section 3 — SOS Vibration (G.1)

| # | Step | Expected |
|---|------|----------|
| 3.1 | Trigger SOS on a real mobile device or device-mode emulation | Device vibrates with the SOS Morse pattern (· · · — — — · · ·) on activation |
| 3.2 | On a desktop browser | No errors — vibration is gracefully skipped |

---

## Section 4 — SOS Alert on Group Members (G.3)

| # | Step | Expected |
|---|------|----------|
| 4.1 | User A triggers SOS | **User B's screen** shows full-screen modal: red background overlay, "🚨 EMERGENCY ALERT", username "User A", distress message |
| 4.2 | User B observes the modal | "Open Map" button, "📞 Call" button, and "✓ I'm going to help" button are all visible |
| 4.3 | Check timestamp in the modal | Shows relative time (e.g. "3 seconds ago") |
| 4.4 | User B's device (mobile) | Device vibrates with SOS Morse pattern |
| 4.5 | User B hears alert sound | Web Audio synthesized alarm plays (may require user interaction to unlock AudioContext first) |
| 4.6 | User B taps "✓ I'm going to help" | Modal is dismissed on User B's screen; SOS event is resolved |

---

## Section 5 — SOS Cancellation (G.1 deactivation)

| # | Step | Expected |
|---|------|----------|
| 5.1 | User A has an active SOS (button is solid red) | |
| 5.2 | User A taps the SOS button once | "Cancel SOS?" modal appears with a 10-second countdown |
| 5.3 | Wait 10 seconds without tapping | SOS is automatically cancelled; button returns to idle red (not pulsing); User B's modal disappears |
| 5.4 | Trigger SOS again (step 2.6) | SOS re-triggered successfully |
| 5.5 | On the "Cancel SOS?" modal, tap "Keep SOS" | Modal closes; SOS remains active |
| 5.6 | On the "Cancel SOS?" modal, tap "Cancel SOS" | SOS cancelled immediately; button returns to idle |

---

## Section 6 — SOS on Map (G.5)

| # | Step | Expected |
|---|------|----------|
| 6.1 | User A enables location sharing (Map page) | User A's location is shown on User B's map |
| 6.2 | User A triggers SOS | A pulsing red circle marker with "SOS" label appears on the map at User A's coordinates, on **both** User A's and User B's map views |
| 6.3 | Tap the SOS map marker | Popup shows: username, distress message, timestamp, "Mark as Resolved" button |
| 6.4 | Tap "Mark as Resolved" in the popup | SOS marker disappears from the map; resolved in DB |
| 6.5 | SOS marker z-index | SOS marker appears above all other user markers |

---

## Section 7 — Push Notifications (G.3)

| # | Step | Expected |
|---|------|----------|
| 7.1 | User B has push notifications enabled (via Settings or `POST /api/v1/push/subscribe`) | |
| 7.2 | User B closes/minimizes the browser tab | |
| 7.3 | User A triggers SOS | User B receives a push notification: title "🚨 EMERGENCY ALERT", body "User A needs help! \"I'm in danger\"" |
| 7.4 | User B has no push subscription | No errors on backend; SOS still broadcasts via WebSocket to open sessions |

---

## Section 8 — REST Endpoint (G.8)

| # | Step | Expected |
|---|------|----------|
| 8.1 | `GET /api/v1/sos` (authenticated) | Returns `{ sosEvents: [...] }` with all active SOS events for user's rooms |
| 8.2 | No active SOS events | Returns `{ sosEvents: [] }` |
| 8.3 | `GET /api/v1/sos/history` | Returns both active and resolved SOS events |
| 8.4 | `DELETE /api/v1/sos/:id` as the SOS owner | Returns `{ success: true }`; event status becomes `resolved` in MongoDB |
| 8.5 | `DELETE /api/v1/sos/:id` as a non-member | Returns HTTP 403 |
| 8.6 | `GET /api/v1/sos` on fresh login | SOS store is hydrated from server correctly |

---

## Section 9 — Offline SOS (G.7)

| # | Step | Expected |
|---|------|----------|
| 9.1 | Disable the device/browser network (DevTools → Network → Offline) | Yellow dot appears on SOS button (offline indicator) |
| 9.2 | Press and hold SOS button for 2 seconds | "Send SOS Now" button triggers; SOS is written to IndexedDB queue (type: `sos_trigger`) |
| 9.3 | Observe the SOS button | Button optimistically enters "active" state with temporary offline ID |
| 9.4 | Re-enable network | Offline queue flushes; SOS event is POSTed to `POST /api/v1/sos`; server persists it |
| 9.5 | Verify queue priority | If multiple queued actions exist (messages + SOS), SOS is processed first |
| 9.6 | Re-enable network while other messages are queued | SOS event POSTed before other queued messages |

---

## Section 10 — SOS History Persistence (G.8)

| # | Step | Expected |
|---|------|----------|
| 10.1 | Trigger and resolve multiple SOS events | Each creates a document in `sos_events` MongoDB collection |
| 10.2 | `GET /api/v1/sos/history` | Returns all events with `status: 'resolved'` or `status: 'active'` |
| 10.3 | Resolved event fields | `resolvedAt` timestamp is populated |
| 10.4 | App reload after active SOS | SOS store is re-hydrated from server; SOS modal / button state is restored |

---

## Section 11 — Multi-User Scenarios

| # | Step | Expected |
|---|------|----------|
| 11.1 | User A and User B both trigger SOS simultaneously | Both SOS events appear as separate alert cards in the modal; both appear as separate markers on the map |
| 11.2 | User C (not in the room) opens the app | No SOS modals; `GET /api/v1/sos` returns empty for rooms they're not in |
| 11.3 | User B resolves User A's SOS via popup | Only User A's SOS is removed; User B's own SOS remains active |

---

## Section 12 — Edge Cases / Error Handling

| # | Step | Expected |
|---|------|----------|
| 12.1 | Trigger SOS without a room selected (no activeRoomId) | SOS button does nothing / message picker appears but "Send SOS Now" does nothing; no error thrown |
| 12.2 | Socket disconnects mid-SOS flow | On reconnect, `GET /api/v1/sos` re-hydrates active events |
| 12.3 | Non-member emits `sos_trigger` via raw WebSocket | Server responds with `sos_error: "Not a member of this room"` |
| 12.4 | Invalid SOS data (missing lat/lng) | Server silently ignores (returns without error) |
| 12.5 | Attempt to resolve another user's SOS (non-admin) | Server responds with `sos_error: "Not authorized to resolve this SOS"` |
| 12.6 | Redis unavailable | SOS still persists to MongoDB; broadcast may fail gracefully with console error |

---

## Agent-Automated Test Checklist

The following can be verified by an automated agent using the browser MCP tool:

```
[ ] Navigate to / — SOS button visible at bottom-right
[ ] Hold SOS button 2s — distress picker appears
[ ] Select "Medical emergency" and send — button turns red/pulsing
[ ] Open second session — SOSAlertModal visible with correct username and message
[ ] Click "✓ I'm going to help" — modal disappears in second session
[ ] Navigate to /map — pulsing SOS marker visible at user's position
[ ] Click SOS map marker — popup shows resolve button
[ ] Click "Mark as Resolved" — marker disappears
[ ] Trigger SOS, press SOS button again — "Cancel SOS?" modal appears with countdown
[ ] Wait 10 seconds — SOS auto-cancelled, button returns to idle
[ ] GET /api/v1/sos — empty array after resolution
[ ] GET /api/v1/sos/history — shows resolved event with resolvedAt timestamp
```

---

## Pass Criteria

All items in Sections 1–12 pass, with the following priorities:

- **P0 (must pass):** 2.3, 2.6, 4.1, 4.4, 5.2, 5.3, 6.2, 8.1, 8.4, 9.4
- **P1 (should pass):** 3.1, 4.5, 7.3, 9.1, 9.5, 10.1, 11.1
- **P2 (nice to have):** 7.2, 12.6
