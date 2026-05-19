# SafeGroup — Typed Rooms & Mesh Communications Plan

**Version:** 0.1 (proposal)
**Owner:** Product (PO) + Senior UI/UX
**Status:** Draft for review, ready to fan out to development agents
**Primary references:**
- [`TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) — current data model, API, sockets
- [`AGENT_DEVELOPMENT_GUIDE.md`](../AGENT_DEVELOPMENT_GUIDE.md) — agent/phase format this doc follows
- [`CHANGELOG.md`](../CHANGELOG.md) — what shipped up to v2.4

---

## 0. TL;DR

Today every SafeGroup room is the same thing: a chat room with maps, calls, SOS,
markers. We are going to turn rooms into **typed apps**: a room "knows what it
is" (chat, radio mesh, FM tuner, music jukebox, dating, parental, watch-party,
sports, news, …) and renders a different toolbar / right-panel / composer per
type while sharing the same plumbing (members, messages, presence, map,
attachments).

Hackathon thesis we are leaning into:

> **SafeGroup keeps people talking when the internet does not.**

To deliver that, we introduce a **mesh transport layer** that abstracts over
WebSocket (when online), WebRTC P2P, Bluetooth LE, **audio modem over the
microphone/3.5 mm jack** (the killer feature — talks through any FM/AM/SSB/
sub-GHz radio), and offline-friendly fallbacks (QR-burst, NFC share, USB
sneakernet). The first room that uses this is the **Radio Enthusiast room**,
because it is the most demanding consumer and the best demo.

Then we light up two more "wow" room types — **FM tuner** (vote-driven shared
listening) and **Music jukebox** (vote-skip / vote-next) — to prove the
"every room is its own little app" idea.

---

## 1. Product Vision

### 1.1 What SafeGroup becomes

A **multifunctional room platform**. Each room is an instance of a **Room
Type** that ships with:

- a default member layout (composer, side panel, header actions)
- a set of **Room Widgets** (mini-apps inside the room)
- type-specific **roles** beyond owner/admin/member (DJ, Net Control,
  Moderator, Tutor, Match-maker, Guardian, …)
- type-specific **events** in the message stream (e.g. `track_voted`,
  `frequency_changed`, `station_voted`, `radio_frame_received`)
- a **`roomConfig` JSON blob** (per room, edited by admins) that tweaks the
  widget set, defaults, and limits

Default rooms (seeded by the system, joinable by anyone, removable by an admin):

| Default room       | Type            | One-liner                                                                  |
| ------------------ | --------------- | -------------------------------------------------------------------------- |
| Radio Enthusiasts  | `radio_mesh`    | Talk to other operators over AM/FM/sub-GHz via the in-app audio modem.     |
| FM Radio Lounge    | `fm_tuner`      | Listen together; vote what plays next.                                     |
| Music Jukebox      | `music_jukebox` | Queue tracks, vote-skip, vote-next, lyrics overlay.                        |
| Dating             | `dating`        | Local matches, time-boxed icebreakers, optional anonymity.                 |
| Parental Controls  | `parental`      | Family-only space with geofencing, content filter, and check-in routines.  |
| Watch Party        | `watch_party`   | Synced video timeline, reactions overlay, hand raise.                      |
| Sport Activity     | `sports`        | Live GPS routes, segments, leaderboards on top of existing telemetry.      |
| News & Debate      | `news`          | Aggregated stories, room-level up/downvote, timed-turn debate threads.     |
| Marketplace        | `market`        | Item listings with geo radius and offline price-card share.                |
| Study Room         | `study`         | Pomodoro timer, shared whiteboard, focus presence.                         |
| Game Lobby         | `game`          | Lightweight multiplayer minigames (chess, codenames, drawing).             |
| Emergency / SOS    | `sos` (exists)  | Already shipped: SOS broadcasts + map markers.                             |
| General Chat       | `chat` (legacy) | Today's room — kept as the default fallback type.                          |

### 1.2 Non-goals (for this plan)

- Not building federation / XMPP in this iteration.
- Not building broadcast-level FM/AM transmitters; we modulate **audio** and
  let the user plug their own radio.
- No regulatory claims — the room ships with a clear "your country, your
  licensing, your responsibility" notice, as the user requested.
- No DRM-protected music streaming. Music room can host user-uploaded tracks
  or freely-licensed catalogues (Jamendo, Free Music Archive, SomaFM, …).

---

## 2. Extended product ideas (PO+UX additions)

Things the user did not ask for but that make the rooms 10× more compelling
and tie everything together. Each is a candidate; pick on the kanban.

### 2.1 Universal upgrades

1. **Room templates** — admins clone "Radio Enthusiasts" into a new
   "Marine HF Net" with its own widget config and roles.
2. **Room marketplace / discovery** — already have public rooms; add
   tags, type filters, and "near me" sorting.
3. **Per-room theme** — owners can pick an accent color + emoji; survives
   into push notifications.
4. **Pinned room widgets** — small dock at the top of the message list
   showing the room's "now": current FM frequency, current track, current
   net control, etc. (one strip, mobile-first, collapses on scroll.)
5. **Offline-first by default** — every room type works in airplane mode
   if the transport supports it; "Online via internet" / "Online via mesh"
   / "Offline (last sync)" pill in the header.
6. **Trusted contact graph** — already have contacts; expose it to the
   mesh layer so we can sign messages with the user's contact key when
   peers can't reach the server.

### 2.2 Per-room fresh angles

- **Radio Enthusiasts (`radio_mesh`)**
  - Built-in **digital modes**: BFSK 300 bps (HF), AFSK 1200 bps (VHF/FM),
    MFSK16, QPSK31-ish. Robust + fast presets, like FLDigi-lite.
  - **QSO log** (room-side, persisted to MongoDB) — every transmitted/
    received frame is auto-logged with timestamp, callsign, RSSI proxy
    (input level), and decoded payload.
  - **Net schedule** widget — "Daily 19:00 UTC net on Channel 5", with
    auto-DM the day-of.
  - **Beacon / APRS-style position** — opt-in periodic beacons piggy-
    backing on the existing `Location` model.
  - **Frame inspector** — every received frame is clickable and shows
    bits / hex / CRC / FEC stats. Great geek bait.
  - **"Bring-your-own-SDR"** (stretch) — optional WebUSB/WebSerial bridge
    to RTL-SDR.js so the room can also receive without a separate radio.
- **FM Radio Lounge (`fm_tuner`)**
  - "Tune" is **vote-driven**: members propose stations from a curated +
    user-added directory (radio-browser.info API or a static seed list).
    Top-voted station plays for everyone; ties broken by recency.
  - **Now-playing strip** with album art from ICY metadata where available.
  - **"Take the deck"** — temporarily disable voting and let one DJ pick
    for N minutes (great for events; surfaces as a poll first).
- **Music Jukebox (`music_jukebox`)**
  - Shared queue, drag-to-reorder for admins/DJs, vote-skip threshold
    (50% of present members), vote-next for the next slot.
  - **Crossfade and ducking** (chat audio cues duck the track briefly).
  - **Lyrics overlay** if available (LRC files via user uploads).
- **Dating (`dating`)**
  - Time-boxed **icebreaker prompts** every 24 h.
  - Optional **mask mode** (avatar + nickname only) until both parties
    "reveal".
  - Distance shown in fuzzy buckets (≤ 1 km / ≤ 5 km / ≤ 25 km), no
    precise coordinates leaked.
- **Parental Controls (`parental`)**
  - Geofences (re-use map): "Notify me when Anna leaves school zone".
  - Content filter on the message stream + attachments (server-side regex
    + image safe-search hook).
  - **Check-in widget** — child must tap "I'm OK" by 18:00; otherwise the
    room nudges, then alerts.
- **Watch Party (`watch_party`)**
  - Sync HTML5 `<video>` via Socket.IO `media_state` events (already a
    pattern we use elsewhere).
  - Reactions overlay (♥ 👏 😂) bursting from each viewer's avatar.
- **Sport Activity (`sports`)**
  - Re-use the `Location` + `Telemetry` models — live route trace,
    segments, KOM-style leaderboards inside the room.
- **News & Debate (`news`)**
  - Per-message **up/downvote** and "source check" thread.
  - **Debate mode**: timed 60-second turns per speaker, audio + text.
- **Marketplace (`market`)**
  - Listings (title, price, photos, geo). Offline export = QR card.
- **Study (`study`)**
  - Shared 25/5 Pomodoro timer (server is source of truth).
  - Light whiteboard (`<canvas>` + CRDT). Mobile uses Apple Pencil/touch.
- **Game (`game`)**
  - Pluggable minigames; first ones: tic-tac-toe, chess, codenames clone,
    drawing-guess. Each is its own widget; uses room messages as moves.

---

## 3. Architecture — typed rooms

### 3.1 Data-model deltas (MongoDB)

We extend the existing `Room` model with two fields and one new collection;
**no breaking change**. Old rooms default to `type: 'chat'` and an empty
`config`.

```ts
// backend/src/models/room.model.ts  (extension)
type RoomType =
  | 'chat' | 'radio_mesh' | 'fm_tuner' | 'music_jukebox'
  | 'dating' | 'parental' | 'watch_party' | 'sports'
  | 'news'  | 'market'    | 'study'      | 'game'
  | 'sos';

const RoomSchema = new Schema<IRoom>({
  // existing fields …
  type:   { type: String, enum: RoomTypes, default: 'chat', index: true },
  config: { type: Schema.Types.Mixed, default: {} },     // freeform per type
  isSystem: { type: Boolean, default: false },           // seeded default rooms
}, { timestamps: true });
```

New collection `roomroles` (so we can have type-specific roles without
overloading the existing `roomMembers.role` field):

```ts
// backend/src/models/roomRole.model.ts
const RoomRoleSchema = new Schema({
  roomId: { type: ObjectId, ref: 'Room', required: true, index: true },
  userId: { type: ObjectId, ref: 'User', required: true, index: true },
  role:   { type: String, required: true },              // 'dj' | 'net_control' | 'guardian' | …
}, { timestamps: true });
RoomRoleSchema.index({ roomId: 1, userId: 1, role: 1 }, { unique: true });
```

### 3.2 Frontend — Room Widget plugin system

```
frontend/src/rooms/
├── registry.ts                 // maps RoomType → RoomBlueprint
├── RoomBlueprint.ts            // type def: title, icon, widgets, composer
├── widgets/
│   ├── RadioModemPanel.tsx     // tx/rx, waterfall, frame log
│   ├── FmTunerPanel.tsx        // station list, vote, now-playing
│   ├── JukeboxPanel.tsx        // queue, vote-skip
│   ├── ParentalCheckIn.tsx
│   ├── WatchPartyPlayer.tsx
│   └── …
└── composers/
    ├── ChatComposer.tsx        // current MessageInput, default
    ├── RadioComposer.tsx       // PTT + modem keyer
    └── …
```

```ts
export interface RoomBlueprint {
  type: RoomType;
  label: string;
  icon: React.FC<{ className?: string }>;
  /** Right-side or top-strip widgets, ordered. */
  widgets: Array<React.FC<{ roomId: string; config: unknown }>>;
  /** Replaces MessageInput for this room type. */
  Composer: React.FC<{ roomId: string }>;
  /** Optional setting screen for owners/admins. */
  Settings?: React.FC<{ roomId: string }>;
  /** Default `roomConfig` when this type is created. */
  defaultConfig: unknown;
}
```

The existing chat view becomes the "shell" and renders the blueprint for the
current `room.type`. **Old chat rooms are unaffected.**

### 3.3 Backend — typed services

We **do not** create a new route tree per type. We add a per-type **service
slice** that the existing `rooms.routes.ts` delegates to for type-specific
operations:

```
backend/src/services/roomTypes/
├── radio.service.ts            // logFrame(), voteFrequency(), …
├── fmTuner.service.ts          // voteStation(), getNowPlaying()
├── jukebox.service.ts          // enqueue(), voteSkip(), voteNext()
└── …
```

Routes that are common (`/rooms/:id/messages`, etc.) stay generic; type-
specific endpoints live under `/rooms/:id/widgets/<feature>` so the URL
shape stays predictable.

### 3.4 Socket.IO — new event family

New events (prefix `room_widget`):

| Event                                    | Direction | Payload                                  |
| ---------------------------------------- | --------- | ---------------------------------------- |
| `room_widget:fm:station_voted`           | s → c     | `{ roomId, stationId, votes }`           |
| `room_widget:fm:now_playing`             | s → c     | `{ roomId, stationId, meta }`            |
| `room_widget:juke:queue_updated`         | s → c     | `{ roomId, queue }`                      |
| `room_widget:juke:skip_voted`            | s → c     | `{ roomId, trackId, ratio }`             |
| `room_widget:radio:frame`                | s ↔ c     | `{ roomId, frame: MeshFrame }`           |
| `room_widget:radio:net_state`            | s → c     | `{ roomId, controllerUserId, mode }`     |
| `room_widget:watch:media_state`          | s → c     | `{ roomId, t, paused, src }`             |

---

## 4. Mesh Communications — the deep dive

This is the heart of the proposal and the first thing we build.

### 4.1 Layered model

```
┌──────────────────────────────────────────────────────────────┐
│ Room widgets (Radio Mesh, Chat composer, telemetry beacon)   │ ← UI
├──────────────────────────────────────────────────────────────┤
│ Mesh Router  (TTL, hop-count, dedup, store-and-forward)      │ ← Layer 3
├──────────────────────────────────────────────────────────────┤
│ Frame codec  (preamble, sync, length, payload, CRC32, FEC)   │ ← Layer 2
├──────────────────────────────────────────────────────────────┤
│ Transports                                                   │ ← Layer 1
│   - WebSocket (online; via existing Socket.IO)               │
│   - WebRTC DataChannel (P2P, when offline but on same LAN)   │
│   - Audio modem (AFSK/MFSK over getUserMedia + WebAudio)     │
│   - Bluetooth LE GATT chunks (WebBluetooth)                  │
│   - QR-burst (chunked QR display + camera scan)              │
│   - NFC tap (Web NFC, Android only)                          │
└──────────────────────────────────────────────────────────────┘
```

Each transport implements:

```ts
export interface MeshTransport {
  id: 'ws' | 'webrtc' | 'audio' | 'ble' | 'qr' | 'nfc';
  isAvailable(): Promise<boolean>;
  /** Sends one frame; resolves when modulation/network handover completes. */
  send(frame: Uint8Array): Promise<void>;
  /** Receives raw frames; emits exactly one event per decoded frame. */
  onFrame(handler: (frame: Uint8Array) => void): () => void;
  capabilities: { maxFrameBytes: number; nominalBps: number; halfDuplex: boolean };
}
```

The **Router** picks the best transport per message (prefer ws → webrtc →
audio → ble → qr) and falls back automatically; messages carry a TTL so
nothing loops forever.

### 4.2 Frame format

Compact, radio-grade, fixed-everywhere:

```
+--------+--------+--------+--------+--------+----+----------+--------+
| PREAM  | SYNC   | VER+TYPE | LEN  | MID   | TTL| PAYLOAD  | CRC32  |
| 24 bit | 16 bit | 1 byte   | 2 B  | 4 B   | 1 B|  …       |  4 B   |
+--------+--------+--------+--------+--------+----+----------+--------+
```

- **PREAMBLE** — `0xAA AA AA` (alternating, helps AGC + bit clock).
- **SYNC** — `0x1ACF` (uncommon, easy to find post-demod).
- **VER (4 bit) + TYPE (4 bit)** — version 1, types: `0=text`, `1=binary`,
  `2=telemetry`, `3=ack`, `4=control`, `5=image_chunk`.
- **LEN** — payload bytes (≤ 1024).
- **MID** — message id (4 random bytes, used for dedup at the router).
- **TTL** — hop budget (default 4, decremented per relay).
- **PAYLOAD** — `protobuf` or `msgpack` (we'll start with msgpack;
  cheaper to encode in browser, no compile-time toolchain).
- **CRC32** — IEEE 802.3 polynomial; integrity, not security.

**Forward error correction** is wrapped around the whole frame body via
Reed-Solomon (255,223) for radio modes — adds 32 bytes, fixes 16 byte
errors per block. For local transports (WS/WebRTC/BLE) FEC is skipped.

**Encryption (optional, opt-in per room)** — Curve25519 key exchange at
join time, ChaCha20-Poly1305 per frame, key derived from room id +
member's contact key. The room config flag `encrypted: true` toggles it.

### 4.3 Audio modem in the browser

We piggy-back on the existing Web Audio toolchain (we already use
`getUserMedia` for PTT).

**Modes (the user picks based on their radio):**

| Mode      | Carrier      | Symbol rate | Net bps | Use case                              |
| --------- | ------------ | ----------- | ------- | ------------------------------------- |
| `bfsk300` | 1200/2200 Hz | 300 Bd      | ≈ 240   | HF SSB, very robust                   |
| `afsk1200`| 1200/2200 Hz | 1200 Bd     | ≈ 900   | VHF/UHF FM (Bell 202, classic)        |
| `mfsk16`  | 16 tones     | 15.625 Bd   | ≈ 55    | Tough HF, narrow bandwidth            |
| `qpsk500` | single carr. | 500 Bd      | ≈ 950   | Clean line-in / 3.5 mm jack only      |
| `dtmf-lite`| DTMF pairs  | 5 sym/s     | ≈ 12    | Worst case; works through any radio   |

Encoder pipeline (`frontend/src/lib/mesh/audio/`):

```
bits ─► FEC (RS 255,223) ─► interleave ─► symbol mapper ─► tone gen ─► AudioBuffer ─► AudioContext.destination
                                                                                          │
                                                                                          ▼
                                                                                       speaker → 3.5 mm jack → radio MIC
```

Decoder pipeline:

```
radio SPK → mic / line-in → MediaStreamSource ─► AnalyserNode ─► Goertzel (per tone) ─► symbol slicer ─►
                                          ─► clock recovery (Mueller-Müller) ─► deinterleave ─► RS decode ─► frame
```

Practical UX rules:

- The composer for `radio_mesh` shows a **"key the radio" PTT** that holds
  during transmit; tail is 250 ms of dead carrier so VOX-rigs catch the
  preamble.
- The receiver is **always on** while the room is open (background
  Goertzel runs at a small CPU cost, ~3 % on a mid-phone).
- We show a **mini waterfall** (spectrogram) so the user can verify they
  are hearing the right tones before keying.
- Each successful decode posts a **regular room message** with badge
  `via Radio · 90 % FEC`, so the radio room is also a normal chat room.

### 4.4 Other transports (sketch only — full design in Phase R-2/R-3)

- **WebRTC** — re-uses our existing signalling (calls); a "mesh peer" is a
  silent DataChannel that joins a peer-discovery topic per room.
- **Bluetooth LE** — Web Bluetooth GATT custom service, 20-byte chunks,
  half-duplex; available on Chrome/Android.
- **QR-burst** — `qrcode-svg` to render a sequence of QR frames at 5 fps;
  receiver uses `BarcodeDetector` (Chrome) or `zxing-js` fallback.
- **NFC** — `NDEFReader.write()` on Android Chrome for one-tap exchange
  (single-frame only; useful for credentials, contacts, listings).

### 4.5 Router rules

```
on send(frame, rooms):
  if any active transport available → encode + tx on best available
  else → enqueue in offlineQueue (model already exists)

on receive(frame, transport):
  if frame.mid already seen in last 60 s → drop (dedup)
  if frame.ttl == 0 → consume locally only
  else (frame.ttl -= 1) and rebroadcast on other transports

bridge:
  online server is just another transport;
  if user is online AND has the room joined,
  any frame received from radio/BLE/QR is rebroadcast over WS
  to the rest of the room — and vice versa.
```

This "bridge" property is the secret sauce: a single user with both a
radio and an internet connection makes the entire room reachable from the
mesh side, and the entire mesh reachable from the internet side.

---

## 5. UI/UX patterns

### 5.1 Mobile-first room layout

```
┌────────────────────────────────────────────────────┐
│ ← Radio Enthusiasts          ⓘ  ⋮                  │ ← header
├────────────────────────────────────────────────────┤
│  ▣ Now: BFSK 300 · CH 5 · 14.300 MHz · S6 ▣        │ ← "now strip" widget
├────────────────────────────────────────────────────┤
│                                                    │
│   ░░ messages list (with `via Radio` badges) ░░    │ ← shared shell
│                                                    │
├────────────────────────────────────────────────────┤
│  [mode▾] [freq▾]      ⏵ waterfall mini           │ ← Radio composer row 1
│  ⓢ STATUS  ⌨  type a message…              [Send]│ ← Radio composer row 2
│                              [● Key Radio (hold)]│ ← PTT FAB
└────────────────────────────────────────────────────┘
```

- The **"now strip"** is the only new chrome; everything else is the
  existing chat UI. Mobile-first; collapses to a pill on scroll.
- Right panel (members, map) keeps working unchanged.
- We add a **"Mesh status"** indicator next to the online/offline pill:
  `WS ✓` / `WS ✗ · Audio ✓` / `Audio TX 32 %` etc.

### 5.2 Room type picker

When creating a room, the modal grows a "Type" step:

```
+----------------------------------+
|  Create a room                   |
|  ─────────────────────────────── |
|  1. Type                         |
|     [Chat] [Radio] [FM] [Music]  |
|     [Dating] [Parental] …        |
|  2. Name                         |
|  3. Visibility (public/private)  |
|  4. Advanced (per-type config)   |
+----------------------------------+
```

System-seeded default rooms are visible in **Public Rooms** with their
type badge.

### 5.3 Accessibility / safety

- Mesh status pill uses `role="status"`; PTT button announces TX/RX over
  `aria-live="polite"`.
- Radio room shows a **first-launch disclaimer**:
  > "You are responsible for complying with your local radio
  > regulations. SafeGroup does not transmit RF — it only modulates audio
  > you choose to route to a radio. Operate at your own risk."

---

## 6. Phased roadmap & agent assignments

This continues the format of `AGENT_DEVELOPMENT_GUIDE.md`. Each phase is
one (sequential) agent unless marked **‖ parallel-ok**. A human reviewer
signs off each phase before the next starts.

### Phase prefixes

- **R-x** — Rooms typing + mesh foundation (the focus).
- **W-x** — Per-room widgets (FM, Music, …).
- **Q-x** — QA / docs / hardening.

---

### Phase R-0 — Discovery & Spike Agent

**Goal:** Reduce the two biggest unknowns to working spikes before we
commit to a final design.

**Deliverables (in a `/spikes/` branch, not merged):**
1. `audio-modem-spike/` — a standalone HTML page that BFSK-encodes a
   message, plays it through the speaker, and decodes it back from the
   microphone in the same browser tab. Target: 95 % decode at SNR ≥ 15 dB
   on a MacBook + iPhone.
2. `rs-fec-spike/` — Reed-Solomon (255,223) JS impl benchmarked on a
   mid-phone (< 5 ms per block).
3. Compatibility matrix doc: iOS Safari, Android Chrome, desktop Chrome,
   desktop Safari — `getUserMedia`, `AudioWorkletNode`, `BarcodeDetector`,
   `Web Bluetooth`, `NDEFReader`.

**Acceptance:** Spikes runnable locally; matrix committed under
`docs/mesh/COMPAT.md`.

---

### Phase R-1 — Typed Rooms Foundation Agent

**Goal:** Add room types and the widget plugin system without changing any
existing room behaviour.

**Tasks**
1. **Backend**
   - Extend `Room` schema with `type`, `config`, `isSystem` (default
     `type: 'chat'`, empty `config`). Migration: not needed — Mongoose
     defaults handle existing docs.
   - Add `roomRole.model.ts` + `roomRoleService` (assign/revoke).
   - Patch `rooms.routes.ts` so `POST /rooms` and `PUT /rooms/:id` accept
     `type` and `config`. Validate `type` against the enum.
   - Seed script `scripts/seed-default-rooms.ts` that creates the system
     rooms listed in §1.1 if they don't exist. Idempotent.
2. **Frontend**
   - `frontend/src/rooms/registry.ts` + `RoomBlueprint.ts`.
   - Refactor the current chat room into the **`chat` blueprint**. No
     visual change; this is purely the plumbing.
   - "Now strip" component (empty for `chat`, hidden on mobile by
     default).
   - Create-Room modal: add the **Type picker** step (chat is selected by
     default).
   - PublicRooms list: show a small type badge per room.
3. **Tests** — unit tests for the type enum, the registry, and a smoke
   test that confirms the chat blueprint renders identically to today's
   chat page (snapshot).

**Acceptance**
- [ ] Existing rooms still render as before.
- [ ] New rooms created with a chosen `type` round-trip the value.
- [ ] Seed script creates all default rooms exactly once.
- [ ] Registry lookup falls back to the `chat` blueprint for unknown
  types (forward-compatible).

---

### Phase R-2 — Mesh Core Agent

**Goal:** Land the mesh layers in the frontend with **only the
WebSocket transport** implemented; everything else is stubbed but
type-safe. This phase makes the router demonstrably correct without
relying on audio.

**Tasks**
1. `frontend/src/lib/mesh/` directory:
   - `frame.ts` — encoder/decoder for the §4.2 frame format (no FEC yet).
   - `crc.ts` — CRC32 IEEE.
   - `router.ts` — TTL/dedup/store-and-forward; uses `OfflineQueue`
     model already present.
   - `transports/ws.ts` — wraps Socket.IO with the `MeshTransport`
     interface. Server bridges `room_widget:radio:frame` events
     transparently.
2. Backend
   - Add `room_widget:radio:frame` socket handler that broadcasts to the
     room and respects per-room mute / ban / message-throttle policies.
   - Persist incoming frames into a new `RadioFrame` collection (room id,
     senderUserId, transportId, transportMeta, frame bytes, decoded
     payload). Indexed by `(roomId, createdAt)`.
3. Frontend dev tools
   - "Mesh inspector" dev panel (route `/dev/mesh`, only when
     `import.meta.env.DEV`): send/receive synthetic frames, see the
     router log.

**Acceptance**
- [ ] Two tabs in the same room can exchange `MeshFrame`s over WS.
- [ ] Dedup prevents the same `mid` from being reposted within 60 s.
- [ ] TTL of 0 stops a frame from being relayed.

---

### Phase R-3 — Audio Modem Agent (the killer)

**Goal:** Implement BFSK 300 and AFSK 1200 modes end-to-end inside an
`AudioWorkletNode`, expose them through the `MeshTransport` interface,
and ship the Radio composer UI.

**Tasks**
1. `frontend/src/lib/mesh/audio/`:
   - `modem.worklet.ts` — `AudioWorkletProcessor` running both an
     encoder (when keyed) and a Goertzel-based decoder.
   - `bfsk.ts`, `afsk.ts` — per-mode parameters and bit→symbol mappers.
   - `rs.ts` — Reed-Solomon (255,223) (use a vetted JS library; the
     hackathon does not need a from-scratch impl).
   - `clockRecovery.ts` — Mueller-Müller or Gardner timing.
   - `audio.transport.ts` — implements `MeshTransport.id = 'audio'`.
2. UI in `frontend/src/rooms/widgets/RadioModemPanel.tsx`:
   - Mode picker, frequency note (cosmetic; for the user log), level
     meters, mini waterfall (`<canvas>` from FFT bins).
   - PTT button (re-uses existing `PTTButton` component shape).
3. Composer: `frontend/src/rooms/composers/RadioComposer.tsx`.
4. Settings: `RadioRoomSettings` with mode default, key tail length,
   "encrypted" toggle (off in v0.1).
5. Disclaimer modal on first open (see §5.3).
6. Add the `radio_mesh` blueprint to the registry.

**Acceptance**
- [ ] On a single device, tx→speaker→mic loopback decodes a 200-byte
  text message at ≥ 95 % success across 20 trials in `bfsk300`.
- [ ] Tx between two phones in the same room (one with audio cable to
  the other) works at ≥ 85 % success in `afsk1200`.
- [ ] Decoded frames appear in the chat as regular messages with the
  `via Radio` badge.
- [ ] CPU on a 2022 mid-phone stays under 25 % during continuous RX.

---

### Phase R-4 — Mesh Router Bridge Agent

**Goal:** Wire the bridge property (§4.5) so that a user with both
internet and radio relays the room.

**Tasks**
1. Frontend router: when a frame arrives over `audio`, **re-emit** it
   over `ws` (and vice versa), respecting TTL and dedup.
2. Backend: tag relayed frames with `relayedBy: userId` for transparency;
   surface this in the frame inspector.
3. Server-side rate-limit: per-user, per-room, max 10 frames / second
   over WS (protects from a misbehaving client).

**Acceptance**
- [ ] User A (radio only) ↔ User B (internet + radio) ↔ User C
  (internet only) round-trip in < 4 s for `bfsk300`.
- [ ] Loop test: a frame initiated on radio does not reappear on radio
  via the bridge.

---

### Phase R-5 — Telemetry & Attachments over Mesh Agent ‖ parallel-ok with W-1

**Goal:** Send small attachments (256×256 JPEG thumb, GPS beacon) over
the mesh.

**Tasks**
1. Image chunker: split a 4–8 KB JPEG into N `image_chunk` frames; reassemble
   at the receiver with progress bar and "open original when online".
2. Telemetry beacons re-use existing `Telemetry` model; new room widget
   `BeaconWidget` periodically emits a `type=2` (telemetry) frame.
3. UX: the chat shows partial-receipt placeholders ("3/7 chunks…") and
   resumes when the rest arrives.

**Acceptance**
- [ ] A 6 KB thumbnail transfers over `afsk1200` between two phones in
  ≤ 90 s, end-to-end.
- [ ] A `type=2` beacon updates the sender's location dot on the room
  map (re-uses existing map).

---

### Phase W-1 — FM Tuner Agent

**Goal:** Ship the **FM Radio Lounge** room (vote-driven shared
listening).

**Tasks**
1. Backend
   - `fmTuner.service.ts`: list stations (seed from `radio-browser.info`
     and a static fallback), vote/unvote, current winner, "take the
     deck" requests.
   - Socket events `room_widget:fm:*` (§3.4).
   - `FmStationVote` collection (`roomId, stationId, userId`, unique).
2. Frontend
   - Blueprint `fm_tuner`: station list with vote buttons, "now playing"
     strip, ICY metadata when available.
   - Shared `<audio>` element synced to the room winner; mute control
     per user (does **not** affect the room).
3. UX
   - "Take the deck" raises a 60-second poll first.

**Acceptance**
- [ ] In a fresh room, two members can vote and the room plays the
  winning stream within 2 s of the swap.
- [ ] Mute is per-user; voting is global.

---

### Phase W-2 — Music Jukebox Agent ‖ parallel-ok with W-1

**Goal:** Ship the **Music Jukebox** room.

**Tasks**
1. Backend
   - `jukebox.service.ts`: enqueue (uploaded attachment OR external URL),
     vote-skip threshold (50 % of presence), vote-next.
   - `JukeboxTrack` collection.
2. Frontend
   - Blueprint `music_jukebox`: queue list (drag for DJ), vote-skip
     button, lyrics overlay.
   - Shared `<audio>` with crossfade and ducking when SOS / radio frames
     arrive.

**Acceptance**
- [ ] Vote-skip with quorum advances the track for all listeners.
- [ ] Drag reorder is restricted to DJ role.

---

### Phase W-3 — Dating, Parental, Watch-Party, Sports, News (any subset)

These are **independent** blueprints. Each gets its own mini-phase that
follows the same shape: add backend service + collection, add frontend
blueprint, add settings. Order is decided by demo priority; suggestion:

1. **Watch Party** (`watch_party`) — biggest "wow", lowest server cost.
2. **Sports** (`sports`) — re-uses existing telemetry, fast win.
3. **Dating** (`dating`) — interesting UX showcase.
4. **Parental** (`parental`) — re-uses location + content filter hook.
5. **News** (`news`) — RSS poller + voting.

(Each one becomes a phase like W-3.x with its own agent.)

---

### Phase Q-1 — QA / docs / disclaimer Agent

**Goal:** Ship the legal / safety / docs pieces.

**Tasks**
1. First-launch disclaimer in radio rooms; persisted "I understand"
   acknowledgement per user.
2. `docs/mesh/USER_GUIDE.md` — how to plug the phone to a radio (3.5 mm
   TRRS, USB-C dongle), volume sweet spot, mode picker.
3. `docs/mesh/OPERATOR_GUIDE.md` — for room admins: roles, schedules,
   bans, "take the deck".
4. Update `CHANGELOG.md` and root `README.md` "rooms" section.
5. Telemetry: count frames sent/received, anonymized success ratios
   reported via existing telemetry channel (opt-in).

**Acceptance**
- [ ] Lint passes everywhere.
- [ ] All new modules covered by at least smoke tests.
- [ ] Manual run on iOS Safari + Android Chrome + desktop Chrome
  matches the compat matrix from R-0.

---

## 7. Phase dependency graph

```
R-0  ─►  R-1  ─►  R-2  ─►  R-3  ─►  R-4
                          │
                          └─►  R-5 ───┐
                                      │
       W-1 ─┐                         │
            ├──►  Q-1                 │
       W-2 ─┘                         │
                                      │
       W-3.x (any) ────────────────► Q-1
```

R-1 → R-4 is the **critical path** for the mesh story.
W-1, W-2, W-3.x can be parallelized once R-1 ships.

---

## 8. Risk register

| Risk                                                                 | Likelihood | Impact | Mitigation                                                                 |
| -------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------- |
| iOS Safari audio limitations (no `AudioWorklet` in some versions)    | Medium     | High   | R-0 spike on iOS first; ScriptProcessorNode fallback if needed.            |
| `getUserMedia` AGC mangling our tones                                | High       | Medium | Disable AGC: `echoCancellation:false, noiseSuppression:false, autoGainControl:false`. |
| FEC + Goertzel CPU on low-end Android                                 | Medium     | Medium | Mode picker; default to `bfsk300` (lighter); throttle Goertzel cadence.    |
| Vote-driven FM disagreement / abuse                                   | Medium     | Low    | "Take the deck" with poll; per-room mute-vote count throttling.            |
| Legal/regulatory perception                                           | Low        | High   | Disclaimer; we modulate **audio**, the user owns the radio.                |
| Default-rooms become unmoderated wastelands                           | Medium     | Medium | System rooms ship with admin = "system bot"; users can fork to user rooms. |

---

## 9. Open questions for the PO before R-1

1. Should the default system rooms be **deletable by anyone with admin** or
   **only by super-admin**? (Recommendation: super-admin only; admins can
   archive/leave.)
2. Encryption on radio frames in v0.1 — **off** by default for
   interoperability, opt-in per room? (Recommendation: yes — off by default.)
3. Music room sources — **uploads only** for v0.1, or also external URLs?
   (Recommendation: uploads only; URLs in W-2.1.)
4. Parental room — do we want to introduce a **child account type**, or
   model it as a role on a regular account? (Recommendation: role for v0.1,
   account type later.)

---

## 10. Glossary

- **Mesh frame** — the §4.2 binary unit that flows across all transports.
- **Transport** — one concrete way to ship bytes (WS, audio, BLE, QR, …).
- **Router** — frontend module that picks transports and dedups frames.
- **Blueprint** — the per-room-type bundle of widgets + composer + config.
- **Net Control** — the operator running a scheduled session in a radio room.
- **Take the deck** — temporarily disable vote-based driving in FM/Music.
- **QSO** — a logged radio conversation (HAM term we reuse for the log).

---

*End of document — ready to slice into agent tickets.*
