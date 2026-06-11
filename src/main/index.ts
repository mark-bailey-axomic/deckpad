import { app, BrowserWindow, dialog, shell } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { extractIcon } from './icons';
import { registerDeckIconScheme, registerDeckIconProtocol } from './deckicon-protocol';
import { syncIconCache } from './icon-sync';
import type { PickKind } from '@shared/types';

registerDeckIconScheme();
import { IPC } from '@shared/constants';
import { findButton } from '@shared/buttons';
import type { ActionStateEvent } from '@shared/types';
import { baseWindowOptions } from './window-options';
import { windowSizeForGrid } from './window-size';
import { ConfigStore } from './config-store';
import { makeRunActionHandler, registerIpc } from './ipc';
import { Runner } from './runner';
import { launchUntracked } from './launchers';

const store = new ConfigStore(app.getPath('userData'));
const iconsDir = join(app.getPath('userData'), 'icons');
let mainWindow: BrowserWindow | null = null;
let lastConfig = store.load();

const PICK_FILTERS: Record<PickKind, Electron.FileFilter[] | undefined> = {
  image: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'ico'] }],
  app: process.platform === 'win32' ? [{ name: 'Applications', extensions: ['exe', 'lnk'] }] : undefined,
  file: undefined
};

async function pickFile(kind: PickKind): Promise<string | null> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: kind === 'app' && process.platform === 'darwin' ? ['openFile'] : ['openFile', 'showHiddenFiles'],
    defaultPath: kind === 'app' && process.platform === 'darwin' ? '/Applications' : undefined,
    filters: PICK_FILTERS[kind]
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

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

function createWindow(grid: { cols: number; rows: number }): BrowserWindow {
  const { width, height } = windowSizeForGrid(grid.cols, grid.rows);
  const win = new BrowserWindow({
    width,
    height,
    ...baseWindowOptions(join(__dirname, '../preload/index.js'))
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => win.show());
  return win;
}

void app.whenReady().then(() => {
  registerDeckIconProtocol(iconsDir);
  registerIpc({
    store,
    onConfigSaved: (cfg) => {
      syncIconCache(lastConfig, cfg, iconsDir);
      lastConfig = cfg;
      if (mainWindow) {
        const { width, height } = windowSizeForGrid(cfg.grid.cols, cfg.grid.rows);
        const [w, h] = mainWindow.getSize();
        if (w !== width || h !== height) mainWindow.setSize(width, height, true);
      }
    },
    runAction,
    stopAction: (id) => runner.stop(id),
    getRunning: () => runner.snapshot(),
    pickFile,
    extractIcon: (path, buttonId) =>
      extractIcon(
        { getFileIcon: (p) => app.getFileIcon(p, { size: 'large' }), iconsDir },
        path,
        buttonId
      ),
    setAlwaysOnTop: (v) => mainWindow?.setAlwaysOnTop(v),
    setLoginItem: (v) => app.setLoginItemSettings({ openAtLogin: v })
  });
  mainWindow = createWindow(lastConfig.grid);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.setAlwaysOnTop(lastConfig.settings.alwaysOnTop);
  app.setLoginItemSettings({ openAtLogin: lastConfig.settings.launchStartup });
});
app.on('window-all-closed', () => app.quit());
