# Phase D — Push-to-Talk (PTT): Human Test Plan

**Phase:** D — Push-to-Talk  
**Branch:** `feature/phase-d-ptt`  
**Scope:** PTT button in chat input, hold-to-talk gesture, live audio streaming, "someone is speaking" UI, offline guard, vibration feedback.

---

## Prerequisites

- `docker compose up --build` is running; all services (`mongo`, `redis`, `api`, `frontend`) healthy.
- At least **three** test accounts registered: `alice`, `bob`, `carol`.
- At least one shared room `#family` with all three as members.
- **Browser A** — Chrome (alice) on desktop or laptop with a working microphone.
- **Browser B** — Chrome or Firefox (bob) on a second device or separate Chrome profile with audio output.
- **Browser C** — optional third device/tab (carol) for multi-listener tests.
- Microphone permission will be requested by the browser the first time PTT is pressed — grant it.
- Mobile device (or DevTools device emulation at 375 px) for layout tests.
- Headphones recommended for D.4 audio playback tests to avoid echo feedback.

---

## D.1 — PTT Button Presence & Layout

### Setup
- Log in as `alice` in Browser A; open `#family` room.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Look at the message input row at the bottom of the chat | A circular microphone button is visible between the file attachment button and the text input |
| 2 | Hover over the PTT button | Tooltip reads "Hold to talk (Space)" |
| 3 | Switch to a **direct message** conversation with bob | PTT button is **not** visible (PTT is rooms-only) |
| 4 | Switch back to `#family` room | PTT button reappears |
| 5 | Resize browser to 375 px wide (mobile) | PTT button still visible; input row does not overflow or wrap awkwardly |
| 6 | Inspect button accessibility: right-click → Inspect → check aria attributes | `aria-label="Hold to talk"` and `aria-pressed="false"` present on the button |

---

## D.2 — Hold-to-Talk Gesture (Mouse & Touch)

### Setup
- Alice and bob both in `#family`; bob has audio playing through speakers.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | **Press and hold** the PTT button (mousedown / touch) | Button turns red; a pulsing ring animation appears around it; browser microphone permission prompt appears (first time only) |
| 2 | While holding, speak "Hello bob" | Microphone is active; no UI error shown |
| 3 | **Release** the PTT button | Button returns to grey; pulsing animation stops |
| 4 | Repeat hold/release 3 times quickly | Button reliably transitions red → grey on each press/release cycle |
| 5 | Press and hold, then move the pointer off the button while still holding | Transmission continues (pointer capture holds); button remains red |
| 6 | Release the pointer anywhere on screen after step 5 | Transmission stops correctly |

---

## D.3 — Keyboard Space Bar Support

### Setup
- Alice is in `#family` room; text input is **not** focused.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Press and hold the **Space bar** | PTT button turns red; pulsing animation starts |
| 2 | Release Space bar | Button returns to grey; transmission stops |
| 3 | Click inside the text input field to focus it; press Space bar | PTT does **not** activate; the space character is typed into the input instead |
| 4 | Press Space bar while an emoji picker modal is open | PTT does not activate |

---

## D.4 — Audio Received by Other Members

### Setup
- Alice (Browser A) in `#family`; Bob (Browser B, different device or profile) also in `#family` with speakers on.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Alice holds PTT and speaks "Testing one two three" | Bob hears alice's voice within ~1 second of her speaking |
| 2 | Alice releases PTT; holds again and speaks a second sentence | Audio resumes with no distortion or gap artifacts |
| 3 | Alice holds PTT for 5 seconds and speaks continuously | Audio streams in real time; no obvious buffering delay builds up |
| 4 | Bob holds PTT after alice releases | Alice hears bob's voice |
| 5 | Carol (Browser C) joins the room and listens while alice transmits | Carol also hears alice without any extra setup |

---

## D.5 — "Someone Is Speaking" UI State

### Setup
- Bob (Browser B) watches `#family` while Alice transmits.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Alice holds PTT | In Bob's browser, a green indicator with an animated dot appears above the PTT button showing "alice speaking" (or the resolved display name) |
| 2 | Alice releases PTT | The green indicator disappears from Bob's UI |
| 3 | Alice holds PTT again | Indicator reappears immediately |
| 4 | Bob's PTT button while alice is transmitting | Button is visually disabled (dimmed / `opacity-50`); tooltip reads "alice is speaking…" |
| 5 | Alice releases; Bob immediately holds PTT | Bob can now transmit; Alice sees the receiving indicator with "bob speaking" |

---

## D.6 — PTT Lock Exclusivity

### Setup
- Alice and Bob in `#family`; both attempt to transmit at the same time.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Alice holds PTT | Alice transmits; Bob sees "alice speaking" |
| 2 | Bob **also** tries to hold PTT while Alice is transmitting | Bob's button does not activate (remains grey or shows busy state); no audio is sent from Bob |
| 3 | Alice releases PTT | Bob's button becomes active again immediately |
| 4 | Bob then holds PTT successfully | Bob transmits; Alice sees the receiving indicator |

---

## D.7 — Offline Behaviour

### Setup
- Alice in `#family`; DevTools → Network → Offline (or physically disconnect from network).

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Go offline | Offline banner appears at top of app |
| 2 | Inspect PTT button | Button is visually disabled (dimmed); tooltip reads "Offline — PTT unavailable" |
| 3 | Attempt to click/hold the PTT button | Nothing happens; no error alert; no microphone permission prompt |
| 4 | Go back online | PTT button becomes active again; hold-to-talk works normally |

---

## D.8 — Vibration Feedback (Mobile Only)

### Setup
- Open app on a physical mobile device with vibration support (iOS vibration via haptics / Android vibration motor).

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Hold PTT button | Device vibrates once (short pulse ~50ms) at the moment transmission starts |
| 2 | Release PTT button | Device vibrates once (short pulse ~50ms) when transmission stops |
| 3 | Receive PTT from another user (bob transmitting) | Device does **not** vibrate on reception |

---

## D.9 — Microphone Permission Handling

| # | Step | Expected result |
|---|------|-----------------|
| 1 | First time pressing PTT in a fresh browser profile | Browser microphone permission dialog appears |
| 2 | Grant microphone permission | Transmission begins; permission is remembered for future sessions |
| 3 | Deny microphone permission | PTT stops silently; no crash; button returns to inactive state; no error alert shown to user |
| 4 | Revoke mic permission via browser settings; attempt PTT again | Same silent fail behaviour as step 3 |

---

## D.10 — Multi-User Scenario (Stress / Conversation Flow)

### Setup
- Alice, Bob, Carol all in `#family` across three devices or browser profiles.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Alice → Bob → Carol take turns transmitting one at a time | Each speaker is heard by all others; no audio overlap or session confusion |
| 2 | Alice transmits; bob presses PTT; carol presses PTT | Both Bob and Carol are blocked; only Alice transmits; UI shows "alice speaking" for both |
| 3 | Alice releases; Bob presses PTT immediately | Bob gets the lock within ~200ms; carol sees "bob speaking" |
| 4 | All three simultaneously send text messages while bob holds PTT | Text messages send and receive normally; PTT and text chat coexist without interference |
| 5 | Bob refreshes his browser tab while holding PTT | Bob's lock is released on disconnect; carol's UI resets within ~2s; alice can now transmit |

---

## D.11 — Regression: Text Chat Unaffected

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Send a text message immediately after releasing PTT | Message sends and appears normally |
| 2 | Upload a file attachment while PTT session is idle | Upload and send work as before |
| 3 | Reply to a message while PTT is active (another user speaking) | Reply UI and send flow are unaffected |
| 4 | Open emoji picker while PTT is idle | Emoji picker opens and inserts emoji as normal |
