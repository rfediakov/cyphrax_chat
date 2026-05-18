# Feature Plan v2 — Location-Aware Family/Group Safety PWA

**Author role:** Senior System Architect + Web Application Designer  
**Date:** 2026-05-18  
**Target audience:** Implementation agents (one agent per phase)  
**Prerequisite:** Phases 1–8 of `AGENT_DEVELOPMENT_GUIDE.md` are complete and `docker compose up` is green.

---

## Table of Contents

1. [Vision & UX Principles](#1-vision--ux-principles)
2. [Technology Additions](#2-technology-additions)
3. [New Data Models](#3-new-data-models)
4. [New API Endpoints](#4-new-api-endpoints)
5. [New Socket.IO Events](#5-new-socketio-events)
6. [Phase Overview](#6-phase-overview)
7. [Phase A — PWA Foundation & Offline Support](#phase-a--pwa-foundation--offline-support)
8. [Phase B — Interactive Map & Real-Time Location](#phase-b--interactive-map--real-time-location)
9. [Phase C — Battery Status & Device Telemetry](#phase-c--battery-status--device-telemetry)
10. [Phase D — Push-to-Talk (PTT)](#phase-d--push-to-talk-ptt)
11. [Phase E — Audio & Video Messages](#phase-e--audio--video-messages)
12. [Phase F — Audio & Video Calls (WebRTC)](#phase-f--audio--video-calls-webrtc)
13. [Phase G — SOS / Danger Alert System](#phase-g--sos--danger-alert-system)
14. [Phase H — Privacy Settings & Parental Controls](#phase-h--privacy-settings--parental-controls)
15. [Phase I — Remote Camera / Mic Access](#phase-i--remote-camera--mic-access)
16. [Cross-Cutting Concerns](#16-cross-cutting-concerns)
17. [Repository Structure Additions](#17-repository-structure-additions)

---

## 1. Vision & UX Principles

This application serves **families and small groups** (outdoor activities, sports teams, parent–child safety) who need to stay connected with rich real-time context — location, voice, video, and emergency alerts — especially in low-connectivity environments.

### Core Design Principles

| Principle | Application |
|-----------|-------------|
| **Safety first** | SOS/Danger button is always visible; one tap, no confirmation |
| **Progressive disclosure** | Advanced features (remote cam, parental controls) live behind Settings; default view is clean |
| **Offline-resilient** | Every action queues locally and syncs when online; UI never blocks on network |
| **Privacy by default** | Location and battery off by default; users opt-in per feature and per contact |
| **Mobile-first** | All layouts designed for 375 px viewport and expanded for tablet/desktop |
| **Accessible** | WCAG 2.1 AA: sufficient contrast, touch targets ≥ 44 px, keyboard-navigable |

### Key UX Patterns

- **Bottom navigation bar** on mobile (Map, Chat, Contacts, Profile) — replaces left sidebar for screens < 768 px
- **Floating SOS button** — fixed bottom-right, red, always on top (z-index managed via CSS variable, never `!important`)
- **Notification badges** — unread count on nav items
- **Permission banners** — non-intrusive top banners requesting mic/camera/location; dismissed with a gesture
- **Live status pills** — coloured dot + text (Online · AFK · Offline · Sharing location · Low battery · SOS 🔴)

---

## 2. Technology Additions

### Frontend additions

| Package | Purpose | License |
|---------|---------|---------|
| `vite-plugin-pwa` + `workbox-*` | Service worker, manifest, background sync | MIT |
| `leaflet` + `react-leaflet` | Interactive map (OpenStreetMap tiles — free, no API key) | BSD |
| `simple-peer` | WebRTC peer abstraction for calls & PTT | MIT |
| `idb` | IndexedDB wrapper for offline queue | ISC |
| `@types/leaflet` | TypeScript types | MIT |

> **Why Leaflet + OSM?** Zero cost, no API key, tiles from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, works offline with tile caching in service worker.

### Backend additions

| Package | Purpose |
|---------|---------|
| `web-push` | VAPID push notification sending |
| `multer` (already installed) | Extended for audio/video blobs |
| `uuid` | Stable PTT session IDs |

### Infrastructure additions

| Component | Change |
|-----------|--------|
| **TURN server** (coturn) | New Docker Compose service; required for WebRTC NAT traversal |
| **MongoDB** | New collections: `locations`, `telemetry`, `calls`, `sos_events`, `push_subscriptions`, `offline_queue` |
| **Redis** | New key patterns: `loc:{userId}`, `battery:{userId}`, `sos:{roomId}` |

---

## 3. New Data Models

### 3.1 `locations`

```ts
{
  _id: ObjectId,
  userId: ObjectId,          // ref: users
  roomId: ObjectId | null,   // null = private sharing
  lat: number,
  lng: number,
  accuracy: number,          // metres
  speed: number | null,      // m/s, null if unavailable
  heading: number | null,    // degrees 0–360
  altitude: number | null,
  source: 'gps' | 'network' | 'passive',
  recordedAt: Date,
  createdAt: Date
}
// Indexes: { userId: 1, recordedAt: -1 }, TTL on recordedAt (30 days by default)
```

### 3.2 `telemetry`

```ts
{
  _id: ObjectId,
  userId: ObjectId,
  batteryLevel: number,      // 0.0–1.0
  batteryCharging: boolean,
  networkType: string,       // '4g' | 'wifi' | 'offline' | 'unknown'
  appVersion: string,
  platform: string,          // 'web' | 'pwa-ios' | 'pwa-android'
  recordedAt: Date,
  createdAt: Date
}
// TTL index on recordedAt (7 days)
```

### 3.3 `calls`

```ts
{
  _id: ObjectId,
  callId: string,            // UUID — used as WebRTC session identifier
  type: 'audio' | 'video',
  initiatorId: ObjectId,
  participants: [{
    userId: ObjectId,
    joinedAt: Date | null,
    leftAt: Date | null,
    declined: boolean
  }],
  roomId: ObjectId | null,   // group call in room
  dialogId: ObjectId | null, // 1-1 call
  status: 'ringing' | 'active' | 'ended' | 'missed',
  startedAt: Date | null,
  endedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

### 3.4 `sos_events`

```ts
{
  _id: ObjectId,
  userId: ObjectId,
  roomId: ObjectId,
  lat: number,
  lng: number,
  message: string,           // optional custom distress message
  status: 'active' | 'resolved',
  resolvedAt: Date | null,
  resolvedBy: ObjectId | null,
  createdAt: Date,
  updatedAt: Date
}
```

### 3.5 `push_subscriptions`

```ts
{
  _id: ObjectId,
  userId: ObjectId,
  endpoint: string,          // Push endpoint URL
  keys: {
    p256dh: string,
    auth: string
  },
  userAgent: string,
  createdAt: Date
}
// Unique index: { userId: 1, endpoint: 1 }
```

### 3.6 `offline_queue` (server-side; client mirrors in IndexedDB)

```ts
{
  _id: ObjectId,
  userId: ObjectId,
  action: 'send_message' | 'update_location' | 'send_telemetry' | 'send_audio' | 'send_video',
  payload: Record<string, unknown>,
  createdAt: Date,
  processedAt: Date | null
}
// TTL index on createdAt (72 hours)
```

### 3.7 `users` schema additions

Add the following fields to the existing `users` schema:

```ts
// Privacy settings
privacyLocation: 'everyone' | 'contacts' | 'nobody',  // default: 'nobody'
privacyBattery: 'everyone' | 'contacts' | 'nobody',   // default: 'nobody'
privacyLastSeen: 'everyone' | 'contacts' | 'nobody',  // default: 'everyone'
privacyOnlineStatus: 'everyone' | 'contacts' | 'nobody', // default: 'everyone'

// Push notifications VAPID subscription stored in push_subscriptions collection
pushEnabled: boolean, // default: false

// Parental / restricted mode
restrictedMode: boolean,          // default: false — child mode
guardianIds: ObjectId[],          // users who can view this account's data
geofenceAlerts: boolean,          // default: false

// PTT
pttEnabled: boolean,              // default: true

// Location sharing
locationSharingActive: boolean,   // default: false
locationSharingRooms: ObjectId[], // rooms where location is shared
```

---

## 4. New API Endpoints

All routes prefix `/api/v1`. Authentication required unless noted.

### 4.1 Push Notifications

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/push/subscribe` | Save push subscription (body: `{ endpoint, keys }`) |
| `DELETE` | `/push/subscribe` | Remove push subscription |
| `POST` | `/push/test` | Send test notification to caller |

### 4.2 Location

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/location` | Persist location point (body: `{ lat, lng, accuracy, speed?, heading?, altitude?, roomId? }`) |
| `GET` | `/location/history` | Own location history (`?from=&to=&limit=`) |
| `GET` | `/location/live` | Latest location of visible users in a room (`?roomId=`) |
| `GET` | `/location/history/:userId` | Guardian-only or self: paginated history |
| `PATCH` | `/location/sharing` | Toggle sharing (`{ active, roomIds[] }`) |

### 4.3 Telemetry

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/telemetry` | Upsert battery + network telemetry |
| `GET` | `/telemetry/live` | Latest telemetry for visible users (`?roomId=`) |

### 4.4 Calls

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/calls` | Initiate call (`{ type, targetId?, roomId? }`) → returns `callId` |
| `GET` | `/calls/:callId` | Get call metadata |
| `PATCH` | `/calls/:callId` | Update status (join / decline / end) |
| `GET` | `/calls/history` | Paginated call history for caller |

### 4.5 SOS

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sos` | Trigger SOS (`{ roomId, lat, lng, message? }`) |
| `PATCH` | `/sos/:sosId/resolve` | Mark SOS as resolved |
| `GET` | `/sos` | Active SOS events for caller's rooms |

### 4.6 Offline Queue (server)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sync` | Bulk flush offline queue (`{ items: OfflineQueueItem[] }`) |

### 4.7 Privacy & Settings

| Method | Path | Description |
|--------|------|-------------|
| `PATCH` | `/users/me/privacy` | Update privacy settings |
| `PATCH` | `/users/me/guardian` | Add / remove guardians |

---

## 5. New Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `location_update` | `{ lat, lng, accuracy, speed?, heading?, roomId? }` | Stream live location (≤ 1/s) |
| `telemetry_update` | `{ batteryLevel, batteryCharging, networkType }` | Battery/network heartbeat (≤ 1/30s) |
| `ptt_start` | `{ roomId, sessionId }` | Begin PTT transmission |
| `ptt_chunk` | `{ sessionId, chunk: ArrayBuffer }` | Binary audio chunk |
| `ptt_end` | `{ sessionId }` | End PTT transmission |
| `webrtc_offer` | `{ callId, targetUserId, sdp }` | WebRTC offer for signalling |
| `webrtc_answer` | `{ callId, targetUserId, sdp }` | WebRTC answer |
| `webrtc_ice` | `{ callId, targetUserId, candidate }` | ICE candidate |
| `call_invite` | `{ callId }` | Notify server of new call (triggers push to invitees) |
| `call_end` | `{ callId }` | Caller ends the call |
| `sos_trigger` | `{ roomId, lat, lng, message? }` | Broadcast SOS |
| `sos_resolve` | `{ sosId }` | Mark SOS resolved |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `location_batch` | `{ updates: [{ userId, lat, lng, accuracy, speed?, heading?, recordedAt }] }` | Batched location updates (≤ 500 ms debounce) |
| `telemetry_update` | `{ userId, batteryLevel, batteryCharging, networkType }` | Live battery/network |
| `ptt_chunk` | `{ sessionId, senderId, chunk: ArrayBuffer }` | Relay PTT audio to room |
| `ptt_end` | `{ sessionId, senderId }` | PTT session ended |
| `call_incoming` | `{ callId, type, from: UserSummary, roomId? }` | Push call invite |
| `webrtc_offer` | `{ callId, from, sdp }` | Relay offer |
| `webrtc_answer` | `{ callId, from, sdp }` | Relay answer |
| `webrtc_ice` | `{ callId, from, candidate }` | Relay ICE |
| `call_ended` | `{ callId, reason }` | Remote party ended |
| `call_declined` | `{ callId, userId }` | Participant declined |
| `sos_alert` | `{ sosId, userId, username, lat, lng, message, roomId }` | SOS to all room members |
| `sos_resolved` | `{ sosId, resolvedBy }` | SOS cleared |

---

## 6. Phase Overview

| Phase | Name | Key Output | Depends on |
|-------|------|-----------|------------|
| A | PWA Foundation | Service worker, manifest, offline queue, install prompt | Existing Phases 1–8 |
| B | Map & Location | Leaflet map, live location sharing, location history | Phase A |
| C | Device Telemetry | Battery sharing, network status, device info panel | Phase A |
| D | Push-to-Talk | PTT button, binary WS audio streaming | Phase A |
| E | Audio/Video Messages | Recording UI, upload, playback in chat | Existing Phase 7 |
| F | Audio/Video Calls | WebRTC signalling, call UI, TURN server | Phase D/E |
| G | SOS System | Danger button, alert broadcast, map marker | Phase B |
| H | Privacy & Parental Controls | Settings page, restricted mode, geofence | Phase B + C |
| I | Remote Access | Consent-gated camera/mic streaming | Phase F |

---

## Phase A — PWA Foundation & Offline Support

**Agent goal:** Convert the Vite React app into a fully installable Progressive Web App with robust offline support.

### A.1 PWA Manifest & Service Worker

**Install `vite-plugin-pwa`:**

```bash
cd frontend && npm install -D vite-plugin-pwa workbox-window
```

**`frontend/vite.config.ts` additions:**

```ts
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
  manifest: {
    name: 'SafeGroup',
    short_name: 'SafeGroup',
    description: 'Family & group location safety app',
    theme_color: '#1e40af',
    background_color: '#0f172a',
    display: 'standalone',
    orientation: 'portrait-primary',
    start_url: '/',
    id: '/',
    icons: [
      { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ],
    categories: ['communication', 'navigation', 'utilities'],
    shortcuts: [
      { name: 'SOS Alert', url: '/?sos=1', icons: [{ src: '/icons/sos-96.png', sizes: '96x96' }] }
    ],
    screenshots: []
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'osm-tiles',
          expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
          cacheableResponse: { statuses: [0, 200] }
        }
      },
      {
        urlPattern: /\/api\/v1\/messages/,
        handler: 'NetworkFirst',
        options: { cacheName: 'api-messages', networkTimeoutSeconds: 5 }
      }
    ],
    // Background sync for offline message queue
    backgroundSync: [{ queueName: 'offline-actions', matchExchange: {} }]
  }
})
```

### A.2 Offline Queue (IndexedDB)

Create `frontend/src/lib/offlineQueue.ts`:

```ts
import { openDB, IDBPDatabase } from 'idb'

export interface QueuedAction {
  id: string          // crypto.randomUUID()
  type: string        // 'send_message' | 'location_update' | etc.
  payload: unknown
  createdAt: number
  retries: number
}

const DB_NAME = 'safegroup-offline'
const STORE  = 'queue'

let db: IDBPDatabase

export async function getDB() {
  if (!db) {
    db = await openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore(STORE, { keyPath: 'id' })
      }
    })
  }
  return db
}

export async function enqueue(action: Omit<QueuedAction, 'id' | 'createdAt' | 'retries'>) {
  const d = await getDB()
  await d.put(STORE, { ...action, id: crypto.randomUUID(), createdAt: Date.now(), retries: 0 })
}

export async function flush(onAction: (a: QueuedAction) => Promise<void>) {
  const d = await getDB()
  const all = await d.getAll(STORE)
  for (const item of all) {
    try {
      await onAction(item)
      await d.delete(STORE, item.id)
    } catch {
      await d.put(STORE, { ...item, retries: item.retries + 1 })
    }
  }
}
```

### A.3 Online/Offline Sync Hook

Create `frontend/src/hooks/useOfflineSync.ts`:

```ts
import { useEffect } from 'react'
import { flush } from '../lib/offlineQueue'
import { syncOfflineActions } from '../api/sync.api'

export function useOfflineSync() {
  useEffect(() => {
    const handleOnline = async () => {
      await flush(async (action) => {
        await syncOfflineActions([action])
      })
    }
    window.addEventListener('online', handleOnline)
    if (navigator.onLine) handleOnline()
    return () => window.removeEventListener('online', handleOnline)
  }, [])
}
```

### A.4 Install Prompt

Create `frontend/src/components/pwa/InstallBanner.tsx`:

- Listen to `beforeinstallprompt` event, store it
- Show a dismissible top banner: "Install SafeGroup for offline access"
- Button "Install" triggers `event.prompt()`
- Persist dismissal in `localStorage` so it doesn't reappear

### A.5 Push Notification Setup

**Backend:** Add `web-push` package. Generate VAPID keys once at startup and store in env:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT=mailto:admin@example.com
```

Create `backend/src/services/push.service.ts` that:
- Saves/removes subscriptions via `push_subscriptions` collection
- Exposes `sendPush(userId, payload)` — looks up all subscriptions for user, calls `webpush.sendNotification()`

**Frontend:** `frontend/src/lib/pushNotifications.ts`:
- `requestPermission()` — asks browser, registers SW push listener
- `subscribe(vapidPublicKey)` — calls `pushManager.subscribe()`, POSTs to `/api/v1/push/subscribe`
- Service worker `push` event handler: show notification with `self.registration.showNotification()`

### A.6 Vibration API Utility

Create `frontend/src/lib/vibration.ts`:

```ts
export function vibrateShort()  { navigator.vibrate?.(50) }
export function vibrateLong()   { navigator.vibrate?.(300) }
export function vibratePattern(pattern: number[]) { navigator.vibrate?.(pattern) }
export function vibrateSOS()    { navigator.vibrate?.([500,200,500,200,500]) }
```

### A.7 Network Status Store

Add to `presence.store.ts` (or new `network.store.ts`):

```ts
isOnline: boolean
connectionType: string  // from navigator.connection.effectiveType
```

Subscribe to `window.addEventListener('online' | 'offline')` and `navigator.connection.change`.

### A.8 Checklist for Agent A

- [ ] `vite-plugin-pwa` installed and configured
- [ ] Manifest with correct icons (generate 192 and 512 px PNGs)
- [ ] Service worker registers and caches shell + OSM tiles
- [ ] IndexedDB offline queue (`offlineQueue.ts`) implemented and tested
- [ ] `useOfflineSync` hook wired into `App.tsx`
- [ ] `POST /api/v1/sync` backend endpoint processes queued items
- [ ] VAPID keys in env, push subscription save/delete endpoints
- [ ] Service worker handles `push` event and shows notification
- [ ] `InstallBanner` component renders and triggers install prompt
- [ ] `vibration.ts` utility created
- [ ] Network status reflected in UI (offline banner / pill)

---

## Phase B — Interactive Map & Real-Time Location

**Agent goal:** Add a full-screen interactive map tab, real-time location sharing, and location history.

### B.1 Dependencies

```bash
cd frontend && npm install leaflet react-leaflet @types/leaflet
```

### B.2 Map Page

Create `frontend/src/pages/Map.tsx` as a new top-level route `/map`.

**Layout:**
```
┌─────────────────────────────────────────────┐
│  Top bar: [Room selector ▾]  [Share: ON/OFF] │
├─────────────────────────────────────────────┤
│                                             │
│         Leaflet Map (fills remaining)       │
│  User avatars as custom markers             │
│  SOS markers (red pulsing circle)           │
│  Accuracy circle (semi-transparent)         │
│                                             │
└──────────────┬──────────────────────────────┘
               │  User info popup on marker tap
```

**Leaflet setup:**

```tsx
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

// OSM tile layer — free, no API key
<TileLayer
  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution='© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
  maxZoom={19}
/>
```

**Custom user marker:**

```ts
function userIcon(user: UserSummary, isCurrentUser: boolean) {
  return L.divIcon({
    html: `<div class="user-marker ${isCurrentUser ? 'user-marker--self' : ''}">
             <img src="${user.avatar ?? '/icons/default-avatar.svg'}" />
             <span>${user.username}</span>
           </div>`,
    className: '',
    iconSize: [48, 56],
    iconAnchor: [24, 56],
    popupAnchor: [0, -56]
  })
}
```

### B.3 Location Store

Create `frontend/src/store/location.store.ts` (Zustand):

```ts
interface LocationState {
  sharingActive: boolean
  currentPosition: GeolocationPosition | null
  userLocations: Record<string, LiveLocation>  // userId → latest
  locationHistory: LocationPoint[]

  setSharingActive: (active: boolean) => void
  updateUserLocation: (userId: string, loc: LiveLocation) => void
  setCurrentPosition: (pos: GeolocationPosition) => void
}
```

### B.4 Geolocation Service

Create `frontend/src/lib/geolocation.ts`:

```ts
let watchId: number | null = null

export function startWatching(onUpdate: (pos: GeolocationPosition) => void, onError: (e: GeolocationPositionError) => void) {
  if (!('geolocation' in navigator)) return
  watchId = navigator.geolocation.watchPosition(onUpdate, onError, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  })
}

export function stopWatching() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
}
```

### B.5 Location Sharing Hook

Create `frontend/src/hooks/useLocationSharing.ts`:

```ts
// When sharingActive && isOnline: emit location_update via socket every 3 seconds
// When sharingActive && isOffline: enqueue in IndexedDB
// Subscribe to socket 'location_batch' and update store
// Throttle emissions to avoid flooding: minimum 5m distance change OR 30s elapsed
```

### B.6 User Location Popup

When clicking a user marker, show popup with:

```
┌────────────────────────────┐
│  [Avatar]  John Doe        │
│  Online • 2 km away        │
│  Battery: 78% 🔋           │
│  Speed: 5.2 km/h           │
│  Last updated: 12s ago     │
│                            │
│  [Message]  [Call]         │
└────────────────────────────┘
```

Obey privacy settings: only show fields user has allowed.

### B.7 Backend — Location Routes

Create `backend/src/routes/location.routes.ts`:

- `POST /location` — validate body, insert into `locations` collection, cache latest in Redis `loc:{userId}` (SETEX 300s), emit `location_update` to appropriate Socket.IO rooms
- `GET /location/live?roomId=` — read Redis cache for each room member whose `privacyLocation` allows caller; return array
- `GET /location/history` — paginated MongoDB query with date range
- `PATCH /location/sharing` — update user `locationSharingActive` and `locationSharingRooms`

### B.8 Socket.IO — Location Handler

Create `backend/src/socket/location.handler.ts`:

```ts
socket.on('location_update', async (data) => {
  // 1. Validate schema
  // 2. Check user has location sharing enabled
  // 3. Cache in Redis
  // 4. Batch updates: accumulate for 500ms then broadcast location_batch to room
  // 5. Store to MongoDB every 30s (don't store every update — too much data)
})
```

Use a Redis sorted set per room to buffer updates and flush on interval.

### B.9 Privacy Enforcement Middleware

Create `backend/src/middleware/locationPrivacy.ts`:

```ts
// filterLocationData(requestingUserId, targetUserId, locationData)
// Returns null if privacy settings block access
// Returns filtered data if allowed
```

Privacy rules:
- `nobody` → never share with anyone
- `contacts` → only share with mutual friends
- `everyone` → share with all room members

### B.10 Location History Panel

In Map page, add a slide-up drawer accessible via a "History" button:
- Timeline chart of today's path
- Replay button: animate marker along historical path
- Export as GPX (future)

### B.11 Checklist for Agent B

- [ ] `react-leaflet` installed, map renders with OSM tiles
- [ ] `/map` route added to router; bottom nav updated
- [ ] Custom user markers with avatar + username
- [ ] Geolocation watching start/stop tied to sharing toggle
- [ ] `location_update` socket event throttled (5m or 30s)
- [ ] `location_batch` received and user markers updated live
- [ ] Accuracy circle rendered per user
- [ ] User popup shows location, battery, speed, last updated
- [ ] Privacy settings respected (server-side filter + client-side hide)
- [ ] Redis cache for latest locations
- [ ] MongoDB persistence every 30s
- [ ] Location history panel (basic list with timestamps)
- [ ] Offline: location updates queued in IndexedDB, flushed on reconnect

---

## Phase C — Battery Status & Device Telemetry

**Agent goal:** Read battery, network, and basic device info; share it in real-time; display in user profiles and map popups.

### C.1 Battery API Service

Create `frontend/src/lib/batteryStatus.ts`:

```ts
export interface BatteryInfo {
  level: number         // 0.0 - 1.0
  charging: boolean
  chargingTime: number  // seconds until full, or Infinity
  dischargingTime: number
}

export async function getBattery(): Promise<BatteryInfo | null> {
  if (!('getBattery' in navigator)) return null
  const battery = await (navigator as Navigator & { getBattery(): Promise<BatteryManager> }).getBattery()
  return {
    level: battery.level,
    charging: battery.charging,
    chargingTime: battery.chargingTime,
    dischargingTime: battery.dischargingTime
  }
}

export function watchBattery(onChange: (info: BatteryInfo) => void): () => void {
  // Subscribe to battery events: levelchange, chargingchange, etc.
  // Return unsubscribe function
}
```

> **Note:** Battery Status API is deprecated in Chrome on HTTPS for privacy (since 2019). It still works in Firefox and some Chromium forks, and in native PWA wrappers. Include a graceful fallback returning `null`. For fully reliable battery info on Android, a TWA (Trusted Web Activity) wrapper can expose it; note this in comments.

### C.2 Network Info Service

Create `frontend/src/lib/networkStatus.ts`:

```ts
export function getNetworkInfo() {
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection
  return {
    type: conn?.effectiveType ?? 'unknown',   // '4g' | '3g' | '2g' | 'slow-2g'
    downlink: conn?.downlink ?? null,
    saveData: conn?.saveData ?? false,
    online: navigator.onLine
  }
}
```

### C.3 Telemetry Hook

Create `frontend/src/hooks/useTelemetry.ts`:

```ts
// Every 30 seconds (and on change):
// 1. Read battery + network info
// 2. Emit 'telemetry_update' via socket
// 3. POST /api/v1/telemetry (for persistence)
// 4. If offline: enqueue in IndexedDB
```

### C.4 Backend — Telemetry Routes

Create `backend/src/routes/telemetry.routes.ts`:

- `POST /telemetry` — upsert telemetry doc, cache in Redis `battery:{userId}` (SETEX 120s), emit `telemetry_update` to room members who have permission
- `GET /telemetry/live?roomId=` — return latest telemetry for visible room members

### C.5 Battery Display

Add a `BatteryIndicator` component:

```tsx
// Props: level (0-1), charging (bool)
// Renders: battery outline with fill % and charging bolt icon
// Color: green > 50%, orange 20-50%, red < 20%
// Shows "?" if battery API not available
```

Use in:
- User popup on map
- Contact list item (small)
- Right sidebar user detail panel
- Profile page (own battery)

### C.6 Low Battery Alert

When a group member's battery drops below 15%:
- Send push notification to guardians/group
- Display amber banner on map near their marker
- Emit push via `push.service.ts`

### C.7 Checklist for Agent C

- [ ] `batteryStatus.ts` with event listeners and fallback
- [ ] `networkStatus.ts` reading `navigator.connection`
- [ ] `useTelemetry` hook emitting every 30s
- [ ] `BatteryIndicator` component with colour states
- [ ] Battery shown in map popup, contact list, profile
- [ ] Low battery (< 15%) push notification to guardians
- [ ] Privacy: battery not shared if `privacyBattery = 'nobody'`
- [ ] Telemetry stored in MongoDB with TTL
- [ ] Redis cache for live telemetry

---

## Phase D — Push-to-Talk (PTT)

**Agent goal:** Add a hold-to-talk button to the chat window that streams audio to all room members in near-real-time.

### D.1 PTT Architecture

```
User A holds PTT button
  → MediaRecorder captures mic in 250ms chunks
  → Chunks sent as binary via socket.emit('ptt_chunk', ...)
  → Server relays chunks to room members (Socket.IO binary event)
  → User B receives chunks
  → Web Audio API / AudioContext queues and plays chunks
```

Binary transport via Socket.IO binary events (no base64 — use `ArrayBuffer`).

### D.2 PTT Hook

Create `frontend/src/hooks/usePTT.ts`:

```ts
// State: isTransmitting, isReceiving, activeSenderId
// startTransmitting(roomId):
//   - Check mic permission (navigator.mediaDevices.getUserMedia)
//   - Create MediaRecorder with 'audio/webm;codecs=opus'
//   - Emit 'ptt_start' { roomId, sessionId: uuid }
//   - On dataavailable: emit 'ptt_chunk' binary
// stopTransmitting():
//   - Stop MediaRecorder
//   - Emit 'ptt_end'
// onChunkReceived(chunk):
//   - Queue into AudioContext buffer
//   - Play in order
```

### D.3 PTT UI Component

Create `frontend/src/components/chat/PTTButton.tsx`:

```
┌───────────────────────────────┐
│  [🎙 Hold to Talk]            │
│   Lottie waveform animation   │
│   while transmitting          │
└───────────────────────────────┘
```

- Large circular button at bottom of chat, left of send button
- **Press and hold** (touch + mouse): `pointerdown` / `pointerup` events
- Pulsing red border while transmitting
- Shows sender avatar + "speaking" badge when receiving
- Disabled when another user is transmitting (show who)
- Accessibility: `aria-label="Hold to talk"`, keyboard Space bar support

### D.4 Receiving Audio

```ts
// frontend/src/lib/pttAudioQueue.ts

class PTTAudioQueue {
  private ctx = new AudioContext()
  private queue: AudioBuffer[] = []
  private playing = false

  async enqueue(chunk: ArrayBuffer) {
    const buffer = await this.ctx.decodeAudioData(chunk)
    this.queue.push(buffer)
    if (!this.playing) this.playNext()
  }

  private playNext() {
    if (!this.queue.length) { this.playing = false; return }
    this.playing = true
    const src = this.ctx.createBufferSource()
    src.buffer = this.queue.shift()!
    src.connect(this.ctx.destination)
    src.onended = () => this.playNext()
    src.start()
  }
}
```

### D.5 Backend — PTT Handler

Create `backend/src/socket/ptt.handler.ts`:

```ts
socket.on('ptt_start', ({ roomId, sessionId }) => {
  // Verify user is room member
  // Set Redis key 'ptt:{roomId}' = { userId, sessionId } with TTL 30s
  // Emit 'ptt_start' to room (except sender) — locks PTT for others
})

socket.on('ptt_chunk', ({ sessionId, chunk }) => {
  // Verify sessionId matches Redis 'ptt:{roomId}' for this socket's user
  // socket.to(roomId).emit('ptt_chunk', { sessionId, senderId, chunk })
})

socket.on('ptt_end', ({ sessionId }) => {
  // Delete Redis key 'ptt:{roomId}'
  // Emit 'ptt_end' to room
})
```

Only one PTT session per room at a time (enforced via Redis lock).

### D.6 PTT Permission Setting

In user Settings, add toggle: "Allow PTT in rooms" (default ON).  
In room settings, admin can disable PTT.

### D.7 Vibration Feedback

When PTT transmission starts/ends: `vibrateShort()`.  
When receiving PTT: no vibration (would be annoying).

### D.8 Checklist for Agent D

- [ ] `usePTT` hook with MediaRecorder (opus codec)
- [ ] Binary socket events for PTT chunks
- [ ] `PTTAudioQueue` plays received chunks in order
- [ ] `PTTButton` component with hold gesture
- [ ] Server PTT handler with Redis lock (one speaker/room)
- [ ] "Someone is speaking" UI state shown to others
- [ ] PTT disabled per user/room setting
- [ ] Vibration on transmit start/stop
- [ ] Offline: PTT silently disabled with "Offline" tooltip

---

## Phase E — Audio & Video Messages

**Agent goal:** Allow users to record short audio/video clips directly in the chat input and send them as message attachments.

### E.1 Audio Message Recording

Extend `MessageInput.tsx` with a record button (hold for audio):

```
┌────────────────────────────────────────┐
│  [📎] [🎙] [📷] [text input........] [➤] │
└────────────────────────────────────────┘
```

- `🎙` button: hold to record audio (up to 60 seconds)
  - Progress arc around button shows elapsed time
  - Release to send; swipe up to cancel
  - Preview waveform before sending (optional)
- `📷` button: opens camera for video recording (up to 30 seconds)

### E.2 AudioMessage Component

Create `frontend/src/components/chat/AudioMessage.tsx`:

```tsx
// Props: src (URL), duration, waveformData?
// Renders: play/pause button, scrubber, duration, waveform bars
// Loading state while audio buffers
```

### E.3 VideoMessage Component

Create `frontend/src/components/chat/VideoMessage.tsx`:

```tsx
// Props: src (URL), thumbnailSrc, duration
// Renders: thumbnail with play overlay, inline <video> on click
// Lazy loads: IntersectionObserver
```

### E.4 Recording Service

Create `frontend/src/lib/mediaRecorder.ts`:

```ts
export async function recordAudio(maxSeconds = 60): Promise<{ blob: Blob; duration: number }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
  // ...accumulate chunks, return blob + duration
}

export async function recordVideo(maxSeconds = 30): Promise<{ blob: Blob; thumbnail: Blob }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } })
  // ...capture thumbnail frame from first second, record video
}
```

### E.5 Message Type Extensions

Extend `message.model.ts` type field:

```ts
type: 'user' | 'system' | 'audio' | 'video'
```

The `attachmentId` on the message points to the uploaded blob.

### E.6 Upload Flow

1. User records audio/video
2. Blob POSTed to `POST /api/v1/attachments` (existing endpoint) with `Content-Type: audio/webm` or `video/webm`
3. `attachmentId` returned
4. Message sent with `type: 'audio'` and `attachmentId`
5. Recipients render `AudioMessage` or `VideoMessage`

### E.7 Offline Audio Messages

If offline when sending:
1. Store blob in IndexedDB (key = `draft:{uuid}`)
2. Enqueue action `{ type: 'send_audio', localBlobKey, roomId, ... }`
3. On reconnect: upload blob, then send message

### E.8 Checklist for Agent E

- [ ] Audio record button in `MessageInput` (hold gesture)
- [ ] Video record button in `MessageInput`
- [ ] `AudioMessage` component with waveform and scrubber
- [ ] `VideoMessage` component with thumbnail and inline player
- [ ] `mediaRecorder.ts` utility handles both types
- [ ] Blobs uploaded via existing attachment endpoint
- [ ] Message `type` extended to include `'audio'` and `'video'`
- [ ] Offline: blobs stored in IndexedDB, sent on reconnect
- [ ] Duration displayed on audio messages
- [ ] Cancel recording gesture (swipe up / click cancel)

---

## Phase F — Audio & Video Calls (WebRTC)

**Agent goal:** Implement full-duplex 1-1 and group audio/video calls using WebRTC, with Socket.IO as the signalling channel.

### F.1 Architecture

```
Caller                        Signalling server              Callee
  │                            (Socket.IO)                    │
  ├── call_invite ────────────────────────────────────────────►│
  │                                                            │
  │◄── call_incoming ──────────────────────────────────────────┤
  │                                                            │
  ├── webrtc_offer ────────────────────────────────────────────►│
  │◄── webrtc_answer ──────────────────────────────────────────┤
  │                                                            │
  ├── webrtc_ice ──────────────────────────────────────────────►│
  │◄── webrtc_ice ─────────────────────────────────────────────┤
  │                                                            │
  │◄════════ Direct P2P media stream (DTLS/SRTP) ══════════════►│
  │           (via STUN/TURN if NAT blocks direct)             │
```

### F.2 TURN Server (docker-compose addition)

Add to `docker-compose.yml`:

```yaml
coturn:
  image: coturn/coturn:latest
  network_mode: host
  environment:
    - TURN_USERNAME=${TURN_USERNAME:-safegroup}
    - TURN_PASSWORD=${TURN_PASSWORD:-safegroup_turn_secret}
  command: >
    -n --log-file=stdout
    --min-port=49152 --max-port=49200
    --use-auth-secret --static-auth-secret=${TURN_PASSWORD:-safegroup_turn_secret}
    --realm=safegroup.local
    --no-multicast-peers
  ports:
    - "3478:3478"
    - "3478:3478/udp"
    - "49152-49200:49152-49200/udp"
```

Add TURN credentials to env and expose via `GET /api/v1/calls/ice-config` (returns time-limited TURN credentials using HMAC).

### F.3 WebRTC Service

Create `frontend/src/lib/webrtc.ts`:

```ts
export class WebRTCSession {
  private pc: RTCPeerConnection
  private localStream: MediaStream | null = null

  constructor(private iceConfig: RTCConfiguration) {
    this.pc = new RTCPeerConnection(iceConfig)
  }

  async startLocalMedia(audio: boolean, video: boolean) { ... }
  async createOffer(): Promise<RTCSessionDescriptionInit> { ... }
  async acceptAnswer(sdp: RTCSessionDescriptionInit) { ... }
  async acceptOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> { ... }
  addIceCandidate(candidate: RTCIceCandidateInit) { ... }
  onRemoteStream(cb: (stream: MediaStream) => void) { ... }
  onIceCandidate(cb: (candidate: RTCIceCandidateInit) => void) { ... }
  close() { ... }
}
```

### F.4 Calls Store

Create `frontend/src/store/calls.store.ts`:

```ts
interface CallsState {
  activeCall: ActiveCall | null
  incomingCall: IncomingCall | null
  callHistory: CallRecord[]

  startCall: (targetId: string, type: 'audio' | 'video') => void
  answerCall: (callId: string) => void
  declineCall: (callId: string) => void
  endCall: () => void
}
```

### F.5 Incoming Call UI

Create `frontend/src/components/calls/IncomingCallModal.tsx`:

```
┌───────────────────────────────────┐
│  📞 Incoming audio call            │
│                                   │
│    [Avatar]  Jane Doe             │
│                                   │
│  [✕ Decline]    [✓ Answer]        │
└───────────────────────────────────┘
```

- Renders as full-screen overlay (z-index below SOS button)
- Vibrates with `vibratePattern([500,300,500])`
- Plays ringtone via Web Audio API
- Auto-declines after 30 seconds

### F.6 Active Call UI

Create `frontend/src/components/calls/ActiveCallOverlay.tsx`:

```
┌─────────────────────────────────────┐
│  🔴 00:03:42     [mute] [cam] [spkr] │
│                                     │
│  [Remote video / avatar]            │
│                                     │
│  [Local video PiP — bottom right]   │
│                                     │
│  [📵 End Call]                      │
└─────────────────────────────────────┘
```

- Fixed overlay, does not block chat
- Minimize to floating PiP while navigating app
- Camera/mic toggle buttons with visual state
- Speaker toggle (earpiece ↔ speaker)

### F.7 Group Calls

For rooms with ≤ 8 members: mesh WebRTC (each pair connects directly).  
For rooms > 8 members: note in code that SFU (mediasoup) would be needed — out of scope for this phase; disable group calls > 8 with a UI message.

### F.8 Backend — Call Signalling Handler

Create `backend/src/socket/call.handler.ts`:

```ts
// webrtc_offer: relay offer to targetUserId, create/update calls document
// webrtc_answer: relay answer
// webrtc_ice: relay ICE candidate
// call_invite: save call to DB, send push notification to callee
// call_end: update call status, emit call_ended to room
```

### F.9 ICE Config Endpoint

`GET /api/v1/calls/ice-config` — returns:

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": "turn:your-server:3478",
      "username": "...",
      "credential": "..."
    }
  ]
}
```

Time-limited credentials generated with HMAC-SHA1 (RFC 5766 §7).

### F.10 Checklist for Agent F

- [ ] TURN server added to `docker-compose.yml`
- [ ] `ICE config` endpoint with time-limited TURN credentials
- [ ] `WebRTCSession` class with full offer/answer/ICE lifecycle
- [ ] `calls.store.ts` Zustand store
- [ ] `IncomingCallModal` with accept/decline/vibrate/ringtone
- [ ] `ActiveCallOverlay` with mute, camera toggle, PiP
- [ ] Audio call works end-to-end (1-1)
- [ ] Video call works end-to-end (1-1)
- [ ] Group call (mesh, ≤ 8) works
- [ ] Call history in `GET /api/v1/calls/history`
- [ ] Push notification sent to callee
- [ ] Call ended on socket disconnect
- [ ] Missed call notification

---

## Phase G — SOS / Danger Alert System

**Agent goal:** Implement a one-tap SOS button that immediately alerts all room members with the user's location, shown prominently on the map.

### G.1 SOS Button

**Always visible** — fixed position bottom-right, above bottom nav bar:

```tsx
// frontend/src/components/sos/SOSButton.tsx
<button
  aria-label="Emergency SOS alert"
  style={{ position: 'fixed', bottom: '80px', right: '16px', zIndex: 'var(--z-sos)' }}
  onPointerDown={handleSOSPress}
>
  SOS
</button>
```

**Activation gesture:** Press and hold for **2 seconds** (prevents accidental triggers).  
- During hold: progress ring fills red around button
- On activation: vibrates with `vibrateSOS()`, sends alert, button turns solid red

**Deactivation:** Second press shows "Cancel SOS?" modal with 10-second auto-confirm cancel.

### G.2 SOS Store

Create `frontend/src/store/sos.store.ts`:

```ts
interface SOSState {
  myActiveSOSId: string | null
  activeSOSEvents: SOSEvent[]  // from all room members

  triggerSOS: (roomId: string) => Promise<void>
  resolveSOS: (sosId: string) => Promise<void>
}
```

### G.3 SOS Alert UI

When a team member triggers SOS:

1. **Full-screen modal** appears on all group members' screens:

```
┌──────────────────────────────────────────┐
│  🚨  EMERGENCY ALERT                     │
│                                          │
│  Jane Doe needs help!                    │
│  "I'm in danger"                         │
│                                          │
│  Location: [Open Map]                    │
│  3 minutes ago                           │
│                                          │
│  [📞 Call Jane]   [✓ I'm going to help] │
└──────────────────────────────────────────┘
```

2. **Map marker:** pulsing red circle with "SOS" label at victim's location
3. **Push notification** to all room members (even if app is closed)
4. **Vibration pattern:** `vibrateSOS()` — SOS morse (· · · — — — · · ·)
5. **Sound alert:** Web Audio API synthesized alarm (no external assets needed)

### G.4 Custom Distress Message

Before confirming SOS (optional, 3-second window):
- Pre-set messages: "I'm in danger", "Medical emergency", "I'm lost", "Custom..."
- Can skip → defaults to "I'm in danger"

### G.5 SOS on Map

In `Map.tsx`:

```tsx
{sosEvents.map(sos => (
  <Marker
    key={sos._id}
    position={[sos.lat, sos.lng]}
    icon={sosIcon}  // pulsing red div icon
    zIndexOffset={1000}
  >
    <Popup>
      <SOSPopup sos={sos} onCall={...} onResolve={...} />
    </Popup>
  </Marker>
))}
```

### G.6 Backend — SOS Handler

Create `backend/src/socket/sos.handler.ts`:

```ts
socket.on('sos_trigger', async ({ roomId, lat, lng, message }) => {
  // 1. Verify user is room member
  // 2. Insert sos_events document
  // 3. Cache in Redis 'sos:{roomId}' with TTL 4 hours
  // 4. Emit 'sos_alert' to room
  // 5. Send push notification to all room members (push.service.ts)
  // 6. Log server-side with timestamp
})

socket.on('sos_resolve', async ({ sosId }) => {
  // 1. Update status to 'resolved'
  // 2. Emit 'sos_resolved' to room
  // 3. Delete Redis cache
})
```

### G.7 Offline SOS

If device is offline when SOS is triggered:
1. Store SOS event locally in IndexedDB
2. Display full-screen "SOS queued — waiting for connection" overlay
3. **Immediately send SMS via `navigator.share` or `tel:` link as fallback**
4. On reconnect: flush SOS event first (highest priority in queue)

### G.8 Checklist for Agent G

- [ ] `SOSButton` fixed-position, always visible
- [ ] 2-second hold activation with progress ring
- [ ] Vibrate SOS pattern on activation
- [ ] SOS alert full-screen modal on all group members
- [ ] Push notification via Web Push
- [ ] Pulsing red SOS marker on map
- [ ] Custom distress message options
- [ ] Resolve SOS (clears map marker and alert)
- [ ] Offline: SOS queued with highest priority
- [ ] SOS history in `sos_events` collection
- [ ] `GET /api/v1/sos` returns active events on app load

---

## Phase H — Privacy Settings & Parental Controls

**Agent goal:** Build a comprehensive Settings page and implement a Restricted (child) mode.

### H.1 Settings Page Structure

Create `frontend/src/pages/Settings.tsx` with tabbed navigation:

```
[Account] [Privacy] [Notifications] [Location] [Safety] [Parental]
```

#### Tab: Privacy

```
Location visibility:      [Everyone ▾]
Battery visibility:       [Contacts only ▾]
Online status:            [Everyone ▾]
Last seen:                [Contacts only ▾]
Profile visible to:       [Everyone ▾]
```

#### Tab: Location

```
Share location:           [OFF]
Share in rooms:           [Select rooms...]
Share with contacts:      [Select contacts...]
Location history:         [30 days ▾]
High-accuracy GPS:        [ON]
```

#### Tab: Notifications

```
Push notifications:       [ON — Enabled]  [Configure]
SOS alerts:               [Always ON — locked]
New messages:             [ON]
Missed calls:             [ON]
Location requests:        [ON]
Low battery alerts:       [ON]
```

#### Tab: Safety

```
SOS message presets:      [Edit...]
Emergency contacts:       [Add contact...]
Guardians:                [Add guardian...]
Auto-SOS on inactivity:   [OFF]  After: [2 hours ▾]
```

#### Tab: Parental

```
⚠️ Restricted mode (child mode)
Enable restricted mode:   [OFF]
When enabled:
  - Location always shared with guardians
  - Cannot disable location sharing
  - Cannot change privacy settings
  - SOS button always visible
  - Geofence alerts (set zones below)

Geofence zones:           [Add zone on map]
```

### H.2 Privacy Middleware (Backend)

Create `backend/src/middleware/privacy.ts`:

```ts
// applyPrivacyFilter(requestingUser, targetUser, data, fields)
// Checks each field against target's privacy settings
// Returns filtered data object
```

Apply to:
- `GET /api/v1/location/live` — filter by `privacyLocation`
- `GET /api/v1/telemetry/live` — filter by `privacyBattery`
- `GET /api/v1/users/:id` — filter `lastSeen` by `privacyLastSeen`, online by `privacyOnlineStatus`

### H.3 Restricted Mode (Child Mode)

When `user.restrictedMode = true`:

**Frontend enforcement:**
- Settings tabs [Privacy], [Location] are locked (read-only with lock icon)
- SOS button cannot be hidden
- Location sharing is force-enabled for `guardianIds`
- "Parental controls active" banner at top of all pages

**Backend enforcement:**
- `PATCH /users/me/privacy` → 403 if `restrictedMode = true`
- `PATCH /location/sharing` → force guardian rooms into active sharing list

### H.4 Geofence Alerts

Store geofence zones per user (guardians set them):

```ts
// In users collection:
geofences: [{
  name: string,           // "Home", "School"
  lat: number,
  lng: number,
  radiusMetres: number,
  alertOnExit: boolean,
  alertOnEntry: boolean
}]
```

Backend checks geofence on each location update:
- If user was inside zone and exits: emit `geofence_exit` event, send push to guardians
- If user enters zone: emit `geofence_entry`

Show geofence circles on map (for guardians only).

### H.5 Inactivity SOS

Background service (PWA service worker or periodic beacon):
- Track last `location_update` or `activity` event timestamp
- If threshold exceeded (configured in settings) and user set auto-SOS ON:
  - Send "I may need help — no activity for X hours" SOS

### H.6 Checklist for Agent H

- [ ] Settings page with tabs: Account, Privacy, Notifications, Location, Safety, Parental
- [ ] Privacy settings persisted via `PATCH /users/me/privacy`
- [ ] Privacy filters applied server-side on location and telemetry endpoints
- [ ] Restricted mode UI enforcement (locked settings, forced sharing)
- [ ] Backend restriction enforcement (403 on privacy changes)
- [ ] Geofence zones: create, display on map, alert on entry/exit
- [ ] Emergency contacts and guardian management
- [ ] SOS presets editable in Settings
- [ ] Push notification preferences granular per type
- [ ] "Parental controls active" banner in restricted mode

---

## Phase I — Remote Camera / Mic Access

**Agent goal:** Allow a guardian (with consent) to remotely request a live video/audio stream from a child's device.

> ⚠️ **Privacy & consent are paramount.** This feature must have explicit on-device consent for every session. No silent access is ever permitted.

### I.1 Remote View Request Flow

```
Guardian requests remote view
  ↓
Socket event 'remote_view_request' sent to child's device
  ↓
Child's device: PROMINENT full-screen consent modal appears
  - "Jane is requesting to view your camera and mic"
  - [DENY] [Allow 1 minute] [Allow 5 minutes]
  ↓
If allowed: WebRTC session started (audio/video)
  ↓
Child's screen: persistent "Being viewed by Jane" banner with [Stop] button
Guardian's screen: live video feed in modal
  ↓
Auto-ends after consent duration OR child presses [Stop]
```

### I.2 Consent Modal

```tsx
// frontend/src/components/remote/RemoteViewConsentModal.tsx
// - Must be dismissible with a single prominent DENY tap
// - Full-screen, z-index at absolute top (above SOS)
// - 30-second auto-deny if no response
// - Persist denial to prevent immediate re-request (cooldown 5 min)
```

### I.3 Active Viewing Indicator

When remote view is active, child sees:

```
┌──────────────────────────────────────────────────┐
│  📹 Jane is viewing your camera   [Stop Now]     │
└──────────────────────────────────────────────────┘
```

- Fixed top banner, cannot be dismissed except via [Stop]
- Vibrates every 60s as reminder
- Logged to user's session history

### I.4 Remote View Session

Reuses WebRTC infrastructure from Phase F:
- Uses `call.handler.ts` with `type: 'remote_view'`
- Child's camera stream is one-way (guardian watches only, no audio from guardian)
- Screen share option: if child approves, they can share screen instead of camera

### I.5 Guardian Dashboard

Add a "Family" section to the Map page sidebar (visible to guardians only):

```
┌─────────────────────────┐
│  FAMILY MEMBERS         │
│                         │
│  👦 Tommy  🟢 Online    │
│     🔋 82%  📍 School   │
│     [📞 Call] [📹 View] │
│                         │
│  👧 Emma   🔴 Offline   │
│     Last seen: 2h ago   │
└─────────────────────────┘
```

### I.6 Audit Log

Every remote access request and session is stored in `sessions` (or a new `remote_access_log` collection):

```ts
{
  requesterId: ObjectId,
  targetUserId: ObjectId,
  requestedAt: Date,
  consentGiven: boolean,
  consentDuration: number | null,   // minutes
  sessionStartedAt: Date | null,
  sessionEndedAt: Date | null,
  endedBy: 'requester' | 'target' | 'timeout'
}
```

Users can view this log in Settings > Privacy > Access History.

### I.7 Checklist for Agent I

- [ ] `remote_view_request` socket event
- [ ] Full-screen consent modal (auto-deny in 30s)
- [ ] Deny cooldown (5 min) stored in Redux/localStorage
- [ ] Active viewing banner with [Stop] button
- [ ] WebRTC stream (child cam → guardian, one-way video)
- [ ] Guardian family dashboard panel on map
- [ ] Remote access audit log
- [ ] Access history visible in Settings
- [ ] Restricted mode users can be viewed by guardians without cooldown (but with consent modal always)

---

## 16. Cross-Cutting Concerns

### 16.1 TypeScript Strict Mode

All new files must pass `tsc --strict`. No `any` without a documented reason.

### 16.2 Error Handling

- All async operations wrapped in try/catch
- Errors surfaced via existing `Toast` component
- Network errors → enqueue to offline queue where applicable

### 16.3 Performance

- Leaflet map: virtualize markers (only render markers in viewport + 20% buffer)
- Location updates: throttle at source (5m or 30s) — not every GPS tick
- Battery/telemetry: 30-second interval, debounce on change events
- PTT audio: 250ms chunks (latency vs quality trade-off)
- WebRTC: use opus audio codec, VP8 video codec

### 16.4 Security

- All location/telemetry data gated behind authentication
- Privacy settings enforced server-side (never trust client-only enforcement)
- WebRTC: DTLS encryption end-to-end (browser default)
- Push subscriptions: validate endpoint before storing
- SOS: rate-limit to prevent spam (3 SOS per hour per user per room)
- Remote access: audit log, consent required, one session at a time per target

### 16.5 Accessibility

- All interactive elements have `aria-label`
- Touch targets ≥ 44 × 44 px
- Focus management in modals (focus trap)
- Colour is never the sole indicator (icons + text)
- Reduce motion: `prefers-reduced-motion` disables animations in CSS

### 16.6 Internationalisation (Future)

- All user-facing strings in `frontend/src/i18n/en.json`
- Use `t('key')` helper (can start with simple object lookup, later replace with i18next)

### 16.7 Testing

Each phase agent should include:

- [ ] At least 3 unit tests for critical service functions (jest)
- [ ] Manual testing checklist in `docs/phase-{X}-testing.md`
- [ ] `docker compose up` still passes after phase

---

## 17. Repository Structure Additions

```
frontend/
  public/
    icons/
      pwa-192.png          (Phase A)
      pwa-512.png          (Phase A)
      sos-96.png           (Phase G)
      default-avatar.svg   (Phase B)
  src/
    pages/
      Map.tsx              (Phase B)
      Settings.tsx         (Phase H)
    components/
      pwa/
        InstallBanner.tsx  (Phase A)
      map/
        UserMarker.tsx     (Phase B)
        SOSMarker.tsx      (Phase G)
        GeofenceCircle.tsx (Phase H)
        UserPopup.tsx      (Phase B)
      chat/
        PTTButton.tsx      (Phase D)
        AudioMessage.tsx   (Phase E)
        VideoMessage.tsx   (Phase E)
      calls/
        IncomingCallModal.tsx (Phase F)
        ActiveCallOverlay.tsx (Phase F)
      sos/
        SOSButton.tsx      (Phase G)
        SOSAlertModal.tsx  (Phase G)
      remote/
        RemoteViewConsentModal.tsx (Phase I)
        ViewingBanner.tsx  (Phase I)
      ui/
        BatteryIndicator.tsx (Phase C)
    hooks/
      useOfflineSync.ts    (Phase A)
      useLocationSharing.ts (Phase B)
      useTelemetry.ts      (Phase C)
      usePTT.ts            (Phase D)
      useCalls.ts          (Phase F)
      useSOS.ts            (Phase G)
    store/
      location.store.ts    (Phase B)
      calls.store.ts       (Phase F)
      sos.store.ts         (Phase G)
    lib/
      offlineQueue.ts      (Phase A)
      geolocation.ts       (Phase B)
      batteryStatus.ts     (Phase C)
      networkStatus.ts     (Phase C)
      vibration.ts         (Phase A)
      pushNotifications.ts (Phase A)
      pttAudioQueue.ts     (Phase D)
      mediaRecorder.ts     (Phase E)
      webrtc.ts            (Phase F)
    i18n/
      en.json              (any phase)

backend/
  src/
    routes/
      location.routes.ts   (Phase B)
      telemetry.routes.ts  (Phase C)
      calls.routes.ts      (Phase F)
      sos.routes.ts        (Phase G)
      push.routes.ts       (Phase A)
      sync.routes.ts       (Phase A)
    socket/
      location.handler.ts  (Phase B)
      ptt.handler.ts       (Phase D)
      call.handler.ts      (Phase F)
      sos.handler.ts       (Phase G)
    services/
      push.service.ts      (Phase A)
      geofence.service.ts  (Phase H)
    models/
      location.model.ts    (Phase B)
      telemetry.model.ts   (Phase C)
      call.model.ts        (Phase F)
      sosEvent.model.ts    (Phase G)
      pushSubscription.model.ts (Phase A)
      offlineQueue.model.ts (Phase A)
    middleware/
      locationPrivacy.ts   (Phase B)
      privacy.ts           (Phase H)

docs/
  FEATURE_PLAN_V2.md       (this file)
  phase-A-testing.md
  phase-B-testing.md
  ...
```

---

## Quick-Start Checklist for Each Agent

Before writing any code:

1. [ ] Read `TECHNICAL_SPEC.md` fully
2. [ ] Read `AGENT_DEVELOPMENT_GUIDE.md` fully
3. [ ] Read this document (`FEATURE_PLAN_V2.md`) fully
4. [ ] Run `docker compose up` and verify it is green
5. [ ] Read all existing code that your phase will touch

During implementation:

6. [ ] TypeScript strict mode — no `any` without comment
7. [ ] Mobile-first: test at 375 px width first
8. [ ] No `!important` in CSS
9. [ ] DRY/KISS/SOLID — extract reusable hooks, services
10. [ ] Every new API route has authentication middleware
11. [ ] Privacy enforced server-side
12. [ ] Offline: queue actions, sync on reconnect
13. [ ] Add `// TODO(phase-X):` for known gaps

After implementation:

14. [ ] `docker compose up --build` passes
15. [ ] No TypeScript errors (`tsc --noEmit`)
16. [ ] No ESLint errors
17. [ ] Create `docs/phase-{letter}-testing.md` with manual test steps
18. [ ] Update the checklist in this section with ✅

---

*End of FEATURE_PLAN_V2.md*
