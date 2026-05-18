# Test Plan — Phase H: Privacy Settings & Parental Controls

**Branch:** `feature/phase-h-privacy-settings`  
**Scope:** Settings page (all tabs), privacy middleware, restricted mode, geofences, guardian management.

---

## 1. Pre-conditions

- App is running (`docker compose up --build` or equivalent).
- At least **two** registered accounts are available:
  - `guardian_user` — acts as guardian
  - `child_user` — will have restricted mode enabled

---

## 2. Human Tester Checklist

### 2.1 Navigation & Layout

| # | Step | Expected |
|---|------|----------|
| H1 | Open the app on mobile (viewport ≤ 768 px) | Bottom navigation shows Chat, Map, Contacts, **Settings**, Profile icons |
| H2 | Tap **Settings** in bottom nav | Navigates to `/settings` without full reload |
| H3 | Observe the tab bar | Six tabs visible: Account, Privacy, Notifications, Location, Safety, Parental |
| H4 | Swipe / scroll the tab bar on a narrow screen | All tabs reachable horizontally, no clipping |
| H5 | Navigate back to Chat via the Cyphrax logo | Returns to `/` |

---

### 2.2 Privacy Tab

| # | Step | Expected |
|---|------|----------|
| P1 | Open **Privacy** tab | Five rows visible: Location visibility, Battery visibility, Online status, Last seen, Profile visible to |
| P2 | Change **Location visibility** from `Nobody` → `Contacts only` | Dropdown updates; page shows new value immediately after save |
| P3 | Reload the page | Selected values persist (fetched from server) |
| P4 | Change **Profile visible to** → `Everyone` | Saved without error |
| P5 | Open DevTools / Network; verify the `PATCH /api/v1/privacy` request body | Contains only the changed field (partial update) |

---

### 2.3 Notifications Tab

| # | Step | Expected |
|---|------|----------|
| N1 | Open **Notifications** tab | All toggles visible; **SOS alerts** row shows 🔒 and cannot be toggled |
| N2 | Toggle **New messages** off | Toggle animates to grey; `PATCH /api/v1/privacy/notifications` called |
| N3 | Toggle **New messages** back on | Toggle animates to blue |
| N4 | Toggle **Push notifications** off | Other toggles remain unaffected |
| N5 | Reload | Notification preferences persist |

---

### 2.4 Location Tab

| # | Step | Expected |
|---|------|----------|
| L1 | Open **Location** tab | Share location toggle and Location history dropdown visible |
| L2 | Toggle **Share location** on | Toggle turns blue; `PATCH /api/v1/privacy/location` called |
| L3 | Change **Location history** to `90 days` | Saved; value persists on reload |
| L4 | Toggle **Share location** off | Toggle returns to grey |

---

### 2.5 Safety Tab

| # | Step | Expected |
|---|------|----------|
| S1 | Open **Safety** tab | SOS Message Presets section, Auto-SOS section, Emergency Contacts link visible |
| S2 | Type `I need help` in the preset field and click **Add** | Preset appears in the list; text field clears |
| S3 | Add 4 more presets (total 5) | **Add** button / input field disappears after 5th preset |
| S4 | Remove the first preset via the ✕ button | List updates immediately; persisted on reload |
| S5 | Toggle **Auto-SOS on inactivity** on | Hours dropdown appears |
| S6 | Change hours to `4` | Saved; `PATCH /api/v1/privacy/safety` payload has `autoSosThresholdHours: 4` |
| S7 | Toggle **Auto-SOS** off | Hours dropdown disappears |

---

### 2.6 Parental Tab

| # | Step | Expected |
|---|------|----------|
| PR1 | Open **Parental** tab | Yellow warning box, Restricted Mode section, Guardians section, Geofence Zones section visible |
| PR2 | Click **+ Add zone** | Inline form appears with Name, Lat, Lng, Radius, exit/entry checkboxes |
| PR3 | Fill in: Name=`Home`, Lat=`51.5`, Lng=`-0.12`, Radius=`200` (exit alert checked) → **Save zone** | Zone card appears in the list; form closes |
| PR4 | Reload | Zone persists |
| PR5 | Delete the zone via ✕ | Zone removed from list and database |
| PR6 | Add a zone with radius `5` | Error message from server (min 10 m) or frontend validation prevents submit |

---

### 2.7 Restricted Mode End-to-End

Requires two browser sessions (guardian + child).

| # | Step | Expected |
|---|------|----------|
| RM1 | As `guardian_user`: call `POST /api/v1/privacy/guardians/<child_user_id>` | Returns `{ ok: true }` — guardian linked |
| RM2 | As `guardian_user`: call `PATCH /api/v1/privacy/restricted-mode` with `{ targetUserId: "<child_user_id>", enabled: true }` | Returns `{ ok: true, restrictedMode: true }` |
| RM3 | As `child_user`: reload the Settings page | Yellow **"Parental controls active"** sticky banner appears at the very top |
| RM4 | As `child_user`: open **Privacy** tab | Yellow lock warning message; all dropdowns disabled |
| RM5 | As `child_user`: open **Location** tab | Yellow lock warning message; Share location toggle is locked |
| RM6 | As `child_user`: try `PATCH /api/v1/privacy` directly (e.g. via curl/Postman) | `403 Forbidden` — "Cannot change privacy settings in restricted mode" |
| RM7 | As `child_user`: try `PATCH /api/v1/privacy/location` directly | `403 Forbidden` |
| RM8 | As `guardian_user`: disable restricted mode | `child_user` receives `restricted_mode_changed` socket event; banner disappears on next load |
| RM9 | As `child_user`: Privacy and Location tabs are editable again | Confirmed |

---

### 2.8 Geofence Alerts

| # | Step | Expected |
|---|------|----------|
| GF1 | Add a geofence zone at the user's current lat/lng with radius `50` m, **exit alert** enabled | Zone saved |
| GF2 | Post a location update from inside the zone | No geofence event emitted |
| GF3 | Post a location update outside the zone (distance > 50 m) | Server emits `geofence_exit` socket event to the user and any linked guardians |
| GF4 | Enable **entry alert** on a zone; post location from outside, then inside | Server emits `geofence_entry` socket event |

---

## 3. Agent (Automated) Test Checklist

The following HTTP/socket scenarios can be scripted against the running backend.

### 3.1 Privacy API

```
GET  /api/v1/privacy/me                             → 200, full settings object
PATCH /api/v1/privacy  { privacyLocation: "everyone" }  → 200, field updated
PATCH /api/v1/privacy  { privacyLocation: "invalid" }   → 400 Bad Request
PATCH /api/v1/privacy/notifications { pushEnabled: false } → 200
PATCH /api/v1/privacy/safety { sosMessagePresets: ["Help!"] } → 200
PATCH /api/v1/privacy/location { locationSharingActive: true } → 200
```

### 3.2 Restricted Mode Enforcement

```
# Setup: add guardian, enable restricted mode
POST  /api/v1/privacy/guardians/:childId            → 200 (as guardian)
PATCH /api/v1/privacy/restricted-mode { targetUserId, enabled: true } → 200

# Attempt to change privacy settings as child
PATCH /api/v1/privacy (as child)                    → 403
PATCH /api/v1/privacy/location (as child)           → 403

# Non-guardian cannot enable restricted mode
PATCH /api/v1/privacy/restricted-mode (as random user) → 403
```

### 3.3 Geofences API

```
POST  /api/v1/privacy/geofences { name, lat, lng, radiusMetres: 100 } → 201
POST  /api/v1/privacy/geofences { radiusMetres: 5 }  → 400 (min 10)
GET   /api/v1/privacy/geofences                     → 200 { geofences: [...] }
DELETE /api/v1/privacy/geofences/:id                → 200
```

### 3.4 Guardian Permissions

```
# Guardian not linked cannot set restricted mode on a user
PATCH /api/v1/privacy/restricted-mode { targetUserId: <other>, enabled: true }
  → 403 "You are not a guardian of this user"

# Guardian can add geofence to child
POST /api/v1/privacy/geofences { ..., targetUserId: <childId> }  → 201 (as guardian)

# Non-guardian cannot add geofence to another user
POST /api/v1/privacy/geofences { ..., targetUserId: <childId> }  → 403 (as random)
```

### 3.5 Geofence Exit/Entry Events (Socket)

```
# Connect to socket as child and guardian
# Set up geofence at (51.5, -0.12), radius 100m

# POST location inside zone (51.5001, -0.1200)
  → no geofence_exit event

# POST location outside zone (51.4995, -0.1250)
  → child socket receives: geofence_exit { zoneName, userId, lat, lng }
  → guardian socket receives: geofence_exit { ... }
```

### 3.6 Location Privacy Filtering

```
# User A: privacyLocation = "nobody"
# User B queries GET /api/v1/location/live?roomId=<shared room>
  → User A's location NOT in response

# User A: privacyLocation = "everyone"
# User B queries again
  → User A's location IS in response
```

---

## 4. Regression Checklist

After merging Phase H, verify these existing features still work:

- [ ] Login / register / logout
- [ ] Chat messaging in rooms and DMs
- [ ] Live location sharing on Map page
- [ ] SOS button visible at all times (not hidden by new UI)
- [ ] Battery telemetry updates
- [ ] Call flow (incoming/active overlay)
- [ ] Offline sync banner
- [ ] Push notification subscription

---

## 5. Known Limitations / Future Work

- **Guardian linking** currently requires an API call; a UI flow (invite link / QR code) is future work.
- **Contacts check** in `canViewField` (privacy middleware) uses guardian/emergency lists as proxy — full mutual-contact check should be wired once the contacts model is stable.
- **Map geofence circles** (visual overlay for guardians) is noted in the spec but deferred to a follow-up.
- **Auto-SOS background service** (PWA service worker) requires Phase I infrastructure; the settings are persisted but the trigger logic is not yet implemented.
