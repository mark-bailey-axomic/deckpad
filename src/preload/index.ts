import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/constants';
import type { ActionStateEvent, Config, DeckApi, PickKind } from '@shared/types';

const deck: DeckApi = {
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke(IPC.getConfig),
  saveConfig: (cfg: Config) => ipcRenderer.invoke(IPC.saveConfig, cfg),
  runAction: (id: string) => ipcRenderer.invoke(IPC.runAction, id),
  stopAction: (id: string) => ipcRenderer.invoke(IPC.stopAction, id),
  getRunning: () => ipcRenderer.invoke(IPC.getRunning),
  pickFile: (kind: PickKind) => ipcRenderer.invoke(IPC.pickFile, kind),
  extractIcon: (path: string, buttonId: string) => ipcRenderer.invoke(IPC.extractIcon, path, buttonId),
  setAlwaysOnTop: (v: boolean) => ipcRenderer.invoke(IPC.setAlwaysOnTop, v),
  setLoginItem: (v: boolean) => ipcRenderer.invoke(IPC.setLoginItem, v),
  onActionState: (cb: (e: ActionStateEvent) => void) => {
    const listener = (_event: unknown, e: ActionStateEvent): void => cb(e);
    ipcRenderer.on(IPC.actionState, listener);
    return () => ipcRenderer.removeListener(IPC.actionState, listener);
  }
};

contextBridge.exposeInMainWorld('deck', deck);
