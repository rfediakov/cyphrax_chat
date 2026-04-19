# Multi-Agent System Test Plan

**Purpose:** Give several testing agents smaller, parallelizable chunks while preserving full coverage of the critical requirements in `AI_herders_jam_-_requirements_v3.docx`.

**Recommended usage:** Run Agents 1-5 in parallel once `docker compose up --build` is healthy. Run Agent 6 after the main functional suites or in parallel if separate test data is used.

**Out of scope by default:** The optional Jabber/XMPP extension from the "Advanced requirements" section is not a release blocker unless that feature was implemented. If it exists, add a separate follow-up suite for XMPP connectivity, federation, and admin dashboards.

---

## Shared Setup

- Start the full stack with `docker compose up --build`.
- Verify `frontend`, `api`, `mongo`, and `redis` are healthy.
- Prepare at least 4 users:
  - `alice` - primary owner/admin tester
  - `bob` - secondary user
  - `carol` - moderation/invitation target
  - `dave` - spare user for ban/unread/multi-session checks
- Keep two browser profiles or incognito windows available for multi-user and multi-tab tests.
- Keep one terminal ready for API `curl` checks and one for DB inspection when needed.

### Shared seed state

- `alice` and `bob` can be made friends when a suite requires DMs.
- Create at least:
  - one public room
  - one private room
  - one room with enough messages to test infinite scroll
- Keep one large-history fixture room with at least 10,000 messages for performance checks if available.

---

## Agent Split

| Agent | Scope | Primary goal |
|------|-------|--------------|
| 1 | Auth, password flows, account lifecycle, sessions | Prove user identity and session management are correct |
| 2 | Contacts, friend requests, bans, personal messaging permissions | Prove user-to-user relationship rules are enforced |
| 3 | Rooms, membership, roles, moderation, invitations | Prove room governance and access control are correct |
| 4 | Messaging, history, attachments, unread/offline delivery | Prove core chat data behavior works across rooms and DMs |
| 5 | Frontend UX, real-time updates, presence, mobile-first layout | Prove the main product experience works in the browser |
| 6 | Non-functional and resilience checks | Prove latency, scale assumptions, persistence, and reliability targets |

---

## Agent 1 - Auth and Sessions

### Goal

Validate account creation, login persistence, password recovery/change, account deletion, and per-session control.

### Test cases

| ID | Step | Expected |
|----|------|----------|
| A1-01 | Register with unique email, username, password | Account created; username and email are unique |
| A1-02 | Register with duplicate email | `409` or equivalent validation error |
| A1-03 | Register with duplicate username | `409` or equivalent validation error |
| A1-04 | Log in with valid email/password | Access granted; session created |
| A1-05 | Log in with invalid password | Rejected with generic auth error |
| A1-06 | Close and reopen browser | User remains signed in if persistent-login flow is implemented |
| A1-07 | Sign out in browser A while browser B stays logged in | Only current browser session is invalidated |
| A1-08 | Request password reset for existing email | Success response; reset path/token is generated according to app flow |
| A1-09 | Request password reset for unknown email | Same generic success response; no email enumeration |
| A1-10 | Complete password reset with valid token | New password works; old password does not |
| A1-11 | Change password while logged in using correct current password | Password changes successfully |
| A1-12 | Change password using wrong current password | Rejected |
| A1-13 | Open sessions page/list after logging in from multiple browsers | All active sessions shown with browser/IP details if available |
| A1-14 | Revoke a non-current session | Target session becomes invalid; current session remains valid |
| A1-15 | Delete account | User account removed/soft-deleted per implementation; memberships in other rooms removed |
| A1-16 | Delete account for a user who owns rooms | Only owned rooms are deleted; their room messages/files are deleted permanently |

### Coverage notes

- Covers registration rules, immutable username expectation, login/logout, persistent login, password reset/change, active sessions, current-session-only logout behavior, and account removal cascade.

---

## Agent 2 - Contacts, Friend Requests, and DM Permissions

### Goal

Validate friend workflows, bans, and the business rules that control whether personal messaging is allowed.

### Test cases

| ID | Step | Expected |
|----|------|----------|
| A2-01 | Send friend request by username | Request created |
| A2-02 | Send friend request with optional message text | Optional text is preserved and visible to recipient |
| A2-03 | Accept friend request | Both users appear in each other's contact list |
| A2-04 | Reject friend request | No friendship created |
| A2-05 | Remove existing friend | Users disappear from each other's friend lists |
| A2-06 | Ban another user | Friendship is terminated; future contact is blocked |
| A2-07 | Banned user tries to send friend request | Rejected |
| A2-08 | Users are friends and not banned; send DM | DM is allowed |
| A2-09 | Users are not friends; send DM | Rejected |
| A2-10 | One side bans the other after a DM history exists | Existing DM history remains visible but chat becomes read-only/frozen |
| A2-11 | Banned user tries to send new personal message | Rejected |
| A2-12 | Unban the user, re-establish friendship, send DM again | Messaging works again only after friendship is restored |
| A2-13 | Initiate friend request from room member list UI if exposed | Request flow works from room context as well as username input |

### Coverage notes

- Covers contact list, friend requests, confirmation requirement, remove friend, user-to-user ban semantics, and the rule that DMs are allowed only between friends with no ban on either side.

---

## Agent 3 - Rooms, Roles, Moderation, and Invitations

### Goal

Validate room lifecycle, access rules, owner/admin permissions, and invitation-only private room behavior.

### Test cases

| ID | Step | Expected |
|----|------|----------|
| A3-01 | Create a public room with name and description | Room created; creator is owner |
| A3-02 | Create a room using an existing room name | Rejected because room names are unique |
| A3-03 | View public room catalog | Shows name, description, and current member count |
| A3-04 | Search public room catalog | Matching rooms returned |
| A3-05 | Join public room as authenticated user | Membership created unless user is banned |
| A3-06 | Leave room as normal member | Membership removed successfully |
| A3-07 | Try to leave room as owner | Rejected; owner must delete room instead |
| A3-08 | Create a private room | Room does not appear in public catalog |
| A3-09 | Try to join private room without invitation | Rejected |
| A3-10 | Invite user to private room | Invitation created and target user can accept/reject |
| A3-11 | Accept private room invitation | User becomes member |
| A3-12 | Reject private room invitation | User does not gain access |
| A3-13 | Promote member to admin | Role changes successfully |
| A3-14 | Demote admin who is not the owner | Role changes successfully |
| A3-15 | Try to remove owner's admin rights | Rejected |
| A3-16 | Admin deletes another user's room message | Allowed |
| A3-17 | Admin removes member from room | User loses room access; treated as ban per requirements |
| A3-18 | Banned user tries to rejoin room | Rejected until unbanned |
| A3-19 | View banned users list | Shows banned users and who banned them |
| A3-20 | Unban user | User can join again if room is public or if later invited to private room |
| A3-21 | Delete room as owner | Room removed; all messages/files/images in that room deleted permanently |
| A3-22 | Non-owner attempts room deletion | Rejected |

### Coverage notes

- Covers public/private rooms, join/leave rules, owner/admin model, room ban rules, invitation flow, member visibility, and room deletion cascade.

---

## Agent 4 - Messaging, History, Attachments, and Delivery

### Goal

Validate the core message model for rooms and DMs, including replies, edits, deletes, attachments, unread handling, and offline persistence.

### Test cases

| ID | Step | Expected |
|----|------|----------|
| A4-01 | Send room message with plain text | Message stored and rendered |
| A4-02 | Send multiline message | Line breaks preserved |
| A4-03 | Send UTF-8 text and emoji | Stored and rendered correctly |
| A4-04 | Send message larger than 3 KB | Rejected |
| A4-05 | Reply to existing room message | Reply reference stored and quoted/outlined in UI |
| A4-06 | Edit own message | Content updates and edited marker appears |
| A4-07 | Delete own message | Message is soft-deleted or replaced according to implementation; no recovery required |
| A4-08 | Non-author attempts message edit in room | Rejected |
| A4-09 | Room admin deletes someone else's room message | Allowed |
| A4-10 | Fetch room history with pagination/infinite scroll | Messages appear in chronological UI order and older pages load correctly |
| A4-11 | Open room with very old history | Older messages remain reachable through infinite scroll |
| A4-12 | Send DM with same message features as room chat | Text, replies, edits, deletes behave the same from the UI perspective |
| A4-13 | Message offline user, then log recipient in later | Message persists and is delivered when recipient returns |
| A4-14 | Receive message in inactive room or DM | Unread indicator increments on corresponding room/contact |
| A4-15 | Open that room or DM | Unread indicator clears |
| A4-16 | Upload image <= 3 MB via upload button | Upload succeeds; original filename preserved |
| A4-17 | Upload arbitrary non-image file <= 20 MB | Upload succeeds |
| A4-18 | Upload image > 3 MB | Rejected |
| A4-19 | Upload non-image file > 20 MB | Rejected |
| A4-20 | Paste image into composer | Upload succeeds through paste workflow |
| A4-21 | Send message with attachment and optional comment | Attachment and comment render correctly |
| A4-22 | Download attachment as current room member or authorized DM participant | Allowed |
| A4-23 | Lose access to room, then try to open/download prior room attachment | Rejected |
| A4-24 | Original uploader loses room access | File remains stored but uploader cannot access it |
| A4-25 | Delete room containing attachments | Attachment records and physical files are removed permanently |

### Coverage notes

- Covers messaging parity between rooms and DMs, reply/edit/delete behavior, persistent history, infinite scroll, unread indicators, attachment limits, paste/upload methods, access control, and offline delivery.

---

## Agent 5 - Frontend UX, Real-Time, Presence, and Mobile

### Goal

Validate the browser experience end to end, with emphasis on low-latency real-time behavior and mobile-first usability.

### Test cases

| ID | Step | Expected |
|----|------|----------|
| A5-01 | Open app unauthenticated | Redirected to sign-in flow |
| A5-02 | Register and land in app | Main chat UI loads successfully |
| A5-03 | Verify layout includes top menu, side navigation, message area, and message input | Core chat structure matches classic web chat expectations |
| A5-04 | Verify room/contact navigation from UI | User can move between rooms, DMs, sessions, profile, and sign out |
| A5-05 | Open room with another user connected | New room messages appear for other participants within 3 seconds |
| A5-06 | Edit message in one browser | Other browser sees edited state quickly |
| A5-07 | Delete message in one browser | Other browser sees deleted state quickly |
| A5-08 | Start typing in one browser | Other browser sees typing indicator quickly |
| A5-09 | Stop typing | Typing indicator disappears after idle timeout |
| A5-10 | User is active in one tab and idle in another | Presence remains online |
| A5-11 | All tabs idle for > 1 minute | Presence changes to AFK |
| A5-12 | All tabs closed | Presence changes to offline |
| A5-13 | Receive friend request while on another screen | User sees a visible notification/toast or equivalent UI cue |
| A5-14 | Receive private room invitation while online | User sees a visible invitation UI and can accept/reject |
| A5-15 | Open rooms list/contact list with unread activity | Unread badges are visible in navigation |
| A5-16 | Use sessions page in browser | Active sessions list is understandable and revocation works from UI |
| A5-17 | Use profile page in browser | Password change and account deletion flows are usable from UI |
| A5-18 | Resize to 375 px width | No broken layout or horizontal overflow on auth, chat, contacts, sessions, profile, room-management flows |
| A5-19 | Use message actions and room management on small screen | Interactions remain reachable and usable on mobile-size viewport |
| A5-20 | Verify classic-chat feel rather than social-feed behavior | Navigation and message workflows feel room/contact driven and not feed driven |

### Coverage notes

- Covers browser UX, live events, unread/notification UX, multi-tab presence, and mobile-first layout requirements.

---

## Agent 6 - Non-Functional, Performance, and Reliability

### Goal

Validate the key non-functional requirements that are still critical to acceptance.

### Test cases

| ID | Step | Expected |
|----|------|----------|
| A6-01 | Start app with `docker compose up --build` from repo root | Full stack builds and runs successfully |
| A6-02 | Send room and DM messages under normal load | Delivery stays within 3 seconds |
| A6-03 | Trigger presence transitions under normal load | Presence updates propagate within 2 seconds |
| A6-04 | Open room with at least 10,000 messages | App remains usable; history loading still works |
| A6-05 | Verify user can belong to many rooms and keep many contacts without obvious UI/API breakage | No functional regressions |
| A6-06 | Verify one room with large member count still loads member list and moderation actions correctly | No obvious permission or rendering breakage |
| A6-07 | Restart browser after login | Login state persists as expected |
| A6-08 | Validate files are stored on local filesystem | Uploaded files exist on disk where app expects them |
| A6-09 | Delete room after heavy usage | Membership, bans, file access rights, and history stay consistent after deletion |
| A6-10 | Ban/unban or remove/reinvite users repeatedly | System remains consistent; no ghost access or stale membership |
| A6-11 | Revoke session while socket/browser is active | Session behavior remains consistent and user is eventually forced out according to implementation |
| A6-12 | Run backend and frontend production builds | TypeScript/build output succeeds cleanly |

### Coverage notes

- Covers capacity/performance assumptions, persistence, local file storage, multi-tab/session behavior, and reliability/consistency constraints.

---

## Cross-Suite Requirement Traceability

| Requirement area from the requirements doc | Covered by |
|--------------------------------------------|------------|
| Registration, login, logout, persistent login | Agent 1 |
| Password reset/change | Agent 1 |
| Account deletion and owned-room cascade | Agent 1, Agent 3, Agent 4 |
| Presence: online / AFK / offline | Agent 5, Agent 6 |
| Multi-tab presence rules | Agent 5 |
| Active sessions list and targeted revocation | Agent 1, Agent 5 |
| Contacts, friend requests, remove friend, user bans | Agent 2 |
| DM allowed only for friends with no bans | Agent 2, Agent 4 |
| Public/private rooms, search, join/leave, owner constraints | Agent 3 |
| Owner/admin moderation and banned users list | Agent 3 |
| Private room invitations | Agent 3, Agent 5 |
| Text, multiline, emoji, UTF-8, replies, edits, deletes | Agent 4 |
| Persistent message history and infinite scroll | Agent 4, Agent 6 |
| Offline message persistence/delivery | Agent 4 |
| Attachments, paste upload, size limits, filename preservation | Agent 4 |
| Attachment access loss after room access loss | Agent 4 |
| Unread indicators | Agent 4, Agent 5 |
| Low-latency delivery and presence updates | Agent 5, Agent 6 |
| Classic web-chat layout and mobile usability | Agent 5 |
| Build/run from `docker compose up` | Agent 6 |

---

## Execution Order

1. Run Agents 1-5 in parallel if each uses separate users/rooms or isolated DB state.
2. If the environment is shared, run in this order:
   - Agent 1
   - Agent 2
   - Agent 3
   - Agent 4
   - Agent 5
   - Agent 6
3. Re-run Agent 5 after major backend fixes because real-time and UI regressions are the easiest to reintroduce.

---

## Exit Criteria

- All critical suites pass with no blocking failures.
- No broken flow remains in auth, rooms, DMs, presence, messaging, attachments, sessions, or mobile navigation.
- `docker compose up --build` and production builds succeed.
- Any skipped tests are documented with a reason and owner.
