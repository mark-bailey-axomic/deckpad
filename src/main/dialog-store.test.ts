import { describe, expect, it } from 'vitest';
import { DialogStore } from './dialog-store';

const win = (tag: string) => ({ tag, isDestroyed: () => false }) as never;

function store(): DialogStore {
  let n = 0;
  return new DialogStore(() => `id-${++n}`);
}

describe('DialogStore', () => {
  it('open returns an id and stores payload + window + view', () => {
    const s = store();
    const id = s.open('edit', win('a'), { draft: 1 });
    expect(id).toBe('id-1');
    expect(s.payloadFor(id)).toEqual({ draft: 1 });
    expect(s.viewForId(id)).toBe('edit');
    expect(s.windowForView('edit')).toMatchObject({ tag: 'a' });
  });

  it('opening the same view again replaces the prior record', () => {
    const s = store();
    s.open('settings', win('first'), { a: 1 });
    s.open('settings', win('second'), { a: 2 });
    expect(s.windowForView('settings')).toMatchObject({ tag: 'second' });
    expect(s.allWindows()).toHaveLength(1);
  });

  it('setPayloadForView updates the stored payload', () => {
    const s = store();
    const id = s.open('activity', win('a'), { items: [] });
    s.setPayloadForView('activity', { items: [1, 2] });
    expect(s.payloadFor(id)).toEqual({ items: [1, 2] });
  });

  it('close removes the record and returns the window handle', () => {
    const s = store();
    const id = s.open('edit', win('a'), {});
    const handle = s.close(id);
    expect(handle).toMatchObject({ tag: 'a' });
    expect(s.payloadFor(id)).toBeUndefined();
    expect(s.windowForView('edit')).toBeUndefined();
    expect(s.allWindows()).toHaveLength(0);
  });

  it('allWindows lists every open dialog window', () => {
    const s = store();
    s.open('edit', win('e'), {});
    s.open('activity', win('a'), {});
    expect(s.allWindows()).toHaveLength(2);
  });
});
