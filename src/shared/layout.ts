import type { Group } from './types';

/** Pad with nulls / truncate to exactly `capacity`, preserving positions. */
export function fitSlots<T>(slots: (T | null)[], capacity: number): (T | null)[] {
  const next = slots.slice(0, capacity);
  while (next.length < capacity) next.push(null);
  return next;
}

/** Insert/shift reorder per spec: dropping at j splices the array (nulls shift too).
 *  Generic over the element type: pass `Button | null` for slot arrays (nulls shift too)
 *  or a non-null type like `Group` for tab arrays — the result type matches the input. */
export function insertShiftReorder<T>(items: T[], from: number, to: number): T[] {
  const last = items.length - 1;
  if (from < 0 || from > last || to < 0 || to > last) return [...items];
  const next = [...items];
  if (from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Index of the item whose id matches; 0 when absent (safe fallback for active-group tracking). */
export function indexOfId(items: { id: string }[], id: string): number {
  const i = items.findIndex((item) => item.id === id);
  return i < 0 ? 0 : i;
}

/** Shrink: filled keys compact into the remaining slots; overflow is dropped and counted. */
export function compactSlots<T>(slots: (T | null)[], capacity: number): { slots: (T | null)[]; lost: number } {
  const filled = slots.filter((s): s is T => s !== null);
  const kept = filled.slice(0, capacity) as (T | null)[];
  return { slots: fitSlots(kept, capacity), lost: filled.length - Math.min(filled.length, capacity) };
}

/** Apply a grid change to every group. Returns the total number of buttons that would be lost. */
export function resizeGroups(groups: Group[], cols: number, rows: number): { groups: Group[]; lost: number } {
  const capacity = cols * rows;
  let lost = 0;
  const next = groups.map((g) => {
    const filledCount = g.slots.filter(Boolean).length;
    if (filledCount > capacity) {
      const r = compactSlots(g.slots, capacity);
      lost += r.lost;
      return { ...g, slots: r.slots };
    }
    // Shrinks that still fit also compact (spec: filled keys compact into remaining slots).
    if (capacity < g.slots.length) {
      const r = compactSlots(g.slots, capacity);
      return { ...g, slots: r.slots };
    }
    return { ...g, slots: fitSlots(g.slots, capacity) };
  });
  return { groups: next, lost };
}
