# Phase E — Audio & Video Messages: Human Test Plan

**Branch:** `phase-e-audio-video-messages`  
**Prerequisites:** `docker compose up --build` succeeds, two browser tabs logged in as different users in the same room or dialog.

---

## Setup

1. Run `docker compose up --build` from the repo root.
2. Open **Tab A** and **Tab B** at `http://localhost:3000`.
3. Register two accounts (e.g. `alice` / `bob`) and add each other as friends.
4. Join the same public room **or** start a direct message dialog.

---

## E-H-1 — Audio Record Button Is Visible

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open a room or dialog chat view. | The input bar shows emoji, attach-file, **microphone**, **camera**, PTT (rooms only), and send buttons. |
| 2 | Hover over the microphone icon. | Tooltip "Record audio message" appears. |
| 3 | Hover over the camera icon. | Tooltip "Record video message" appears. |

---

## E-H-2 — Grant Microphone Permission

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click the microphone button. | Browser prompts for microphone permission (first time only). |
| 2 | Click **Allow**. | Recording banner appears: red pulsing dot, "Recording audio · 0:00 / 1:00", **Send** and **✕** buttons. |

---

## E-H-3 — Record & Send Audio Message

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start recording (click mic). Allow permission if prompted. | Banner shows elapsed time counting up. |
| 2 | Speak into the microphone for ~3 seconds. | Timer advances. |
| 3 | Click **Send** in the banner. | Banner disappears; "Uploading audio · 0:03…" indicator shows briefly. |
| 4 | Check Tab B (other user). | An audio player card appears in the message list showing a waveform graphic, play/pause button, scrubber bar, and duration (e.g. "0:03"). |
| 5 | Click the play button. | Audio plays back. Waveform bars fill blue as playback progresses. |
| 6 | Drag the scrubber. | Playback jumps to the new position. |

---

## E-H-4 — Cancel Audio Recording

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click the microphone button to start recording. | Banner appears. |
| 2 | Click the **✕** (cancel) button in the banner. | Banner disappears. No message is sent. No spinner shows. |

---

## E-H-5 — Audio Message Auto-Stops at 60 Seconds

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start audio recording. | Banner shows "0:00 / 1:00". |
| 2 | Wait for the timer to reach 1:00. | Recording stops automatically. Upload begins, then audio message appears in chat. |

---

## E-H-6 — Record & Send Video Message

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click the camera button. | Browser may prompt for camera + microphone permission. Allow it. |
| 2 | Banner shows "Recording video · 0:00 / 0:30". | Timer counts up. |
| 3 | Record for ~5 seconds, then click **Send**. | Spinner shows briefly. |
| 4 | Tab B sees a video thumbnail card with a **▶ play overlay** and duration badge (e.g. "0:05"). |
| 5 | Click the video card on Tab B. | Video expands inline and begins playing. |

---

## E-H-7 — Cancel Video Recording

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start a video recording. | Banner appears. |
| 2 | Click **✕** (cancel). | Banner disappears. No message sent. |

---

## E-H-8 — Disabled State While Another Recording Is Active

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start an audio recording. | Mic button turns red/active. |
| 2 | Try clicking the camera button. | Camera button is disabled (opacity-50). Clicking it does nothing. |
| 3 | Stop the audio recording. | Both buttons return to normal state. |

---

## E-H-9 — Audio Message in Direct Message (Dialog)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open a direct message with `bob`. | Input bar shows mic and camera buttons. |
| 2 | Record and send a short audio message. | Both users see the AudioMessage component in the DM thread. |

---

## E-H-10 — Audio Player Loading State

| Step | Action | Expected |
|------|--------|----------|
| 1 | Send an audio message. | Observe audio card immediately after it appears. |
| 2 | Click play before the browser has buffered the audio. | A spinner shows briefly inside the play button while buffering. |
| 3 | Once buffered, the spinner is replaced by the play icon. |

---

## E-H-11 — Video Lazy Loading

| Step | Action | Expected |
|------|--------|----------|
| 1 | Send several messages so the video message is off-screen. | Scroll down; video thumbnail is not rendered yet. |
| 2 | Scroll up to bring the video card into the viewport. | Thumbnail or grey placeholder loads within ~200px of entering the viewport. |

---

## E-H-12 — Offline Audio Send (IndexedDB Queue)

| Step | Action | Expected |
|------|--------|----------|
| 1 | In Tab A, open DevTools → Network → set to **Offline**. | Connection indicator shows offline. |
| 2 | Record and attempt to send an audio message. | Upload is skipped; action is queued to IndexedDB. No error alert. |
| 3 | Set DevTools back to **Online**. | Queue flushes automatically; audio message appears in Tab B. |

---

## E-H-13 — Message Type Persistence

| Step | Action | Expected |
|------|--------|----------|
| 1 | Send an audio and a video message in a room. | Both messages appear with their respective players. |
| 2 | Refresh Tab B (F5). | After reload, audio and video messages are loaded from history and still rendered as audio/video players (not as text). |

---

## E-H-14 — Deleted Audio/Video Message

| Step | Action | Expected |
|------|--------|----------|
| 1 | Hover over an audio message you sent. | Context menu appears (Reply / Delete). |
| 2 | Click **Delete**. | Audio player is replaced with "(message deleted)" in italic text. |

---

## Pass/Fail Summary Checklist

- [ ] E-H-1: Mic and camera buttons visible in input bar  
- [ ] E-H-2: Browser permission prompt on first use  
- [ ] E-H-3: Audio recorded, uploaded, and played back  
- [ ] E-H-4: Cancel audio recording — no message sent  
- [ ] E-H-5: Audio auto-stops at 60 s  
- [ ] E-H-6: Video recorded, uploaded, thumbnail shown, plays inline  
- [ ] E-H-7: Cancel video recording — no message sent  
- [ ] E-H-8: Buttons disabled while other recording is active  
- [ ] E-H-9: Audio/video works in DMs  
- [ ] E-H-10: Loading spinner during buffering  
- [ ] E-H-11: Video thumbnail lazy-loads  
- [ ] E-H-12: Offline queue → send on reconnect  
- [ ] E-H-13: Audio/video messages persist across page reload  
- [ ] E-H-14: Deleted audio/video shows "(message deleted)"  
