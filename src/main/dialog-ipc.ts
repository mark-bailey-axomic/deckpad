import { ipcMain } from 'electron';
import { IPC } from '@shared/constants';
import type { DialogView } from '@shared/types';

const VIEWS: readonly string[] = ['edit', 'settings', 'activity'];

function assertView(v: unknown): asserts v is DialogView {
  if (typeof v !== 'string' || !VIEWS.includes(v)) throw new Error('invalid dialog view');
}
function assertId(v: unknown): asserts v is string {
  if (typeof v !== 'string' || v.length === 0) throw new Error('invalid dialog id');
}

export interface DialogIpcDeps {
  openDialog: (view: DialogView, payload: unknown) => string;
  getPayload: (id: string) => unknown;
  sendMessage: (id: string, message: unknown) => void;
  closeDialog: (id: string) => void;
  updateDialog: (view: DialogView, payload: unknown) => void;
}

export function registerDialogIpc(deps: DialogIpcDeps): void {
  ipcMain.handle(IPC.openDialog, async (_e, view: unknown, payload: unknown) => {
    assertView(view);
    return deps.openDialog(view, payload);
  });

  ipcMain.handle(IPC.getDialogPayload, async (_e, id: unknown) => {
    assertId(id);
    return deps.getPayload(id);
  });

  ipcMain.handle(IPC.sendDialogMessage, async (_e, id: unknown, message: unknown) => {
    assertId(id);
    deps.sendMessage(id, message);
  });

  ipcMain.handle(IPC.closeDialog, async (_e, id: unknown) => {
    assertId(id);
    deps.closeDialog(id);
  });

  ipcMain.handle(IPC.updateDialog, async (_e, view: unknown, payload: unknown) => {
    assertView(view);
    deps.updateDialog(view, payload);
  });
}
