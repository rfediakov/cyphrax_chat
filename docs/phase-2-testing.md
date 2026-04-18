# Phase 2 — Data Layer: Manual Testing Guide

## Prerequisites

- Docker Desktop running
- Repository cloned and on branch `phase-2/data-layer`
- No `.env` file needed — `docker-compose.yml` injects all required vars

---

## Step 1 — Build and start all containers

```bash
docker compose up --build
```

**Expected logs (API container):**
```
[MongoDB] Connected
[MongoDB] Ready (autoIndex: true)
[Redis] Connected
[Redis] Ready
[Redis] Ping OK
Server running on port 3001
```

If you see these four lines the DB bootstrap is working correctly.

---

## Step 2 — Confirm the API is alive

```bash
curl http://localhost:3001/
```

**Expected:**
```json
{"status":"ok","message":"Chat API running"}
```

---

## Step 3 — Verify all 12 collections exist in MongoDB

```bash
docker compose exec mongo mongosh chat --eval "db.getCollectionNames()"
```

> Collections are lazy-created on first insert, but indexes are registered at startup.
> Run the insert steps below first, then re-run this command.

After inserts you should see all 12:
`users, sessions, friendrequests, userbans, rooms, roommembers, roombans, roominvitations, dialogs, messages, attachments, lastread`

---

## Step 4 — Insert a User document and verify indexes

```bash
docker compose exec api node -e "
import('./dist/lib/mongo.js').then(m => m.connectMongo()).then(async () => {
  const { User } = await import('./dist/models/user.model.js');
  const u = await User.create({
    email: 'test@example.com',
    username: 'testuser',
    passwordHash: 'placeholder'
  });
  console.log('Created user:', u._id.toString());
  process.exit(0);
});
"
```

Then read it back in mongosh:

```bash
docker compose exec mongo mongosh chat --eval "db.users.find().pretty()"
```

---

## Step 5 — Verify the TTL index on sessions

```bash
docker compose exec mongo mongosh chat --eval "db.sessions.getIndexes()"
```

**Expected** — look for an entry with `expireAfterSeconds: 0` on the `expiresAt` field:
```json
{
  "key": { "expiresAt": 1 },
  "expireAfterSeconds": 0,
  "name": "expiresAt_1"
}
```

---

## Step 6 — Verify the text index on rooms

```bash
docker compose exec mongo mongosh chat --eval "db.rooms.getIndexes()"
```

**Expected** — entry with `weights` covering `name` and `description`:
```json
{ "key": { "_fts": "text", "_ftsx": -1 }, "weights": { "description": 1, "name": 1 } }
```

---

## Step 7 — Verify the global error handler returns structured JSON

Hit a non-existent route:

```bash
curl -s http://localhost:3001/api/v1/nonexistent | jq
```

> Collections and routes are not mounted yet in Phase 2, so Express returns its default 404.
> The important check is that `AppError` subclasses serialize correctly — fully exercised in Phase 3 when auth routes are added.

---

## Step 8 — Tear down cleanly

```bash
docker compose down -v
```

**Expected:** all containers stop and named volumes (`mongo_data`, `uploads`) are removed without errors.

---

## Acceptance Criteria Checklist

- [ ] `docker compose up --build` completes without errors
- [ ] API container logs show MongoDB + Redis connected
- [ ] `curl http://localhost:3001/` returns `{"status":"ok","message":"Chat API running"}`
- [ ] All 12 collections visible in `db.getCollectionNames()` after inserts
- [ ] TTL index present on `sessions.expiresAt`
- [ ] Text index present on `rooms` (name + description)
- [ ] `docker compose down -v` cleans up without errors
- [ ] TypeScript compiles: `cd backend && npm run build` exits 0
