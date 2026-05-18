# Phase I — Remote Camera / Mic Access — Test Plan

**Branch:** `phase-i-remote-camera`  
**Date:** 2026-05-18  
**Audience:** Human testers and agent test runners

---

## Prerequisites

- `docker compose up --build` completes without errors
- Two browser tabs (or devices) are logged into different accounts
- Account A has Account B listed in its `guardianIds` (Account A is a guardian of Account B)

To set up the guardian relationship via API (or use the Parental tab in Settings):
```bash
# Account A calls this to register as guardian of Account B
curl -X POST http://localhost:3000/api/v1/privacy/guardians/<Account_B_id> \
  -H "Authorization: Bearer <Account_A_token>"
```

---

## 1. Automated Unit Tests

Run the test suite in the `backend/` directory:

```bash
cd backend
npm test
```

**Expected:** 8 tests pass, 0 failures.

Tests cover:
- `isGuardianOf` — correctly identifies guardian relationships, returns false for invalid IDs or missing users
- `logDeniedRequest` — persists log entry with `consentGiven: false`
- `logAllowedRequest` — persists log entry with `consentGiven: true`, correct duration and timestamps
- `closeAccessLog` — updates `sessionEndedAt` and `endedBy` for the most recent open session

---

## 2. Manual Test Cases

### T-I-01: Guardian requests remote view — child denies

**Steps:**
1. Log in as Account A (guardian) in Tab 1
2. Log in as Account B (child/ward) in Tab 2
3. Tab 1: Open the Map page → click **👨‍👩‍👧 Family** button
4. Tab 1: Locate Account B in the Family panel → click **📹 View**
5. Tab 2: A full-screen consent modal appears

**Verify in Tab 2:**
- [ ] Modal is full-screen with highest z-index
- [ ] Guardian name is displayed correctly
- [ ] Countdown timer starts at 30 and decreases every second
- [ ] [DENY] button is prominently styled (red, bold)
- [ ] Two allow buttons: "Allow 1 min" and "Allow 5 min"

6. Tab 2: Click **DENY**

**Verify:**
- [ ] Tab 2: Modal dismisses immediately
- [ ] Tab 1: Toast notification says "Remote view request was denied"
- [ ] Tab 1: The 📹 View button does not show "Viewing"
- [ ] DB: `RemoteAccessLog` entry created with `consentGiven: false`, `endedBy: null`

---

### T-I-02: Guardian requests remote view — auto-deny (30-second timeout)

**Steps:**
1. Tab 1 (guardian): Click **📹 View** in Family panel
2. Tab 2 (child): Consent modal appears — do NOT click any button
3. Wait 30 seconds

**Verify:**
- [ ] Tab 2: Modal auto-closes after 30 seconds without user action
- [ ] Tab 1: Toast notification says "Remote view request timed out (no response)"
- [ ] DB: `RemoteAccessLog` entry with `consentGiven: false`

---

### T-I-03: Deny cooldown prevents immediate re-request

**Steps:**
1. Tab 2 (child): Deny a request (or let it time out)
2. Tab 1 (guardian): Immediately try to request again

**Verify:**
- [ ] Tab 1: Error toast appears with message "Request blocked — cooldown active for X more minute(s)"
- [ ] The block lasts approximately 5 minutes after denial

---

### T-I-04: Child allows 1-minute remote view — guardian sees live feed

**Steps:**
1. Tab 1 (guardian): Click **📹 View** in Family panel
2. Tab 2 (child): Click **Allow 1 min**

**Verify in Tab 2:**
- [ ] Consent modal closes
- [ ] Orange banner appears at the top: "👤 [Guardian name] is viewing your camera [Stop Now]"
- [ ] Banner cannot be dismissed except via **Stop Now**
- [ ] Device vibrates (if supported)

**Verify in Tab 1:**
- [ ] Full-screen guardian view modal opens
- [ ] Loading spinner shown while WebRTC connects
- [ ] Video stream from child's camera appears within a few seconds
- [ ] Header shows ward's name, "Live camera" label, and "1min left" countdown
- [ ] "End view" button is visible

**Verify after ~60 seconds:**
- [ ] Tab 1 and Tab 2: Session auto-ends
- [ ] Toast notification: "Remote view session ended (time limit reached)"
- [ ] DB: `sessionEndedAt` and `endedBy: 'timeout'` recorded

---

### T-I-05: Child allows 5-minute remote view — guardian ends session

**Steps:**
1. Tab 1 (guardian): Click **📹 View**
2. Tab 2 (child): Click **Allow 5 min**
3. Tab 1: Wait for video feed to appear, then click **End view**

**Verify:**
- [ ] Tab 1: Guardian modal closes
- [ ] Tab 2: Orange banner disappears
- [ ] DB: `endedBy: 'requester'` recorded

---

### T-I-06: Child stops the session using the banner

**Steps:**
1. Start a remote view session (Tab 2 child allows)
2. Tab 2: Click **Stop Now** on the orange banner

**Verify:**
- [ ] Tab 2: Banner disappears, camera stream stops
- [ ] Tab 1: Guardian modal closes
- [ ] Toast appears: "Remote view session ended"
- [ ] DB: `endedBy: 'target'` recorded

---

### T-I-07: Child disconnects during session

**Steps:**
1. Start a remote view session
2. Tab 2 (child): Close the browser tab or disconnect Wi-Fi

**Verify:**
- [ ] Tab 1: Guardian modal closes within a few seconds
- [ ] DB: `endedBy` is set (either 'target' or 'timeout')

---

### T-I-08: Non-guardian cannot request remote view

**Steps:**
1. Log in as Account C (not a guardian of Account B)
2. Manually emit the socket event from browser console:
   ```js
   socket.emit('remote_view_request', { targetUserId: '<Account_B_id>' })
   ```

**Verify:**
- [ ] Account C receives `remote_view_error` event with "You are not a guardian of this user."
- [ ] Account B does NOT receive a consent modal

---

### T-I-09: Access history visible in Settings

**Steps:**
1. After completing any T-I-01 through T-I-07 test
2. Log in as either Account A or Account B
3. Navigate to Settings → Privacy tab
4. Scroll to "Remote Access History" section
5. Click **Show history**

**Verify:**
- [ ] Table of access log entries appears
- [ ] Each entry shows: requester name, target name, date/time, "Allowed"/"Denied" badge
- [ ] Denied entries have a red "Denied" badge
- [ ] Allowed entries show duration and who ended the session
- [ ] **Hide history** button collapses the list

---

### T-I-10: Family dashboard shows correct ward status

**Steps:**
1. Log in as Account A (guardian) and navigate to Map
2. Click **👨‍👩‍👧 Family**

**Verify:**
- [ ] Account B appears in the list
- [ ] Online/offline indicator matches Account B's actual connection state
- [ ] If Account B has telemetry enabled, battery % is shown
- [ ] 🔒 icon appears if Account B is in restricted mode
- [ ] **💬 Msg** button navigates to Account B's dialog

---

### T-I-11: Restricted mode user — consent still required

**Steps:**
1. Enable restricted mode on Account B (via guardian dashboard or API)
2. Tab 1 (guardian): Request remote view

**Verify:**
- [ ] Account B still receives the consent modal
- [ ] Account B can still deny

---

### T-I-12: docker compose up still passes

```bash
docker compose down && docker compose up --build
```

**Verify:**
- [ ] All containers start successfully (backend, frontend, mongo, redis)
- [ ] No compilation errors in backend TypeScript
- [ ] Frontend Vite build succeeds

---

## 3. Agent-Executable Checks

The following checks can be run programmatically by an agent:

### A-I-01: Unit tests pass
```bash
cd backend && npm test -- --no-coverage
# Expected: Tests: 8 passed, 8 total
```

### A-I-02: Backend TypeScript compiles
```bash
cd backend && npx tsc --noEmit
# Expected: exit code 0
```

### A-I-03: Frontend TypeScript compiles
```bash
cd frontend && npx tsc --noEmit
# Expected: exit code 0
```

### A-I-04: Remote routes respond with 401 for unauthenticated requests
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/remote/wards
# Expected: 401
```

### A-I-05: Remote routes respond with 200 for authenticated guardian
```bash
# Obtain a valid JWT, then:
curl -s http://localhost:3000/api/v1/remote/wards \
  -H "Authorization: Bearer <token>"
# Expected: {"wards": [...]}
```

### A-I-06: Access log endpoint returns correct shape
```bash
curl -s http://localhost:3000/api/v1/remote/access-log \
  -H "Authorization: Bearer <token>"
# Expected: {"logs": [...]}
```

---

## 4. Acceptance Criteria Checklist

From the Phase I spec:

- [ ] `remote_view_request` socket event relays to child with guardian name
- [ ] Full-screen consent modal with 30s auto-deny
- [ ] Deny cooldown (5 min) persisted in Zustand/localStorage
- [ ] Active viewing banner with [Stop] button on child's screen
- [ ] Banner vibrates every 60s as a reminder
- [ ] WebRTC stream: child cam → guardian (one-way video, guardian recvonly)
- [ ] Guardian family dashboard panel on Map page
- [ ] Remote access audit log written to MongoDB on every request
- [ ] Access history visible in Settings → Privacy → Remote Access History
- [ ] Restricted mode users can be viewed by guardians (consent modal still appears)

---

## 5. Known Limitations / Out of Scope for Phase I

- Screen share option (mentioned in spec I.4) — deferred
- Push notification on remote view request when app is in background — deferred
- Guardian dashboard shows telemetry battery only if `useTelemetry` is running on the ward's device
- ICE/TURN server configuration is inherited from Phase F call infrastructure
