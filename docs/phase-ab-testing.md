# Phase A & B — Human Test Plan

**Phases:** A — PWA Foundation & Offline Support · B — Interactive Map & Real-Time Location  
**Scope:** PWA install, service worker, offline queue, push notifications, Leaflet map, real-time location sharing, location history.

---

## Prerequisites

- `docker compose up --build` is running and all services (`mongo`, `redis`, `api`, `frontend`) are healthy.
- At least **three** test accounts registered: `alice`, `bob`, `carol`.
- At least one shared room created (e.g. `#family`) with all three users as members.
- Browser: Chrome (or Chromium-based) recommended for PWA install and DevTools; Firefox for battery API fallback tests.
- Mobile device or browser DevTools device emulation at **375 px** width for mobile-specific checks.

---

## Phase A — PWA Foundation & Offline Support

### A.1 PWA Manifest & Installability

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open Chrome DevTools → **Application** → **Manifest** | `name: SafeGroup`, `short_name: SafeGroup`, `theme_color: #1e40af`, icons for 192 px and 512 px listed, no manifest errors |
| 2 | In the same panel check `display` | Value is `standalone` |
| 3 | Check `start_url` | Value is `/` |
| 4 | Check `shortcuts` | SOS Alert shortcut listed pointing to `/?sos=1` |
| 5 | DevTools → Application → **Service Workers** | Service worker status is `activated and is running`; no errors |
| 6 | Check the browser address-bar or install chip | "Install SafeGroup" prompt is available (or an in-app install banner is visible) |

### A.2 Service Worker Caching

| # | Step | Expected result |
|---|------|-----------------|
| 1 | DevTools → Application → **Cache Storage** | Caches exist: one for the app shell (JS/CSS/HTML) and one named `osm-tiles` |
| 2 | Load the app normally; navigate to `/map` so tiles load | OSM tile requests appear in the `osm-tiles` cache |
| 3 | DevTools → Network → tick **Offline**; hard-reload | App shell loads from cache; no blank screen |
| 4 | Navigate between routes while offline | Pages render from cache; no "Cannot connect" browser error page |
| 5 | Go back online (untick Offline) | App reconnects; pending socket events resume |

### A.3 Install Banner

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Visit the app in a browser that hasn't installed the PWA | A dismissible top banner appears: "Install SafeGroup for offline access" with an **Install** button |
| 2 | Click **Install** | OS/browser native install prompt appears |
| 3 | Accept the install | App launches in standalone window; no browser chrome visible |
| 4 | Dismiss the banner using the close (×) icon | Banner disappears and does **not** reappear on page refresh (persisted in `localStorage`) |

### A.4 Offline Message Queue (IndexedDB)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Log in as `alice`; open `#family` chat | Chat loads normally |
| 2 | DevTools → Network → tick **Offline** | Offline indicator/banner appears in the UI |
| 3 | Type and send a message in `#family` | Message appears optimistically in the UI; no error thrown |
| 4 | DevTools → Application → **IndexedDB** → `safegroup-offline` → `queue` | The unsent message action appears as a queued record |
| 5 | Go back online (untick Offline) | The queued message is automatically flushed; it appears in `#family` for `bob` and `carol` |
| 6 | Verify the IndexedDB `queue` store is empty after sync | No leftover items |

### A.5 Online/Offline UI Indicator

| # | Step | Expected result |
|---|------|-----------------|
| 1 | While online, inspect the status area | Online indicator/pill is green (or hidden if design omits it) |
| 2 | DevTools → Network → Offline | UI shows an "Offline" banner or status pill with appropriate label |
| 3 | Restore online | Banner/pill reverts; sync happens automatically |

### A.6 Push Notifications

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Log in as `alice`; grant notification permission when prompted | Browser shows a permission request; granting it registers a push subscription |
| 2 | DevTools → Application → **Service Workers** → Push | "Push subscription active" or similar; subscription POSTed to `/api/v1/push/subscribe` (verify in Network tab) |
| 3 | With `alice`'s browser in background (or tab unfocused), have `bob` send a message to `#family` | Alice receives a system push notification |
| 4 | Click the push notification | App opens (or focuses) and navigates to `#family` |
| 5 | Deny notification permission in a separate browser profile | App still functions normally; no console error; no broken UI |

### A.7 Vibration (Mobile / Chrome Android)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open the app on a physical Android device or Chrome with vibration support | No errors in console related to vibration |
| 2 | Trigger an action that calls `vibrateShort()` (e.g. send a message or tap a button with haptic feedback) | Device vibrates briefly (~50 ms) |
| 3 | On a desktop browser where vibration is unsupported | No JS error; `navigator.vibrate?.()` call is silently skipped |

### A.8 Network Status Store

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open browser DevTools → Network → change throttle to **Slow 3G** | `connectionType` in the app reflects a slower network (e.g. `"2g"` or `"3g"` in the network pill/store) |
| 2 | Switch to **No throttling** | Type updates accordingly |
| 3 | Toggle Offline on/off | `isOnline` state toggles; UI reflects each change within 1 s |

---

## Phase B — Interactive Map & Real-Time Location

### B.1 Map Page Renders

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Log in as `alice`; click **Map** in the bottom navigation | `/map` route loads; full-screen Leaflet map visible |
| 2 | Pan and zoom the map | Smooth interaction; OSM tiles load; attribution "© OpenStreetMap" visible |
| 3 | Zoom to level 19 | Tiles still load; no console errors |
| 4 | Inspect the top bar | Room selector dropdown and a **Share: ON/OFF** toggle are visible |

### B.2 Geolocation Permission & Self Marker

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Click **Share: OFF** to enable sharing | Browser requests geolocation permission |
| 2 | Grant permission | Toggle switches to **ON**; alice's avatar marker appears on the map at her current location |
| 3 | An accuracy circle is rendered around alice's marker | Semi-transparent circle visible; radius changes as GPS accuracy improves |
| 4 | Alice's marker has her username label | Username `alice` visible beneath/above the avatar |
| 5 | Deny geolocation permission | Toggle reverts to OFF; no crash; a human-readable error message or banner is shown |

### B.3 Real-Time Location Sharing — Multi-User

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Log in as `bob` on a second device/browser tab; enable location sharing in `#family` | Bob's avatar marker appears on alice's map (and vice versa) without page refresh |
| 2 | Physically move (or simulate movement via DevTools → **Sensors** → Geolocation) | Markers update on the other user's map within ~3–5 s |
| 3 | Check throttling: emit only on ≥ 5 m change OR 30 s elapsed | Open DevTools → Network → WS frames; verify `location_update` is not sent more often than once per 30 s when stationary |
| 4 | Turn off sharing for `bob` (toggle OFF) | Bob's marker is removed from alice's map |
| 5 | `carol` joins the room and enables sharing | Carol's marker appears on both alice's and bob's maps |

### B.4 Location Update Socket Events

| # | Step | Expected result |
|---|------|-----------------|
| 1 | DevTools → Network → WS → filter by `location` | `location_update` frames sent from client; `location_batch` frames received from server |
| 2 | Verify `location_batch` payload | Contains `updates` array with `{ userId, lat, lng, accuracy, recordedAt }` |
| 3 | Server batching: multiple rapid updates from a user | Only one `location_batch` event per ≤ 500 ms window arrives at client |

### B.5 User Popup on Marker Click

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Click on `bob`'s marker on alice's map | A popup appears above the marker |
| 2 | Popup contains: avatar, username, online status, distance, last updated timestamp | All fields present and readable |
| 3 | Battery level shown (if bob has battery sharing enabled) | Battery percentage with coloured indicator |
| 4 | Speed shown if bob is moving | Speed in km/h present |
| 5 | **Message** button in popup | Clicking it navigates to the DM with bob |
| 6 | **Call** button in popup (placeholder for Phase F) | Button visible; may be disabled or show "coming soon" |

### B.6 Privacy Settings Enforcement

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Set alice's location privacy to `nobody` | Alice's marker disappears from all other users' maps; alice no longer receives her own broadcasts back |
| 2 | Set alice's location privacy to `contacts` | Only users who are alice's contacts see her marker |
| 3 | Set alice's location privacy to `everyone` | All room members see alice's marker |
| 4 | Verify server-side filtering: check API response for `/api/v1/location/live?roomId=...` as a non-contact user | Alice's location entry is absent from the response payload |

### B.7 Location History Panel

| # | Step | Expected result |
|---|------|-----------------|
| 1 | On the Map page, click the **History** button | A slide-up drawer or side panel opens |
| 2 | Alice's past locations for today are listed with timestamps | At least the locations recorded during this test session appear |
| 3 | Entries are sorted by time (newest first or chronologically with a timeline) | Correct ordering |
| 4 | Replay button (if implemented) | Marker animates along historical path |

### B.8 Backend — Location API

| # | Step | Expected result |
|---|------|-----------------|
| 1 | `POST /api/v1/location` with valid `{ lat, lng, accuracy, roomId }` as authenticated user | `201` response; location stored |
| 2 | `GET /api/v1/location/live?roomId=<id>` | Returns array of latest locations for visible room members |
| 3 | `GET /api/v1/location/history` with date range query params | Returns paginated location history |
| 4 | `PATCH /api/v1/location/sharing` with `{ active: false }` | Sharing stops; subsequent live query omits user |
| 5 | Redis: inspect `loc:<userId>` key after a location update | Key exists with TTL ≤ 300 s; value contains latest lat/lng |
| 6 | MongoDB persistence: after 30 s of sharing, query `locations` collection | At least one document stored (not every update, only ~30 s snapshots) |

### B.9 Offline Location Queue

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Enable location sharing as alice; DevTools → Network → Offline | Sharing toggle remains ON; no crash |
| 2 | Simulate movement (DevTools Sensors) while offline | `location_update` actions accumulate in IndexedDB `queue` store |
| 3 | Go back online | Queued location updates are flushed to the server; they appear in location history |

### B.10 Mobile Layout — Map

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Resize to 375 px viewport (or use a physical phone) | Map fills the screen; top bar and bottom nav don't overlap the map |
| 2 | Tap a marker | Popup appears within viewport; not clipped off-screen |
| 3 | Bottom navigation is visible below the map | All nav items (Map, Chat, Contacts, Profile) accessible without scrolling |
| 4 | Share toggle is reachable in the top bar on small screens | No overflow; toggle fits within 375 px |

---

## End-to-End Scenario — Phases A & B Together

**Objective:** Verify PWA offline resilience combined with real-time location sharing.

1. Register `alice`, `bob`, `carol`; create room `#family` with all three.
2. Install the PWA on a mobile browser (or emulate).
3. `alice` enables location sharing in `#family`; `bob` and `carol` do the same.
4. All three markers appear on each user's map with usernames.
5. Take `alice`'s device offline (airplane mode / DevTools Offline):
   - Location sharing stops emitting to server (queued locally).
   - Offline banner appears in the UI.
   - `alice` sends a chat message — it queues in IndexedDB.
6. Restore `alice`'s connection:
   - Queued message appears in `#family` chat for `bob` and `carol`.
   - Location marker resumes updating.
   - IndexedDB queue is empty.
7. `bob` disables sharing — his marker disappears from others' maps.
8. `alice` opens **History** panel — sees her own location trail including the gap during offline period.
9. `alice` receives a push notification when `carol` sends a message while alice's tab is backgrounded.
10. `alice` clicks the notification — app focuses and navigates to `#family`.

**Pass criteria:** All steps succeed; no console errors; no broken UI; markers update in real-time; offline queue drains on reconnect.

---

## Acceptance Criteria Checklist

### Phase A

- [ ] PWA manifest present with correct name, icons, `display: standalone`, SOS shortcut.
- [ ] Service worker activates; app shell cached; OSM tiles cached in `osm-tiles` cache.
- [ ] App loads and navigates routes while fully offline.
- [ ] Install banner appears and triggers native install prompt; dismissal persists.
- [ ] Offline actions (messages) queue in IndexedDB and flush automatically on reconnect.
- [ ] Online/offline UI indicator updates within 1 s of network change.
- [ ] Push notification permission flow works; notifications received when app is backgrounded.
- [ ] Vibration utility runs without errors on supported devices; silently skips on unsupported.
- [ ] `docker compose up` — full application works end-to-end.

### Phase B

- [ ] `/map` route renders full-screen Leaflet map with OSM tiles and attribution.
- [ ] Bottom navigation includes Map tab; accessible from all pages.
- [ ] Geolocation starts/stops correctly with the Share toggle.
- [ ] Self marker (avatar + username + accuracy circle) appears on map when sharing.
- [ ] Other users' markers appear and update in real-time via `location_batch` socket events.
- [ ] Location updates throttled: no more than once per 30 s when stationary.
- [ ] Clicking a marker opens popup with username, status, distance, battery, speed, last updated.
- [ ] Privacy settings enforced server-side: `nobody` / `contacts` / `everyone` filters work.
- [ ] Location history panel lists past locations with timestamps.
- [ ] Redis cache `loc:{userId}` set with TTL 300 s on every update.
- [ ] MongoDB stores location snapshots every ~30 s (not every raw update).
- [ ] Offline location updates queue in IndexedDB and flush on reconnect.
- [ ] Map layout is usable on 375 px mobile viewport; popups stay within viewport.
- [ ] `docker compose up` — full application works end-to-end.
