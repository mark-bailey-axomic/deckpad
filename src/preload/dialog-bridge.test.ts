import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposed: Record<string, unknown> = {};
const invoke = vi.fn(async () => undefined);
const listeners = new Map<string, (e: unknown, p: unknown) => void>();
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (k: string, v: unknown) => { exposed[k] = v; } },
  ipcRenderer: {
    invoke,
    on: (ch: string, fn: (e: unknown, p: unknown) => void) => listeners.set(ch, fn),
    removeListener: (ch: string) => listeners.delete(ch)
  }
}));

import { IPC } from '@shared/constants';
import type { DeckApi } from '@shared/types';

beforeEach(() => {
  vi.resetModules();
  invoke.mockClear();
  listeners.clear();
  for (const k of Object.keys(exposed)) delete exposed[k];
});

describe('preload dialog bridge', () => {
  it('maps dialog methods to channels', async () => {
    await import('./index');
    const deck = exposed.deck as DeckApi;

    await deck.openDialog('edit', { a: 1 });
    expect(invoke).toHaveBeenCalledWith(IPC.openDialog, 'edit', { a: 1 });

    await deck.getDialogPayload('id-1');
    expect(invoke).toHaveBeenCalledWith(IPC.getDialogPayload, 'id-1');

    await deck.sendDialogMessage('id-1', { type: 'cancel' });
    expect(invoke).toHaveBeenCalledWith(IPC.sendDialogMessage, 'id-1', { type: 'cancel' });

    await deck.closeDialog('id-1');
    expect(invoke).toHaveBeenCalledWith(IPC.closeDialog, 'id-1');

    await deck.updateDialog('activity', { items: [] });
    expect(invoke).toHaveBeenCalledWith(IPC.updateDialog, 'activity', { items: [] });
  });

  it('onDialogMessage subscribes and unsubscribes', async () => {
    await import('./index');
    const deck = exposed.deck as DeckApi;
    const cb = vi.fn();
    const off = deck.onDialogMessage(cb);
    listeners.get(IPC.dialogMessage)!({}, { view: 'edit', message: { type: 'save' } });
    expect(cb).toHaveBeenCalledWith({ view: 'edit', message: { type: 'save' } });
    off();
    expect(listeners.has(IPC.dialogMessage)).toBe(false);
  });

  it('onDialogUpdate subscribes and unsubscribes', async () => {
    await import('./index');
    const deck = exposed.deck as DeckApi;
    const cb = vi.fn();
    const off = deck.onDialogUpdate(cb);
    listeners.get(IPC.dialogUpdate)!({}, { items: [] });
    expect(cb).toHaveBeenCalledWith({ items: [] });
    off();
    expect(listeners.has(IPC.dialogUpdate)).toBe(false);
  });
});
