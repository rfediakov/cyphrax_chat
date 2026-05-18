# Phase C — Battery Status & Device Telemetry: Human Test Plan

**Phase:** C — Battery Status & Device Telemetry  
**Branch:** `feature/phase-c-battery-telemetry`  
**Scope:** Battery indicator in map popup / member list / DM panel, real-time telemetry updates, low-battery alert banner, privacy setting, offline queue for telemetry.

---

## Prerequisites

- `docker compose up --build` is running; all services (`mongo`, `redis`, `api`, `frontend`) healthy.
- At least **three** test accounts registered: `alice`, `bob`, `carol`.
- At least one shared room `#family` with all three as members.
- **Browser choice:**
  - Firefox (Nightly or stable) is recommended for C.1 Battery API tests — Chrome on HTTPS no longer supports `navigator.getBattery()`.
  - Chrome is recommended for all other sections (DevTools, PWA, push).
- Mobile device or Chrome DevTools device emulation at **375 px** for mobile layout checks.
- Notification permission granted for at least one browser profile (for low-battery push tests).

---

## C.1 — Battery Indicator Display

### Setup
- Log in as `alice` in Browser A (Firefox).
- Log in as `bob` in Browser B (Chrome or Firefox).
- Both join `#family` room.

### Map popup

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Navigate to `/map`; enable location sharing as `alice` | Alice's marker appears on map |
| 2 | `bob` enables location sharing in `#family` from Browser B | Bob's marker appears on alice's map |
| 3 | Click on `bob`'s marker | Popup opens with bob's name, distance, last updated |
| 4 | Battery indicator present in popup (Firefox with Battery API available) | A small battery shell with coloured fill and percentage label visible (e.g. "75%") |
| 5 | Battery indicator present in popup (Chrome, Battery API unavailable) | Indicator shows battery outline with **"?"** — not a blank space or error |
| 6 | `bob`'s battery level > 50% | Fill bar is **green** |
| 7 | `bob`'s battery level 20–50% | Fill bar is **amber/orange** |
| 8 | `bob`'s battery level < 20% | Fill bar is **red**; percentage label also red |
| 9 | `bob` is charging | A bolt icon (⚡) is overlaid on the battery fill bar |

### Right sidebar — room member list

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open `#family`; open right sidebar | Member list shows `alice`, `bob`, `carol` |
| 2 | Next to `bob`'s name, a small battery indicator is visible (size `sm`) | Battery shell + percentage label rendered; fits on one line without overflow |
| 3 | Battery level colour matches the thresholds in C.1 map popup section | Consistent colouring |
| 4 | If `bob`'s battery info is unavailable (Chrome) | "?" indicator shown instead of empty space |

### DM user panel (right sidebar)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Click on `bob` in the contact list to open a DM | Right sidebar switches to DM user panel |
| 2 | Below `bob`'s online status, a battery indicator (size `md`) is visible | Battery indicator rendered with correct level and colour |
| 3 | While viewing the DM panel, `bob` charges his device (simulate by refreshing bob's page) | Battery indicator updates in alice's DM panel within ~30 s (next telemetry emit) |

---

## C.2 — Real-Time Telemetry Updates

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open `#family` map as `alice`; note `bob`'s battery percentage in his marker popup | A percentage is shown |
| 2 | Simulate a battery level change on `bob`'s device (or wait for 30 s periodic emit) | Alice's view of bob's battery updates without page refresh |
| 3 | Open DevTools → Network → filter for `/api/v1/telemetry` | A `POST` request fires every ~30 s from the active browser |
| 4 | Open DevTools → Network → WS frames | `telemetry_update` socket emit is visible in the outgoing frames |
| 5 | A `telemetry_update` event is received from `bob` | Bob's battery indicator in alice's sidebar updates immediately |

---

## C.3 — Low Battery Alert (< 15%, Discharging)

> **Note:** This test requires a browser/device that supports `navigator.getBattery()` (Firefox) **or** directly calling `POST /api/v1/telemetry` with a low level via DevTools → Console.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Simulate `bob`'s battery dropping below 15% while discharging — run in bob's browser console: `fetch('/api/v1/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer <token>' }, body: JSON.stringify({ battery: { level: 0.08, charging: false, chargingTime: null, dischargingTime: 3600 }, network: { online: true, effectiveType: '4g', downlink: 10, saveData: false }, recordedAt: new Date().toISOString() }) })` | Request returns `200` |
| 2 | `alice`'s browser (backgrounded or in a separate tab) | Alice receives a system push notification: **"Low Battery Warning — Bob's battery is at 8%"** |
| 3 | Battery indicator for `bob` in alice's map popup | Turns **red**; shows "8%" |
| 4 | Repeat step 1 with `charging: true` (bob plugged in) | **No** push notification is sent |
| 5 | Repeat step 1 with `level: 0.2` (20%, above threshold) | **No** push notification sent; indicator shows amber |

---

## C.4 — Privacy Setting (`privacyBattery`)

> Update `privacyBattery` via direct DB change or a settings UI if available; otherwise use the API: `PATCH /api/v1/users/me` with `{ privacyBattery: 'nobody' }` (if endpoint exists) or edit via MongoDB Compass.

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Set `bob`'s `privacyBattery` to `'nobody'` | Battery indicator for `bob` disappears from alice's map popup, sidebar, and DM panel |
| 2 | `alice` calls `GET /api/v1/telemetry/live?roomId=<familyId>` (or observes via UI) | Bob's battery entry is absent |
| 3 | Set `bob`'s `privacyBattery` to `'everyone'` | Battery indicator for `bob` reappears in alice's UI |
| 4 | `carol` (a non-contact of `bob`) with `bob`'s privacy set to `'contacts'` | Carol does not see bob's battery (pending contact-level check implementation) |

---

## C.5 — Offline Queue for Telemetry

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Log in as `alice`; open `#family` | Normal operation |
| 2 | DevTools → Network → tick **Offline** | Offline banner appears in UI |
| 3 | Wait 30 s (for the interval to fire) or trigger a battery/network change | No network error thrown; no console crash |
| 4 | DevTools → Application → **IndexedDB** → `safegroup-offline` → `queue` | One or more records with `type: 'telemetry_update'` appear in the queue |
| 5 | Restore online (untick Offline) | Queued telemetry entries are flushed; `queue` store is empty or only contains other pending actions |
| 6 | Verify `battery:<aliceId>` Redis key exists after reconnect | Key present with TTL ≤ 120 s |

---

## C.6 — `BatteryIndicator` Component States

Open the battery indicator in isolation (e.g. Storybook, or by temporarily rendering it in a page).

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Render `<BatteryIndicator level={0.8} charging={false} />` | Green fill ~80%; no bolt icon; label "80%" in green |
| 2 | Render `<BatteryIndicator level={0.35} charging={false} />` | Amber fill ~35%; label "35%" in amber |
| 3 | Render `<BatteryIndicator level={0.12} charging={false} />` | Red fill ~12%; label "12%" in red |
| 4 | Render `<BatteryIndicator level={0.6} charging={true} />` | Green fill ~60%; bolt icon overlaid; label "60%" |
| 5 | Render `<BatteryIndicator level={null} charging={null} />` | Battery outline with **"?"** label; no crash |
| 6 | Render with `size="sm"` | Visually smaller; fits inline next to a username in the member list |
| 7 | Render with `size="md"` | Larger variant; appropriate for DM panel and profile use |
| 8 | Hover over any indicator | Tooltip shows e.g. "Battery: 80%" or "Battery: 80% (charging)" |

---

## C.7 — Mobile Layout (375 px viewport)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Resize to 375 px; open `#family`; view right sidebar (member list) | Battery indicators fit inline with usernames; no horizontal overflow |
| 2 | Tap a marker on the map (mobile viewport) | Popup appears within viewport; battery indicator visible and not clipped |
| 3 | Open DM panel (tap a contact) | Battery indicator visible below status; no overflow |
| 4 | The "?" state on 375 px | Still fits inline; no layout break |

---

## C.8 — Backend Sanity Checks (Browser DevTools)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | DevTools → Network — observe after page load for `#family` | `GET /api/v1/telemetry/live?roomId=<id>` fires on room load; `200` with telemetry array |
| 2 | Observe the `POST /api/v1/telemetry` request body | Contains `battery`, `network`, `recordedAt` fields |
| 3 | `POST /api/v1/telemetry` with no auth token (DevTools fetch) | `401` response; no telemetry stored |
| 4 | Inspect Redis via `redis-cli GET battery:<aliceId>` after alice's browser posts | JSON blob present; TTL ≤ 120 s |

---

## End-to-End Scenario

**Objective:** Full Phase C user journey for a guardian monitoring a group member.

1. Register `alice` (guardian), `bob` (member), `carol` (member); create room `#family`.
2. Grant push notification permission in `alice`'s browser.
3. `bob` and `carol` open the app in separate browser tabs (Firefox for battery API).
4. `alice` opens `/map`; enables location sharing; `bob` and `carol` do the same.
5. All three markers appear on the map.
6. `alice` clicks `bob`'s marker → popup shows battery indicator with level and colour.
7. `alice` opens the right sidebar → sees battery indicators next to bob and carol in the member list.
8. `alice` opens a DM with `bob` → DM panel shows bob's battery.
9. Simulate `bob`'s battery dropping to 8% discharging (console fetch or Firefox real drain):
   - `alice` receives a push notification "Low Battery Warning — bob's battery is at 8%".
   - Bob's indicator turns red in alice's map popup and sidebar.
10. `alice`'s browser goes offline (DevTools → Offline):
    - Telemetry updates queue in IndexedDB.
    - No crashes.
11. `alice`'s browser goes back online → queue drains → Redis key refreshed.
12. Set `bob`'s `privacyBattery` to `'nobody'` → bob's battery disappears from alice's UI.
13. Restore `privacyBattery` to `'everyone'` → battery reappears.

**Pass criteria:** All steps succeed; battery colours are correct; push notification delivered; privacy setting respected; no console errors; no layout breaks at 375 px.

---

## Acceptance Criteria Checklist

- [ ] Battery indicator visible in map popup for users with telemetry data.
- [ ] Battery indicator visible in right sidebar member list (size `sm`).
- [ ] Battery indicator visible in DM user detail panel (size `md`).
- [ ] Colour states correct: green > 50%, amber 20–50%, red < 20%.
- [ ] Charging bolt icon shown when `charging: true`.
- [ ] "?" rendered when battery level is `null` (API unavailable) — no crash.
- [ ] Battery updates in real-time (within ~30 s) without page refresh.
- [ ] Low battery (< 15%, discharging) push notification received by room members.
- [ ] Charging at low level does **not** trigger push notification.
- [ ] `privacyBattery = 'nobody'` hides battery indicator from all other users' views.
- [ ] Telemetry queued in IndexedDB when offline; drained automatically on reconnect.
- [ ] No horizontal overflow at 375 px in member list, popup, or DM panel.
- [ ] No console errors in any of the above scenarios.
- [ ] `docker compose up` — full application works end-to-end.
