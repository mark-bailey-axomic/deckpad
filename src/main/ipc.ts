import { ipcMain } from 'electron';
import { IPC } from '@shared/constants';
import { validateConfig } from '@shared/config-validate';
import type { Config } from '@shared/types';
import type { ConfigStore } from './config-store';

export interface IpcDeps {
  store: ConfigStore;
  /** Called after each successful save (icon sync + window resize hook later). */
  onConfigSaved: (cfg: Config) => void;
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.getConfig, () => deps.store.load());

  ipcMain.handle(IPC.saveConfig, async (_event, cfg: unknown) => {
    if (!validateConfig(cfg)) {
      throw new Error('invalid config payload');
    }
    deps.store.save(cfg);
    try {
      deps.onConfigSaved(cfg);
    } catch {
      // Hook failure must not reject the save.
    }
  });
}
