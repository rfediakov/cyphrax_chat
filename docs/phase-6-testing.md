# Phase 6 — Frontend Foundation: Test Plan

**Phase:** 6  
**Agent:** Frontend Foundation Agent  
**Date:** 2026-04-19  
**Prerequisites:** Phase 5 accepted. `docker compose up` running with all containers healthy.

---

## Environment Setup

```bash
# Start full stack
docker compose up --build

# Or for frontend dev only (backend running separately on host)
cd frontend && npm run dev
```

Frontend dev server: `http://localhost:5173`  
Production (via Docker): `http://localhost:3000`

---

## 1. Build Verification

### 1.1 TypeScript + Vite build

```bash
cd frontend && npm run build
```

**Expected:** `✓ built in <N>ms` with no TypeScript errors and no Vite warnings that indicate broken imports.

---

## 2. Zustand Stores

### 2.1 Auth store persistence

1. Open the app at `/login`.
2. Log in with valid credentials.
3. Hard-refresh the page (`Ctrl+Shift+R`).
4. Open browser DevTools → Application → Local Storage.
5. Confirm `auth-storage` key exists with `user` object (no `accessToken` — token is not persisted for security).
6. Confirm you are NOT redirected to `/login` (token refresh flow keeps session alive via cookie).

### 2.2 Chat store reactivity

1. After logging in, open browser console.
2. Run:
   ```js
   window.__chatStore = (await import('/src/store/chat.store.ts')).useChatStore;
   window.__chatStore.getState().setRooms([{ _id: 'test', name: 'TestRoom', isPrivate: false, owner: 'u1' }]);
   ```
3. Confirm no JS errors. The store should update without page reload.

### 2.3 Presence store

1. Open browser console after login.
2. Run:
   ```js
   import('/src/store/presence.store.ts').then(m => m.usePresenceStore.getState().setStatus('user123', 'online'));
   ```
3. Confirm `statuses['user123'] === 'online'`.

---

## 3. Axios API Layer

### 3.1 Request interceptor — token injection

1. Open DevTools → Network tab.
2. Trigger any API call (e.g., navigate to `/` after login).
3. Inspect request headers.
4. **Expected:** `Authorization: Bearer <token>` header is present.

### 3.2 Response interceptor — 401 refresh flow

1. In DevTools Application → Local Storage, clear the `auth-storage` key.
2. Manually expire the access token by waiting 15 minutes (or use DevTools to mock a 401).
3. Trigger an API call.
4. **Expected:**
   - A `POST /api/v1/auth/refresh` request fires automatically.
   - The original request is retried with the new token.
   - You remain on the current page (no forced redirect to `/login`).

### 3.3 Refresh failure redirects to login

1. Clear all cookies (delete the `refreshToken` HttpOnly cookie via DevTools if accessible, or wait for it to expire).
2. Force a 401 by manually clearing the access token in storage.
3. Trigger an API call.
4. **Expected:** Redirected to `/login`.

---

## 4. Socket.IO Client Hook

### 4.1 Connection on login

1. Open DevTools → Network → WS filter.
2. Log in with valid credentials.
3. **Expected:** A WebSocket connection to `/socket.io/` is established.
4. Browser console should log: `[Socket] connected <socketId>`.

### 4.2 Disconnection on logout

1. While connected, click "Sign out" (or call `useAuth().logout()` from console).
2. **Expected:** WebSocket closes. `[Socket] disconnected` logged to console.

### 4.3 Token change triggers reconnect

1. Log in as user A.
2. Observe WebSocket connected.
3. Refresh token manually (force a 401).
4. **Expected:** Hook disconnects old socket and reconnects with the new token without a page reload.

### 4.4 Incoming `message` event

Using two browser tabs:

1. Tab A: logged in as user A, viewing a room.
2. Tab B: logged in as user B, send a message to the same room via the API:
   ```bash
   curl -X POST http://localhost:3001/api/v1/rooms/<roomId>/messages \
     -H "Authorization: Bearer <tokenB>" \
     -H "Content-Type: application/json" \
     -d '{"content":"Hello from user B"}'
   ```
3. **Expected in Tab A:** `appendMessage` is called. If Tab A is not viewing that room, `incrementUnread` is called.

### 4.5 Incoming `presence` event

1. Log in as user A in Tab A and user B in Tab B.
2. Verify Tab A receives presence updates from `evaluatePresence` on the backend.
3. Open DevTools console in Tab A, run:
   ```js
   import('/src/store/presence.store.ts').then(m => console.log(m.usePresenceStore.getState().statuses));
   ```
4. **Expected:** User B's `_id` appears with status `'online'`.

---

## 5. React Router

### 5.1 Unauthenticated access guard

| Test | Action | Expected |
|------|--------|----------|
| No token | Navigate to `http://localhost:5173/` | Redirect to `/login` |
| No token | Navigate to `http://localhost:5173/sessions` | Redirect to `/login` |
| No token | Navigate to `http://localhost:5173/profile` | Redirect to `/login` |

### 5.2 Authenticated redirect from public routes

| Test | Action | Expected |
|------|--------|----------|
| Logged in | Navigate to `/login` | Redirect to `/` |
| Logged in | Navigate to `/register` | Redirect to `/` |

### 5.3 Wildcard catch-all

1. Navigate to `http://localhost:5173/some/random/path`.
2. **Expected:** Redirected to `/` (then to `/login` if not authenticated).

---

## 6. Login Page

### 6.1 Successful login

1. Navigate to `/login`.
2. Enter valid email and password.
3. Click "Sign in".
4. **Expected:**
   - Request `POST /api/v1/auth/login` returns 200.
   - `auth.store.setAuth(token, user)` called.
   - Redirected to `/`.

### 6.2 Invalid credentials

1. Navigate to `/login`.
2. Enter wrong password.
3. Click "Sign in".
4. **Expected:** Red error banner displays the API error message. No redirect.

### 6.3 Mobile layout (375 px)

1. Open DevTools → Device toolbar → set to 375 × 667 (iPhone SE).
2. Navigate to `/login`.
3. **Expected:**
   - Form is fully visible without horizontal scroll.
   - Input fields are full-width.
   - "Sign in" button is full-width.
   - "Forgot password?" link is reachable by tap.

---

## 7. Register Page

### 7.1 Successful registration

1. Navigate to `/register`.
2. Enter unique email, username, password, confirm password.
3. Click "Create account".
4. **Expected:**
   - `POST /api/v1/auth/register` returns 201.
   - Logged in and redirected to `/`.

### 7.2 Password mismatch validation

1. Enter password `abc12345` and confirm `abc12346`.
2. Click "Create account".
3. **Expected:** Client-side error "Passwords do not match." No API call made.

### 7.3 Duplicate email/username

1. Try to register with an already-used email.
2. **Expected:** Red error banner with `409 Conflict` message from API.

### 7.4 Mobile layout

Same criteria as section 6.3 applied to `/register`.

---

## 8. ForgotPassword Page

### 8.1 Submit known email

1. Navigate to `/forgot-password`.
2. Enter a registered email.
3. Click "Send reset link".
4. **Expected:**
   - `POST /api/v1/auth/password/reset-request` returns 200.
   - Form is replaced by a confirmation message.
   - API console (backend logs) shows the reset URL.

### 8.2 Submit unknown email (best-effort — no leakage)

1. Enter a non-existent email.
2. Click "Send reset link".
3. **Expected:** Same confirmation message shown (no disclosure of whether email exists).

### 8.3 Missing token redirect

1. Navigate directly to `/reset-password` (no `?token=` param).
2. **Expected:** Error message "Invalid or missing reset token." with link to request a new one.

---

## 9. ResetPassword Page

### 9.1 Valid token — password reset

1. Obtain a reset token from the API console log.
2. Navigate to `/reset-password?token=<token>`.
3. Enter new password and confirm.
4. Click "Set new password".
5. **Expected:**
   - `POST /api/v1/auth/password/reset` returns 200.
   - Redirected to `/login`.
   - Old password no longer works; new password works.

### 9.2 Expired or invalid token

1. Navigate to `/reset-password?token=invalidtoken`.
2. Submit.
3. **Expected:** Red error banner with message from API (e.g., "Invalid or expired token").

### 9.3 Password mismatch

1. Enter different passwords in the two fields.
2. Click "Set new password".
3. **Expected:** Client-side error "Passwords do not match." No API call made.

---

## 10. Auth Hooks

### 10.1 useAuth — currentUser populated after login

```js
// In browser console after login
import('/src/hooks/useAuth.ts').then(m => console.log(m.useAuth())); // won't work directly
// Instead check store:
import('/src/store/auth.store.ts').then(m => console.log(m.useAuthStore.getState().user));
```

**Expected:** `{ _id, username, email }` object.

### 10.2 usePresence — getStatus fallback

```js
import('/src/hooks/usePresence.ts').then(m => {
  const { getStatus } = m.usePresence();
  console.log(getStatus('nonexistentId')); // Expected: 'offline'
});
```

---

## Acceptance Criteria Summary

| # | Criterion | Pass / Fail |
|---|-----------|-------------|
| 1 | `npm run build` — no TypeScript or Vite errors | |
| 2 | `/login` renders correctly on mobile (375 px) and desktop | |
| 3 | Successful login stores the access token and redirects to `/` | |
| 4 | Navigating to `/` without a token redirects to `/login` | |
| 5 | Password reset request logs the reset URL to the API console | |
| 6 | Axios interceptor retries a failed request after a successful token refresh | |
| 7 | Socket.IO hook connects and logs "connected" after login | |
| 8 | Register form validates passwords match before API call | |
| 9 | ResetPassword reads `?token=` from URL and redirects to `/login` on success | |
| 10 | Presence store updates when socket `presence` event is received | |

---

*Test plan authored by Phase 6 Frontend Foundation Agent.*
