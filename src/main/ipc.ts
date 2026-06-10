import { ipcMain } from 'electron';
import { IPC } from '@shared/constants';
import type { Config } from '@shared/types';
import type { ConfigStore } from './config-store';

export interface IpcDeps {
  store: ConfigStore;
  /** Called after each successful save (icon sync + window resize hook later). */
  onConfigSaved: (cfg: Config) => void;
}

function assertConfigShape(value: unknown): asserts value is Config {
  const cfg = value as Config;
  if (typeof value !== 'object' || value === null || cfg.version !== 1 || !Array.isArray(cfg.groups)) {
    throw new Error('invalid config payload');
  }
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.getConfig, () => deps.store.load());

  ipcMain.handle(IPC.saveConfig, async (_event, cfg: unknown) => {
    assertConfigShape(cfg);
    deps.store.save(cfg);
    deps.onConfigSaved(cfg);
  });
}
