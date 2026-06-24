import type { Surface } from './types';

// Frozen design tweaks
export const KEY_SIZE = 104;
export const GAP = 14;
export const RADIUS = 16;
export const GLOW = 0.7;
export const PAD = 22;
export const BAR_H = 52;
export const TABS_H = 40;

export const GRID_LIMITS = { cols: { min: 2, max: 6 }, rows: { min: 2, max: 5 } } as const;
export const DEFAULT_GRID = { cols: 4, rows: 3 } as const;

export const ACCENTS = ['#34D399', '#0E5ECF', '#22D3EE', '#8B5CF6', '#F59E0B', '#F04438'] as const;
export const DEFAULT_ACCENT = ACCENTS[0];

export const TILE_COLORS = ['#34D399', '#0E5ECF', '#22D3EE', '#8B5CF6', '#F59E0B', '#F04438', '#64748B', '#EC4899'] as const;

export const EMOJIS = ['🚀', '🛠', '📦', '🗄', '🔥', '⚡️', '🎯', '📸', '🧪', '☁️', '🔑', '🎧'] as const;

export const SURFACES: Record<Surface, { bg: string; key: string; keyHi: string }> = Object.freeze({
  'near-black': { bg: '#0E0E10', key: '#1A1A1E', keyHi: '#26262C' },
  charcoal: { bg: '#161619', key: '#202026', keyHi: '#2C2C34' },
  'ink-blue': { bg: '#0B0F17', key: '#161C28', keyHi: '#202A3A' }
});

// Runner tuning (spec values)
export const OUTPUT_RING_CAPACITY = 500; // lines per run
export const OUTPUT_BATCH_MS = 50;
export const RUNNING_REVEAL_MS = 300; // exits faster than this skip visible running
export const SIGKILL_ESCALATION_MS = 3000;

// Button ID format — single source of truth shared by IPC and config-validate
export const BUTTON_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

// IPC channel names — single source of truth for preload + main
export const IPC = {
  getConfig: 'config:get',
  saveConfig: 'config:save',
  runAction: 'action:run',
  stopAction: 'action:stop',
  getRunning: 'action:running',
  pickFile: 'dialog:pick-file',
  extractIcon: 'icon:extract',
  setAlwaysOnTop: 'window:set-always-on-top',
  setLoginItem: 'app:set-login-item',
  actionState: 'action-state',
  // dialog windows
  openDialog: 'dialog:open',
  getDialogPayload: 'dialog:get-payload',
  sendDialogMessage: 'dialog:send-message',
  closeDialog: 'dialog:close',
  updateDialog: 'dialog:update-data',
  dialogMessage: 'dialog:message',
  dialogUpdate: 'dialog:update'
} as const;
