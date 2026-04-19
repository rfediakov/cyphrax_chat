# Agent 2 - Contacts, Friend Requests, and DM Permissions Test Plan

## Goal

Validate friend workflows, bans, and the rules that control whether personal messaging is allowed.

## Test Cases

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
| A2-10 | One side bans the other after a DM history exists | Existing DM history remains visible but chat becomes read-only or frozen |
| A2-11 | Banned user tries to send new personal message | Rejected |
| A2-12 | Unban the user, re-establish friendship, send DM again | Messaging works again only after friendship is restored |
| A2-13 | Initiate friend request from room member list UI if exposed | Request flow works from room context as well as username input |

## Coverage Notes

- contacts list
- friend request creation and confirmation
- remove friend flow
- user-to-user ban semantics
- DM allowed only between friends with no bans on either side
