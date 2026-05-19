# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The single source of truth for the version is the [`/VERSION`](./VERSION) file.
Run `./scripts/sync-version.sh [new-version]` to propagate it to
`frontend/package.json`, `backend/package.json`, and `frontend/src/version.ts`.

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
  - Backend `GET /version` endpoint returning `{ name, version }` for
    operational checks.
  - This `CHANGELOG.md`.

## [2.1.0] - 2026-05-18
- GCP deploy tooling and version badge.
