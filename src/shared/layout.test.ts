import { describe, expect, it } from 'vitest';
import { compactSlots, fitSlots, indexOfId, insertShiftReorder, resizeGroups } from './layout';
import type { Group } from './types';

const g = (id: string, slots: (string | null)[]): Group =>
  ({ id, name: id, slots: slots.map((s) => (s ? { id: s, label: s, type: 'command' as const, command: 'x', icon: { kind: 'auto' as const } } : null)) });
const ids = (group: Group) => group.slots.map((s) => s?.id ?? null);

describe('insertShiftReorder', () => {
  it('moving forward shifts intermediate slots (nulls too) back', () => {
    expect(insertShiftReorder(['a', 'b', null, 'c'], 0, 2)).toEqual(['b', null, 'a', 'c']);
  });
  it('moving backward shifts intermediate slots forward', () => {
    expect(insertShiftReorder(['a', 'b', null, 'c'], 3, 1)).toEqual(['a', 'c', 'b', null]);
  });
  it('keeps array length and is a no-op for from === to', () => {
    const arr = ['a', null, 'b'];
    expect(insertShiftReorder(arr, 1, 1)).toEqual(arr);
    expect(insertShiftReorder(arr, 0, 2)).toHaveLength(3);
  });
});

describe('fitSlots', () => {
  it('pads with nulls on grow, preserving positions', () => {
    expect(fitSlots(['a', null], 4)).toEqual(['a', null, null, null]);
  });
  it('truncates on shrink', () => {
    expect(fitSlots(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
});

describe('compactSlots', () => {
  it('compacts filled keys into the remaining slots, reporting losses', () => {
    const { slots, lost } = compactSlots(['a', null, 'b', null, 'c'], 3);
    expect(slots).toEqual(['a', 'b', 'c']);
    expect(lost).toBe(0);
  });
  it('drops overflow keys and counts them', () => {
    const { slots, lost } = compactSlots(['a', 'b', 'c', 'd'], 2);
    expect(slots).toEqual(['a', 'b']);
    expect(lost).toBe(2);
  });
});

describe('resizeGroups', () => {
  it('grow: pads every group without losses', () => {
    const { groups, lost } = resizeGroups([g('g1', ['a', null])], 2, 2);
    expect(ids(groups[0])).toEqual(['a', null, null, null]);
    expect(lost).toBe(0);
  });
  it('shrink: compacts each group and sums losses across groups', () => {
    const { groups, lost } = resizeGroups(
      [g('g1', ['a', null, 'b', 'c']), g('g2', ['d', 'e', 'f', null])],
      // capacity 4 → 2
      2, 1
    );
    expect(ids(groups[0])).toEqual(['a', 'b']);
    expect(ids(groups[1])).toEqual(['d', 'e']);
    expect(lost).toBe(2); // c and f
  });
});

describe('insertShiftReorder — bounds', () => {
  it('out-of-range from index returns array unchanged (same length, same contents)', () => {
    const arr = ['a', 'b', 'c'] as (string | null)[];
    const result = insertShiftReorder(arr, 99, 1);
    expect(result).toHaveLength(arr.length);
    expect(result).toEqual(arr);
    expect(result.some((v) => v === undefined)).toBe(false);
  });

  it('negative from index returns array unchanged', () => {
    const arr = ['a', 'b', 'c'] as (string | null)[];
    const result = insertShiftReorder(arr, -1, 1);
    expect(result).toHaveLength(arr.length);
    expect(result).toEqual(arr);
    expect(result.some((v) => v === undefined)).toBe(false);
  });

  it('out-of-range to index returns array unchanged', () => {
    const arr = ['a', 'b', 'c'] as (string | null)[];
    const result = insertShiftReorder(arr, 0, 99);
    expect(result).toHaveLength(arr.length);
    expect(result).toEqual(arr);
    expect(result.some((v) => v === undefined)).toBe(false);
  });

  it('negative to index returns array unchanged', () => {
    const arr = ['a', 'b', 'c'] as (string | null)[];
    const result = insertShiftReorder(arr, 0, -1);
    expect(result).toHaveLength(arr.length);
    expect(result).toEqual(arr);
    expect(result.some((v) => v === undefined)).toBe(false);
  });
});

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
