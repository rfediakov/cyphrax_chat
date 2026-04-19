# Agent 5 - Frontend UX, Real-Time, Presence, and Mobile Test Plan

## Goal

Validate the browser experience end to end, with emphasis on low-latency real-time behavior and mobile-first usability.

## Test Cases

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
| A5-11 | All tabs idle for more than 1 minute | Presence changes to AFK |
| A5-12 | All tabs closed | Presence changes to offline |
| A5-13 | Receive friend request while on another screen | User sees a visible notification or toast |
| A5-14 | Receive private room invitation while online | User sees invitation UI and can accept or reject |
| A5-15 | Open rooms list or contacts list with unread activity | Unread badges are visible in navigation |
| A5-16 | Use sessions page in browser | Active sessions list is understandable and revocation works from UI |
| A5-17 | Use profile page in browser | Password change and account deletion flows are usable from UI |
| A5-18 | Resize to 375 px width | No broken layout or horizontal overflow on auth, chat, contacts, sessions, profile, or room-management flows |
| A5-19 | Use message actions and room management on small screen | Interactions remain reachable and usable on mobile-size viewport |
| A5-20 | Verify classic-chat feel rather than social-feed behavior | Navigation and message workflows feel room/contact driven and not feed driven |

## Coverage Notes

- browser UX and navigation
- real-time updates
- typing indicators and presence states
- multi-tab behavior
- unread and notification UX
- mobile-first layout checks
