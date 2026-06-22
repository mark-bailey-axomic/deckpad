import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import type { DialogView } from '@shared/types';
import { baseWindowOptions } from './window-options';

/** Fixed content sizes per dialog view (frameless — these are the full window sizes). */
export const DIALOG_SIZES: Record<DialogView, { width: number; height: number }> = {
  edit: { width: 440, height: 620 },
  settings: { width: 420, height: 560 },
  activity: { width: 460, height: 520 }
};

export function dialogWindowOptions(
  view: DialogView,
  preloadPath: string,
  parent: BrowserWindow
): { options: BrowserWindowConstructorOptions; size: { width: number; height: number } } {
  const size = DIALOG_SIZES[view];
  const attached = view !== 'activity'; // activity is independent/non-blocking
  const options: BrowserWindowConstructorOptions = {
    ...baseWindowOptions(preloadPath),
    ...size,
    modal: attached,
    ...(attached ? { parent } : {})
  };
  return { options, size };
}
