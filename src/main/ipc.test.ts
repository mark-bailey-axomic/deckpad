import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '@shared/constants';
import type { Config } from '@shared/types';

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }
  }
}));

import { registerIpc, type IpcDeps } from './ipc';
import { ConfigStore, defaultConfig } from './config-store';

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`no handler for ${channel}`);
  return Promise.resolve(fn({}, ...args) as T);
}

let dir: string;
let deps: IpcDeps;

beforeEach(() => {
  handlers.clear();
  dir = mkdtempSync(join(tmpdir(), 'deckpad-ipc-'));
  deps = {
    store: new ConfigStore(dir),
    onConfigSaved: vi.fn()
  } as unknown as IpcDeps;
  registerIpc(deps);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('config IPC', () => {
  it('config:get returns the stored config', async () => {
    const cfg = await invoke<Config>(IPC.getConfig);
    expect(cfg.version).toBe(1);
    expect(cfg.groups[0].name).toBe('Actions');
  });

  it('config:save persists and is visible to the next config:get', async () => {
    const cfg = defaultConfig();
    cfg.settings.accent = '#8B5CF6';
    await invoke(IPC.saveConfig, cfg);
    const reloaded = await invoke<Config>(IPC.getConfig);
    expect(reloaded.settings.accent).toBe('#8B5CF6');
  });

  it('config:save rejects a non-object payload', async () => {
    await expect(invoke(IPC.saveConfig, 'garbage')).rejects.toThrow(/invalid config/i);
  });

  it('config:save notifies onConfigSaved with the saved config', async () => {
    const cfg = defaultConfig();
    await invoke(IPC.saveConfig, cfg);
    expect(deps.onConfigSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  });
});
