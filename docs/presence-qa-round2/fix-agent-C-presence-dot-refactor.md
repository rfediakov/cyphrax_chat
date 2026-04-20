# Agent C — Shared PresenceDot Component (R2-BUG-03)

## Status

**Medium — Never implemented.** This was Round 1 BUG-05 and was not touched. All six files still contain local copies of `type PresenceStatus` and/or `PresenceDot`.

---

## Bug Summary

`PresenceStatus` and `PresenceDot` are duplicated across 6 files with minor inconsistencies:

| File | `PresenceStatus` type | `PresenceDot` component | Notes |
|------|-----------------------|------------------------|-------|
| `frontend/src/store/presence.store.ts` | ✓ line 3 | — | |
| `frontend/src/hooks/usePresence.ts` | ✓ line 3 | — | |
| `frontend/src/components/layout/LeftSidebar.tsx` | ✓ line 24 | ✓ lines 26–38 | `w-2 h-2`, has `title={status}` |
| `frontend/src/components/layout/RightSidebar.tsx` | ✓ line 18 | ✓ lines 20–27 | `w-2 h-2`, **missing `title` attribute** |
| `frontend/src/pages/Contacts.tsx` | ✓ line 17 | ✓ lines 19–26 | `w-2.5 h-2.5`, has `title={status}` — **different size** |
| `frontend/src/components/modals/ManageRoomModal.tsx` | ✓ line 35 | ✓ lines 37–44 | Need to verify size |

Any addition of a new status (e.g. `'busy'`, `'dnd'`) or visual change to the dot requires editing all 6 files. `Contacts.tsx` already diverged in dot size (`w-2.5` vs `w-2`), creating a visual inconsistency.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/src/components/ui/PresenceDot.tsx` | **Create** — single canonical component + exported type |
| `frontend/src/store/presence.store.ts` | Import type; remove local definition |
| `frontend/src/hooks/usePresence.ts` | Import type; remove local definition |
| `frontend/src/components/layout/LeftSidebar.tsx` | Import component + type; remove local copies |
| `frontend/src/components/layout/RightSidebar.tsx` | Import component + type; remove local copies |
| `frontend/src/pages/Contacts.tsx` | Import component + type; remove local copies |
| `frontend/src/components/modals/ManageRoomModal.tsx` | Import component + type; remove local copies |

---

## Implementation

### Step 1 — Read all source files first

Before writing anything, read the `PresenceDot` implementation in each of the 4 UI files to confirm exact Tailwind class usage. The canonical version must not introduce visual regressions.

**Expected findings (verify these):**
- LeftSidebar: `bg-green-400`, `bg-amber-400`, `bg-gray-500` — `w-2 h-2` — with `title`
- RightSidebar: `bg-green-400`, `bg-amber-400`, `bg-gray-500` — `w-2 h-2` — **no `title`**
- Contacts: `bg-green-400`, `bg-amber-400`, `bg-gray-500` — `w-2.5 h-2.5` — with `title`
- ManageRoomModal: read and record

### Step 2 — Create `frontend/src/components/ui/PresenceDot.tsx`

Standardise to `w-2 h-2` (the majority variant). Include `title` for accessibility. Accept an optional `className` prop for size overrides if any consumer needs a different size.

```tsx
export type PresenceStatus = 'online' | 'afk' | 'offline';

const DOT_COLORS: Record<PresenceStatus, string> = {
  online: 'bg-green-400',
  afk: 'bg-amber-400',
  offline: 'bg-gray-500',
};

interface PresenceDotProps {
  status: PresenceStatus;
  className?: string;
}

export function PresenceDot({ status, className = '' }: PresenceDotProps) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[status]} ${className}`}
      title={status}
    />
  );
}
```

> Place this file alongside existing shared UI primitives: `Toast.tsx` and `ErrorBoundary.tsx` are already in `frontend/src/components/ui/`.

### Step 3 — Update `frontend/src/store/presence.store.ts`

Replace the local type with an import:

```ts
import type { PresenceStatus } from '../components/ui/PresenceDot';
```

Remove line 3: `type PresenceStatus = 'online' | 'afk' | 'offline';`

All other store code stays unchanged.

### Step 4 — Update `frontend/src/hooks/usePresence.ts`

```ts
import { usePresenceStore } from '../store/presence.store';
import type { PresenceStatus } from '../components/ui/PresenceDot';

export function usePresence() {
  const statuses = usePresenceStore((s) => s.statuses);

  const getStatus = (userId: string): PresenceStatus =>
    statuses[userId] ?? 'offline';

  return { getStatus, statuses };
}
```

Remove line 3: `type PresenceStatus = 'online' | 'afk' | 'offline';`

### Step 5 — Update the four UI files

For each of `LeftSidebar.tsx`, `RightSidebar.tsx`, `Contacts.tsx`, `ManageRoomModal.tsx`:

1. Add the import at the top (adjust relative path per file location):

```tsx
// In LeftSidebar.tsx and RightSidebar.tsx (inside components/layout/):
import { PresenceDot, type PresenceStatus } from '../ui/PresenceDot';

// In Contacts.tsx (inside pages/):
import { PresenceDot, type PresenceStatus } from '../components/ui/PresenceDot';

// In ManageRoomModal.tsx (inside components/modals/):
import { PresenceDot, type PresenceStatus } from '../ui/PresenceDot';
```

2. **Delete** the local `type PresenceStatus = ...` definition.

3. **Delete** the local `function PresenceDot(...)` component definition (the entire function, including the `const colors` map inside it).

4. Verify all `<PresenceDot status={...} />` usages in the file remain — they now refer to the imported component and require no other changes.

**Special case — `Contacts.tsx`:** The local dot used `w-2.5 h-2.5`. After switching to the canonical component (default `w-2 h-2`), verify the dot is still clearly visible. If a larger size is needed, pass `className="w-2.5 h-2.5"`:

```tsx
<PresenceDot status={getStatus(contact._id)} className="w-2.5 h-2.5" />
```

Note this in your PR description.

---

## Acceptance Criteria

| ID | Test | Pass Condition |
|----|------|----------------|
| C-01 | Online user — LeftSidebar contacts list | Green dot visible |
| C-02 | AFK user — LeftSidebar contacts list | Amber dot visible |
| C-03 | Offline user — LeftSidebar contacts list | Grey dot visible |
| C-04 | Online user — RightSidebar member list | Green dot visible |
| C-05 | Online user — Contacts page | Green dot visible |
| C-06 | Online user — ManageRoomModal member list | Green dot visible |
| C-07 | `tsc --noEmit` | Zero TypeScript errors |
| C-08 | `grep -r "type PresenceStatus" frontend/src/` | Returns **only** `PresenceDot.tsx` |
| C-09 | `grep -r "function PresenceDot" frontend/src/` | Returns **only** `PresenceDot.tsx` |
| C-10 | Hover over any presence dot | Browser tooltip shows `"online"`, `"afk"`, or `"offline"` (from `title` attribute) |

---

## Notes

- This is a **pure refactor** — zero logic changes, zero backend changes, no new features.
- Run `tsc --noEmit` from `frontend/` after making changes to catch any import-path mistakes early.
- Agent C can be merged **independently** of Agents A and B — it only touches component and type files, not `useSocket.ts` or `Chat.tsx`.
- Standardise to `w-2 h-2` (8 px) as the canonical dot size, matching the majority of existing usages. The `className` escape hatch handles any surface that genuinely needs a different size.
- The `shrink-0` class (already in LeftSidebar's version) prevents the dot from collapsing in flex containers — include it in the canonical component.
