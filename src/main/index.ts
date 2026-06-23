import { app, BrowserWindow, dialog, nativeImage, shell } from 'electron';
import { spawn, spawnSync, execFile as _execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { extractIcon, type ExtractBundleIconFn } from './icons';

const execFile = promisify(_execFile);
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
import { handleQuitRequest, handleWindowCloseRequest } from './quit-flow';
import { DialogStore } from './dialog-store';
import { dialogWindowOptions } from './dialog-options';
import { broadcastToWebContents, liveWebContents } from './broadcast';
import { registerDialogIpc } from './dialog-ipc';
import type { DialogView } from '@shared/types';

// Both createThumbnail and getFileIcon return generic icons for .app on macOS 26;
// read the bundle's Info.plist → locate the .icns → convert to PNG via sips.
const darwinExtractBundleIcon: ExtractBundleIconFn = async (appBundlePath, destPngPath) => {
  try {
    let iconName: string;
    try {
      const { stdout } = await execFile('plutil', [
        '-extract', 'CFBundleIconFile', 'raw',
        join(appBundlePath, 'Contents', 'Info.plist')
      ]);
      iconName = stdout.trim();
    } catch {
      iconName = 'AppIcon';
    }
    if (!iconName) iconName = 'AppIcon';

    let icnsPath = join(appBundlePath, 'Contents', 'Resources', iconName);
    if (!icnsPath.endsWith('.icns')) icnsPath += '.icns';
    if (!existsSync(icnsPath)) return false;

    await execFile('sips', [
      '-s', 'format', 'png',
      icnsPath,
      '--out', destPngPath,
      '--resampleHeightWidthMax', '256'
    ]);
    return existsSync(destPngPath);
  } catch {
    return false;
  }
};

const store = new ConfigStore(app.getPath('userData'));
const iconsDir = join(app.getPath('userData'), 'icons');
let mainWindow: BrowserWindow | null = null;
const dialogs = new DialogStore(() => crypto.randomUUID());
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
  const windows = [
    ...(mainWindow ? [mainWindow] : []),
    ...(dialogs.allWindows() as BrowserWindow[])
  ];
  broadcastToWebContents(liveWebContents(windows), IPC.actionState, e);
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

function createDialogWindow(view: DialogView, payload: unknown): string {
  if (!mainWindow) throw new Error('no main window');

  // Dedup: focus the existing window for this view and refresh its data.
  const existing = dialogs.windowForView(view) as BrowserWindow | undefined;
  if (existing && !existing.isDestroyed()) {
    dialogs.setPayloadForView(view, payload);
    if (!existing.webContents.isDestroyed()) existing.webContents.send(IPC.dialogUpdate, payload);
    existing.focus();
    return dialogs.idForView(view)!;
  }

  const preload = join(__dirname, '../preload/index.js');
  const { options } = dialogWindowOptions(view, preload, mainWindow);
  const win = new BrowserWindow(options);
  const id = dialogs.open(view, win, payload);

  const query = `?view=${view}&id=${id}`;
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/dialog.html${query}`);
  } else {
    void win.loadFile(join(__dirname, '../renderer/dialog.html'), { search: query });
  }
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    dialogs.close(id);
    if (mainWindow && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(IPC.dialogMessage, { view, message: { type: 'dialog-closed' } });
    }
  });
  return id;
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
        {
          getFileIcon: (p, opts) => app.getFileIcon(p, { size: opts?.size ?? 'normal' }),
          createThumbnail: (p) => nativeImage.createThumbnailFromPath(p, { width: 256, height: 256 }),
          // Both createThumbnail and getFileIcon return generic icons for .app on macOS 26;
          // extract real icons directly from the bundle's embedded .icns file.
          extractBundleIcon: process.platform === 'darwin' ? darwinExtractBundleIcon : undefined,
          iconsDir
        },
        path,
        buttonId
      ),
    setAlwaysOnTop: (v) => mainWindow?.setAlwaysOnTop(v),
    setLoginItem: (v) => app.setLoginItemSettings({ openAtLogin: v })
  });
  registerDialogIpc({
    openDialog: (view, payload) => createDialogWindow(view, payload),
    getPayload: (id) => dialogs.payloadFor(id) ?? null,
    sendMessage: (id, message) => {
      const view = dialogs.viewForId(id);
      if (view && mainWindow && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(IPC.dialogMessage, { view, message });
      }
    },
    closeDialog: (id) => {
      const win = dialogs.close(id) as BrowserWindow | undefined;
      if (win && !win.isDestroyed()) win.close();
    },
    updateDialog: (view, payload) => {
      dialogs.setPayloadForView(view, payload);
      const win = dialogs.windowForView(view) as BrowserWindow | undefined;
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(IPC.dialogUpdate, payload);
    }
  });
  mainWindow = createWindow(lastConfig.grid);
  const win = mainWindow;
  // Intercept window close: the dialog is parented to the window (still alive here).
  // Cancel keeps the window open — never a window-less app with orphaned processes.
  win.on('close', (event) => {
    if (quitting) return;
    handleWindowCloseRequest({
      runningCount: () => runner.runningCount(),
      confirm: (n) => confirmStopRunning(win, n),
      killAll: (opts) => runner.killAll(opts),
      preventDefault: () => event.preventDefault(),
      initiateQuit: () => {
        quitting = true;
      }
    });
  });
  mainWindow.on('closed', () => {
    for (const w of dialogs.allWindows()) {
      const win = w as BrowserWindow;
      if (!win.isDestroyed()) win.close();
    }
    mainWindow = null;
  });
  mainWindow.setAlwaysOnTop(lastConfig.settings.alwaysOnTop);
  app.setLoginItemSettings({ openAtLogin: lastConfig.settings.launchStartup });
});
const confirmStopRunning = (parent: BrowserWindow | null, n: number): boolean => {
  const options = {
    type: 'warning' as const,
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `${n} action${n === 1 ? ' is' : 's are'} still running`,
    detail: 'Quitting DeckPad will stop them.'
  };
  return (parent ? dialog.showMessageBoxSync(parent, options) : dialog.showMessageBoxSync(options)) === 0;
};

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting) return;
  const decision = handleQuitRequest({
    runningCount: () => runner.runningCount(),
    confirm: (n) => confirmStopRunning(mainWindow, n),
    killAll: (opts) => runner.killAll(opts)
  });
  if (decision === 'cancel') {
    event.preventDefault();
    return;
  }
  quitting = true;
});

app.on('window-all-closed', () => app.quit());
