# Agent 4 - Messaging, History, Attachments, and Delivery Test Plan

## Goal

Validate the core message model for rooms and DMs, including replies, edits, deletes, attachments, unread handling, and offline persistence.

## Test Cases

| ID | Step | Expected |
|----|------|----------|
| A4-01 | Send room message with plain text | Message stored and rendered |
| A4-02 | Send multiline message | Line breaks preserved |
| A4-03 | Send UTF-8 text and emoji | Stored and rendered correctly |
| A4-04 | Send message larger than 3 KB | Rejected |
| A4-05 | Reply to existing room message | Reply reference stored and quoted or outlined in UI |
| A4-06 | Edit own message | Content updates and edited marker appears |
| A4-07 | Delete own message | Message is soft-deleted or replaced according to implementation; no recovery required |
| A4-08 | Non-author attempts message edit in room | Rejected |
| A4-09 | Room admin deletes someone else's room message | Allowed |
| A4-10 | Fetch room history with pagination or infinite scroll | Messages appear in chronological UI order and older pages load correctly |
| A4-11 | Open room with very old history | Older messages remain reachable through infinite scroll |
| A4-12 | Send DM with same message features as room chat | Text, replies, edits, and deletes behave the same from the UI perspective |
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
| A4-23 | Lose access to room, then try to open or download prior room attachment | Rejected |
| A4-24 | Original uploader loses room access | File remains stored but uploader cannot access it |
| A4-25 | Delete room containing attachments | Attachment records and physical files are removed permanently |

## Coverage Notes

- room and DM message parity
- replies, edits, deletes, and history
- infinite scroll and persistence
- unread indicators and offline delivery
- attachment upload methods and size limits
- attachment access control and deletion cascade
