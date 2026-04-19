# Agent 6 - Non-Functional, Performance, and Reliability Test Plan

## Goal

Validate the critical non-functional requirements that support release readiness.

## Test Cases

| ID | Step | Expected |
|----|------|----------|
| A6-01 | Start app with `docker compose up --build` from repo root | Full stack builds and runs successfully |
| A6-02 | Send room and DM messages under normal load | Delivery stays within 3 seconds |
| A6-03 | Trigger presence transitions under normal load | Presence updates propagate within 2 seconds |
| A6-04 | Open room with at least 10,000 messages | App remains usable; history loading still works |
| A6-05 | Verify user can belong to many rooms and keep many contacts without obvious UI or API breakage | No functional regressions |
| A6-06 | Verify one room with large member count still loads member list and moderation actions correctly | No obvious permission or rendering breakage |
| A6-07 | Restart browser after login | Login state persists as expected |
| A6-08 | Validate files are stored on local filesystem | Uploaded files exist on disk where app expects them |
| A6-09 | Delete room after heavy usage | Membership, bans, file access rights, and history stay consistent after deletion |
| A6-10 | Ban, unban, remove, and re-invite users repeatedly | System remains consistent; no ghost access or stale membership |
| A6-11 | Revoke session while socket or browser is active | Session behavior remains consistent and user is eventually forced out according to implementation |
| A6-12 | Run backend and frontend production builds | Build output succeeds cleanly |

## Coverage Notes

- `docker compose up --build` readiness
- delivery and presence latency targets
- large history usability
- local filesystem storage behavior
- consistency of membership, bans, access rights, and history
- release-oriented build validation
