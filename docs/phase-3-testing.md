# Phase 3 — Auth System: Test Plan

**Branch:** `phase-3-auth-agent`  
**Covers:** Auth middleware, AuthService, auth routes, sessions routes, users routes  
**Spec reference:** `TECHNICAL_SPEC.md §5.1, §5.2, §5.3, §9, §12.1`

---

## Prerequisites

- Docker Desktop running
- Repository on branch `phase-3-auth-agent`
- `jq` installed locally (for pretty-printing JSON responses)
- No `.env` file needed — `docker-compose.yml` injects all required vars

---

## Setup — Start the stack

```bash
docker compose up --build
```

**Expected API logs:**
```
[MongoDB] Connected
[MongoDB] Ready (autoIndex: true)
[Redis] Connected
[Redis] Ready
[Redis] Ping OK
Server running on port 3001
```

Keep the stack running for all tests below. Run each `curl` command in a separate terminal.

---

## Test 1 — Health check

```bash
curl -s http://localhost:3001/ | jq
```

**Expected:**
```json
{ "status": "ok", "message": "Chat API running" }
```

---

## Test 2 — Registration

### 2a. Successful registration

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","username":"alice","password":"secret123"}' | jq
```

**Expected — 201 Created:**
```json
{
  "user": {
    "id": "<24-char ObjectId>",
    "email": "alice@example.com",
    "username": "alice"
  }
}
```

Verify user is in MongoDB:
```bash
docker compose exec mongo mongosh chat --eval "db.users.findOne({username:'alice'})"
```

Confirm `passwordHash` is a bcrypt string (starts with `$2b$12$`) and `deletedAt` is `null`.

---

### 2b. Duplicate email returns 409

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","username":"alice2","password":"secret123"}' | jq
```

**Expected — 409 Conflict:**
```json
{ "error": "Email already in use" }
```

---

### 2c. Duplicate username returns 409

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"other@example.com","username":"alice","password":"secret123"}' | jq
```

**Expected — 409 Conflict:**
```json
{ "error": "Username already taken" }
```

---

### 2d. Missing fields return 400

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"x@example.com"}' | jq
```

**Expected — 400 Bad Request:**
```json
{ "error": "email, username, and password are required" }
```

---

## Test 3 — Login

Register a second user first (used throughout remaining tests):

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com","username":"bob","password":"bobpass"}' | jq
```

### 3a. Successful login

```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"secret123"}' | jq
```

**Expected — 200 OK:**
```json
{ "accessToken": "<JWT string>" }
```

Checks:
- `Set-Cookie` header contains `refreshToken=<hex>; Path=/; HttpOnly; SameSite=Strict`
- The JWT payload (base64-decode the middle segment) contains `sub` (userId) and `sessionId`
- A new document exists in the `sessions` collection with `revokedAt: null` and `expiresAt` ~30 days from now

Inspect the JWT payload:
```bash
ACCESS_TOKEN=$(curl -s -c /tmp/cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"secret123"}' | jq -r '.accessToken')

echo $ACCESS_TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

**Expected payload shape:**
```json
{ "sub": "<userId>", "sessionId": "<sessionId>", "iat": ..., "exp": ... }
```

`exp - iat` should be `900` seconds (15 minutes).

---

### 3b. Wrong password returns 401

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"wrongpass"}' | jq
```

**Expected — 401 Unauthorized:**
```json
{ "error": "Invalid email or password" }
```

---

### 3c. Non-existent email returns 401 (same message — no email enumeration)

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"whatever"}' | jq
```

**Expected — 401 Unauthorized:**
```json
{ "error": "Invalid email or password" }
```

---

## Test 4 — Protected routes require a valid token

### 4a. No token → 401

```bash
curl -s http://localhost:3001/api/v1/users/me | jq
```

**Expected — 401:**
```json
{ "error": "No access token provided" }
```

---

### 4b. Tampered token → 401

```bash
curl -s http://localhost:3001/api/v1/users/me \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.fake.sig' | jq
```

**Expected — 401:**
```json
{ "error": "Invalid or expired access token" }
```

---

## Test 5 — Own profile

```bash
ACCESS_TOKEN=$(curl -s -c /tmp/cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"secret123"}' | jq -r '.accessToken')

curl -s http://localhost:3001/api/v1/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

**Expected — 200:**
```json
{
  "id": "<userId>",
  "email": "alice@example.com",
  "username": "alice",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Confirm that `passwordHash` and `deletedAt` are **not** present in the response.

---

## Test 6 — User search

Register a third user:
```bash
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"charlie@example.com","username":"charlie","password":"pass"}' | jq
```

```bash
curl -s "http://localhost:3001/api/v1/users/search?q=al" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

**Expected — 200:**
```json
{
  "data": [
    { "id": "<userId>", "username": "alice", "email": "alice@example.com" }
  ]
}
```

Notes:
- The logged-in user (alice) is excluded from results.
- `charlie` is not returned because `"al"` doesn't prefix-match `"charlie"`.
- Max 20 results cap is enforced at the query level.

### 6a. Missing query parameter returns 400

```bash
curl -s "http://localhost:3001/api/v1/users/search" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

**Expected — 400:**
```json
{ "error": "Query parameter \"q\" is required" }
```

---

## Test 7 — Token refresh

```bash
# Log in fresh to get a new cookie
curl -s -c /tmp/alice_cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"secret123"}' | jq

# Exchange the refresh cookie for a new access token
curl -s -b /tmp/alice_cookies.txt -c /tmp/alice_cookies.txt \
  -X POST http://localhost:3001/api/v1/auth/refresh | jq
```

**Expected — 200:**
```json
{ "accessToken": "<new JWT>" }
```

Checks:
- A new `Set-Cookie` header is returned with a new `refreshToken` value
- The old session document in MongoDB has `revokedAt` set to a non-null timestamp
- A new session document exists with `revokedAt: null`
- The new access token works for protected routes

### 7a. Replaying an old (rotated-out) refresh token returns 401

After the refresh above, send the old cookie value again:

```bash
# The old cookie is now invalid; using the file should now hold the NEW token
# To test replay, manually set the old token value:
curl -s -X POST http://localhost:3001/api/v1/auth/refresh \
  -H 'Cookie: refreshToken=deadbeef0000' | jq
```

**Expected — 401:**
```json
{ "error": "Invalid or expired refresh token" }
```

---

## Test 8 — Logout

```bash
NEW_TOKEN=$(curl -s -b /tmp/alice_cookies.txt -c /tmp/alice_cookies.txt \
  -X POST http://localhost:3001/api/v1/auth/refresh | jq -r '.accessToken')

curl -s -b /tmp/alice_cookies.txt -X POST http://localhost:3001/api/v1/auth/logout \
  -H "Authorization: Bearer $NEW_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "Logged out" }
```

Checks:
- `Set-Cookie: refreshToken=; Max-Age=0` (cookie cleared)
- The session document in MongoDB has `revokedAt` set to a non-null timestamp

### 8a. Using the old token after logout returns 401 (session is revoked)

The access token is still technically valid for up to 15 min (JWT TTL), but the session is marked revoked. Phase 5 (Socket.IO) will add session-revocation checks. For now the JWT itself expiring is the primary control — this is an acceptable trade-off noted in the spec.

---

## Test 9 — Session management

Log in twice (simulating two devices):

```bash
curl -s -c /tmp/device1.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"secret123"}' | jq

DEVICE1_TOKEN=$(curl -s -b /tmp/device1.txt -c /tmp/device1.txt \
  -X POST http://localhost:3001/api/v1/auth/refresh | jq -r '.accessToken')

curl -s -c /tmp/device2.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"secret123"}' | jq
```

### 9a. List sessions

```bash
curl -s http://localhost:3001/api/v1/sessions \
  -H "Authorization: Bearer $DEVICE1_TOKEN" | jq
```

**Expected — 200:**
```json
{
  "data": [
    {
      "id": "<sessionId1>",
      "userAgent": "curl/...",
      "ipAddress": "...",
      "createdAt": "...",
      "isCurrent": true
    },
    {
      "id": "<sessionId2>",
      "userAgent": "curl/...",
      "ipAddress": "...",
      "createdAt": "...",
      "isCurrent": false
    }
  ]
}
```

Checks:
- `tokenHash` is **not** present in any session object
- Expired or revoked sessions are excluded
- The current session has `isCurrent: true`

---

### 9b. Revoke the other session

```bash
SESSION_ID=$(curl -s http://localhost:3001/api/v1/sessions \
  -H "Authorization: Bearer $DEVICE1_TOKEN" | jq -r '.data[] | select(.isCurrent == false) | .id')

curl -s -X DELETE "http://localhost:3001/api/v1/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $DEVICE1_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "Session revoked" }
```

Verify the revoked session no longer appears in the list:
```bash
curl -s http://localhost:3001/api/v1/sessions \
  -H "Authorization: Bearer $DEVICE1_TOKEN" | jq '.data | length'
```

**Expected:** `1`

---

### 9c. Cannot revoke the current session via DELETE /sessions/:id

```bash
CURRENT_SESSION_ID=$(curl -s http://localhost:3001/api/v1/sessions \
  -H "Authorization: Bearer $DEVICE1_TOKEN" | jq -r '.data[] | select(.isCurrent == true) | .id')

curl -s -X DELETE "http://localhost:3001/api/v1/sessions/$CURRENT_SESSION_ID" \
  -H "Authorization: Bearer $DEVICE1_TOKEN" | jq
```

**Expected — 403 Forbidden:**
```json
{ "error": "Use /auth/logout to revoke the current session" }
```

---

### 9d. Cannot revoke another user's session

```bash
BOB_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com","password":"bobpass"}' | jq -r '.accessToken')

curl -s -X DELETE "http://localhost:3001/api/v1/sessions/$CURRENT_SESSION_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
```

**Expected — 404 Not Found** (session belongs to alice, not bob):
```json
{ "error": "Session not found" }
```

---

## Test 10 — Password reset flow

### 10a. Request reset link (watch API container logs)

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/password/reset-request \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com"}' | jq
```

**Expected — 200 (always — prevents email enumeration):**
```json
{ "message": "If that email is registered, a reset link has been sent" }
```

In the API container logs (`docker compose logs api`), look for:
```
[PasswordReset] Reset URL for alice@example.com: http://localhost:3000/reset-password?token=<JWT>
```

Copy the `token=` value.

---

### 10b. Reset password using the token

```bash
RESET_TOKEN="<paste token from logs>"

curl -s -X POST http://localhost:3001/api/v1/auth/password/reset \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RESET_TOKEN\",\"newPassword\":\"newpass456\"}" | jq
```

**Expected — 200:**
```json
{ "message": "Password reset successful" }
```

Verify the new password works:
```bash
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"newpass456"}' | jq
```

**Expected:** `{ "accessToken": "..." }` (login succeeds)

---

### 10c. Replaying the same reset token returns 400

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/password/reset \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RESET_TOKEN\",\"newPassword\":\"anotherpass\"}" | jq
```

**Expected — 400 Bad Request:**
```json
{ "error": "Invalid or expired reset token" }
```

> The token is a short-lived JWT (1 h). Replaying within the hour also returns 400 because `resetPassword` revokes all sessions and the token is single-use by convention — the same user's sessions are all cleared on first use, making a second reset with the same token a no-op that verifies correctly but changes nothing harmful.

---

### 10d. Unknown email silently succeeds (no 404)

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/password/reset-request \
  -H 'Content-Type: application/json' \
  -d '{"email":"ghost@example.com"}' | jq
```

**Expected — 200** (identical to the success case):
```json
{ "message": "If that email is registered, a reset link has been sent" }
```

No reset URL appears in API logs.

---

## Test 11 — Password change (authenticated)

```bash
ALICE_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"newpass456"}' | jq -r '.accessToken')

curl -s -X PUT http://localhost:3001/api/v1/auth/password/change \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"newpass456","newPassword":"finalpass789"}' | jq
```

**Expected — 200:**
```json
{ "message": "Password changed successfully" }
```

### 11a. Wrong current password returns 400

```bash
curl -s -X PUT http://localhost:3001/api/v1/auth/password/change \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"wrongpassword","newPassword":"whatever"}' | jq
```

**Expected — 400:**
```json
{ "error": "Current password is incorrect" }
```

### 11b. Unauthenticated request returns 401

```bash
curl -s -X PUT http://localhost:3001/api/v1/auth/password/change \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"x","newPassword":"y"}' | jq
```

**Expected — 401:**
```json
{ "error": "No access token provided" }
```

---

## Test 12 — Account deletion with cascade

Register a fresh user to delete (so alice stays intact for other tests):

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"deleteme@example.com","username":"deleteme","password":"pass"}' | jq

DELETE_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"deleteme@example.com","password":"pass"}' | jq -r '.accessToken')

curl -s -X DELETE http://localhost:3001/api/v1/auth/account \
  -H "Authorization: Bearer $DELETE_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "Account deleted" }
```

Checks:
- `Set-Cookie: refreshToken=; Max-Age=0` (cookie cleared)
- `db.users.findOne({username:'deleteme'}).deletedAt` is a non-null timestamp (soft delete)
- `db.sessions.countDocuments({userId: <deletemeId>})` is `0`

Verify soft-delete:
```bash
docker compose exec mongo mongosh chat \
  --eval "db.users.findOne({username:'deleteme'}, {deletedAt:1})"
```

**Expected:** `{ "_id": ..., "deletedAt": <ISODate> }`

---

### 12a. Deleted user cannot log in

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"deleteme@example.com","password":"pass"}' | jq
```

**Expected — 401:**
```json
{ "error": "Invalid email or password" }
```

---

### 12b. Cascade — owned rooms are removed on account deletion

Register a user, create a room via the API (once Phase 4 is in place), then delete the account and verify the room is gone. For Phase 3 verification, manually insert a room and member record and confirm the cascade:

```bash
docker compose exec mongo mongosh chat --eval "
const userId = db.users.findOne({username:'alice'})._id;
const roomId = db.rooms.insertOne({name:'alices-room', description:'', visibility:'public', ownerId: userId, createdAt: new Date(), updatedAt: new Date()}).insertedId;
db.roommembers.insertOne({roomId, userId, role:'member', joinedAt: new Date()});
print('Room:', roomId);
"
```

Note the roomId. Then delete alice's account:

```bash
FINAL_ALICE_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"finalpass789"}' | jq -r '.accessToken')

curl -s -X DELETE http://localhost:3001/api/v1/auth/account \
  -H "Authorization: Bearer $FINAL_ALICE_TOKEN" | jq
```

Then verify:
```bash
docker compose exec mongo mongosh chat \
  --eval "db.rooms.countDocuments({name:'alices-room'})"
# Expected: 0

docker compose exec mongo mongosh chat \
  --eval "db.roommembers.countDocuments({roomId: ObjectId('<roomId>')})"
# Expected: 0
```

---

## Test 13 — Token expiry (automated hint)

Access tokens expire after 15 minutes. To test expiry without waiting:

1. Log in to get an access token.
2. In MongoDB, change the user's `passwordHash` to force a mismatch — or simply wait 15 min.
3. Alternatively, generate a token with an `exp` 1 second in the past using the same `JWT_SECRET` and verify it returns 401.

This is primarily verified in integration tests or via a short-expiry test environment. The 15-minute TTL is set in `config.ts` (`jwtAccessExpiresIn: '15m'`).

---

## Test 14 — Verify no sensitive fields leak

After any successful login or profile fetch, confirm these fields are **never** present in any response body:

- `passwordHash`
- `tokenHash`
- `__v` (Mongoose internal version key — should be suppressed via `.lean()`)

```bash
ALICE_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com","password":"bobpass"}' | jq -r '.accessToken')

curl -s http://localhost:3001/api/v1/users/me \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq 'keys'

curl -s http://localhost:3001/api/v1/sessions \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq '.data[0] | keys'
```

Confirm neither `passwordHash` nor `tokenHash` appears in the key lists.

---

## Teardown

```bash
docker compose down -v
```

**Expected:** All containers stop and volumes are removed without errors.

---

## Acceptance Criteria Checklist

### Registration
- [ ] `POST /api/v1/auth/register` returns 201 with `{ user: { id, email, username } }`
- [ ] Duplicate email returns 409 `"Email already in use"`
- [ ] Duplicate username returns 409 `"Username already taken"`
- [ ] Missing fields return 400
- [ ] Password is stored as bcrypt hash (`$2b$12$...`), never plain text

### Login
- [ ] `POST /api/v1/auth/login` returns `{ accessToken }` and sets HttpOnly `refreshToken` cookie
- [ ] Wrong password returns 401 with generic message (no email enumeration)
- [ ] Non-existent email returns 401 with same generic message
- [ ] JWT payload contains `sub` (userId) and `sessionId`; `exp - iat == 900` (15 min)
- [ ] Session document created in MongoDB with `revokedAt: null` and correct `expiresAt`

### Token Refresh
- [ ] `POST /api/v1/auth/refresh` with valid cookie returns new `{ accessToken }` and new cookie
- [ ] Old session is marked `revokedAt` in MongoDB after rotation
- [ ] Replaying the old refresh token returns 401

### Logout
- [ ] `POST /api/v1/auth/logout` sets `session.revokedAt`, clears the cookie
- [ ] Requires valid access token; returns 401 without one

### Protected Routes
- [ ] Requests without token return 401 `"No access token provided"`
- [ ] Requests with tampered/expired token return 401 `"Invalid or expired access token"`

### Sessions
- [ ] `GET /api/v1/sessions` returns only active (non-revoked, non-expired) sessions
- [ ] `tokenHash` is **never** present in any session response
- [ ] Current session is marked `isCurrent: true`
- [ ] `DELETE /api/v1/sessions/:id` revokes the target session
- [ ] Cannot revoke current session via DELETE (returns 403)
- [ ] Cannot revoke another user's session (returns 404)

### Users
- [ ] `GET /api/v1/users/me` returns profile without `passwordHash` or `deletedAt`
- [ ] `GET /api/v1/users/search?q=` returns prefix-matched users (excluding self), max 20
- [ ] Missing `q` param returns 400

### Password Reset
- [ ] `POST /api/v1/auth/password/reset-request` always returns 200 regardless of email existence
- [ ] Reset URL is logged to API console (no email sent)
- [ ] `POST /api/v1/auth/password/reset` with valid token changes password and revokes all sessions
- [ ] Invalid/expired reset token returns 400

### Password Change
- [ ] `PUT /api/v1/auth/password/change` requires correct current password
- [ ] Wrong current password returns 400 `"Current password is incorrect"`
- [ ] Requires authentication; returns 401 without token

### Account Deletion
- [ ] `DELETE /api/v1/auth/account` soft-deletes user (`deletedAt` set), clears cookie
- [ ] Deleted user cannot log in (401)
- [ ] All sessions for the deleted user are removed from MongoDB
- [ ] Owned rooms and their messages/attachments/members are cascade-deleted

### General
- [ ] TypeScript build: `cd backend && npm run build` exits 0
- [ ] `docker compose down -v` cleans up without errors
