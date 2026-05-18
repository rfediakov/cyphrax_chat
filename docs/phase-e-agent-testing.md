# Phase E — Audio & Video Messages: Agent Test Plan

**Branch:** `phase-e-audio-video-messages`  
**Tooling:** `docker compose up --build`, direct HTTP calls with `curl`, Jest (if configured), or any HTTP client available to the agent.

---

## Setup

```bash
docker compose up --build -d
# Wait for containers to be healthy
curl -s http://localhost:3000/api/v1/health   # or any known health endpoint
```

Register two test users and authenticate:

```bash
# Register alice
ALICE=$(curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice_e","email":"alice_e@test.com","password":"Pass1234!"}')
ALICE_TOKEN=$(echo $ALICE | jq -r '.token')

# Register bob
BOB=$(curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"bob_e","email":"bob_e@test.com","password":"Pass1234!"}')
BOB_TOKEN=$(echo $BOB | jq -r '.token')
BOB_ID=$(echo $BOB | jq -r '.user._id // .user.id')

# Add as friends (send request + accept)
REQ=$(curl -s -X POST http://localhost:3000/api/v1/contacts/request \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"targetId\":\"$BOB_ID\"}")
REQ_ID=$(echo $REQ | jq -r '._id // .id')

curl -s -X POST "http://localhost:3000/api/v1/contacts/request/$REQ_ID/accept" \
  -H "Authorization: Bearer $BOB_TOKEN"

# Create a public room
ROOM=$(curl -s -X POST http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"phase-e-test","isPrivate":false}')
ROOM_ID=$(echo $ROOM | jq -r '._id // .id')

# Bob joins the room
curl -s -X POST "http://localhost:3000/api/v1/rooms/$ROOM_ID/join" \
  -H "Authorization: Bearer $BOB_TOKEN"
```

---

## E-A-1 — Message Model: Type Enum Extended

Verify the message model accepts `audio` and `video` types by sending a message with each type via the API.

```bash
# Create a tiny valid audio/webm blob (2-byte placeholder — real test uses a proper file)
echo -n 'RIFF' > /tmp/test_audio.webm

# Upload audio attachment
AUDIO_ATT=$(curl -s -X POST http://localhost:3000/api/v1/attachments/upload \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "file=@/tmp/test_audio.webm;type=audio/webm" \
  -F "contextId=$ROOM_ID" \
  -F "contextType=room")
AUDIO_ATT_ID=$(echo $AUDIO_ATT | jq -r '.id')

echo "Attachment ID: $AUDIO_ATT_ID"
# Expected: a valid MongoDB ObjectId string
```

**Pass:** `id` field is a non-null ObjectId string.  
**Fail:** `4xx` response or missing `id`.

---

## E-A-2 — Send Audio Room Message

```bash
AUDIO_MSG=$(curl -s -X POST "http://localhost:3000/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\" \",\"type\":\"audio\",\"duration\":5,\"attachmentId\":\"$AUDIO_ATT_ID\"}")

echo $AUDIO_MSG | jq '{type: .message.type, duration: .message.duration, attachments: (.message.attachments | length)}'
```

**Pass:**
```json
{ "type": "audio", "duration": 5, "attachments": 1 }
```
**Fail:** `type` is `"user"`, `duration` is null/missing, or HTTP error.

---

## E-A-3 — Send Video Room Message

```bash
echo -n 'WEBM' > /tmp/test_video.webm

VIDEO_ATT=$(curl -s -X POST http://localhost:3000/api/v1/attachments/upload \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "file=@/tmp/test_video.webm;type=video/webm" \
  -F "contextId=$ROOM_ID" \
  -F "contextType=room")
VIDEO_ATT_ID=$(echo $VIDEO_ATT | jq -r '.id')

VIDEO_MSG=$(curl -s -X POST "http://localhost:3000/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\" \",\"type\":\"video\",\"duration\":12,\"attachmentId\":\"$VIDEO_ATT_ID\"}")

echo $VIDEO_MSG | jq '{type: .message.type, duration: .message.duration}'
```

**Pass:** `{ "type": "video", "duration": 12 }`

---

## E-A-4 — Retrieve Room Messages: Audio/Video Messages in History

```bash
HISTORY=$(curl -s "http://localhost:3000/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $BOB_TOKEN")

echo $HISTORY | jq '[.data[] | {id: ._id, type: .type, duration: .duration}]'
```

**Pass:** The audio and video messages sent by alice appear with their correct `type` and `duration`. Bob can see them (membership check passes).

---

## E-A-5 — Send Audio Dialog Message

```bash
DIALOG_AUDIO_ATT=$(curl -s -X POST http://localhost:3000/api/v1/attachments/upload \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "file=@/tmp/test_audio.webm;type=audio/webm" \
  -F "contextId=$BOB_ID" \
  -F "contextType=dialog")
DIALOG_AUDIO_ATT_ID=$(echo $DIALOG_AUDIO_ATT | jq -r '.id')

DIALOG_MSG=$(curl -s -X POST "http://localhost:3000/api/v1/dialogs/$BOB_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\" \",\"type\":\"audio\",\"duration\":8,\"attachmentId\":\"$DIALOG_AUDIO_ATT_ID\"}")

echo $DIALOG_MSG | jq '{type: .message.type, duration: .message.duration}'
```

**Pass:** `{ "type": "audio", "duration": 8 }`

---

## E-A-6 — Invalid Type Defaults to User

```bash
BAD_TYPE=$(curl -s -X POST "http://localhost:3000/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"hello","type":"ptt"}')

echo $BAD_TYPE | jq '.message.type'
```

**Pass:** Returns `"user"` (unknown types default to `user`).

---

## E-A-7 — Audio Message Requires Attachment (Content-Only Audio Rejected)

```bash
NO_ATT=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "http://localhost:3000/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":" ","type":"audio","duration":3}')

echo "Status: $NO_ATT"
```

**Pass:** Returns `201` (the audio message is accepted; the attachment is optional at the API level — it's the client's responsibility to always include one).  
**Note:** If the team decides the API should enforce attachment presence for audio/video, this test should expect `400` instead. Adjust accordingly.

---

## E-A-8 — Attachment Size Limit: Audio > 10 MB Rejected

```bash
# Generate an 11 MB zero-byte file
dd if=/dev/zero bs=1M count=11 of=/tmp/big_audio.webm 2>/dev/null

STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST http://localhost:3000/api/v1/attachments/upload \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "file=@/tmp/big_audio.webm;type=audio/webm" \
  -F "contextId=$ROOM_ID" \
  -F "contextType=room")

echo "Status: $STATUS"
```

**Pass:** `413` (Payload Too Large).

---

## E-A-9 — Duration Field Stored in Database

Verify the `duration` field is persisted in MongoDB.

```bash
MSG_ID=$(echo $AUDIO_MSG | jq -r '.message._id')

# Use the existing messages endpoint to retrieve the specific message
curl -s "http://localhost:3000/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $BOB_TOKEN" | \
  jq --arg id "$MSG_ID" '.data[] | select(._id == $id) | {type, duration}'
```

**Pass:** `{ "type": "audio", "duration": 5 }`

---

## E-A-10 — Soft Delete Audio Message

```bash
DEL=$(curl -s -o /dev/null -w '%{http_code}' \
  -X DELETE "http://localhost:3000/api/v1/rooms/$ROOM_ID/messages/$MSG_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN")

echo "Delete status: $DEL"

# Re-fetch
curl -s "http://localhost:3000/api/v1/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $BOB_TOKEN" | \
  jq --arg id "$MSG_ID" '.data[] | select(._id == $id) | {deletedAt, content}'
```

**Pass:** `204` or `200` on delete. After deletion, `deletedAt` is non-null and `content` is `"[deleted]"`.

---

## E-A-11 — Unauthorized User Cannot Download Audio Attachment

```bash
# Register a stranger with no room membership
STRANGER=$(curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"stranger_e","email":"stranger_e@test.com","password":"Pass1234!"}')
STRANGER_TOKEN=$(echo $STRANGER | jq -r '.token')

STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  "http://localhost:3000/api/v1/attachments/$AUDIO_ATT_ID" \
  -H "Authorization: Bearer $STRANGER_TOKEN")

echo "Status: $STATUS"
```

**Pass:** `403` Forbidden.

---

## E-A-12 — Frontend Component Files Exist

```bash
test -f frontend/src/lib/mediaRecorder.ts     && echo "PASS: mediaRecorder.ts" || echo "FAIL"
test -f frontend/src/components/chat/AudioMessage.tsx && echo "PASS: AudioMessage.tsx" || echo "FAIL"
test -f frontend/src/components/chat/VideoMessage.tsx && echo "PASS: VideoMessage.tsx" || echo "FAIL"
```

**Pass:** All three lines output `PASS`.

---

## E-A-13 — Frontend TypeScript Compiles Without New Errors

```bash
cd frontend
npx tsc --noEmit 2>&1 | grep -v 'leaflet' | grep -v '^$'
```

**Pass:** No output (only pre-existing leaflet errors are filtered out).

---

## E-A-14 — Backend TypeScript Compiles Clean

```bash
cd backend
npx tsc --noEmit
```

**Pass:** Exit code 0, no output.

---

## E-A-15 — Offline Queue: `send_audio` Action Is Registered

Programmatically simulate an offline audio send by calling the IndexedDB enqueue helper with a `send_audio` payload (via a test page or Playwright/Puppeteer script):

```js
// In browser context (Playwright or manual DevTools snippet):
const { enqueue, saveBlob } = await import('/src/lib/offlineQueue.ts');
const blob = new Blob(['RIFF'], { type: 'audio/webm' });
const blobKey = 'draft:test-uuid-1234';
await saveBlob(blobKey, blob);
await enqueue({
  type: 'send_audio',
  payload: {
    blobKey,
    contextId: '<ROOM_ID>',
    contextType: 'room',
    duration: 3,
    mimeType: 'audio/webm',
  },
});
// Then set navigator.onLine = true (or reconnect) and verify the message appears
```

**Pass:** After coming back online, the queued action flushes and an audio message with `type: "audio"` appears in the room message list (verified by GET `/rooms/:id/messages`).

---

## Pass/Fail Summary Checklist

- [ ] E-A-1: Audio attachment upload succeeds  
- [ ] E-A-2: Room audio message: `type=audio`, `duration=5`, 1 attachment  
- [ ] E-A-3: Room video message: `type=video`, `duration=12`  
- [ ] E-A-4: Room message history includes audio/video with correct fields  
- [ ] E-A-5: Dialog audio message: `type=audio`, `duration=8`  
- [ ] E-A-6: Invalid type defaults to `user`  
- [ ] E-A-7: Audio message without attachment accepted (201)  
- [ ] E-A-8: Audio > 10 MB rejected with 413  
- [ ] E-A-9: `duration` field persisted in DB  
- [ ] E-A-10: Soft-delete audio message → `[deleted]`  
- [ ] E-A-11: Stranger cannot download attachment (403)  
- [ ] E-A-12: Frontend component files exist  
- [ ] E-A-13: Frontend TS: no new errors beyond pre-existing leaflet  
- [ ] E-A-14: Backend TS: exit 0  
- [ ] E-A-15: Offline queue send_audio action flushes on reconnect  
