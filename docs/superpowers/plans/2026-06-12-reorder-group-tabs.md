# Reorder Group Tabs in Edit Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag group tabs left/right to reorder them while in edit mode, persisting the new order and keeping the active group visible.

**Architecture:** Reuse the existing native HTML5 drag-and-drop pattern already used for keys. Add a second, independent drag-state pair (`groupDragFrom` ref + `groupDragOver` state) in `App.tsx`, wire drag handlers onto each tab `<div>`, and reorder `config.groups` with the existing `insertShiftReorder()` through the single `commit()` persistence path. A small pure helper `indexOfId()` recomputes the active index by id so the selected group follows its tab.

**Tech Stack:** React 19 + TypeScript, native HTML5 DnD, vanilla CSS, Vitest + @testing-library/react (jsdom), Electron.

**Design reference:** `docs/superpowers/specs/2026-06-12-reorder-group-tabs-design.md`

---

## File Structure

- `src/shared/layout.ts` — add `indexOfId()` pure helper (sits beside the existing `insertShiftReorder()`).
- `src/shared/layout.test.ts` — unit tests for `indexOfId()` and a group-array reorder case.
- `src/renderer/src/App.tsx` — add group-drag state + handlers; make tabs draggable; render drag-over/edit classes.
- `src/renderer/src/App.test.tsx` — component tests for tab drag reorder, active-follows-group, and guards.
- `src/renderer/src/assets/deckpad.css` — `.dp-tab.is-edit` (affordance + grab cursor) and `.dp-tab.is-dragover` (insertion outline).

---

## Task 1: `indexOfId()` helper + group reorder coverage

**Files:**
- Modify: `src/shared/layout.ts` (add export beside `insertShiftReorder`, ~line 19)
- Test: `src/shared/layout.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/shared/layout.test.ts` (the file already imports from `./layout` and defines the `g` group factory near the top):

```typescript
describe('indexOfId', () => {
  const mk = (idList: string[]) => idList.map((id) => ({ id }));
  it('returns the index of the matching id', () => {
    expect(indexOfId(mk(['a', 'b', 'c']), 'b')).toBe(1);
  });
  it('returns 0 when the id is absent (safe fallback)', () => {
    expect(indexOfId(mk(['a', 'b']), 'zzz')).toBe(0);
  });
});

describe('insertShiftReorder — groups array', () => {
  it('reorders a Group[] preserving identity', () => {
    const groups = [g('g1', []), g('g2', []), g('g3', [])];
    expect(insertShiftReorder(groups, 0, 2).map((x) => x.id)).toEqual(['g2', 'g3', 'g1']);
  });
});
```

Update the existing import line at the top of the file to include `indexOfId`:

```typescript
import { compactSlots, fitSlots, indexOfId, insertShiftReorder, resizeGroups } from './layout';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/layout.test.ts`
Expected: FAIL — `indexOfId is not a function` (or import error).

- [ ] **Step 3: Implement `indexOfId`**

In `src/shared/layout.ts`, add immediately after `insertShiftReorder` (after line 19):

```typescript
/** Index of the item whose id matches; 0 when absent (safe fallback for active-group tracking). */
export function indexOfId(items: { id: string }[], id: string): number {
  const i = items.findIndex((item) => item.id === id);
  return i < 0 ? 0 : i;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/layout.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add src/shared/layout.ts src/shared/layout.test.ts
git commit -m "feat: indexOfId helper + group-array reorder coverage"
```

---

## Task 2: Drag-reorder wiring in `App.tsx`

**Files:**
- Modify: `src/renderer/src/App.tsx` (state ~line 37; handlers ~line 122; tab JSX lines 297–300; import line 3)
- Test: `src/renderer/src/App.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `src/renderer/src/App.test.tsx` (it already mocks `./lib/deck`, defines `button()` and `seedConfig()`, and imports `fireEvent, render, screen, waitFor, vi`):

```typescript
describe('group tab reorder', () => {
  it('drag-reorders tabs in edit mode, persists, and keeps the active group', async () => {
    await seedConfig([button('b1', 'One')]);
    render(<App />);
    await screen.findByText('Actions');
    fireEvent.click(screen.getByTitle('New group')); // Group 2
    fireEvent.click(screen.getByTitle('New group')); // Group 3 — now active
    fireEvent.click(screen.getByTitle('Edit layout'));

    const tabs = document.querySelectorAll('.dp-tab');
    fireEvent.dragStart(tabs[0]);   // grab "Actions"
    fireEvent.dragOver(tabs[2]);    // over "Group 3"
    fireEvent.drop(tabs[2]);

    await waitFor(async () => {
      const cfg = await getDeck().getConfig();
      expect(cfg.groups.map((gr) => gr.name)).toEqual(['Group 2', 'Group 3', 'Actions']);
    });
    // active group ("Group 3") follows its tab, not the index
    expect(document.querySelector('.dp-tab.is-active')?.textContent).toContain('Group 3');
  });

  it('tabs are not draggable outside edit mode', async () => {
    await seedConfig([]);
    render(<App />);
    await screen.findByText('Actions');
    fireEvent.click(screen.getByTitle('New group')); // need >1 group
    const tab = document.querySelector('.dp-tab') as HTMLElement;
    expect(tab.getAttribute('draggable')).toBe('false');
  });

  it('dropping a tab on itself does not trigger a save', async () => {
    await seedConfig([]);
    render(<App />);
    await screen.findByText('Actions');
    fireEvent.click(screen.getByTitle('New group'));
    fireEvent.click(screen.getByTitle('Edit layout'));
    const tabs = document.querySelectorAll('.dp-tab');
    const saveSpy = vi.spyOn(getDeck(), 'saveConfig');
    saveSpy.mockClear();
    fireEvent.dragStart(tabs[0]);
    fireEvent.drop(tabs[0]);
    expect(saveSpy).not.toHaveBeenCalled();
    saveSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/App.test.tsx -t "group tab reorder"`
Expected: FAIL — reorder test: groups order unchanged / no `.dp-tab` draggable wiring; draggable test: attribute is not `"false"` (tabs aren't draggable yet, attribute absent → `null`).

- [ ] **Step 3a: Import `indexOfId`**

In `src/renderer/src/App.tsx` line 3, extend the layout import:

```typescript
import { indexOfId, insertShiftReorder, resizeGroups } from '@shared/layout';
```

- [ ] **Step 3b: Add group-drag state**

In `src/renderer/src/App.tsx`, immediately after the existing key drag state (after line 37, `const [dragOver, setDragOver] = useState<number | null>(null);`):

```typescript
  // group-tab drag state (separate from the key drag above so the two never interfere)
  const groupDragFrom = useRef<number | null>(null);
  const [groupDragOver, setGroupDragOver] = useState<number | null>(null);
```

- [ ] **Step 3c: Add group-drag handlers**

In `src/renderer/src/App.tsx`, immediately after `onDragEnd` (after line 122, the closing `};` of the key `onDragEnd`):

```typescript
  const onGroupDrop = (e: React.DragEvent, gi: number) => {
    e.preventDefault();
    const from = groupDragFrom.current;
    groupDragFrom.current = null;
    setGroupDragOver(null);
    if (from === null || from === gi) return;
    const activeId = config.groups[activeIndex].id;
    const reordered = insertShiftReorder(config.groups, from, gi);
    commit((cfg) => ({ ...cfg, groups: insertShiftReorder(cfg.groups, from, gi) }));
    setActive(indexOfId(reordered, activeId)); // active follows its group, not the index
  };

  const onGroupDragEnd = () => {
    groupDragFrom.current = null;
    setGroupDragOver(null);
  };
```

- [ ] **Step 3d: Make tabs draggable and render drag/edit classes**

In `src/renderer/src/App.tsx`, replace the tab opening `<div>` (lines 297–300):

```tsx
              <div key={g.id} className={'dp-tab' + (isActive ? ' is-active' : '')}
                onClick={() => { setActive(gi); setRenaming(null); }}
                onDoubleClick={() => setRenaming({ gi, value: g.name })}
                title="Double-click to rename">
```

with (only the reorderable case — more than one group — gets the affordance and `draggable`):

```tsx
              <div key={g.id}
                className={'dp-tab' + (isActive ? ' is-active' : '')
                  + (editMode && config.groups.length > 1 ? ' is-edit' : '')
                  + (groupDragOver === gi ? ' is-dragover' : '')}
                draggable={editMode && !isRenaming && config.groups.length > 1}
                onClick={() => { setActive(gi); setRenaming(null); }}
                onDoubleClick={() => setRenaming({ gi, value: g.name })}
                onDragStart={() => { setRenaming(null); groupDragFrom.current = gi; }}
                onDragOver={(e) => { if (editMode && groupDragFrom.current !== null) { e.preventDefault(); setGroupDragOver(gi); } }}
                onDragEnd={onGroupDragEnd}
                onDrop={(e) => onGroupDrop(e, gi)}
                title="Double-click to rename">
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/App.test.tsx -t "group tab reorder"`
Expected: PASS (3 tests).

Then run the full App suite to confirm no regressions in existing tab/key behavior:

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat: drag-reorder group tabs in edit mode"
```

---

## Task 3: Drag/edit visual feedback (CSS)

**Files:**
- Modify: `src/renderer/src/assets/deckpad.css` (group-tabs section, near `.dp-tab-add` ~line 72)

- [ ] **Step 1: Add the styles**

In `src/renderer/src/assets/deckpad.css`, add after the `.dp-tab-add` rule (after line 72). The `jiggle` keyframes already exist (reused from `.dp-key.is-edit`):

```css
.dp-tab.is-edit{ animation:jiggle .32s ease-in-out infinite alternate; cursor:grab; }
.dp-tab.is-dragover{ outline:2px dashed color-mix(in srgb,var(--accent) 70%,transparent); outline-offset:2px; }
```

- [ ] **Step 2: Verify the app builds / type-checks and the full suite is green**

Run: `npx vitest run`
Expected: PASS (whole suite).

(CSS has no unit test; this step is the regression guard. Manual visual check: toggle edit mode with ≥2 groups → tabs jiggle and show `grab` cursor; dragging a tab over another shows the dashed outline.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/assets/deckpad.css
git commit -m "feat: edit-mode + drag-over styles for group tabs"
```

---

## Self-Review notes

- **Spec coverage:** data/state (Task 2 state + handlers), active-follows-group (`indexOfId`, Task 1; wired Task 2), interaction/rendering incl. `draggable` guards and class wiring (Task 2), visual feedback (Task 3), edge cases — single group (gated by `config.groups.length > 1`), drop-on-self (guarded `from === gi`, tested Task 2), reorder-while-renaming (`!isRenaming` guard). Testing items all mapped to Task 1/Task 2 tests.
- **No placeholders:** every code/test step shows literal code and exact commands.
- **Type consistency:** `indexOfId(items: { id: string }[], id)` used in `App.tsx` against `Group[]` (Group has `id: string`). `insertShiftReorder<T>` reused for `Group[]`. Handler names `onGroupDrop` / `onGroupDragEnd` and state `groupDragFrom` / `groupDragOver` consistent across Task 2 steps.
