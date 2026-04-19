# Agent 5 — Frontend: Shared PresenceDot Component

## Goal

Fix **BUG-05**: eliminate the six-way duplication of `PresenceStatus` type and `PresenceDot` component by extracting them into a single shared file.

## Bug Summary

The following files each define their own local copy of `type PresenceStatus` and a `PresenceDot` component (or equivalent inline logic):

| File | Lines (approx) |
|------|----------------|
| `frontend/src/components/layout/LeftSidebar.tsx` | 12–26 |
| `frontend/src/components/layout/RightSidebar.tsx` | 18–27 |
| `frontend/src/pages/Contacts.tsx` | 17–26 |
| `frontend/src/components/modals/ManageRoomModal.tsx` | 35–44 |
| `frontend/src/hooks/usePresence.ts` | 3 (type only) |
| `frontend/src/store/presence.store.ts` | 3 (type only) |

Any future addition of a status (e.g. `'busy'`, `'dnd'`) requires editing all six files. Any visual change to the dot requires the same.

## Files to touch

| File | Change |
|------|--------|
| `frontend/src/components/ui/PresenceDot.tsx` | Create — canonical component + type export |
| `frontend/src/store/presence.store.ts` | Import type from `PresenceDot.tsx`; remove local definition |
| `frontend/src/hooks/usePresence.ts` | Import type from `PresenceDot.tsx`; remove local definition |
| `frontend/src/components/layout/LeftSidebar.tsx` | Import from `PresenceDot.tsx`; remove local copies |
| `frontend/src/components/layout/RightSidebar.tsx` | Import from `PresenceDot.tsx`; remove local copies |
| `frontend/src/pages/Contacts.tsx` | Import from `PresenceDot.tsx`; remove local copies |
| `frontend/src/components/modals/ManageRoomModal.tsx` | Import from `PresenceDot.tsx`; remove local copies |

## Implementation Steps

### 1. Create `frontend/src/components/ui/PresenceDot.tsx`

Read each of the six files above first to confirm the exact colour mapping used, then create a single canonical version. The expected shape (verify against source):

```tsx
export type PresenceStatus = 'online' | 'afk' | 'offline';

const DOT_CLASS: Record<PresenceStatus, string> = {
  online: 'bg-green-500',
  afk: 'bg-yellow-500',
  offline: 'bg-gray-500',
};

interface PresenceDotProps {
  status: PresenceStatus;
  className?: string;
}

export function PresenceDot({ status, className = '' }: PresenceDotProps) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[status]} ${className}`}
    />
  );
}
```

> Match the exact Tailwind classes already used in the codebase — read the existing implementations before writing the canonical version to avoid a visual regression.

### 2. Update `presence.store.ts`

Replace the local `type PresenceStatus = ...` with an import:

```ts
import type { PresenceStatus } from '../components/ui/PresenceDot';
```

Remove the local type definition. All other store code stays the same.

### 3. Update `usePresence.ts`

Same pattern — replace local type definition with the import.

### 4. Update the four UI files

For each of `LeftSidebar.tsx`, `RightSidebar.tsx`, `Contacts.tsx`, `ManageRoomModal.tsx`:

1. Delete the local `type PresenceStatus` definition.
2. Delete the local `PresenceDot` component (or inline dot markup).
3. Add import: `import { PresenceDot, type PresenceStatus } from '../components/ui/PresenceDot';`  
   (adjust relative path depth per file location).
4. Replace all usages of the local component/type with the imported ones.

## Acceptance Criteria

| ID | Check | Pass condition |
|----|-------|----------------|
| P5-01 | Online user presence dot — all surfaces | Green dot shown in LeftSidebar, RightSidebar, Contacts, ManageRoomModal |
| P5-02 | AFK user presence dot — all surfaces | Yellow dot shown on all four surfaces |
| P5-03 | Offline user presence dot — all surfaces | Grey dot shown on all four surfaces |
| P5-04 | No TypeScript errors | `tsc --noEmit` passes |
| P5-05 | No duplicate `PresenceStatus` definitions in codebase | `grep -r "type PresenceStatus" src/` returns only `PresenceDot.tsx` |
| P5-06 | No duplicate `PresenceDot` component definitions | `grep -r "function PresenceDot" src/` returns only `PresenceDot.tsx` |

## Notes

- Run this task **after** Agents 2, 3, and 4 are merged to avoid merge conflicts — those agents touch `useSocket.ts` and `Chat.tsx`, not these six files, so parallel execution is possible but sequential is safer.
- Do not change the dot colours or sizes — this is a pure refactor with no visual changes.
- If the four UI files use slightly different Tailwind classes for the dot (e.g. `w-2.5 h-2.5` in one place), standardise to the most common variant and note the change in the PR description.
- `PresenceDot.tsx` goes under `src/components/ui/` alongside other shared primitives (e.g. `Toast`, `ErrorBoundary`).
