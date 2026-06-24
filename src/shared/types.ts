export interface GridSize {
  cols: number;
  rows: number;
}

export type Surface = 'near-black' | 'charcoal' | 'ink-blue';

export interface Settings {
  accent: string;
  surface: Surface;
  showLabels: boolean;
  launchStartup: boolean;
  alwaysOnTop: boolean;
  settingsInWindow: boolean;
  activityInWindow: boolean;
}

export type ButtonType = 'command' | 'file' | 'app';
export type IconKind = 'auto' | 'letter' | 'emoji' | 'image';

export interface ButtonIcon {
  kind: IconKind;
  emoji?: string;
  tileColor?: string;
  sourcePath?: string;
}

export interface Button {
  id: string;
  label: string;
  type: ButtonType;
  command?: string;
  cwd?: string;
  showTerminal?: boolean;
  path?: string;
  icon: ButtonIcon;
}

export interface Group {
  id: string;
  name: string;
  slots: (Button | null)[]; // length === cols * rows
}

export interface Config {
  version: 1;
  grid: GridSize;
  settings: Settings;
  groups: Group[]; // min 1
}

export type ActionStateEvent =
  | { type: 'started'; buttonId: string; startedAt: number }
  | { type: 'output'; buttonId: string; chunk: string }
  | { type: 'exited'; buttonId: string; code: number; ranFor: number; stopped?: boolean };

export interface RunningSnapshot {
  buttonId: string;
  startedAt: number;
  output: string[];
}

export type PickKind = 'file' | 'app' | 'image';

export type DialogView = 'edit' | 'settings' | 'activity';

export interface DeckApi {
  readonly platform: NodeJS.Platform;
  getConfig(): Promise<Config>;
  saveConfig(cfg: Config): Promise<void>;
  runAction(id: string): Promise<void>; // stop if already running
  stopAction(id: string): Promise<void>;
  getRunning(): Promise<RunningSnapshot[]>; // initial sync on load
  pickFile(kind: PickKind): Promise<string | null>;
  extractIcon(path: string, buttonId: string): Promise<string | null>; // deckicon:// URL
  setAlwaysOnTop(v: boolean): Promise<void>;
  setLoginItem(v: boolean): Promise<void>;
  onActionState(cb: (e: ActionStateEvent) => void): () => void;
  // dialog windows — payloads/messages are opaque JSON at the IPC boundary
  openDialog(view: DialogView, payload: unknown): Promise<string>; // returns dialog id
  getDialogPayload(id: string): Promise<unknown>;
  sendDialogMessage(id: string, message: unknown): Promise<void>;
  closeDialog(id: string): Promise<void>;
  updateDialog(view: DialogView, payload: unknown): Promise<void>; // push fresh data to an open window
  onDialogMessage(cb: (m: { view: DialogView; message: unknown }) => void): () => void;
  onDialogUpdate(cb: (payload: unknown) => void): () => void;
}

// Renderer-side runtime state for one key (never persisted).
export type KeyRunState = 'idle' | 'launching' | 'running' | 'success' | 'failed';

export interface KeyRuntime {
  state: KeyRunState;
  startedAt?: number;
  log: string[];
  failedDot: boolean;
  exit?: number;
  ranFor?: number; // ms, from the exited event
}
