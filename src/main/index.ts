import { app, BrowserWindow, shell } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { IPC } from '@shared/constants';
import { findButton } from '@shared/buttons';
import type { ActionStateEvent } from '@shared/types';
import { baseWindowOptions } from './window-options';
import { ConfigStore } from './config-store';
import { makeRunActionHandler, registerIpc } from './ipc';
import { Runner } from './runner';
import { launchUntracked } from './launchers';

const store = new ConfigStore(app.getPath('userData'));
let mainWindow: BrowserWindow | null = null;

const sendActionState = (e: ActionStateEvent): void => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(IPC.actionState, e);
  }
};

const runner = new Runner({ spawn, send: sendActionState });

const commandExists = (cmd: string): boolean =>
  spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd]).status === 0;

const runAction = makeRunActionHandler({
  resolveButton: (id) => findButton(store.load(), id),
  runTracked: (b) => runner.run(b),
  launchUntracked: (b) =>
    launchUntracked(b, {
      platform: process.platform,
      openPath: (p) => shell.openPath(p),
      openExternal: (url) => shell.openExternal(url),
      spawnDetached: (cmd) => {
        const child = spawn(cmd, [], { detached: true, stdio: 'ignore' });
        child.on('error', () => undefined); // missing binary: untracked launch, nothing to surface
        child.unref();
      },
      runCommand: (cmd, args) => {
        const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
        child.on('error', () => undefined);
        child.unref();
      },
      commandExists
    })
});

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 488,
    height: 514,
    ...baseWindowOptions(join(__dirname, '../preload/index.js'))
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => win.show());
  return win;
}

void app.whenReady().then(() => {
  registerIpc({
    store,
    onConfigSaved: () => undefined, // icon sync (Task 25) + resize (Task 30)
    runAction,
    stopAction: (id) => runner.stop(id),
    getRunning: () => runner.snapshot(),
    pickFile: async () => null, // Task 25
    extractIcon: async () => null, // Task 23
    setAlwaysOnTop: () => undefined, // Task 29
    setLoginItem: () => undefined // Task 29
  });
  mainWindow = createWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
});
app.on('window-all-closed', () => app.quit());
