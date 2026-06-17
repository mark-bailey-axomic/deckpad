# Reorder Group Tabs in Edit Mode — Design

**Date:** 2026-06-12
**Status:** Approved (design)

## Summary

Let users reorder the group tabs by drag-and-drop while in edit mode. Today tabs
can only be added (appended) or deleted; their order is fixed. This adds
horizontal drag-to-reorder using the same native HTML5 drag-and-drop pattern
already proven for reordering keys within a grid.

## Goals

- Drag a group tab left/right to a new position while in edit mode.
- Persist the new order through the existing config-save path.
- Keep the user's currently active group visible after a reorder (active follows
  the group, not the index).
- Leave existing tab interactions untouched: single-click to switch, double-click
  to rename, ✕ to delete.

## Non-goals

- Reordering outside edit mode.
- Reordering keys (already exists).
- Any new persistence format — group order remains implicit array order.
- Keyboard / arrow-button reordering (YAGNI for now; drag only).

## Current state (references)

- Tabs rendered in `src/renderer/src/App.tsx:289` (the `.dp-tabs` block).
- Edit mode: local `useState` in `App.tsx:24`, toggled by the pencil button
  (`App.tsx:275`).
- Group model: `src/shared/types.ts:37` — `Group { id, name, slots }`; order is
  the position in `Config.groups` (no explicit order field).
- Active group: numeric index `active` (`App.tsx:23`).
- Central persistence: `commit()` (`App.tsx:53`) → `deck.saveConfig`.
- Existing key drag-and-drop: native HTML5 DnD in `App.tsx` (`dragFrom` ref +
  `dragOver` state) with reorder logic `insertShiftReorder()` in
  `src/shared/layout.ts:10`.

## Approach

**Inline handlers in `App.tsx`, mirroring the existing key-reorder code.**
Smallest diff, reuses the proven pattern, no new abstraction. Rejected
alternatives: extracting a `GroupTabs` component (more churn; App.tsx is the
single state owner) and a generalized `useReorder` hook (the slot case allows
`null` shifting, groups do not — abstraction would leak).

## Design

### Data & state

- Reuse `insertShiftReorder()` on `config.groups`.
- New drag state in `App.tsx`, kept separate from the key-drag state so the two
  never interfere:
  - `groupDragFrom = useRef<number | null>(null)`
  - `[groupDragOver, setGroupDragOver] = useState<number | null>(null)`
- Reorder commits through the existing `commit()` path → `deck.saveConfig`.

### Active-follows-group

Index-based selection would make the visible grid jump when tabs shuffle. To
avoid that:

1. Before reordering, capture `const activeId = config.groups[active].id`.
2. After reordering, set `active` to the new index of `activeId`.

Extract this into a small pure helper for testing, e.g.:

```ts
// reorder the groups array (delegates to insertShiftReorder)
function reorderGroups(groups: Group[], from: number, to: number): Group[]
// new index of a group id within an array
function indexOfId(groups: Group[], id: string): number
```

(Implementation may combine these; the key requirement is a unit-testable pure
function that, given groups + from + to + activeId, yields the new order and the
new active index.)

### Interaction & rendering

On each tab `<div>` (`App.tsx:289`–319):

- `draggable={editMode && !isRenaming}` — draggable only in edit mode, never
  while that tab's rename input is open.
- `onDragStart` → set `groupDragFrom.current = gi`; also `setRenaming(null)`.
- `onDragOver` → `e.preventDefault()` + `setGroupDragOver(gi)`, only when
  `editMode` and a group drag is in progress.
- `onDrop` → compute reordered groups via
  `insertShiftReorder(config.groups, groupDragFrom.current, gi)`, recompute
  `active` by id, `commit()`, clear drag state.
- `onDragEnd` → clear `groupDragFrom` and `groupDragOver`.
- The delete ✕ (`.dp-tab-del`) already `stopPropagation`s; drag starts on the
  tab body, so the ✕ remains a click target.

Single-click (switch) and double-click (rename) are unaffected — native DnD only
fires on actual movement.

### Visual feedback (`src/renderer/src/assets/deckpad.css`, mirroring keys)

- `.dp-tab.is-edit` — subtle affordance/jiggle in edit mode (parallel to
  `.dp-key.is-edit`).
- `.dp-tab.is-dragover` — insertion indicator on the hovered tab during a drag
  (parallel to `.dp-key.is-dragover`); a left/right edge marker, since tabs are
  laid out horizontally.
- `cursor: grab` on draggable tabs in edit mode.

## Edge cases

- Single group: nothing to reorder; drag is a no-op (consistent with the ✕ being
  hidden when `groups.length <= 1`).
- Drop on self (`from === to`): `insertShiftReorder` returns a copy unchanged;
  guard to avoid a redundant `commit()`/save.
- Reorder while renaming: prevented via `draggable={... && !isRenaming}`.
- Active group moved, or a non-active group dragged past the active one: active
  still follows by id.

## Testing (Vitest + Testing Library, TDD)

- `insertShiftReorder` on a groups array — add a group-specific case if existing
  coverage is slot-only.
- Active-follows-group helper (pure): move the active group; move a non-active
  group past the active one; move to either end.
- Component: simulate `dragStart` / `dragOver` / `drop` on tabs → assert
  `saveConfig` called with reordered groups AND the active group preserved.
- Guards: tabs not draggable when `editMode` is false; not draggable while
  renaming; drop-on-self does not trigger a save.
