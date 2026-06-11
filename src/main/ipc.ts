import { ipcMain } from 'electron';
import { IPC } from '@shared/constants';
import { isUntracked } from '@shared/buttons';
import type { Button, Config, PickKind, RunningSnapshot } from '@shared/types';
import type { ConfigStore } from './config-store';
import { validateConfig } from './validate-config';

export interface RunActionDeps {
  resolveButton: (id: string) => Button | null;
  runTracked: (button: Button) => void;
  launchUntracked: (button: Button) => Promise<void>;
}

/** Main resolves the command from saved config — the renderer only ever sends an id. */
export function makeRunActionHandler(deps: RunActionDeps): (id: string) => Promise<void> {
  return async (id: string) => {
    const button = deps.resolveButton(id);
    if (!button) throw new Error(`unknown button: ${id}`);
    if (isUntracked(button)) await deps.launchUntracked(button);
    else deps.runTracked(button);
  };
}

export interface IpcDeps {
  store: ConfigStore;
  /** Called after each successful save (icon sync + window resize hook later). */
  onConfigSaved: (cfg: Config) => void;
  runAction: (id: string) => Promise<void>;
  stopAction: (id: string) => void;
  getRunning: () => RunningSnapshot[];
  pickFile: (kind: PickKind) => Promise<string | null>;
  extractIcon: (path: string, buttonId: string) => Promise<string | null>;
  setAlwaysOnTop: (v: boolean) => void;
  setLoginItem: (v: boolean) => void;
}

const PICK_KINDS: readonly string[] = ['file', 'app', 'image'];
const BUTTON_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function assertString(v: unknown, name: string): asserts v is string {
  if (typeof v !== 'string' || v.length === 0) throw new Error(`invalid ${name}`);
}
function assertButtonId(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !BUTTON_ID_RE.test(v)) throw new Error('invalid button id');
}
function assertBoolean(v: unknown, name: string): asserts v is boolean {
  if (typeof v !== 'boolean') throw new Error(`invalid ${name}`);
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.getConfig, () => deps.store.load());

  ipcMain.handle(IPC.saveConfig, async (_e, cfg: unknown) => {
    if (!validateConfig(cfg)) throw new Error('invalid config payload');
    deps.store.save(cfg);
    try {
      deps.onConfigSaved(cfg);
    } catch (err) {
      console.error('onConfigSaved hook failed:', err);
      // Hook failure must not reject the save.
    }
  });

  ipcMain.handle(IPC.runAction, async (_e, id: unknown) => {
    assertButtonId(id);
    await deps.runAction(id);
  });

  ipcMain.handle(IPC.stopAction, async (_e, id: unknown) => {
    assertButtonId(id);
    deps.stopAction(id);
  });

  ipcMain.handle(IPC.getRunning, () => deps.getRunning());

  ipcMain.handle(IPC.pickFile, async (_e, kind: unknown) => {
    if (typeof kind !== 'string' || !PICK_KINDS.includes(kind)) throw new Error('invalid pick kind');
    return deps.pickFile(kind as PickKind);
  });

  ipcMain.handle(IPC.extractIcon, async (_e, path: unknown, buttonId: unknown) => {
    assertString(path, 'path');
    assertButtonId(buttonId);
    return deps.extractIcon(path, buttonId);
  });

  ipcMain.handle(IPC.setAlwaysOnTop, async (_e, v: unknown) => {
    assertBoolean(v, 'flag');
    deps.setAlwaysOnTop(v);
  });

  ipcMain.handle(IPC.setLoginItem, async (_e, v: unknown) => {
    assertBoolean(v, 'flag');
    deps.setLoginItem(v);
  });
}
