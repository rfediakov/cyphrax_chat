# Phase 8 — Frontend Features: Test Plan

**Phase:** 8 — Frontend Features Agent  
**Branch:** `phase-8/frontend-features`  
**Scope:** ManageRoom modal, Public Rooms catalog, Contacts/friend requests, Sessions page, Profile page, unread badge system, room invitation toasts, friend request toasts.

---

## Prerequisites

- `docker compose up` is running (`mongo`, `redis`, `api`, `frontend` all healthy).
- At least **three** test user accounts registered (e.g. `alice`, `bob`, `carol`).
- At least one public room and one private room created.

---

## 8.1 ManageRoom Modal

### Setup
- Log in as `alice`.
- Create a public room `#test-room` (alice becomes owner).
- Open `#test-room` in the chat.

### Members tab

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Open right sidebar → click **Manage Room** | Modal opens on Members tab |
| 2 | Verify `alice` row shows role `owner` and no action buttons | Correct |
| 3 | Log in as `bob` in another browser; join `#test-room`; reopen modal as alice | Bob appears with role `member` |
| 4 | Click **Make admin** on Bob's row (owner only) | Bob's role changes to `admin`; row updates |
| 5 | Click **Remove admin** on Bob's row | Bob's role reverts to `member` |
| 6 | Click **Ban** on Bob's row | Bob disappears from Members; confirm Bob cannot rejoin immediately |
| 7 | Switch to **Banned** tab | Bob appears in the banned list |
| 8 | Click **Unban** on Bob | Bob disappears from banned list |

### Admins tab

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Promote `carol` to admin via Members tab | Switch to Admins tab; carol appears |
| 2 | Click **Remove admin** on carol (owner only) | Carol disappears from Admins; Members tab shows her as `member` |

### Banned users tab

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Ban `carol` from Members tab | Switch to Banned tab; carol with ban timestamp appears |
| 2 | Click **Unban** | Carol disappears; she can rejoin the room |

### Invitations tab (private room only)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Create a **private** room `#invite-test` | Only alice is a member |
| 2 | Open Manage Room → Invitations tab | Input visible |
| 3 | Type `bob` and click **Send invite** | "Invitation sent to @bob" shown |
| 4 | As `bob`, observe toast notification "You have been invited to #invite-test" with Accept/Reject | Toast appears |
| 5 | Click **Accept** in the toast | `#invite-test` appears in bob's Private Rooms sidebar section |
| 6 | Repeat invite for `carol`; carol clicks **Reject** | Room does NOT appear in carol's sidebar |

### Settings tab

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Change room name to `test-room-renamed` and click **Save changes** | Success message; sidebar and header show new name |
| 2 | Toggle **Private room** checkbox; save | Room moves between Public/Private sections in sidebar |
| 3 | Click **Delete room**; confirm | Room removed from sidebar; users in the room are redirected to welcome screen |

---

## 8.2 Public Rooms Catalog

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Click **Public Rooms** in TopNav | `/public-rooms` page loads with room cards |
| 2 | Type in search box (debounced) | Cards filter in real time; empty state shown for no matches |
| 3 | Click **Join** on an unjoined room | Button changes to **View** with "Joined" badge; room appears in sidebar |
| 4 | Click **View** on an already-joined room | Redirects to `/` with that room active |
| 5 | Scroll to bottom; if `hasMore`, click **Load more** | Next page appended without duplicates |
| 6 | Rooms user has already joined show "Joined" badge on first load | Correct |

---

## 8.3 Contacts & Friend Requests

### Contacts page (`/contacts`)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Click **Contacts** in TopNav | `/contacts` loads |
| 2 | Type `bob` in "Add contact" and click **Send request** | Success message shown |
| 3 | As `bob`, go to `/contacts` | Pending requests section shows alice's request |
| 4 | Bob clicks **Accept** | alice appears in bob's friends list; bob appears in alice's friends list |
| 5 | As bob, click **Reject** on carol's (hypothetical) request | Request disappears; carol not added |
| 6 | Click **Message** next to a friend | Redirected to `/`; DM with that friend is active |
| 7 | Click **Remove** next to a friend | Friend removed from list |
| 8 | Click **Ban** next to a friend | Friend moved to Banned users section |
| 9 | Click **Unban** in banned section | User removed from banned list |

### Friend request toast (real-time)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | User `carol` sends a friend request to `alice` via API/contacts page | Alice (on chat page) sees a toast: "@carol sent you a friend request." |
| 2 | Toast auto-dismisses after 5 s | Correct |

### Sidebar contact list

| # | Step | Expected result |
|---|------|-----------------|
| 1 | In LeftSidebar Contacts section, friends show presence dot | Correct colour (green/amber/grey) |
| 2 | Unread DM badge shown next to contact when a DM is received while viewing another context | Badge appears |
| 3 | Click contact to open DM | Badge clears |

---

## 8.4 Unread Badge System

| # | Step | Expected result |
|---|------|-----------------|
| 1 | With Alice active in room A, Bob sends a message to room B (Alice is a member) | Room B shows amber unread badge in Alice's sidebar |
| 2 | Alice clicks room B | Badge clears immediately |
| 3 | `read` socket event is emitted (verify in browser DevTools ws frames) | `{ contextId, contextType }` visible |
| 4 | Same for DMs: Bob sends DM to Alice while Alice views a room | Alice's contact shows unread badge |
| 5 | Badge count caps at `99+` for > 99 unread | Correct |

---

## 8.5 Sessions Page

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Navigate to `/sessions` | Table of active sessions displayed |
| 2 | Current session highlighted in blue with "Current" badge and no Revoke button | Correct |
| 3 | Log in from a second browser tab; refresh sessions page | Two sessions visible |
| 4 | Click **Revoke** on the second session | Session disappears from list; second tab gets 401 on next API call |
| 5 | Revoke button disabled / spinner during request | Correct |

---

## 8.6 Profile Page

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Navigate to `/profile` | Username (immutable, plain text) and email displayed |
| 2 | Enter wrong current password → click **Change password** | Error message from API shown |
| 3 | Enter correct current password, matching new passwords ≥ 8 chars | "Password changed successfully." shown; fields cleared |
| 4 | Enter mismatched new/confirm passwords | Client-side error before API call |
| 5 | Uncheck confirmation checkbox | **Delete my account** button stays disabled |
| 6 | Check confirmation checkbox → click **Delete my account** | Spinner; on success redirect to `/login`; attempting to log in with old credentials fails |
| 7 | Verify cascade: owned rooms no longer exist; messages gone | DB check or API returns 404 |

---

## 8.7 Mobile Layout (375 px viewport)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Resize browser to 375 px width on all new pages | No horizontal overflow; all content readable |
| 2 | Sessions page table wraps gracefully | Columns stack or scroll |
| 3 | ManageRoom modal fits within viewport | Scrollable tabs and content |
| 4 | Contacts page action buttons wrap on small screens | No overlap |
| 5 | Toast notifications fit within 375 px (max-w constraint) | Correct |

---

## 8.8 End-to-End Scenario

**Objective:** Complete user journey touching all Phase 8 features.

1. Register `alice`, `bob`, `carol`.
2. `alice` creates public room `#general` and private room `#vip`.
3. `bob` and `carol` discover and join `#general` via Public Rooms catalog.
4. `alice` invites `bob` to `#vip` via ManageRoom → Invitations tab. `bob` accepts via toast.
5. `alice` sends a friend request to `bob` via Contacts page. `bob` accepts.
6. `alice` and `bob` exchange DMs. Unread badge increments for `alice` when `bob` replies while alice is in `#general`.
7. `alice` opens DM — badge clears.
8. `alice` promotes `bob` to admin in `#general`. `carol` is banned. `carol` sees she can't rejoin.
9. `alice` changes her password on Profile page.
10. `alice` revokes an old session on Sessions page.
11. `alice` deletes `#vip` from ManageRoom → Settings tab. Room vanishes from sidebar for all users.

**Pass criteria:** All steps succeed without console errors or broken UI.

---

## Acceptance Criteria Checklist (from AGENT_DEVELOPMENT_GUIDE.md §8)

- [ ] Manage Room modal opens for admin/owner; all 5 tabs render and work.
- [ ] Banning a member from the Members tab removes them and adds them to Banned tab.
- [ ] Room deletion from Settings tab cascades and removes the room from the sidebar.
- [ ] Public room catalog search returns results and allows joining.
- [ ] Sending a friend request and accepting it via the Contacts page adds the friend.
- [ ] Unread badge increments for rooms the user is not currently viewing.
- [ ] Opening the room clears the unread badge.
- [ ] Sessions page lists and allows revoking individual sessions.
- [ ] Profile page allows password change; wrong current password returns an error.
- [ ] Account deletion cascade confirmed: user, owned rooms, messages all gone.
- [ ] Layout is usable on 375 px mobile.
- [ ] `docker compose up` — full application works end-to-end.
