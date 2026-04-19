# Multi-Agent Test Plans

These files split the master system test plan into smaller agent-owned chunks that can be executed in parallel.

## Shared Setup

- Start the stack with `docker compose up --build`.
- Verify `frontend`, `api`, `mongo`, and `redis` are healthy.
- Prepare at least 4 users: `alice`, `bob`, `carol`, `dave`.
- Keep at least two browser profiles or incognito windows available.
- Seed:
  - one public room
  - one private room
  - one room with enough messages for infinite scroll
  - one large-history room with about 10,000 messages if available

## Files

- `agent-1-auth-sessions.md`
- `agent-2-contacts-dms.md`
- `agent-3-rooms-moderation.md`
- `agent-4-messaging-attachments.md`
- `agent-5-frontend-realtime-mobile.md`
- `agent-6-non-functional-reliability.md`

## Execution Order

Run Agents 1-5 in parallel if each agent has isolated users and rooms. If the same environment is shared, run them in this order:

1. `agent-1-auth-sessions.md`
2. `agent-2-contacts-dms.md`
3. `agent-3-rooms-moderation.md`
4. `agent-4-messaging-attachments.md`
5. `agent-5-frontend-realtime-mobile.md`
6. `agent-6-non-functional-reliability.md`

## Coverage Summary

Together these plans cover the critical requirements from `AI_herders_jam_-_requirements_v3.docx`:

- auth, password reset/change, persistent login, sessions, account deletion
- contacts, friend requests, bans, and DM eligibility rules
- public/private rooms, invitations, owner/admin moderation, bans, deletion
- messaging, replies, edits, deletes, unread handling, offline delivery
- attachments, paste upload, size limits, and attachment access control
- real-time events, presence, multi-tab behavior, and mobile-first UI checks
- build/run validation, latency, persistence, and reliability checks
