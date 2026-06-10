import type { BrowserWindowConstructorOptions } from 'electron';

export function baseWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: '#0E0E10',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}
