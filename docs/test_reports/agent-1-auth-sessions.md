# Agent 1 — Auth & Sessions — QA report

**Date:** 2026-04-19  
**Environment:** Docker Compose (`api` on `http://localhost:3001`, JWT secrets per `docker-compose.yml`)  
**Method:** API verification with `curl` against live stack; code review for browser-only cases. UI was not driven in a browser in this pass (Sessions page implementation reviewed in source).

---

## Summary

| ID     | Result | Notes |
|--------|--------|--------|
| A1-01  | **Pass** | `POST /api/v1/auth/register` returns `201` with `accessToken` and `user` (unique email/username). |
| A1-02  | **Pass** | Duplicate email → `409`, `{"error":"Email already in use"}`. |
| A1-03  | **Pass** | Duplicate username → `409`, `{"error":"Username already taken"}`. |
| A1-04  | **Pass** | Valid login → `200`, access token + user payload. |
| A1-05  | **Pass** | Wrong password → `401`, `{"error":"Invalid email or password"}` (generic). |
| A1-06  | **Pass (code review)** | Refresh token: httpOnly cookie, 30-day max-age; Zustand persists `user` only, `accessToken` refreshed via `/auth/refresh`. **Manual browser check** still recommended to confirm cookie survives browser restart. |
| A1-07  | **Partial** | Refresh invalidation per session works; see **BUG-A1-001**. |
| A1-08  | **Pass** | `200` + generic message; dev logs reset URL to API console (`[PasswordReset]`). No real email in dev. |
| A1-09  | **Pass** | Unknown email returns **same** `200` body as existing email (no enumeration). |
| A1-10  | **Pass** | After reset, old password rejected (`401`), new password accepted (`200`). |
| A1-11  | **Pass** | `PUT /auth/password/change` with correct current password → `200`. |
| A1-12  | **Pass** | Wrong current password → `400`, `{"error":"Current password is incorrect"}` (rejected; not `401`). |
| A1-13  | **Pass** | `GET /sessions` returns all active sessions with `userAgent`, `ipAddress`, `isCurrent`, timestamps. UI (`/sessions`) maps UA to friendly labels and shows IP when present. |
| A1-14  | **Pass** | `DELETE /sessions/:id` on non-current session → `200`; that session’s refresh fails (`401`); current session still works. |
| A1-15  | **Partial** | Login blocked for deleted user (`401`); soft-delete behavior confirmed. Duplicate-email data integrity issue: see **BUG-A1-002**. |
| A1-16  | **Pass** | Owner account deletion removed owned room (`GET /rooms/:id` → `404` for former member); member’s `GET /rooms/mine` empty after cascade. |

---

## Bugs / issues for follow-up

### BUG-A1-001 — Access token remains valid after logout until JWT expiry

**Severity:** Medium (session “logout” does not immediately invalidate Bearer access token for API calls.)

**Steps (reproduced via API):**

1. Create two sessions (two `POST /auth/login` with same credentials, two cookie jars).
2. `POST /auth/logout` with **session A** Bearer token + session A cookies.
3. `POST /auth/refresh` with **session B** cookies → `200` (expected: other session stays valid).
4. `POST /auth/refresh` with **session A** cookies → `401` (expected: logged-out session refresh invalid).
5. `GET /api/v1/users/me` with **original session A access token** (still within ~15m TTL) → **`200`** (unexpected if “logout” should invalidate all access for that session immediately).

**Root cause (code):** `requireAuth` verifies JWT only; it does not check `Session.revokedAt` for `payload.sessionId`.

**Expected (suggested):** Either validate session in DB on each request, or use short access-token TTL + mandatory refresh that checks session state (trade-offs apply).

---

### BUG-A1-002 — Same email can exist on multiple user documents after soft-delete

**Severity:** High (identity / uniqueness / potential confusion for “deleted account” semantics.)

**Observed:**

1. Register user, delete account (`DELETE /auth/account` → soft-delete `deletedAt`).
2. Register again with **same email**, different username → `201` Created.
3. MongoDB contains **two** `users` documents with the **same** `email` (one soft-deleted, one active).

**Root cause:**

- Application conflict check uses `deletedAt: null`, so it treats the email as “free” after soft-delete.
- `User.create` then inserts a second row with the same email.
- In this environment, MongoDB accepted the insert, meaning a **unique index on `email` is not effectively preventing duplicates** (index missing, or not applied to existing collection).

**Expected:** Either enforce email uniqueness at DB level (including handling soft-delete via partial unique index or email mutation on delete), or document that email reuse is intentional and adjust product/tests accordingly.

---

## Evidence snippets (representative)

- Duplicate registration: `409` with conflict messages (A1-02, A1-03).
- Invalid login: `401` + `Invalid email or password` (A1-05).
- Password reset enumeration: identical `200` JSON for known vs unknown email (A1-08/09).
- Session list: `GET /api/v1/sessions` includes `userAgent`, `ipAddress`, `isCurrent` (A1-13).
- Revoke other session: refresh for revoked session `401`, current session still `200` on `/users/me` (A1-14).
- Owner delete cascade: room `404` for member; `rooms/mine` empty (A1-16).

---

## Out of scope / manual follow-up

- **A1-06:** Full “close all browser windows and reopen” UX test in Chrome/Safari/Firefox.
- **A1-07:** True two-browser manual test (same as API simulation with two cookie jars).
- **A1-08:** Production email delivery (SMTP) not verified; dev uses console log for reset URL.

---

## Files referenced (for fix agents)

- `backend/src/middleware/auth.middleware.ts` — access token verification only.
- `backend/src/services/auth.service.ts` — `logout`, `deleteAccount`, `register` conflict query.
- `backend/src/models/user.model.ts` — `email` / `username` uniqueness.
- `frontend/src/store/auth.store.ts` — persist `user` only; refresh-driven sessions.
- `frontend/src/pages/Sessions.tsx` — active sessions UI.
