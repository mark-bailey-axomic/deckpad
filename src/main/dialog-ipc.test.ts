import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, ...args: unknown[]) => unknown) => handlers.set(channel, fn)
  }
}));

import { IPC } from '@shared/constants';
import { registerDialogIpc, type DialogIpcDeps } from './dialog-ipc';

function deps(over: Partial<DialogIpcDeps> = {}): DialogIpcDeps {
  return {
    openDialog: vi.fn(() => 'id-1'),
    getPayload: vi.fn(() => ({ p: 1 })),
    sendMessage: vi.fn(),
    closeDialog: vi.fn(),
    updateDialog: vi.fn(),
    ...over
  };
}

const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);

beforeEach(() => handlers.clear());

describe('registerDialogIpc', () => {
  it('openDialog validates the view and returns an id', async () => {
    const d = deps();
    registerDialogIpc(d);
    await expect(call(IPC.openDialog, 'edit', { a: 1 })).resolves.toBe('id-1');
    expect(d.openDialog).toHaveBeenCalledWith('edit', { a: 1 });
  });

  it('openDialog rejects an unknown view', async () => {
    registerDialogIpc(deps());
    await expect(call(IPC.openDialog, 'bogus', {})).rejects.toThrow('invalid dialog view');
  });

  it('getDialogPayload returns the stashed payload', async () => {
    const d = deps({ getPayload: vi.fn(() => ({ p: 9 })) });
    registerDialogIpc(d);
    await expect(call(IPC.getDialogPayload, 'id-1')).resolves.toEqual({ p: 9 });
    expect(d.getPayload).toHaveBeenCalledWith('id-1');
  });

  it('sendDialogMessage forwards id + message', async () => {
    const d = deps();
    registerDialogIpc(d);
    await call(IPC.sendDialogMessage, 'id-1', { type: 'save' });
    expect(d.sendMessage).toHaveBeenCalledWith('id-1', { type: 'save' });
  });

  it('closeDialog forwards the id', async () => {
    const d = deps();
    registerDialogIpc(d);
    await call(IPC.closeDialog, 'id-1');
    expect(d.closeDialog).toHaveBeenCalledWith('id-1');
  });

  it('updateDialog validates the view', async () => {
    const d = deps();
    registerDialogIpc(d);
    await call(IPC.updateDialog, 'activity', { items: [] });
    expect(d.updateDialog).toHaveBeenCalledWith('activity', { items: [] });
    await expect(call(IPC.updateDialog, 'nope', {})).rejects.toThrow('invalid dialog view');
  });

  it('rejects an invalid dialog id', async () => {
    registerDialogIpc(deps());
    await expect(call(IPC.getDialogPayload, '')).rejects.toThrow('invalid dialog id');
    await expect(call(IPC.closeDialog, 123)).rejects.toThrow('invalid dialog id');
  });

  it('openDialog rejects prototype-chain keys (Object.hasOwn, not in)', async () => {
    registerDialogIpc(deps());
    await expect(call(IPC.openDialog, 'toString', {})).rejects.toThrow('invalid dialog view');
  });
});
