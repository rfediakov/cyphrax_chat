# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The single source of truth for the version is the [`/VERSION`](./VERSION) file.
Run `./scripts/sync-version.sh [new-version]` to propagate it to
`frontend/package.json`, `backend/package.json`, and `frontend/src/version.ts`.

## [2.4.0] - 2026-05-19

### Added
- **Custom map markers**: any room member can drop a categorized marker
  (Pin, Meet here, Hazard, Food, Camp, Photo) on the group map with an
  optional title and notes. Markers are room-scoped, persisted in MongoDB,
  and broadcast in real-time over Socket.IO (`marker_created`,
  `marker_updated`, `marker_deleted`). Owners (and room admins) can delete
  their markers from the popup.
- **Interactive map legend** overlaid on the map (top-left). Collapses to a
  pill on idle and expands into a list with live counts for You, Group
  members, SOS, and each marker category. Each row toggles visibility of
  that layer on the map; "Show all / Hide all" shortcut included. Hidden
  layers persist per-user in `localStorage`.
- **Add-marker bottom sheet** (`AddMarkerSheet`): mobile-first picker with
  category chips, title (max 80) and notes (max 500), and accessible
  focus/keyboard behaviour. Available on both the full Map page and the
  in-chat `ChatMapPanel` mini-map.
- **Backend**: `MapMarker` model and `/api/v1/markers` REST surface
  (`GET ?roomId=…`, `POST`, `PATCH /:id`, `DELETE /:id`) with room
  membership checks and owner-or-admin delete authorization.

### Changed
- `GroupMap` now accepts `customMarkers`, `currentUserId`,
  `onDeleteMarker`, and `hiddenLayers` and renders user/peer/SOS/marker
  layers conditionally based on the layer-visibility set.
- The map page replaces the binary "picker mode" with an explicit tool
  mode (`idle | pin | marker`) so the two place-on-map actions can't
  collide, and surfaces status hints at the bottom of the viewport.

## [2.3.0] - 2026-05-19

### Fixed
- **SOS emergency alert is now dismissible**: previously the only "close" path
  was the *I'm going to help* button, which calls `sos_resolve`. The server
  only authorizes the victim or a room admin to resolve, so for every other
  helper the request silently failed and the full-screen red alert stayed
  pinned on top of the app with no way out.

### Changed
- **Version display**: shows full semver (`v2.3.0`) instead of truncating to
  `major.minor`; visible in the top nav on every authenticated screen (not only
  Chat/login) via a shared `AppVersion` component and `AuthenticatedLayout`.

### Added
- **Local dismiss for SOS alerts** (`SOSAlertModal`):
  - Close (×) button in the top-right of each alert card (44×44 tap target,
    `aria-label="Dismiss alert"`, visible focus ring).
  - Secondary *Dismiss* button next to the primary CTA for users who don't
    want to commit to helping.
  - `Esc` key dismisses all currently visible alerts.
  - *Dismiss all (N)* shortcut when 2+ alerts are stacked.
  - *I'm going to help* now optimistically dismisses locally **and** still
    attempts `sos_resolve` — admins/victims continue to clear it for the
    whole room, helpers are no longer stuck.
- **Accessibility**: alert overlay exposes `role="dialog"` / `aria-modal`
  and each card uses `role="alertdialog"` with `aria-labelledby` /
  `aria-describedby`.
- **`dismissedSOSIds`** state in `useSOSStore` with `dismissSOS(id)` action;
  dismissals are per-SOS-id, scoped to the session, auto-pruned when the
  underlying event is resolved or removed, and re-cleared if the same id is
  re-broadcast by the server.

## [2.2.0] - 2026-05-19

### Fixed
- **Branding**: unified product name to **SafeGroup** across the app shell,
  auth flow, and chat welcome screen (previously a mix of *Cyphrax*, *ChatApp*,
  and *SafeGroup*).
- **Mobile layout**: the fixed bottom navigation no longer overlaps the chat
  composer, the map history FAB, or the bottom of `Profile`, `Sessions`,
  `Contacts`, `PublicRooms`, and `Settings`. `Chat` and `Map` now use `100dvh`
  with mobile-only bottom padding so the visible viewport stays usable.
- **Top nav**: links use `react-router NavLink` so the active route is
  visually highlighted and exposes `aria-current`.
- **Welcome copy** on the chat home screen no longer references a non-existent
  "left sidebar" on mobile.
- **Version badge** is no longer rendered over the top navigation on app
  routes; it now appears only on the public auth pages.
- **Accessibility**: settings toggles expose `role="switch"` /
  `aria-checked` / accessible name; icon-only close buttons in the
  *Create Room* modal and the map *Location History* drawer expose
  `aria-label` (with `aria-hidden` on the decorative icons).
- **Auth styling**: replaced indigo accents with the app's blue palette so
  buttons, focus rings, links, and checkbox accents match the in-app UI.
- **Headings**: removed the duplicate room-name `<h2>` from the members
  panel — the chat header `<h1>` is now the canonical heading.

### Added
- **App versioning infrastructure**:
  - Root [`VERSION`](./VERSION) file as the single source of truth.
  - [`scripts/sync-version.sh`](./scripts/sync-version.sh) propagates the
    version to `frontend/package.json`, `backend/package.json`, and
    `frontend/src/version.ts`.
  - Backend `GET /api/v1/version` endpoint returning `{ name, version }`
    for operational checks (mounted under `/api/v1` so it goes through
    the same reverse proxy as the rest of the API).
  - This `CHANGELOG.md`.

## [2.1.0] - 2026-05-18
- GCP deploy tooling and version badge.
