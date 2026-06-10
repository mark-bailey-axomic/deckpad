import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { baseWindowOptions } from './window-options';

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

void app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
