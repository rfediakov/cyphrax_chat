# Agent 1 - Auth and Sessions Test Plan

## Goal

Validate account creation, login persistence, password recovery/change, account deletion, and per-session control.

## Test Cases

| ID | Step | Expected |
|----|------|----------|
| A1-01 | Register with unique email, username, password | Account created; username and email are unique |
| A1-02 | Register with duplicate email | Rejected with conflict/validation error |
| A1-03 | Register with duplicate username | Rejected with conflict/validation error |
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
| A1-15 | Delete account | User account removed or soft-deleted per implementation; memberships in other rooms removed |
| A1-16 | Delete account for a user who owns rooms | Only owned rooms are deleted; their room messages/files are deleted permanently |

## Coverage Notes

- registration rules
- login/logout behavior
- persistent login across browser restart
- password reset and password change
- active session list and targeted revocation
- current-session-only logout behavior
- account deletion and owned-room cascade
