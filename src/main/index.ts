import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { baseWindowOptions } from './window-options';
import { ConfigStore } from './config-store';
import { registerIpc } from './ipc';

const store = new ConfigStore(join(app.getPath('userData')));

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 488,
    height: 514,
    ...baseWindowOptions(join(__dirname, '../preload/index.js'))
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  win.once('ready-to-show', () => win.show());
  return win;
}

void app.whenReady().then(() => {
  registerIpc({
    store,
    onConfigSaved: () => undefined, // window resize + icon sync: Tasks 25/30
    runAction: async () => undefined, // runner: Task 22
    stopAction: () => undefined, // runner: Task 22
    getRunning: () => [], // runner: Task 22
    pickFile: async () => null, // dialogs: Task 25
    extractIcon: async () => null, // icons: Task 23
    setAlwaysOnTop: () => undefined, // window: Task 29
    setLoginItem: () => undefined // login item: Task 29
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
