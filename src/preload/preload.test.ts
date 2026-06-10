import { beforeAll, describe, expect, it, vi } from 'vitest';
import { IPC } from '@shared/constants';
import type { DeckApi } from '@shared/types';

const exposed = new Map<string, unknown>();
const invoke = vi.fn().mockResolvedValue(undefined);
const on = vi.fn();
const removeListener = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (key: string, api: unknown) => exposed.set(key, api) },
  ipcRenderer: { invoke, on, removeListener }
}));

let deck: DeckApi;
beforeAll(async () => {
  await import('./index');
  deck = exposed.get('deck') as DeckApi;
});

describe('preload deck bridge', () => {
  it('exposes deck in the main world with the platform', () => {
    expect(deck).toBeDefined();
    expect(deck.platform).toBe(process.platform);
  });

  it('maps every method to its IPC channel with arguments', async () => {
    await deck.getConfig();
    expect(invoke).toHaveBeenLastCalledWith(IPC.getConfig);
    const cfg = { version: 1 } as never;
    await deck.saveConfig(cfg);
    expect(invoke).toHaveBeenLastCalledWith(IPC.saveConfig, cfg);
    await deck.runAction('b1');
    expect(invoke).toHaveBeenLastCalledWith(IPC.runAction, 'b1');
    await deck.stopAction('b1');
    expect(invoke).toHaveBeenLastCalledWith(IPC.stopAction, 'b1');
    await deck.getRunning();
    expect(invoke).toHaveBeenLastCalledWith(IPC.getRunning);
    await deck.pickFile('image');
    expect(invoke).toHaveBeenLastCalledWith(IPC.pickFile, 'image');
    await deck.extractIcon('/a', 'b1');
    expect(invoke).toHaveBeenLastCalledWith(IPC.extractIcon, '/a', 'b1');
    await deck.setAlwaysOnTop(true);
    expect(invoke).toHaveBeenLastCalledWith(IPC.setAlwaysOnTop, true);
    await deck.setLoginItem(true);
    expect(invoke).toHaveBeenLastCalledWith(IPC.setLoginItem, true);
  });

  it('onActionState subscribes to action-state and unsubscribes', () => {
    const cb = vi.fn();
    const off = deck.onActionState(cb);
    expect(on).toHaveBeenCalledWith(IPC.actionState, expect.any(Function));
    const listener = on.mock.calls.at(-1)![1] as (e: unknown, ev: unknown) => void;
    listener({}, { type: 'started', buttonId: 'b1', startedAt: 1 });
    expect(cb).toHaveBeenCalledWith({ type: 'started', buttonId: 'b1', startedAt: 1 });
    off();
    expect(removeListener).toHaveBeenCalledWith(IPC.actionState, listener);
  });
});
