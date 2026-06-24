import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    onConfigSaved: vi.fn(),
    runAction: vi.fn().mockResolvedValue(undefined),
    stopAction: vi.fn(),
    getRunning: vi.fn(() => [{ buttonId: 'b1', startedAt: 1, output: [] }]),
    pickFile: vi.fn().mockResolvedValue('/picked'),
    extractIcon: vi.fn().mockResolvedValue('deckicon://b1.png'),
    setAlwaysOnTop: vi.fn(),
    setLoginItem: vi.fn()
  };
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

  // -------------------------------------------------------------------------
  // NEW: reviewer-requested regression tests
  // -------------------------------------------------------------------------

  it('config:save rejects payload missing settings (deep validation)', async () => {
    const bad = { version: 1, groups: [] }; // no settings, empty groups
    await expect(invoke(IPC.saveConfig, bad)).rejects.toThrow(/invalid config/i);
  });

  it('config:save rejects payload with out-of-bounds grid (cols=9999)', async () => {
    const bad = {
      ...defaultConfig(),
      grid: { cols: 9999, rows: 3 }
    };
    await expect(invoke(IPC.saveConfig, bad)).rejects.toThrow(/invalid config/i);
  });

  it('config:get returns prior config unchanged after a rejected save', async () => {
    // Establish a known-good config first
    const good = defaultConfig();
    good.settings.accent = '#8B5CF6';
    await invoke(IPC.saveConfig, good);

    // Attempt a bad save
    const bad = { version: 1, groups: [] };
    await expect(invoke(IPC.saveConfig, bad)).rejects.toThrow();

    // Store should still have the good config
    const current = await invoke<Config>(IPC.getConfig);
    expect(current.settings.accent).toBe('#8B5CF6');
  });

  it('config:save still resolves (and persists) when onConfigSaved throws', async () => {
    // Re-register IPC with a throwing hook
    handlers.clear();
    const throwingDeps: IpcDeps = {
      store: new ConfigStore(dir),
      onConfigSaved: vi.fn().mockImplementation(() => { throw new Error('hook exploded'); }),
      runAction: vi.fn().mockResolvedValue(undefined),
      stopAction: vi.fn(),
      getRunning: vi.fn(() => []),
      pickFile: vi.fn().mockResolvedValue(null),
      extractIcon: vi.fn().mockResolvedValue(null),
      setAlwaysOnTop: vi.fn(),
      setLoginItem: vi.fn()
    };
    registerIpc(throwingDeps);

    const cfg = defaultConfig();
    cfg.settings.accent = '#F59E0B';

    // Should NOT reject even though the hook throws
    await expect(invoke(IPC.saveConfig, cfg)).resolves.not.toThrow();

    // File must have been written
    const onDisk = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    expect(onDisk.settings.accent).toBe('#F59E0B');

    // Store must reflect the save
    const reloaded = await invoke<Config>(IPC.getConfig);
    expect(reloaded.settings.accent).toBe('#F59E0B');
  });
});

describe('action + system IPC', () => {
  it('action:run delegates the id to runAction', async () => {
    await invoke(IPC.runAction, 'b1');
    expect(deps.runAction).toHaveBeenCalledWith('b1');
  });

  it('action:run rejects non-string ids', async () => {
    await expect(invoke(IPC.runAction, 42)).rejects.toThrow(/invalid/i);
  });

  it('action:stop delegates; action:running returns the snapshot', async () => {
    await invoke(IPC.stopAction, 'b1');
    expect(deps.stopAction).toHaveBeenCalledWith('b1');
    expect(await invoke(IPC.getRunning)).toEqual([{ buttonId: 'b1', startedAt: 1, output: [] }]);
  });

  it('dialog:pick-file validates kind and delegates', async () => {
    expect(await invoke(IPC.pickFile, 'image')).toBe('/picked');
    await expect(invoke(IPC.pickFile, 'evil')).rejects.toThrow(/invalid/i);
  });

  it('icon:extract validates and delegates', async () => {
    expect(await invoke(IPC.extractIcon, '/a', 'b1')).toBe('deckicon://b1.png');
    await expect(invoke(IPC.extractIcon, 1, 2)).rejects.toThrow(/invalid/i);
  });

  it('window/system toggles validate booleans and delegate', async () => {
    await invoke(IPC.setAlwaysOnTop, true);
    expect(deps.setAlwaysOnTop).toHaveBeenCalledWith(true);
    await invoke(IPC.setLoginItem, false);
    expect(deps.setLoginItem).toHaveBeenCalledWith(false);
    await expect(invoke(IPC.setAlwaysOnTop, 'yes')).rejects.toThrow(/invalid/i);
  });

  it('config:save now rejects structurally invalid configs via validateConfig', async () => {
    const bad = { ...defaultConfig(), grid: { cols: 99, rows: 1 } };
    await expect(invoke(IPC.saveConfig, bad)).rejects.toThrow(/invalid config/i);
  });
});

// ---------------------------------------------------------------------------
// Phase-4 review: buttonId format guard
// ---------------------------------------------------------------------------

describe('buttonId format guard', () => {
  // icon:extract

  it('icon:extract rejects a path-traversal button id', async () => {
    await expect(invoke(IPC.extractIcon, '/some/path', '../../evil')).rejects.toThrow(/invalid button id/i);
  });

  it('icon:extract accepts a UUID-style button id', async () => {
    await expect(invoke(IPC.extractIcon, '/some/path', 'b1-2c3d')).resolves.not.toThrow();
    expect(deps.extractIcon).toHaveBeenCalledWith('/some/path', 'b1-2c3d');
  });

  it('icon:extract rejects an id that is exactly 65 chars (max is 64)', async () => {
    const longId = 'a'.repeat(65);
    await expect(invoke(IPC.extractIcon, '/some/path', longId)).rejects.toThrow(/invalid button id/i);
  });

  it('icon:extract accepts an id that is exactly 64 chars', async () => {
    const maxId = 'a'.repeat(64);
    await expect(invoke(IPC.extractIcon, '/some/path', maxId)).resolves.not.toThrow();
  });

  it('icon:extract rejects an id containing invalid characters (slash)', async () => {
    await expect(invoke(IPC.extractIcon, '/some/path', 'btn/evil')).rejects.toThrow(/invalid button id/i);
  });

  // action:run

  it('action:run rejects a path-traversal button id', async () => {
    await expect(invoke(IPC.runAction, '../x')).rejects.toThrow(/invalid button id/i);
  });

  it('action:run accepts a valid alphanumeric-hyphen id', async () => {
    await expect(invoke(IPC.runAction, 'abc-123')).resolves.not.toThrow();
    expect(deps.runAction).toHaveBeenCalledWith('abc-123');
  });

  it('action:run rejects a 65-char id', async () => {
    const longId = 'b'.repeat(65);
    await expect(invoke(IPC.runAction, longId)).rejects.toThrow(/invalid button id/i);
  });

  // action:stop

  it('action:stop rejects a path-traversal button id', async () => {
    await expect(invoke(IPC.stopAction, '../x')).rejects.toThrow(/invalid button id/i);
  });

  it('action:stop accepts a valid alphanumeric-hyphen id', async () => {
    await expect(invoke(IPC.stopAction, 'btn-ok')).resolves.not.toThrow();
    expect(deps.stopAction).toHaveBeenCalledWith('btn-ok');
  });
});

// ---------------------------------------------------------------------------
// Task 22: makeRunActionHandler routing (tracked vs untracked)
// ---------------------------------------------------------------------------

import { makeRunActionHandler } from './ipc';
import type { Button } from '@shared/types';

describe('makeRunActionHandler routing', () => {
  const command: Button = { id: 'c1', label: 'C', type: 'command', command: 'true', icon: { kind: 'auto' } };
  const terminal: Button = { ...command, id: 'c2', showTerminal: true };
  const script: Button = { id: 's1', label: 'S', type: 'script', scriptId: 'script-a', icon: { kind: 'auto' } };

  function makeDeps() {
    return {
      resolveButton: vi.fn((id: string) => ({ c1: command, c2: terminal, s1: script } as Record<string, Button>)[id] ?? null),
      runTracked: vi.fn(),
      launchUntracked: vi.fn().mockResolvedValue(undefined)
    };
  }

  it('plain commands go to the runner (tracked)', async () => {
    const d = makeDeps();
    await makeRunActionHandler(d)('c1');
    expect(d.runTracked).toHaveBeenCalledWith(command);
    expect(d.launchUntracked).not.toHaveBeenCalled();
  });

  it('script buttons go to the runner (tracked)', async () => {
    const d = makeDeps();
    await makeRunActionHandler(d)('s1');
    expect(d.runTracked).toHaveBeenCalledWith(script);
    expect(d.launchUntracked).not.toHaveBeenCalled();
  });

  it('command with showTerminal goes to launchUntracked', async () => {
    const d = makeDeps();
    await makeRunActionHandler(d)('c2');
    expect(d.launchUntracked).toHaveBeenCalledWith(terminal);
    expect(d.runTracked).not.toHaveBeenCalled();
  });

  it('unknown ids reject (renderer can never inject commands — only ids resolve)', async () => {
    const d = makeDeps();
    await expect(makeRunActionHandler(d)('ghost')).rejects.toThrow(/unknown button/i);
  });

  it('unknown button id rejects with /unknown button|not found/i and never calls runTracked or launchUntracked', async () => {
    const d = makeDeps();
    await expect(makeRunActionHandler(d)('does-not-exist')).rejects.toThrow(/unknown button|not found/i);
    expect(d.runTracked).not.toHaveBeenCalled();
    expect(d.launchUntracked).not.toHaveBeenCalled();
  });
});
