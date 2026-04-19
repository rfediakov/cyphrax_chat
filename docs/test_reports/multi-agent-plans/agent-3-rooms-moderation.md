# Agent 3 - Rooms, Roles, Moderation, and Invitations Test Plan

## Goal

Validate room lifecycle, access rules, owner/admin permissions, and invitation-only private room behavior.

## Test Cases

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
| A3-10 | Invite user to private room | Invitation created and target user can accept or reject |
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

## Coverage Notes

- public/private rooms
- room catalog and search
- join/leave rules
- owner/admin model
- room bans and banned-user visibility
- invitation flow
- room deletion cascade
