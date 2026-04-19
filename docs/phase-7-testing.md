# Phase 7 — Frontend Chat Agent: Test Plan

**Branch:** `phase-7/frontend-chat`  
**Date:** 2026-04-19  
**Scope:** Main chat layout, MessageList with infinite scroll, MessageInput (emoji, file upload, paste), typing indicators, message actions (edit, delete, reply), real-time socket wiring.

---

## Prerequisites

- `docker compose up --build` succeeds (all services healthy).
- At least two user accounts registered (User A, User B).
- User A and User B are friends (accepted friend request).
- A public room exists and both users are members.

---

## 1. Layout & Navigation

### 1.1 Three-column layout
| Step | Expected |
|------|----------|
| Navigate to `/` as authenticated user | Chat page renders with TopNav, LeftSidebar, and RightSidebar visible |
| Resize browser to 375 px wide | LeftSidebar collapses gracefully; RightSidebar hidden (`hidden lg:flex`); main area fills width |
| Click "Cyphrax" logo | Stays on `/` |
| Click "Sessions" nav link | Navigates to `/sessions` |
| Click Profile dropdown → "Profile" | Navigates to `/profile` |
| Click Profile dropdown → "Sign out" | Logs out and redirects to `/login` |

### 1.2 Welcome screen
| Step | Expected |
|------|----------|
| Open chat without selecting any room/contact | Welcome screen shown with Cyphrax logo and descriptive text |

---

## 2. Left Sidebar

### 2.1 Room listing
| Step | Expected |
|------|----------|
| Open sidebar | Public Rooms and Private Rooms sections visible as accordion |
| Click section header | Section collapses/expands |
| Public room exists | Room shown under "Public Rooms" with `#` prefix |
| Type in search box | Rooms filtered in real time (client-side) |
| Click a room | Room highlighted (active state); MessageList loads messages |
| Room with unread messages | Amber badge displays unread count |

### 2.2 Contacts listing
| Step | Expected |
|------|----------|
| User A has User B as contact | User B visible under "Contacts" |
| User B is online | Green dot next to username |
| User B goes AFK (>60 s idle) | Amber dot within 2 s |
| User B disconnects | Grey dot within 90 s |
| Click contact | DM conversation opens in MessageList |
| DM has unread | Badge count shown on contact |

### 2.3 Create Room modal
| Step | Expected |
|------|----------|
| Click "Create Room" button | Modal opens |
| Submit with empty name | Submit button disabled / HTML5 validation |
| Submit valid name | Room created, appears in sidebar, becomes active |
| Tick "Private room" | Room created as private; appears under Private Rooms section |
| Room name already taken | Error message shown in modal |

---

## 3. Right Sidebar

| Step | Expected |
|------|----------|
| Select a public room | Right sidebar shows room name, description, visibility badge, member count |
| Members list visible | Owner, Admins, Members grouped with presence dots |
| Current user is admin/owner | "Invite User" button visible |
| Type username and click "Send Invite" | Success message shown; invited user receives invitation |
| Invalid username | Error message shown |
| Select a DM context | Right sidebar shows "Direct message" placeholder |
| No active context | Sidebar shows "Select a room…" prompt |

---

## 4. Message List

### 4.1 Initial load
| Step | Expected |
|------|----------|
| Select room with messages | Last 50 messages load; oldest at top, newest at bottom |
| Room has fewer than 50 messages | All messages shown; "Beginning of conversation" label visible |
| Room is empty | "No messages yet. Say hello!" placeholder |

### 4.2 Infinite scroll
| Step | Expected |
|------|----------|
| Room has >50 messages | Loading spinner appears at top when scrolled within 200 px of top |
| Older messages load | Scroll position preserved (no jump) |
| All history loaded | "Beginning of conversation" label; no further loads |
| Rapidly scroll to top | Only one concurrent request (loading guard) |

### 4.3 Auto-scroll
| Step | Expected |
|------|----------|
| User at bottom; new message arrives | List smoothly scrolls to new message |
| User scrolled up; new message arrives | No forced scroll; user stays in history |

### 4.4 Message item display
| Step | Expected |
|------|----------|
| Regular message | Avatar initials, username, timestamp, content visible |
| Message with `editedAt` | `(edited)` label shown in grey italic |
| Soft-deleted message | `(message deleted)` placeholder; no attachments shown |
| Message with `replyToId` | Quoted preview shown above content with blue left border |
| Reply parent is deleted | `(message deleted)` in reply preview |

### 4.5 Attachments
| Step | Expected |
|------|----------|
| Message has image attachment | Thumbnail shown inline; click opens full image in new tab |
| Message has non-image attachment | Download card shown with filename and file size |
| Soft-deleted message with attachments | Attachments hidden |

---

## 5. Message Input

### 5.1 Basic sending
| Step | Expected |
|------|----------|
| Type text and press Enter | Message sent; appears in list immediately |
| Press Shift+Enter | Newline inserted; message NOT sent |
| Click Send button | Message sent |
| Send button with empty text and no attachment | Button disabled |
| Textarea grows with content | Max 5 rows; scrolls beyond that |

### 5.2 Emoji picker
| Step | Expected |
|------|----------|
| Click emoji button | Picker opens below button |
| Select an emoji | Emoji appended to text; picker closes |
| Click outside picker | Picker closes |

### 5.3 File upload
| Step | Expected |
|------|----------|
| Click paperclip button | File dialog opens |
| Select image ≤ 3 MB | Upload progress shown (spinner); attachment indicator appears |
| Select file > 20 MB | Error alert shown ("File upload failed") |
| Remove pending attachment | Click ✕ on indicator; attachment cleared |
| Send message with pending attachment | Message includes attachment; displayed inline or as card |

### 5.4 Paste to upload
| Step | Expected |
|------|----------|
| Copy an image from browser and paste into textarea | Image auto-uploaded; attachment indicator appears |
| Paste plain text | Text inserted normally; no upload triggered |

### 5.5 Reply banner
| Step | Expected |
|------|----------|
| Right-click message → Reply | Reply banner appears above input: "Replying to @username: <excerpt>" |
| Click ✕ on banner | Reply cleared; message sent without `replyToId` |
| Send while replying | Message sent with `replyToId`; reply preview shown in MessageItem |

### 5.6 Typing indicator
| Step | Expected |
|------|----------|
| User A types in a room | User B sees "@username is typing…" within 1 s |
| User A stops typing for 3 s | Typing indicator disappears for User B |
| Multiple users typing | All usernames listed: "@alice, @bob are typing…" |

---

## 6. Message Actions (context menu)

### 6.1 Desktop hover
| Step | Expected |
|------|----------|
| Hover over own message | Three-dot menu appears in top-right corner |
| Click three-dot → "Reply" | Reply banner populated |
| Click three-dot → "Edit" | `prompt()` dialog opens with existing text |
| Submit edited text | Message updated in place; `(edited)` label appears |
| Click three-dot → "Delete" | Confirm dialog shown |
| Confirm deletion | Message replaced with `(message deleted)` placeholder |
| Hover over other user's message | "Reply" visible; "Edit" and "Delete" hidden |
| Admin user hovers over any message | "Delete" visible |

### 6.2 Mobile long-press
| Step | Expected |
|------|----------|
| Long-press (>500 ms) on message on mobile | Context menu opens |

---

## 7. Real-time Events

### 7.1 New messages
| Step | Expected |
|------|----------|
| User A sends a message | User B sees it appear within 3 s without refreshing |
| User B is viewing a different room | Unread badge increments on the source room |

### 7.2 Message edits
| Step | Expected |
|------|----------|
| User A edits a message | User B sees updated content in place with `(edited)` label within 3 s |

### 7.3 Message deletions
| Step | Expected |
|------|----------|
| User A deletes a message | User B sees `(message deleted)` placeholder within 3 s |

### 7.4 Unread badges
| Step | Expected |
|------|----------|
| New message arrives in inactive room | Badge count increments |
| User opens that room | Badge cleared; `read` socket event emitted |

---

## 8. Activity & Presence

| Step | Expected |
|------|----------|
| User moves mouse / types | `activity` event emitted (throttled to once/10 s) |
| User idle for >60 s | Presence transitions to AFK (amber dot) for other users |
| User interacts again | Presence transitions back to online (green dot) |
| User closes tab | Presence transitions to offline within 90 s |

---

## 9. TypeScript Build

| Check | Expected |
|-------|----------|
| `npm run build` in `frontend/` | No TypeScript errors; Vite produces dist/ |

---

## 10. Acceptance Criteria Cross-check

| Criterion | Status |
|-----------|--------|
| Opening a room loads last 50 messages | ✅ |
| Scroll to top loads older messages without breaking position | ✅ |
| Sending a message appears immediately and in real time for others (<3 s) | ✅ |
| Editing updates in place with "(edited)" label | ✅ |
| Soft-delete shows placeholder for all users | ✅ |
| Reply shows quoted preview correctly | ✅ |
| Emoji picker inserts emoji | ✅ |
| Image upload (≤3 MB) shows inline | ✅ |
| Typing indicator appears and disappears after 3 s | ✅ |
| Presence dots update within 2 s of AFK/online transition | ✅ |
| Layout usable on 375 px mobile | ✅ |

---

## Known Limitations / Phase 8 TODOs

- `isAdmin` flag in `Chat.tsx` is hardcoded to `false`; admin-gated "Delete" in context menu and "Invite User" / "Manage room" in RightSidebar require Phase 8 room member resolution.
- Sessions page and Profile page are placeholder stubs — implemented in Phase 8.
- ManageRoom modal not yet built — Phase 8.
- Friend request flow UI not yet exposed in LeftSidebar — Phase 8.
- Room invitation toast not yet implemented — Phase 8.
