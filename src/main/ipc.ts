import { ipcMain } from 'electron';
import { IPC } from '@shared/constants';
import type { Config, PickKind, RunningSnapshot } from '@shared/types';
import type { ConfigStore } from './config-store';
import { validateConfig } from './validate-config';

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

function assertString(v: unknown, name: string): asserts v is string {
  if (typeof v !== 'string' || v.length === 0) throw new Error(`invalid ${name}`);
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
    } catch {
      // Hook failure must not reject the save.
    }
  });

  ipcMain.handle(IPC.runAction, async (_e, id: unknown) => {
    assertString(id, 'button id');
    await deps.runAction(id);
  });

  ipcMain.handle(IPC.stopAction, async (_e, id: unknown) => {
    assertString(id, 'button id');
    deps.stopAction(id);
  });

  ipcMain.handle(IPC.getRunning, () => deps.getRunning());

  ipcMain.handle(IPC.pickFile, async (_e, kind: unknown) => {
    if (typeof kind !== 'string' || !PICK_KINDS.includes(kind)) throw new Error('invalid pick kind');
    return deps.pickFile(kind as PickKind);
  });

  ipcMain.handle(IPC.extractIcon, async (_e, path: unknown, buttonId: unknown) => {
    assertString(path, 'path');
    assertString(buttonId, 'button id');
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
