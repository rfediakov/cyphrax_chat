# Phase 4 — Core API: Test Plan

**Branch:** `phase-4/core-api`  
**Covers:** Contacts/Friends, Rooms, Room Messages, Dialog Messages, File Attachments  
**Spec reference:** `TECHNICAL_SPEC.md §5, §8, §11, §12.2, §12.3, §12.5, §12.6`

---

## Prerequisites

- Docker Desktop running
- Repository on branch `phase-4/core-api`
- `jq` installed locally (for pretty-printing JSON responses)
- No `.env` file needed — `docker-compose.yml` injects all required vars

---

## Setup — Start the stack

```bash
docker compose up --build
```

**Expected API logs:**
```
[MongoDB] Connected
[MongoDB] Ready (autoIndex: true)
[Redis] Connected
[Redis] Ready
[Redis] Ping OK
Server running on port 3001
```

### Create two test users

Run these once; all subsequent tests reuse these users.

```bash
# Register alice
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","username":"alice","password":"alicepass"}' | jq

# Register bob
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com","username":"bob","password":"bobpass"}' | jq

# Register charlie (for invite and ban tests)
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"charlie@example.com","username":"charlie","password":"charliepass"}' | jq
```

### Obtain access tokens (reuse these variables throughout)

```bash
ALICE_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"alicepass"}' | jq -r '.accessToken')

BOB_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com","password":"bobpass"}' | jq -r '.accessToken')

CHARLIE_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"charlie@example.com","password":"charliepass"}' | jq -r '.accessToken')
```

---

## Test 1 — Friend requests

### 1a. Send a friend request

```bash
curl -s -X POST http://localhost:3001/api/v1/contacts/request \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"toUsername":"bob","message":"Hey Bob!"}' | jq
```

**Expected — 201 Created:**
```json
{ "message": "Friend request sent" }
```

Verify in MongoDB:
```bash
docker compose exec mongo mongosh chat \
  --eval "db.friendrequests.findOne({status:'pending'})"
```

Confirm `fromUser` is alice's ObjectId and `status` is `"pending"`.

---

### 1b. Duplicate request returns 409

```bash
curl -s -X POST http://localhost:3001/api/v1/contacts/request \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"toUsername":"bob"}' | jq
```

**Expected — 409 Conflict:**
```json
{ "error": "Friend request already pending" }
```

---

### 1c. Cannot send request to yourself

```bash
curl -s -X POST http://localhost:3001/api/v1/contacts/request \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"toUsername":"alice"}' | jq
```

**Expected — 400 Bad Request:**
```json
{ "error": "Cannot send a friend request to yourself" }
```

---

### 1d. View incoming requests (as Bob)

```bash
curl -s http://localhost:3001/api/v1/contacts/requests \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
```

**Expected — 200:**
```json
{
  "requests": [
    {
      "id": "<requestId>",
      "fromUser": { "id": "<aliceId>", "username": "alice", "email": "alice@example.com" },
      "message": "Hey Bob!",
      "createdAt": "..."
    }
  ]
}
```

Save the request ID:
```bash
REQUEST_ID=$(curl -s http://localhost:3001/api/v1/contacts/requests \
  -H "Authorization: Bearer $BOB_TOKEN" | jq -r '.requests[0].id')
```

---

### 1e. Accept the friend request

```bash
curl -s -X PUT "http://localhost:3001/api/v1/contacts/requests/$REQUEST_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"accept"}' | jq
```

**Expected — 200:**
```json
{ "message": "Friend request accepted" }
```

---

### 1f. View friend list

```bash
curl -s http://localhost:3001/api/v1/contacts \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{
  "contacts": [
    { "id": "<bobId>", "username": "bob", "email": "bob@example.com" }
  ]
}
```

```bash
curl -s http://localhost:3001/api/v1/contacts \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
```

**Expected:** alice appears in bob's list too (bidirectional friendship).

---

### 1g. Reject a friend request

First send alice → charlie request:
```bash
curl -s -X POST http://localhost:3001/api/v1/contacts/request \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"toUsername":"charlie"}' | jq

CHARLIE_REQ_ID=$(curl -s http://localhost:3001/api/v1/contacts/requests \
  -H "Authorization: Bearer $CHARLIE_TOKEN" | jq -r '.requests[0].id')

curl -s -X PUT "http://localhost:3001/api/v1/contacts/requests/$CHARLIE_REQ_ID" \
  -H "Authorization: Bearer $CHARLIE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"reject"}' | jq
```

**Expected — 200:**
```json
{ "message": "Friend request rejected" }
```

Charlie's incoming requests list should now be empty:
```bash
curl -s http://localhost:3001/api/v1/contacts/requests \
  -H "Authorization: Bearer $CHARLIE_TOKEN" | jq '.requests | length'
# Expected: 0
```

---

### 1h. Invalid action returns 400

```bash
curl -s -X PUT "http://localhost:3001/api/v1/contacts/requests/$REQUEST_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"maybe"}' | jq
```

**Expected — 400:**
```json
{ "error": "action must be \"accept\" or \"reject\"" }
```

---

### 1i. Remove a friend

```bash
BOB_ID=$(curl -s http://localhost:3001/api/v1/users/me \
  -H "Authorization: Bearer $BOB_TOKEN" | jq -r '.id')

curl -s -X DELETE "http://localhost:3001/api/v1/contacts/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "Friend removed" }
```

Alice's contact list should now be empty:
```bash
curl -s http://localhost:3001/api/v1/contacts \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq '.contacts | length'
# Expected: 0
```

---

## Test 2 — User-to-user ban (§12.3)

Re-establish the alice ↔ bob friendship:
```bash
curl -s -X POST http://localhost:3001/api/v1/contacts/request \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"toUsername":"bob"}' | jq

BOB_REQ_ID=$(curl -s http://localhost:3001/api/v1/contacts/requests \
  -H "Authorization: Bearer $BOB_TOKEN" | jq -r '.requests[0].id')

curl -s -X PUT "http://localhost:3001/api/v1/contacts/requests/$BOB_REQ_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"accept"}' | jq
```

### 2a. Alice bans Bob

```bash
BOB_ID=$(curl -s http://localhost:3001/api/v1/users/me \
  -H "Authorization: Bearer $BOB_TOKEN" | jq -r '.id')

curl -s -X POST "http://localhost:3001/api/v1/contacts/ban/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "User banned" }
```

Verify §12.3 cascade in MongoDB:
```bash
docker compose exec mongo mongosh chat \
  --eval "db.friendrequests.countDocuments({status:'accepted'})"
# Expected: 0  (the accepted friendship was deleted)

docker compose exec mongo mongosh chat \
  --eval "db.userbans.findOne({})"
# Expected: document with blockerId = aliceId, blockedId = bobId
```

---

### 2b. Banned user cannot send a friend request

```bash
curl -s -X POST http://localhost:3001/api/v1/contacts/request \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"toUsername":"alice"}' | jq
```

**Expected — 403 Forbidden:**
```json
{ "error": "Cannot send friend request to this user" }
```

---

### 2c. Dialog history is still visible after a ban

> The dialog between alice and bob (created in Test 5) must still be readable. This is verified in Test 5d.

---

### 2d. Unban user

```bash
curl -s -X DELETE "http://localhost:3001/api/v1/contacts/ban/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "User unbanned" }
```

```bash
docker compose exec mongo mongosh chat \
  --eval "db.userbans.countDocuments({})"
# Expected: 0
```

---

## Test 3 — Room management

### 3a. Create a public room (Alice)

```bash
ROOM=$(curl -s -X POST http://localhost:3001/api/v1/rooms \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"general","description":"The general channel","visibility":"public"}' | jq)

echo $ROOM | jq

ROOM_ID=$(echo $ROOM | jq -r '.room.id')
```

**Expected — 201 Created:**
```json
{
  "room": {
    "id": "<roomId>",
    "name": "general",
    "description": "The general channel",
    "visibility": "public",
    "ownerId": "<aliceId>",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Verify alice is also a member:
```bash
docker compose exec mongo mongosh chat \
  --eval "db.roommembers.countDocuments({roomId: ObjectId('$ROOM_ID')})"
# Expected: 1
```

---

### 3b. Duplicate room name returns 409

```bash
curl -s -X POST http://localhost:3001/api/v1/rooms \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"general"}' | jq
```

**Expected — 409 Conflict:**
```json
{ "error": "Room name already taken" }
```

---

### 3c. Get room details

```bash
curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
```

**Expected — 200:** room object with id, name, description, visibility, ownerId, timestamps.

---

### 3d. Public room catalog with text search

```bash
# Create a second room so search returns something
curl -s -X POST http://localhost:3001/api/v1/rooms \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"random","description":"Off-topic discussion","visibility":"public"}' | jq

RANDOM_ROOM_ID=$(curl -s "http://localhost:3001/api/v1/rooms/public" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq -r '.rooms[] | select(.name=="random") | .id')

# Search by name
curl -s "http://localhost:3001/api/v1/rooms/public?q=general" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{
  "rooms": [
    { "id": "<roomId>", "name": "general", "description": "The general channel", ... }
  ],
  "total": 1
}
```

No `q` → all public rooms (paginated):
```bash
curl -s "http://localhost:3001/api/v1/rooms/public?page=1" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq '.total'
# Expected: 2
```

---

### 3e. Join a public room (Bob joins general)

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/join" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "Joined room" }
```

Verify member count is now 2:
```bash
curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/members" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq '.members | length'
# Expected: 2
```

---

### 3f. Member list includes role info

```bash
curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/members" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{
  "members": [
    { "id": "...", "user": { "id": "<aliceId>", "username": "alice", ... }, "role": "owner", "joinedAt": "..." },
    { "id": "...", "user": { "id": "<bobId>", "username": "bob", ... }, "role": "member", "joinedAt": "..." }
  ]
}
```

Non-members get 403:
```bash
curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/members" \
  -H "Authorization: Bearer $CHARLIE_TOKEN" | jq
# Expected: { "error": "You are not a member of this room" }
```

---

### 3g. Update room settings (owner only)

```bash
curl -s -X PUT "http://localhost:3001/api/v1/rooms/$ROOM_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Updated description"}' | jq
```

**Expected — 200:** room object with updated description.

Non-owner update returns 403:
```bash
curl -s -X PUT "http://localhost:3001/api/v1/rooms/$ROOM_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Hacked"}' | jq
# Expected: { "error": "Only the owner can update room settings" }
```

---

### 3h. Promote Bob to admin (owner only)

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/admins/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "User promoted to admin" }
```

Member list should now show Bob with `role: "admin"`:
```bash
curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/members" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq '.members[] | select(.user.username=="bob") | .role'
# Expected: "admin"
```

---

### 3i. Demote Bob back to member

```bash
curl -s -X DELETE "http://localhost:3001/api/v1/rooms/$ROOM_ID/admins/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "User demoted to member" }
```

---

### 3j. Owner cannot leave (§12.4)

```bash
curl -s -X DELETE "http://localhost:3001/api/v1/rooms/$ROOM_ID/leave" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 400 Bad Request:**
```json
{ "error": "Room owner cannot leave; transfer ownership or delete the room" }
```

---

### 3k. Member can leave

```bash
curl -s -X DELETE "http://localhost:3001/api/v1/rooms/$ROOM_ID/leave" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "Left room" }
```

Member count should be back to 1:
```bash
curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/members" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq '.members | length'
# Expected: 1
```

---

### 3l. Room ban / unban (§11 — remove-member = ban)

Re-join Bob first:
```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/join" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq

# Ban Bob from the room
curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/ban/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "User banned from room" }
```

Verify Bob is removed from members and added to ban list:
```bash
curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/members" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq '.members | length'
# Expected: 1 (only Alice)

curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/bans" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected bans response:**
```json
{
  "bans": [
    {
      "id": "...",
      "user": { "id": "<bobId>", "username": "bob" },
      "bannedBy": { "id": "<aliceId>", "username": "alice" },
      "bannedAt": "..."
    }
  ]
}
```

Banned user cannot join:
```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/join" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
# Expected: { "error": "You are banned from this room" }
```

Unban Bob:
```bash
curl -s -X DELETE "http://localhost:3001/api/v1/rooms/$ROOM_ID/ban/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
# Expected: { "message": "User unbanned from room" }
```

---

## Test 4 — Private room & invitations

### 4a. Create a private room

```bash
PRIV_ROOM=$(curl -s -X POST http://localhost:3001/api/v1/rooms \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"secret","description":"Invite only","visibility":"private"}' | jq)

PRIV_ROOM_ID=$(echo $PRIV_ROOM | jq -r '.room.id')
```

---

### 4b. Joining a private room is rejected

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/$PRIV_ROOM_ID/join" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
```

**Expected — 403 Forbidden:**
```json
{ "error": "This room requires an invitation" }
```

---

### 4c. Send invitation

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/$PRIV_ROOM_ID/invitations" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"username":"bob"}' | jq
```

**Expected — 201 Created:**
```json
{ "message": "Invitation sent" }
```

---

### 4d. Accept invitation (as Bob)

```bash
INV_ID=$(docker compose exec mongo mongosh chat --quiet \
  --eval "JSON.stringify(db.roominvitations.findOne({invitedUser: db.users.findOne({username:'bob'})._id}, {_id:1})._id)")

# Strip surrounding quotes from the ID
INV_ID=$(echo $INV_ID | tr -d '"')

curl -s -X PUT "http://localhost:3001/api/v1/rooms/$PRIV_ROOM_ID/invitations/$INV_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"accept"}' | jq
```

**Expected — 200:**
```json
{ "message": "Invitation accepted" }
```

Bob should now be a member:
```bash
curl -s "http://localhost:3001/api/v1/rooms/$PRIV_ROOM_ID/members" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq '.members | length'
# Expected: 2
```

---

### 4e. Reject invitation (Charlie)

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/$PRIV_ROOM_ID/invitations" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"username":"charlie"}' | jq

CHARLIE_INV_ID=$(docker compose exec mongo mongosh chat --quiet \
  --eval "JSON.stringify(db.roominvitations.findOne({invitedUser: db.users.findOne({username:'charlie'})._id, status:'pending'}, {_id:1})._id)" | tr -d '"')

curl -s -X PUT "http://localhost:3001/api/v1/rooms/$PRIV_ROOM_ID/invitations/$CHARLIE_INV_ID" \
  -H "Authorization: Bearer $CHARLIE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"reject"}' | jq
# Expected: { "message": "Invitation rejected" }

# Charlie remains non-member
curl -s "http://localhost:3001/api/v1/rooms/$PRIV_ROOM_ID/members" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq '.members | length'
# Expected: 2
```

---

## Test 5 — Room messages

### 5a. Send a message in general room

Bob re-joins general first:
```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/join" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq

MSG=$(curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hello everyone!"}' | jq)

echo $MSG | jq
MSG_ID=$(echo $MSG | jq -r '.message.id')
```

**Expected — 201 Created:**
```json
{
  "message": {
    "id": "<msgId>",
    "roomId": "<roomId>",
    "authorId": "<aliceId>",
    "content": "Hello everyone!",
    "replyToId": null,
    "editedAt": null,
    "deletedAt": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### 5b. Message over 3 KB is rejected (§12.5)

```bash
LONG=$(python3 -c "print('x' * 3073)")
curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"$LONG\"}" | jq
```

**Expected — 400 Bad Request:**
```json
{ "error": "Message exceeds 3 KB limit" }
```

---

### 5c. Reply to a message

```bash
REPLY=$(curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"Hi Alice!\",\"replyToId\":\"$MSG_ID\"}" | jq)

echo $REPLY | jq '.message.replyToId'
# Expected: "<msgId>"
```

---

### 5d. Cursor-based message pagination (§12.6)

Send a few more messages to have data:
```bash
for i in 1 2 3 4 5; do
  curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages" \
    -H "Authorization: Bearer $ALICE_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"content\":\"Message $i\"}" | jq -r '.message.id'
done
```

Fetch first page (limit=3):
```bash
PAGE1=$(curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages?limit=3" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq)

echo $PAGE1 | jq '.data | length'
# Expected: 3

CURSOR=$(echo $PAGE1 | jq -r '.nextCursor')
echo "Next cursor: $CURSOR"
# Expected: a non-null ObjectId string
```

Fetch next page using cursor:
```bash
PAGE2=$(curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages?limit=3&before=$CURSOR" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq)

echo $PAGE2 | jq '.data | length'
# Expected: 3 (or fewer if fewer messages remain)
```

Verify messages are in reverse-chronological order (newest first):
```bash
echo $PAGE1 | jq '[.data[].id]'
# IDs should descend (newest first); client reverses for display
```

When no more messages remain, `nextCursor` is null:
```bash
# Fetch all messages in one shot
ALL=$(curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages?limit=100" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq)

echo $ALL | jq '.nextCursor'
# Expected: null (all messages fit in one page)
```

---

### 5e. Non-member cannot read messages

```bash
curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $CHARLIE_TOKEN" | jq
```

**Expected — 403 Forbidden:**
```json
{ "error": "You are not a member of this room" }
```

---

### 5f. Edit a message (author only)

```bash
curl -s -X PUT "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages/$MSG_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hello everyone! (edited)"}' | jq
```

**Expected — 200:**
```json
{
  "message": {
    "id": "<msgId>",
    "content": "Hello everyone! (edited)",
    "editedAt": "<ISO timestamp>",
    ...
  }
}
```

Non-author edit returns 403:
```bash
curl -s -X PUT "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages/$MSG_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hacked"}' | jq
# Expected: { "error": "You can only edit your own messages" }
```

---

### 5g. Soft-delete a message

```bash
curl -s -X DELETE "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages/$MSG_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "Message deleted" }
```

The message still appears in history but with `[deleted]` content:
```bash
curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq '.data[] | select(.id=="'"$MSG_ID"'") | {content, deletedAt}'
```

**Expected:**
```json
{ "content": "[deleted]", "deletedAt": "<ISO timestamp>" }
```

Admin can also soft-delete:
```bash
REPLY_MSG_ID=$(echo $REPLY | jq -r '.message.id')

# Promote Bob to admin so he can delete Alice's messages
curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/admins/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq

# Bob (admin) deletes alice's message
ALICE_MSG2_ID=$(curl -s "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages?limit=10" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq -r '[.data[] | select(.content | startswith("Message"))][0].id')

curl -s -X DELETE "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages/$ALICE_MSG2_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
# Expected: { "message": "Message deleted" }
```

---

## Test 6 — Room deletion cascade (§12.2)

Create a temporary room, send a message, then delete the room:

```bash
TEMP_ROOM=$(curl -s -X POST http://localhost:3001/api/v1/rooms \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"temp-room","visibility":"public"}' | jq)

TEMP_ROOM_ID=$(echo $TEMP_ROOM | jq -r '.room.id')

# Send a message
curl -s -X POST "http://localhost:3001/api/v1/rooms/$TEMP_ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"This will be deleted"}' | jq

# Delete the room
curl -s -X DELETE "http://localhost:3001/api/v1/rooms/$TEMP_ROOM_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{ "message": "Room deleted" }
```

Verify cascade in MongoDB:
```bash
docker compose exec mongo mongosh chat --eval "
print('Rooms:', db.rooms.countDocuments({_id: ObjectId('$TEMP_ROOM_ID')}));
print('Messages:', db.messages.countDocuments({roomId: ObjectId('$TEMP_ROOM_ID')}));
print('Members:', db.roommembers.countDocuments({roomId: ObjectId('$TEMP_ROOM_ID')}));
"
# Expected: all 0
```

Non-owner cannot delete:
```bash
curl -s -X DELETE "http://localhost:3001/api/v1/rooms/$ROOM_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
# Expected: { "error": "Only the owner can delete the room" }
```

---

## Test 7 — Dialog messages

First re-establish alice ↔ bob friendship (if removed in Test 2):
```bash
curl -s -X POST http://localhost:3001/api/v1/contacts/request \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"toUsername":"bob"}' | jq

BOB_REQ=$(curl -s http://localhost:3001/api/v1/contacts/requests \
  -H "Authorization: Bearer $BOB_TOKEN" | jq -r '.requests[0].id')

curl -s -X PUT "http://localhost:3001/api/v1/contacts/requests/$BOB_REQ" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"accept"}' | jq
```

```bash
ALICE_ID=$(curl -s http://localhost:3001/api/v1/users/me \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq -r '.id')
```

### 7a. Send a DM

```bash
DM=$(curl -s -X POST "http://localhost:3001/api/v1/dialogs/$BOB_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hey Bob, private message!"}' | jq)

echo $DM | jq
DM_MSG_ID=$(echo $DM | jq -r '.message.id')
```

**Expected — 201 Created:**
```json
{
  "message": {
    "id": "<msgId>",
    "dialogId": "<dialogId>",
    "authorId": "<aliceId>",
    "content": "Hey Bob, private message!",
    ...
  }
}
```

---

### 7b. Non-friend cannot send DM

```bash
curl -s -X POST "http://localhost:3001/api/v1/dialogs/$BOB_ID/messages" \
  -H "Authorization: Bearer $CHARLIE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Spam!"}' | jq
```

**Expected — 403 Forbidden:**
```json
{ "error": "You must be friends to send a direct message" }
```

---

### 7c. List dialogs

```bash
curl -s http://localhost:3001/api/v1/dialogs \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

**Expected — 200:**
```json
{
  "dialogs": [
    {
      "id": "<dialogId>",
      "otherUser": { "id": "<bobId>", "username": "bob" },
      "lastMessage": { "id": "...", "content": "Hey Bob, private message!", ... },
      "updatedAt": "..."
    }
  ]
}
```

---

### 7d. Fetch dialog message history (cursor pagination)

```bash
# Send a few more DMs to have data
for i in 1 2 3 4 5; do
  curl -s -X POST "http://localhost:3001/api/v1/dialogs/$BOB_ID/messages" \
    -H "Authorization: Bearer $ALICE_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"content\":\"DM number $i\"}" | jq -r '.message.id'
done

# Paginate
DM_PAGE1=$(curl -s "http://localhost:3001/api/v1/dialogs/$BOB_ID/messages?limit=3" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq)

echo $DM_PAGE1 | jq '.data | length'
# Expected: 3

DM_CURSOR=$(echo $DM_PAGE1 | jq -r '.nextCursor')

DM_PAGE2=$(curl -s "http://localhost:3001/api/v1/dialogs/$BOB_ID/messages?limit=3&before=$DM_CURSOR" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq)

echo $DM_PAGE2 | jq '.data | length'
# Expected: 3
```

Both endpoints (GET by alice and GET by bob using alice's ID) return the same dialog:
```bash
curl -s "http://localhost:3001/api/v1/dialogs/$ALICE_ID/messages?limit=3" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq '.data | length'
# Expected: 3 (same dialog, symmetric access)
```

---

### 7e. Edit and soft-delete a DM

```bash
# Edit
curl -s -X PUT "http://localhost:3001/api/v1/dialogs/$BOB_ID/messages/$DM_MSG_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hey Bob (edited)!"}' | jq

# Soft-delete
curl -s -X DELETE "http://localhost:3001/api/v1/dialogs/$BOB_ID/messages/$DM_MSG_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
# Expected: { "message": "Message deleted" }
```

Bob cannot delete Alice's DM:
```bash
curl -s -X DELETE "http://localhost:3001/api/v1/dialogs/$ALICE_ID/messages/$DM_MSG_ID" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq
# Expected: { "error": "You can only delete your own messages" }
```

---

### 7f. Banned user cannot send DM (§12.3)

```bash
# Alice bans Bob
curl -s -X POST "http://localhost:3001/api/v1/contacts/ban/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq

# Bob tries to DM Alice
curl -s -X POST "http://localhost:3001/api/v1/dialogs/$ALICE_ID/messages" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Can you hear me?"}' | jq
```

**Expected — 403 Forbidden:**
```json
{ "error": "Messaging is blocked between these users" }
```

Dialog history remains accessible (not deleted):
```bash
curl -s "http://localhost:3001/api/v1/dialogs/$ALICE_ID/messages?limit=5" \
  -H "Authorization: Bearer $BOB_TOKEN" | jq '.data | length'
# Expected: > 0 (history is still visible)
```

Unban to restore for remaining tests:
```bash
curl -s -X DELETE "http://localhost:3001/api/v1/contacts/ban/$BOB_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

---

## Test 8 — File attachments

### 8a. Upload an image (≤ 3 MB)

Create a 100 KB test image:
```bash
dd if=/dev/urandom bs=1024 count=100 > /tmp/test-image.jpg 2>/dev/null

curl -s -X POST http://localhost:3001/api/v1/attachments/upload \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "file=@/tmp/test-image.jpg;type=image/jpeg" \
  -F "roomId=$ROOM_ID" | jq
```

**Expected — 201 Created:**
```json
{
  "id": "<attachmentId>",
  "url": "/api/v1/attachments/<attachmentId>"
}
```

Save the attachment ID:
```bash
ATT_ID=$(curl -s -X POST http://localhost:3001/api/v1/attachments/upload \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "file=@/tmp/test-image.jpg;type=image/jpeg" \
  -F "roomId=$ROOM_ID" | jq -r '.id')
```

Verify file exists on disk inside the container:
```bash
docker compose exec api ls "/uploads/$ROOM_ID/"
```

---

### 8b. Image over 3 MB is rejected with 413

```bash
dd if=/dev/urandom bs=1024 count=3100 > /tmp/big-image.jpg 2>/dev/null

curl -s -X POST http://localhost:3001/api/v1/attachments/upload \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "file=@/tmp/big-image.jpg;type=image/jpeg" \
  -F "roomId=$ROOM_ID" | jq
```

**Expected — 413:**
```json
{ "error": "Image exceeds 3 MB limit" }
```

---

### 8c. Non-image file (≤ 20 MB) uploads successfully

```bash
dd if=/dev/urandom bs=1024 count=500 > /tmp/document.pdf 2>/dev/null

PDF_ATT_ID=$(curl -s -X POST http://localhost:3001/api/v1/attachments/upload \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "file=@/tmp/document.pdf;type=application/pdf" \
  -F "roomId=$ROOM_ID" | jq -r '.id')

echo "PDF attachment: $PDF_ATT_ID"
```

**Expected — 201 Created** with id and url.

---

### 8d. Send a message with an attachment

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"Here's an image\",\"attachmentId\":\"$ATT_ID\"}" | jq
```

**Expected — 201 Created:** message with content.

Verify the attachment's messageId is now set:
```bash
docker compose exec mongo mongosh chat \
  --eval "db.attachments.findOne({_id: ObjectId('$ATT_ID')}, {messageId:1})"
# Expected: messageId is a non-null ObjectId
```

---

### 8e. Authenticated room member can download attachment

```bash
curl -s -o /tmp/downloaded.jpg \
  -H "Authorization: Bearer $BOB_TOKEN" \
  "http://localhost:3001/api/v1/attachments/$ATT_ID"

# Verify file was downloaded (non-zero size)
ls -la /tmp/downloaded.jpg
```

**Expected:** file is downloaded successfully (HTTP 200).

---

### 8f. Non-member cannot download attachment (403)

```bash
curl -s -w "%{http_code}" -o /dev/null \
  -H "Authorization: Bearer $CHARLIE_TOKEN" \
  "http://localhost:3001/api/v1/attachments/$ATT_ID"
```

**Expected:** `403`

---

### 8g. No auth → 401

```bash
curl -s -w "%{http_code}" -o /dev/null \
  "http://localhost:3001/api/v1/attachments/$ATT_ID"
```

**Expected:** `401`

---

## Test 9 — Cascade: room deletion removes attachment files from disk

```bash
CASCADE_ROOM=$(curl -s -X POST http://localhost:3001/api/v1/rooms \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"cascade-test","visibility":"public"}' | jq)

CASCADE_ROOM_ID=$(echo $CASCADE_ROOM | jq -r '.room.id')

# Upload a file to this room
CASCADE_ATT=$(curl -s -X POST http://localhost:3001/api/v1/attachments/upload \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "file=@/tmp/test-image.jpg;type=image/jpeg" \
  -F "roomId=$CASCADE_ROOM_ID" | jq)

CASCADE_ATT_ID=$(echo $CASCADE_ATT | jq -r '.id')

# Send a message linking the attachment
curl -s -X POST "http://localhost:3001/api/v1/rooms/$CASCADE_ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"file\",\"attachmentId\":\"$CASCADE_ATT_ID\"}" | jq

# Get the stored path before deletion
STORED_PATH=$(docker compose exec mongo mongosh chat --quiet \
  --eval "JSON.stringify(db.attachments.findOne({_id: ObjectId('$CASCADE_ATT_ID')}, {storedPath:1}).storedPath)" | tr -d '"')

# Delete the room
curl -s -X DELETE "http://localhost:3001/api/v1/rooms/$CASCADE_ROOM_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq
```

Verify attachment record is gone from MongoDB:
```bash
docker compose exec mongo mongosh chat \
  --eval "db.attachments.countDocuments({_id: ObjectId('$CASCADE_ATT_ID')})"
# Expected: 0
```

Verify the physical file was removed from disk:
```bash
docker compose exec api test -f "$STORED_PATH" && echo "EXISTS" || echo "DELETED"
# Expected: DELETED
```

---

## Teardown

```bash
docker compose down -v
```

**Expected:** All containers stop and volumes are removed without errors.

---

## Acceptance Criteria Checklist

### Contacts / Friends
- [ ] `POST /contacts/request` sends a friend request; 409 on duplicate; 400 on self-request
- [ ] `GET /contacts/requests` returns pending incoming requests with sender info
- [ ] `PUT /contacts/requests/:id` accepts or rejects; invalid action returns 400
- [ ] `GET /contacts` returns all accepted friends (bidirectional)
- [ ] `DELETE /contacts/:userId` removes the friendship
- [ ] `POST /contacts/ban/:userId` deletes accepted FriendRequest and creates UserBan (§12.3)
- [ ] `DELETE /contacts/ban/:userId` removes the UserBan
- [ ] Banned user cannot send a friend request (403)

### Rooms
- [ ] `POST /rooms` creates room; creator is automatically added as member
- [ ] Duplicate room name returns 409
- [ ] `GET /rooms/public?q=` returns paginated results with text search working
- [ ] `GET /rooms/:id` returns room details
- [ ] `PUT /rooms/:id` owner can update; non-owner gets 403
- [ ] `DELETE /rooms/:id` owner can delete with full cascade (messages, attachments, files, members, bans, invitations)
- [ ] Non-owner cannot delete (403)
- [ ] `POST /rooms/:id/join` joins public room; 403 if banned
- [ ] `POST /rooms/:id/join` returns 403 for private rooms
- [ ] `DELETE /rooms/:id/leave` owner gets 400; member leaves successfully
- [ ] `GET /rooms/:id/members` returns member list with roles; 403 for non-members
- [ ] `POST/DELETE /rooms/:id/admins/:userId` promotes/demotes admin (owner only)
- [ ] `POST /rooms/:id/ban/:userId` bans + removes from members; 403 for non-admins
- [ ] Banned user cannot join the room (403)
- [ ] `DELETE /rooms/:id/ban/:userId` unbans user
- [ ] `GET /rooms/:id/bans` returns ban list; restricted to admins/owner
- [ ] `POST /rooms/:id/invitations` invites user to private room
- [ ] `PUT /rooms/:id/invitations/:invId` accept adds user as member; reject does not

### Room Messages
- [ ] `POST /rooms/:id/messages` creates message; 201 with full message object
- [ ] Content > 3 KB returns 400 (§12.5)
- [ ] `replyToId` stored correctly on message
- [ ] Non-member POST returns 403
- [ ] `GET /rooms/:id/messages` returns reverse-chronological page; `nextCursor` for next page
- [ ] `before` cursor filters correctly; `nextCursor` is null when no more data
- [ ] `PUT /rooms/:id/messages/:msgId` author edits message; `editedAt` set; non-author gets 403
- [ ] `DELETE /rooms/:id/messages/:msgId` soft-deletes (author or admin); content becomes `[deleted]`

### Dialog Messages
- [ ] `POST /dialogs/:userId/messages` requires friendship; non-friend gets 403
- [ ] Banned users cannot send DMs to each other (403); history remains visible
- [ ] `GET /dialogs` lists all conversations with `lastMessage` preview
- [ ] `GET /dialogs/:userId/messages` cursor pagination works (symmetric access)
- [ ] `PUT /dialogs/:userId/messages/:msgId` edit; author only
- [ ] `DELETE /dialogs/:userId/messages/:msgId` soft-delete; author only

### Attachments
- [ ] `POST /attachments/upload` stores file; returns `{ id, url }`
- [ ] Image > 3 MB returns 413; the temp file is cleaned up
- [ ] Non-image ≤ 20 MB uploads successfully
- [ ] Sending a message with `attachmentId` links the attachment to the message
- [ ] `GET /attachments/:id` streams the file for authenticated room members/dialog participants
- [ ] Non-member access returns 403; unauthenticated access returns 401
- [ ] Room deletion cascade removes attachment records and physical files from disk

### General
- [ ] TypeScript build: `cd backend && npm run build` exits 0
- [ ] `docker compose down -v` cleans up without errors
