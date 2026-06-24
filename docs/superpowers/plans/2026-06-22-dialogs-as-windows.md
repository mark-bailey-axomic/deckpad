# Dialogs as Separate Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move deckpad's EditModal (always) and Settings/ActivityPanel (toggle-gated) out of in-window overlays into real frameless `BrowserWindow`s.

**Architecture:** A single extra renderer entry (`dialog.html`) hosts a tiny router that renders the existing `EditModal`/`Settings`/`ActivityPanel` components by `?view=` param. The main process owns window creation, lifecycle, and a payload/message bus over IPC. All config mutation stays in `App.tsx` (the single source of truth): dialog windows send messages → main forwards to the main window → `App.tsx` applies them through its existing `commit`/`saveModal`/`onSettingsChange`/`stop` paths. The independent Activity window stays live because the main window pushes recomputed item lists to it and action-state is broadcast to all windows.

**Tech Stack:** Electron 42, React 19, TypeScript 5.8, electron-vite 3, Vitest 3 (two projects: `main`=node, `renderer`=jsdom), `@testing-library/react`.

## Global Constraints

- IPC channel names live in ONE place: `src/shared/constants.ts` `IPC` object. Preload and main both import from there. Never hardcode a channel string.
- Renderer↔main payloads are validated/narrowed on the main side; the renderer sends only ids and JSON-serializable data (same discipline as existing `assertButtonId`/`validateConfig`).
- Window construction reuses `baseWindowOptions(preloadPath)` from `src/main/window-options.ts` (frameless, sandboxed, contextIsolation) — dialog options extend it, never replace its `webPreferences`.
- Pure logic goes in dependency-injected modules with unit tests (mirror `quit-flow.ts`/`window-options.ts`). Electron-touching glue stays thin in `src/main/index.ts` and is verified by `npm run typecheck` + `npm run build` + manual run.
- TDD: failing test first, minimal code, green, commit. Run `npm test` (both projects) before each commit; a task's commit also requires `npm run typecheck` green.
- Commit message format: `feat: <desc>` / `test: <desc>` (this repo's convention). Branch is already `claude_dialogs-as-windows_feature`.
- The IPC payload boundary is intentionally `unknown`-typed: the dialog "payload" and "message" are opaque JSON at the IPC layer. Renderer-side discriminated unions (`DialogMessage`) provide type safety in the renderer; main never inspects message *contents*, only routes by `view`.

---

## File Structure

**New files:**
- `src/main/dialog-options.ts` — pure: `dialogWindowOptions(view, preloadPath, parent)` → `{ options, size }` per view (frameless; modal+parent for edit/settings; independent for activity).
- `src/main/dialog-options.test.ts`
- `src/main/dialog-store.ts` — pure: `DialogStore` class — stash/fetch/clear payloads by id; track open `BrowserWindow` by view; generate ids (injected generator).
- `src/main/dialog-store.test.ts`
- `src/main/broadcast.ts` — pure: `broadcastToWebContents(targets, channel, payload)` helper.
- `src/main/broadcast.test.ts`
- `src/main/dialog-ipc.ts` — `registerDialogIpc(deps)` — the new IPC handlers (mirrors `ipc.ts` style, unit-tested with mocked `ipcMain`).
- `src/main/dialog-ipc.test.ts`
- `src/renderer/dialog.html` — second renderer HTML entry.
- `src/renderer/src/dialog/main.tsx` — dialog renderer bootstrap (reads `?view=&id=`).
- `src/renderer/src/dialog/DialogHost.tsx` — router/shell: fetch payload, render component, relay messages, apply theme, listen for updates.
- `src/renderer/src/dialog/DialogHost.test.tsx`
- `src/renderer/src/dialog/messages.ts` — renderer-side `DialogMessage` discriminated union + payload types.

**Modified files:**
- `src/shared/constants.ts` — add dialog IPC channels.
- `src/shared/types.ts` — add `DialogView`; extend `DeckApi` with dialog methods.
- `src/preload/index.ts` — implement new `DeckApi` methods.
- `src/main/index.ts` — construct `DialogStore`, wire `registerDialogIpc`, create dialog windows, broadcast action-state, teardown on main-window close.
- `src/renderer/src/components/Settings.tsx` — add two window-mode toggles.
- `src/renderer/src/App.tsx` — route EditModal (always) + Settings/Activity (toggle) through `deck.openDialog`; subscribe to `onDialogMessage`; push live updates to the activity window.
- `electron.vite.config.ts` — add `dialog.html` to the renderer build input.
- `src/renderer/src/lib/deck-mock.ts` — add no-op dialog methods so the in-memory mock still satisfies `DeckApi`.

---

## Task 1: Dialog IPC channels + shared types

**Files:**
- Modify: `src/shared/constants.ts:38-49`
- Modify: `src/shared/types.ts` (add `DialogView`, extend `DeckApi`)
- Test: `src/shared/constants.test.ts` (create)

**Interfaces:**
- Produces: `IPC.openDialog`, `IPC.getDialogPayload`, `IPC.sendDialogMessage`, `IPC.closeDialog`, `IPC.updateDialog`, `IPC.dialogMessage`, `IPC.dialogUpdate` (string channel constants); `DialogView = 'edit' | 'settings' | 'activity'`; new `DeckApi` methods (signatures in Step 3).

- [ ] **Step 1: Write the failing test**

Create `src/shared/constants.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { IPC } from './constants';

describe('IPC dialog channels', () => {
  it('defines all dialog channels', () => {
    expect(IPC.openDialog).toBe('dialog:open');
    expect(IPC.getDialogPayload).toBe('dialog:get-payload');
    expect(IPC.sendDialogMessage).toBe('dialog:send-message');
    expect(IPC.closeDialog).toBe('dialog:close');
    expect(IPC.updateDialog).toBe('dialog:update-data');
    expect(IPC.dialogMessage).toBe('dialog:message');
    expect(IPC.dialogUpdate).toBe('dialog:update');
  });

  it('has no duplicate channel strings', () => {
    const values = Object.values(IPC);
    expect(new Set(values).size).toBe(values.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/constants.test.ts`
Expected: FAIL — `IPC.openDialog` is `undefined`.

- [ ] **Step 3: Add channels and types**

In `src/shared/constants.ts`, extend the `IPC` object (keep existing keys, add before the closing `}`):

```ts
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
```

In `src/shared/types.ts`, add after the `PickKind` line (line 61):

```ts
export type DialogView = 'edit' | 'settings' | 'activity';
```

Then extend the `DeckApi` interface (inside it, after `onActionState`):

```ts
  // dialog windows — payloads/messages are opaque JSON at the IPC boundary
  openDialog(view: DialogView, payload: unknown): Promise<string>; // returns dialog id
  getDialogPayload(id: string): Promise<unknown>;
  sendDialogMessage(id: string, message: unknown): Promise<void>;
  closeDialog(id: string): Promise<void>;
  updateDialog(view: DialogView, payload: unknown): Promise<void>; // push fresh data to an open window
  onDialogMessage(cb: (m: { view: DialogView; message: unknown }) => void): () => void;
  onDialogUpdate(cb: (payload: unknown) => void): () => void;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/constants.test.ts`
Expected: PASS (2 tests).
Note: `npm run typecheck` will now report `DeckApi` not fully implemented in `preload/index.ts` and `deck-mock.ts` — those are fixed in Tasks 7 and 9. That is expected at this point.

- [ ] **Step 5: Commit**

```bash
git add src/shared/constants.ts src/shared/types.ts src/shared/constants.test.ts
git commit -m "feat: add dialog-window IPC channels and DeckApi surface"
```

---

## Task 2: `dialog-options` — per-view window options (pure)

**Files:**
- Create: `src/main/dialog-options.ts`
- Test: `src/main/dialog-options.test.ts`

**Interfaces:**
- Consumes: `baseWindowOptions` from `./window-options`; `DialogView` from `@shared/types`.
- Produces: `dialogWindowOptions(view: DialogView, preloadPath: string, parent: BrowserWindow): { options: BrowserWindowConstructorOptions; size: { width: number; height: number } }`.

- [ ] **Step 1: Write the failing test**

Create `src/main/dialog-options.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dialogWindowOptions, DIALOG_SIZES } from './dialog-options';

const parent = { id: 1 } as never; // BrowserWindow stand-in; only identity is used

describe('dialogWindowOptions', () => {
  it('edit: modal child attached to parent, frameless', () => {
    const { options, size } = dialogWindowOptions('edit', '/preload.js', parent);
    expect(options.frame).toBe(false);
    expect(options.modal).toBe(true);
    expect(options.parent).toBe(parent);
    expect(options.webPreferences?.preload).toBe('/preload.js');
    expect(size).toEqual(DIALOG_SIZES.edit);
  });

  it('settings: modal child attached to parent', () => {
    const { options } = dialogWindowOptions('settings', '/preload.js', parent);
    expect(options.modal).toBe(true);
    expect(options.parent).toBe(parent);
  });

  it('activity: independent — not modal, no parent', () => {
    const { options } = dialogWindowOptions('activity', '/preload.js', parent);
    expect(options.modal).toBe(false);
    expect(options.parent).toBeUndefined();
    expect(options.frame).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/dialog-options.test.ts`
Expected: FAIL — cannot find module `./dialog-options`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/dialog-options.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/dialog-options.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/dialog-options.ts src/main/dialog-options.test.ts
git commit -m "feat: dialog-options — per-view frameless window options"
```

---

## Task 3: `DialogStore` — payload + open-window tracking (pure)

**Files:**
- Create: `src/main/dialog-store.ts`
- Test: `src/main/dialog-store.test.ts`

**Interfaces:**
- Consumes: `DialogView` from `@shared/types`.
- Produces: `class DialogStore` with:
  - `open(view: DialogView, win: WinHandle, payload: unknown): string` — registers a window + payload, returns a new id. Replaces any existing record for that view.
  - `payloadFor(id: string): unknown | undefined`
  - `windowForView(view: DialogView): WinHandle | undefined`
  - `viewForId(id: string): DialogView | undefined`
  - `setPayloadForView(view, payload): void`
  - `close(id: string): WinHandle | undefined` — removes record, returns the window handle so the caller can destroy it.
  - `allWindows(): WinHandle[]`
  - where `WinHandle` is a minimal structural type `{ isDestroyed(): boolean }` so it can be unit-tested without Electron and used with real `BrowserWindow` (which satisfies it).

- [ ] **Step 1: Write the failing test**

Create `src/main/dialog-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DialogStore } from './dialog-store';

const win = (tag: string) => ({ tag, isDestroyed: () => false }) as never;

function store(): DialogStore {
  let n = 0;
  return new DialogStore(() => `id-${++n}`);
}

describe('DialogStore', () => {
  it('open returns an id and stores payload + window + view', () => {
    const s = store();
    const id = s.open('edit', win('a'), { draft: 1 });
    expect(id).toBe('id-1');
    expect(s.payloadFor(id)).toEqual({ draft: 1 });
    expect(s.viewForId(id)).toBe('edit');
    expect(s.windowForView('edit')).toMatchObject({ tag: 'a' });
  });

  it('opening the same view again replaces the prior record', () => {
    const s = store();
    s.open('settings', win('first'), { a: 1 });
    s.open('settings', win('second'), { a: 2 });
    expect(s.windowForView('settings')).toMatchObject({ tag: 'second' });
    expect(s.allWindows()).toHaveLength(1);
  });

  it('setPayloadForView updates the stored payload', () => {
    const s = store();
    s.open('activity', win('a'), { items: [] });
    s.setPayloadForView('activity', { items: [1, 2] });
    const id = s.viewForId('activity') ? 'id-1' : '';
    expect(s.payloadFor(id)).toEqual({ items: [1, 2] });
  });

  it('close removes the record and returns the window handle', () => {
    const s = store();
    const id = s.open('edit', win('a'), {});
    const handle = s.close(id);
    expect(handle).toMatchObject({ tag: 'a' });
    expect(s.payloadFor(id)).toBeUndefined();
    expect(s.windowForView('edit')).toBeUndefined();
    expect(s.allWindows()).toHaveLength(0);
  });

  it('allWindows lists every open dialog window', () => {
    const s = store();
    s.open('edit', win('e'), {});
    s.open('activity', win('a'), {});
    expect(s.allWindows()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/dialog-store.test.ts`
Expected: FAIL — cannot find module `./dialog-store`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/dialog-store.ts`:

```ts
import type { DialogView } from '@shared/types';

export interface WinHandle {
  isDestroyed(): boolean;
}

interface Record_ {
  id: string;
  view: DialogView;
  win: WinHandle;
  payload: unknown;
}

/** Tracks open dialog windows (one per view) and their stashed payloads. */
export class DialogStore {
  private byView = new Map<DialogView, Record_>();
  private byId = new Map<string, Record_>();

  constructor(private genId: () => string) {}

  open(view: DialogView, win: WinHandle, payload: unknown): string {
    const existing = this.byView.get(view);
    if (existing) this.byId.delete(existing.id);
    const id = this.genId();
    const rec: Record_ = { id, view, win, payload };
    this.byView.set(view, rec);
    this.byId.set(id, rec);
    return id;
  }

  payloadFor(id: string): unknown | undefined {
    return this.byId.get(id)?.payload;
  }

  windowForView(view: DialogView): WinHandle | undefined {
    return this.byView.get(view)?.win;
  }

  viewForId(id: string): DialogView | undefined {
    return this.byId.get(id)?.view;
  }

  setPayloadForView(view: DialogView, payload: unknown): void {
    const rec = this.byView.get(view);
    if (rec) rec.payload = payload;
  }

  close(id: string): WinHandle | undefined {
    const rec = this.byId.get(id);
    if (!rec) return undefined;
    this.byId.delete(id);
    this.byView.delete(rec.view);
    return rec.win;
  }

  allWindows(): WinHandle[] {
    return [...this.byView.values()].map((r) => r.win);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/dialog-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/dialog-store.ts src/main/dialog-store.test.ts
git commit -m "feat: DialogStore — track dialog windows and payloads by view/id"
```

---

## Task 4: `broadcast` helper + action-state fan-out (pure)

**Files:**
- Create: `src/main/broadcast.ts`
- Test: `src/main/broadcast.test.ts`

**Interfaces:**
- Produces: `broadcastToWebContents(targets: WebContentsLike[], channel: string, payload: unknown): void` where `WebContentsLike = { isDestroyed(): boolean; send(channel: string, payload: unknown): void }`. Skips destroyed targets.

- [ ] **Step 1: Write the failing test**

Create `src/main/broadcast.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { broadcastToWebContents } from './broadcast';

const wc = (destroyed = false) => ({ isDestroyed: () => destroyed, send: vi.fn() });

describe('broadcastToWebContents', () => {
  it('sends to every live target', () => {
    const a = wc();
    const b = wc();
    broadcastToWebContents([a, b], 'chan', { x: 1 });
    expect(a.send).toHaveBeenCalledWith('chan', { x: 1 });
    expect(b.send).toHaveBeenCalledWith('chan', { x: 1 });
  });

  it('skips destroyed targets', () => {
    const dead = wc(true);
    const live = wc();
    broadcastToWebContents([dead, live], 'chan', 1);
    expect(dead.send).not.toHaveBeenCalled();
    expect(live.send).toHaveBeenCalledWith('chan', 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/broadcast.test.ts`
Expected: FAIL — cannot find module `./broadcast`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/broadcast.ts`:

```ts
export interface WebContentsLike {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

/** Fan a push event out to every live target. */
export function broadcastToWebContents(
  targets: WebContentsLike[],
  channel: string,
  payload: unknown
): void {
  for (const t of targets) {
    if (!t.isDestroyed()) t.send(channel, payload);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/broadcast.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/broadcast.ts src/main/broadcast.test.ts
git commit -m "feat: broadcast helper for fanning push events to all windows"
```

---

## Task 5: `registerDialogIpc` — dialog IPC handlers (unit-tested with mocked ipcMain)

**Files:**
- Create: `src/main/dialog-ipc.ts`
- Test: `src/main/dialog-ipc.test.ts`

**Interfaces:**
- Consumes: `IPC` from `@shared/constants`; `DialogView` from `@shared/types`.
- Produces: `registerDialogIpc(deps: DialogIpcDeps): void` and the `DialogIpcDeps` interface:
  ```ts
  export interface DialogIpcDeps {
    openDialog: (view: DialogView, payload: unknown) => string;          // returns id
    getPayload: (id: string) => unknown;
    sendMessage: (id: string, message: unknown) => void;                  // → main window
    closeDialog: (id: string) => void;
    updateDialog: (view: DialogView, payload: unknown) => void;           // → open window
  }
  ```
- This module registers `ipcMain.handle` for `openDialog`/`getDialogPayload`/`sendDialogMessage`/`closeDialog`/`updateDialog`, validating the `view` argument against the three known views.

- [ ] **Step 1: Write the failing test**

Create `src/main/dialog-ipc.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, ...args: unknown[]) => unknown) => handlers.set(channel, fn)
  }
}));

import { IPC } from '@shared/constants';
import { registerDialogIpc, type DialogIpcDeps } from './dialog-ipc';

function deps(over: Partial<DialogIpcDeps> = {}): DialogIpcDeps {
  return {
    openDialog: vi.fn(() => 'id-1'),
    getPayload: vi.fn(() => ({ p: 1 })),
    sendMessage: vi.fn(),
    closeDialog: vi.fn(),
    updateDialog: vi.fn(),
    ...over
  };
}

const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);

beforeEach(() => handlers.clear());

describe('registerDialogIpc', () => {
  it('openDialog validates the view and returns an id', async () => {
    const d = deps();
    registerDialogIpc(d);
    await expect(call(IPC.openDialog, 'edit', { a: 1 })).resolves.toBe('id-1');
    expect(d.openDialog).toHaveBeenCalledWith('edit', { a: 1 });
  });

  it('openDialog rejects an unknown view', async () => {
    registerDialogIpc(deps());
    await expect(call(IPC.openDialog, 'bogus', {})).rejects.toThrow('invalid dialog view');
  });

  it('getDialogPayload returns the stashed payload', async () => {
    const d = deps({ getPayload: vi.fn(() => ({ p: 9 })) });
    registerDialogIpc(d);
    await expect(call(IPC.getDialogPayload, 'id-1')).resolves.toEqual({ p: 9 });
    expect(d.getPayload).toHaveBeenCalledWith('id-1');
  });

  it('sendDialogMessage forwards id + message', async () => {
    const d = deps();
    registerDialogIpc(d);
    await call(IPC.sendDialogMessage, 'id-1', { type: 'save' });
    expect(d.sendMessage).toHaveBeenCalledWith('id-1', { type: 'save' });
  });

  it('closeDialog forwards the id', async () => {
    const d = deps();
    registerDialogIpc(d);
    await call(IPC.closeDialog, 'id-1');
    expect(d.closeDialog).toHaveBeenCalledWith('id-1');
  });

  it('updateDialog validates the view', async () => {
    const d = deps();
    registerDialogIpc(d);
    await call(IPC.updateDialog, 'activity', { items: [] });
    expect(d.updateDialog).toHaveBeenCalledWith('activity', { items: [] });
    await expect(call(IPC.updateDialog, 'nope', {})).rejects.toThrow('invalid dialog view');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/dialog-ipc.test.ts`
Expected: FAIL — cannot find module `./dialog-ipc`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/dialog-ipc.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/dialog-ipc.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/dialog-ipc.ts src/main/dialog-ipc.test.ts
git commit -m "feat: registerDialogIpc — validated dialog-window IPC handlers"
```

---

## Task 6: Preload bridge methods

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/lib/deck-mock.ts` (add no-op dialog methods so the mock still satisfies `DeckApi`)
- Test: `src/preload/dialog-bridge.test.ts` (create) — verifies the bridge maps each method to the right channel.

**Interfaces:**
- Consumes: `IPC` channels (Task 1), `DialogView` (Task 1).
- Produces: a `DeckApi` whose new methods call the matching `ipcRenderer.invoke`/`on`.

- [ ] **Step 1: Write the failing test**

Create `src/preload/dialog-bridge.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposed: Record<string, unknown> = {};
const invoke = vi.fn(async () => undefined);
const listeners = new Map<string, (e: unknown, p: unknown) => void>();
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (k: string, v: unknown) => { exposed[k] = v; } },
  ipcRenderer: {
    invoke,
    on: (ch: string, fn: (e: unknown, p: unknown) => void) => listeners.set(ch, fn),
    removeListener: (ch: string) => listeners.delete(ch)
  }
}));

import { IPC } from '@shared/constants';
import type { DeckApi } from '@shared/types';

beforeEach(() => { invoke.mockClear(); });

describe('preload dialog bridge', () => {
  it('maps dialog methods to channels', async () => {
    await import('./index');
    const deck = exposed.deck as DeckApi;

    await deck.openDialog('edit', { a: 1 });
    expect(invoke).toHaveBeenCalledWith(IPC.openDialog, 'edit', { a: 1 });

    await deck.getDialogPayload('id-1');
    expect(invoke).toHaveBeenCalledWith(IPC.getDialogPayload, 'id-1');

    await deck.sendDialogMessage('id-1', { type: 'cancel' });
    expect(invoke).toHaveBeenCalledWith(IPC.sendDialogMessage, 'id-1', { type: 'cancel' });

    await deck.closeDialog('id-1');
    expect(invoke).toHaveBeenCalledWith(IPC.closeDialog, 'id-1');

    await deck.updateDialog('activity', { items: [] });
    expect(invoke).toHaveBeenCalledWith(IPC.updateDialog, 'activity', { items: [] });
  });

  it('onDialogMessage subscribes and unsubscribes', async () => {
    await import('./index');
    const deck = exposed.deck as DeckApi;
    const cb = vi.fn();
    const off = deck.onDialogMessage(cb);
    listeners.get(IPC.dialogMessage)!({}, { view: 'edit', message: { type: 'save' } });
    expect(cb).toHaveBeenCalledWith({ view: 'edit', message: { type: 'save' } });
    off();
    expect(listeners.has(IPC.dialogMessage)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/preload/dialog-bridge.test.ts`
Expected: FAIL — `deck.openDialog is not a function`.

- [ ] **Step 3: Implement the bridge methods**

In `src/preload/index.ts`, add `DialogView` to the type import and add the new methods to the `deck` object (after `onActionState`):

```ts
import type { ActionStateEvent, Config, DeckApi, DialogView, PickKind } from '@shared/types';
```

```ts
  openDialog: (view: DialogView, payload: unknown) => ipcRenderer.invoke(IPC.openDialog, view, payload),
  getDialogPayload: (id: string) => ipcRenderer.invoke(IPC.getDialogPayload, id),
  sendDialogMessage: (id: string, message: unknown) => ipcRenderer.invoke(IPC.sendDialogMessage, id, message),
  closeDialog: (id: string) => ipcRenderer.invoke(IPC.closeDialog, id),
  updateDialog: (view: DialogView, payload: unknown) => ipcRenderer.invoke(IPC.updateDialog, view, payload),
  onDialogMessage: (cb: (m: { view: DialogView; message: unknown }) => void) => {
    const listener = (_e: unknown, m: { view: DialogView; message: unknown }): void => cb(m);
    ipcRenderer.on(IPC.dialogMessage, listener);
    return () => ipcRenderer.removeListener(IPC.dialogMessage, listener);
  },
  onDialogUpdate: (cb: (payload: unknown) => void) => {
    const listener = (_e: unknown, p: unknown): void => cb(p);
    ipcRenderer.on(IPC.dialogUpdate, listener);
    return () => ipcRenderer.removeListener(IPC.dialogUpdate, listener);
  }
```

- [ ] **Step 4: Add matching no-op methods to the mock**

In `src/renderer/src/lib/deck-mock.ts`, add these to the returned mock object so it still satisfies `DeckApi` (the mock is used in browser dev + non-dialog renderer tests; dialog windows always run with the real preload):

```ts
  openDialog: async () => 'mock-dialog',
  getDialogPayload: async () => null,
  sendDialogMessage: async () => undefined,
  closeDialog: async () => undefined,
  updateDialog: async () => undefined,
  onDialogMessage: () => () => undefined,
  onDialogUpdate: () => () => undefined,
```

(If `deck-mock.ts` defines a typed `const mock: DeckApi = {...}`, this restores full-interface conformance.)

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/preload/dialog-bridge.test.ts`
Expected: PASS (2 tests).
Run: `npm run typecheck`
Expected: PASS — `DeckApi` is now fully implemented by both preload and mock.

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts src/preload/dialog-bridge.test.ts src/renderer/src/lib/deck-mock.ts
git commit -m "feat: preload bridge + mock for dialog-window IPC"
```

---

## Task 7: Second renderer entry + DialogHost router/shell

**Files:**
- Create: `src/renderer/dialog.html`
- Create: `src/renderer/src/dialog/messages.ts`
- Create: `src/renderer/src/dialog/DialogHost.tsx`
- Create: `src/renderer/src/dialog/main.tsx`
- Create: `src/renderer/src/dialog/DialogHost.test.tsx`
- Modify: `electron.vite.config.ts` (renderer build input)

**Interfaces:**
- Consumes: `getDeck()` from `../lib/deck`; existing `EditModal`/`Settings`/`ActivityPanel` components; `DialogView` from `@shared/types`.
- Produces: `DialogHost({ view, id })` React component; `messages.ts` payload/message types (Step 1).

- [ ] **Step 1: Define the renderer-side message + payload types**

Create `src/renderer/src/dialog/messages.ts`:

```ts
import type { Button } from '@shared/types';
import type { ModalDraft } from '../components/EditModal';
import type { SettingsValues } from '../components/Settings';
import type { ActivityItem } from '../components/ActivityPanel';

// Payloads sent INTO a dialog window on open (and via updateDialog for activity).
export interface EditPayload { draft: ModalDraft; index: number; accent: string; surface: string }
export interface SettingsPayload { settings: SettingsValues; accent: string; surface: string }
export interface ActivityPayload { items: ActivityItem[]; now: number; accent: string; surface: string }

// Messages sent OUT of a dialog window → main → main window.
export type DialogMessage =
  | { type: 'save'; button: Button; index: number }   // edit
  | { type: 'settings-change'; patch: Partial<SettingsValues> }
  | { type: 'activity-stop'; buttonId: string };
```

- [ ] **Step 2: Write the failing test**

Create `src/renderer/src/dialog/DialogHost.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { DeckApi } from '@shared/types';
import { DialogHost } from './DialogHost';
import type { EditPayload } from './messages';

function mockDeck(payload: unknown): DeckApi {
  return {
    openDialog: vi.fn(), getDialogPayload: vi.fn(async () => payload),
    sendDialogMessage: vi.fn(async () => undefined), closeDialog: vi.fn(async () => undefined),
    updateDialog: vi.fn(), onDialogMessage: () => () => undefined,
    onDialogUpdate: () => () => undefined,
    pickFile: vi.fn(async () => null), extractIcon: vi.fn(async () => null)
  } as unknown as DeckApi;
}

const editPayload: EditPayload = {
  draft: { id: 'b1', isNew: false, label: 'Hello', type: 'command', command: 'echo hi', cwd: '', showTerminal: false, path: '', icon: { kind: 'auto' } },
  index: 3, accent: '#34D399', surface: 'near-black'
};

describe('DialogHost', () => {
  it('fetches its payload and renders the edit view', async () => {
    const deck = mockDeck(editPayload);
    render(<DialogHost view="edit" id="id-1" deck={deck} />);
    expect(deck.getDialogPayload).toHaveBeenCalledWith('id-1');
    await waitFor(() => expect(screen.getByDisplayValue('Hello')).toBeInTheDocument());
  });

  it('save sends a save message then asks to close', async () => {
    const deck = mockDeck(editPayload);
    render(<DialogHost view="edit" id="id-1" deck={deck} />);
    await waitFor(() => screen.getByDisplayValue('Hello'));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(deck.sendDialogMessage).toHaveBeenCalledWith('id-1', expect.objectContaining({ type: 'save', index: 3 }));
      expect(deck.closeDialog).toHaveBeenCalledWith('id-1');
    });
  });
});
```

(Note: the "save" button label/role comes from the existing `EditModal`. If the save control isn't a `button` with accessible name "Save", adjust the selector to match `EditModal`'s actual markup — read `src/renderer/src/components/EditModal.tsx` to confirm before writing the assertion.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/dialog/DialogHost.test.tsx`
Expected: FAIL — cannot find module `./DialogHost`.

- [ ] **Step 4: Implement `DialogHost`**

Create `src/renderer/src/dialog/DialogHost.tsx`:

```tsx
import { useEffect, useState, type ReactElement } from 'react';
import type { Button, DeckApi, DialogView, Surface } from '@shared/types';
import { SURFACES, GLOW, RADIUS } from '@shared/constants';
import { EditModal } from '../components/EditModal';
import { Settings } from '../components/Settings';
import { ActivityPanel } from '../components/ActivityPanel';
import type { EditPayload, SettingsPayload, ActivityPayload, DialogMessage } from './messages';

interface Props {
  view: DialogView;
  id: string;
  deck: DeckApi;
}

export function DialogHost({ view, id, deck }: Props): ReactElement | null {
  const [payload, setPayload] = useState<unknown>(undefined);

  useEffect(() => { void deck.getDialogPayload(id).then(setPayload); }, [deck, id]);

  // Activity is independent + live: re-render when main window pushes fresh data.
  useEffect(() => deck.onDialogUpdate((p) => setPayload(p)), [deck]);

  if (payload === undefined) return null;

  const send = (message: DialogMessage) => void deck.sendDialogMessage(id, message);
  const close = () => void deck.closeDialog(id);
  const sendThenClose = (message: DialogMessage) => { send(message); close(); };

  const accent = (payload as { accent: string }).accent;
  const surface = (payload as { surface: Surface }).surface;
  const surf = SURFACES[surface] ?? SURFACES['near-black'];
  const style = {
    width: '100%', height: '100%', background: surf.bg,
    '--accent': accent, '--key': surf.key, '--key-hi': surf.keyHi,
    '--glow': GLOW, '--radius': `${RADIUS}px`
  } as React.CSSProperties;

  return (
    <div className="dp-dialog-window" style={style}>
      {view === 'edit' && (() => {
        const p = payload as EditPayload;
        return (
          <EditModal
            open
            draft={p.draft}
            accent={accent}
            onSave={(button: Button) => sendThenClose({ type: 'save', button, index: p.index })}
            onCancel={close}
            pickFile={(kind) => deck.pickFile(kind)}
            extractIcon={(path, buttonId) => deck.extractIcon(path, buttonId)}
          />
        );
      })()}

      {view === 'settings' && (() => {
        const p = payload as SettingsPayload;
        return (
          <Settings
            open
            settings={p.settings}
            onChange={(patch) => send({ type: 'settings-change', patch })}
            onClose={close}
          />
        );
      })()}

      {view === 'activity' && (() => {
        const p = payload as ActivityPayload;
        return (
          <ActivityPanel
            open
            items={p.items}
            now={p.now}
            accent={accent}
            onStop={(buttonId) => send({ type: 'activity-stop', buttonId })}
            onClose={close}
          />
        );
      })()}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/dialog/DialogHost.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Add the renderer bootstrap + HTML entry**

Create `src/renderer/src/dialog/main.tsx`:

```tsx
import '../assets/deckpad.css';
import '../app.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { DialogView } from '@shared/types';
import { getDeck } from '../lib/deck';
import { DialogHost } from './DialogHost';

const params = new URLSearchParams(window.location.search);
const view = params.get('view') as DialogView;
const id = params.get('id') ?? '';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DialogHost view={view} id={id} deck={getDeck()} />
  </React.StrictMode>
);
```

Create `src/renderer/dialog.html` (copy of `index.html` pointing at the dialog bootstrap):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' deckicon: data:; font-src 'self'" />
    <title>DeckPad</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/dialog/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Register the second entry in the renderer build**

In `electron.vite.config.ts`, add `build.rollupOptions.input` to the `renderer` block so both HTML files are built (electron-vite defaults to `index.html` only):

```ts
import { resolve } from 'node:path';
// ...
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@shared': shared, '@renderer': resolve(__dirname, 'src/renderer/src') }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          dialog: resolve(__dirname, 'src/renderer/dialog.html')
        }
      }
    }
  }
```

- [ ] **Step 8: Verify the build produces both entries**

Run: `npm run build`
Expected: PASS; `out/renderer/index.html` and `out/renderer/dialog.html` both exist.
Run: `ls out/renderer/*.html`
Expected: both files listed.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/dialog.html src/renderer/src/dialog electron.vite.config.ts
git commit -m "feat: dialog renderer entry + DialogHost router/shell"
```

---

## Task 8: Wire dialog windows into the main process

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `DialogStore` (Task 3), `dialogWindowOptions` (Task 2), `broadcastToWebContents` (Task 4), `registerDialogIpc` (Task 5), `IPC` channels (Task 1).
- Produces: live dialog-window creation, message routing to the main window, live data push to open windows, action-state broadcast, and teardown on main-window close. This is Electron glue — verified by typecheck + build + manual run (consistent with `index.ts` having no unit test).

- [ ] **Step 1: Add imports and the dialog store**

In `src/main/index.ts`, add imports near the other `./` imports:

```ts
import { DialogStore } from './dialog-store';
import { dialogWindowOptions } from './dialog-options';
import { broadcastToWebContents } from './broadcast';
import { registerDialogIpc } from './dialog-ipc';
import type { DialogView } from '@shared/types';
```

After `let mainWindow: BrowserWindow | null = null;` (line 59) add:

```ts
const dialogs = new DialogStore(() => crypto.randomUUID());
```

- [ ] **Step 2: Add the dialog-window factory**

Add this function near `createWindow` (after line 121):

First add `idForView` to `DialogStore` so dedup can return the existing id without re-registering. In `src/main/dialog-store.ts` add the method:

```ts
  idForView(view: DialogView): string | undefined {
    return this.byView.get(view)?.id;
  }
```

and add a case to `src/main/dialog-store.test.ts`:

```ts
  it('idForView returns the id from the matching open()', () => {
    const s = store();
    const id = s.open('edit', win('a'), {});
    expect(s.idForView('edit')).toBe(id);
    expect(s.idForView('settings')).toBeUndefined();
  });
```

Run: `npx vitest run src/main/dialog-store.test.ts` → PASS.

Then add the factory in `src/main/index.ts`. Dedup focuses the existing window for the view (per the spec table), refreshes its payload, and returns the existing id — it never creates a second window or re-registers:

```ts
function createDialogWindow(view: DialogView, payload: unknown): string {
  if (!mainWindow) throw new Error('no main window');

  // Dedup: focus the existing window for this view and refresh its data.
  const existing = dialogs.windowForView(view) as BrowserWindow | undefined;
  if (existing && !existing.isDestroyed()) {
    dialogs.setPayloadForView(view, payload);
    existing.webContents.send(IPC.dialogUpdate, payload);
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
  win.on('closed', () => { dialogs.close(id); });
  return id;
}
```

- [ ] **Step 3: Register dialog IPC inside `app.whenReady`**

Inside the `app.whenReady().then(() => { ... })` block, after `registerIpc({...})`, add:

```ts
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
        if (win && !win.isDestroyed()) win.webContents.send(IPC.dialogUpdate, payload);
      }
    });
```

- [ ] **Step 4: Broadcast action-state to all windows**

Replace `sendActionState` (lines 77–81) with a fan-out that includes the main window plus any open dialog windows:

```ts
const sendActionState = (e: ActionStateEvent): void => {
  const targets = [
    ...(mainWindow ? [mainWindow.webContents] : []),
    ...dialogs.allWindows().map((w) => (w as BrowserWindow).webContents)
  ];
  broadcastToWebContents(targets, IPC.actionState, e);
};
```

- [ ] **Step 5: Tear down dialog windows when the main window closes**

In `mainWindow.on('closed', ...)` (lines 172–174), close any open dialog windows first (independent activity window is not auto-closed by Electron):

```ts
  mainWindow.on('closed', () => {
    for (const w of dialogs.allWindows()) {
      const win = w as BrowserWindow;
      if (!win.isDestroyed()) win.close();
    }
    mainWindow = null;
  });
```

- [ ] **Step 6: Verify typecheck + build + tests**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm test`
Expected: PASS (all existing + new unit tests, including the `idForView` test added in Step 2).
Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/main/dialog-store.ts src/main/dialog-store.test.ts
git commit -m "feat: create + route dialog windows from the main process"
```

---

## Task 9: Settings window-mode toggles + App routing

**Files:**
- Modify: `src/shared/types.ts` (add two settings fields)
- Modify: `src/main/validate-config.ts` (accept the new fields) + its test
- Modify: `src/renderer/src/components/Settings.tsx` (two toggles) + `SettingsValues`
- Modify: `src/renderer/src/App.tsx` (route opens through `deck.openDialog`; subscribe to `onDialogMessage`; push live updates to the activity window)
- Test: `src/renderer/src/App.test.tsx` (extend)

**Interfaces:**
- Consumes: `deck.openDialog`/`onDialogMessage`/`updateDialog`; `DialogMessage` (Task 7).
- Produces: persisted `settingsInWindow`/`activityInWindow` booleans; App routing behavior.

- [ ] **Step 1: Write the failing test (App routes EditModal to a window)**

Read `src/renderer/src/App.test.tsx` first to match its existing harness (how it provides a mock `deck` and config). Then add:

```tsx
it('opening the editor calls deck.openDialog instead of rendering an inline modal', async () => {
  // ...render App with a mock deck whose openDialog is a vi.fn()...
  // trigger an edit (e.g. click an empty key / press edit on a key)
  // assert: deck.openDialog was called with 'edit' and a payload containing { index, draft, accent }
  // assert: no inline modal node (e.g. queryByRole('dialog')) is present
});
```

Fill the body using the file's existing patterns (the existing tests already render `App` with a mock deck and a config — reuse that exact setup; do not invent a new harness).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: FAIL — `openDialog` not called (App still renders the inline `EditModal`).

- [ ] **Step 3: Add the two settings fields + validation**

In `src/shared/types.ts`, extend `Settings`:

```ts
export interface Settings {
  accent: string;
  surface: Surface;
  showLabels: boolean;
  launchStartup: boolean;
  alwaysOnTop: boolean;
  settingsInWindow: boolean;
  activityInWindow: boolean;
}
```

In `src/main/validate-config.ts`, add boolean checks for `settingsInWindow` and `activityInWindow` mirroring the existing `launchStartup`/`alwaysOnTop` checks. **Back-compat:** existing saved configs lack these keys — treat missing as `false` rather than rejecting. In whichever module builds the default/loaded config (`ConfigStore.load` or a `defaultConfig`), default both to `false`. Add a `validate-config.test.ts` case: a config omitting these fields still validates (or is normalized to `false` on load — match the existing pattern in that file).

- [ ] **Step 4: Add the toggles to Settings**

In `src/renderer/src/components/Settings.tsx`, extend `SettingsValues`:

```ts
export interface SettingsValues {
  cols: number;
  rows: number;
  accent: string;
  surface: Surface;
  showLabels: boolean;
  launchStartup: boolean;
  alwaysOnTop: boolean;
  settingsInWindow: boolean;
  activityInWindow: boolean;
}
```

Add two `ToggleRow`s in the settings body (follow the existing `ToggleRow` usage for `showLabels`/`launchStartup`):

```tsx
<ToggleRow
  label="Open Settings in its own window"
  checked={settings.settingsInWindow}
  onChange={(v) => onChange({ settingsInWindow: v })}
/>
<ToggleRow
  label="Open Activity in its own window"
  checked={settings.activityInWindow}
  onChange={(v) => onChange({ activityInWindow: v })}
/>
```

(Confirm the `ToggleRow` prop names by reading `src/renderer/src/components/ToggleRow.tsx`; match them exactly.)

- [ ] **Step 5: Route opens through the dialog API in App.tsx**

In `src/renderer/src/App.tsx`:

1. Build the `SettingsValues` passed to `<Settings>` to include the two new fields:
   ```tsx
   settings={{ cols, rows, accent, surface: config.settings.surface, showLabels: config.settings.showLabels, launchStartup: config.settings.launchStartup, alwaysOnTop: config.settings.alwaysOnTop, settingsInWindow: config.settings.settingsInWindow, activityInWindow: config.settings.activityInWindow }}
   ```

2. Replace the EditModal-opening sites (`setModal({...})` in `pressKey`, `ctxEdit`) with a helper that always opens a window:
   ```tsx
   const openEditor = (draft: ModalDraft, index: number) =>
     void deck.openDialog('edit', { draft, index, accent, surface: config.settings.surface });
   ```
   - `pressKey`: empty slot → `openEditor(newDraft(), idx)`; edit-mode existing → `openEditor({ ...structuredClone(b), isNew: false }, idx)`.
   - `ctxEdit`: `openEditor({ ...structuredClone(b), isNew: false }, menu.index)`.
   - Remove the `modal` state and the inline `<EditModal .../>` render (lines 387–390) and its import if now unused.

3. Settings button: if `config.settings.settingsInWindow`, open a window; else keep the in-window sheet:
   ```tsx
   onClick={(e) => {
     e.stopPropagation();
     if (config.settings.settingsInWindow) {
       void deck.openDialog('settings', { settings: settingsValues, accent, surface: config.settings.surface });
     } else setSettingsOpen((o) => !o);
   }}
   ```
   (Render `<Settings>` inline only when `!settingsInWindow`.)

4. Activity pill: same pattern with `activityInWindow` and `panelItems`/`now`. Render `<ActivityPanel>` inline only when `!activityInWindow`.

5. Subscribe to messages from dialog windows and apply them through existing paths:
   ```tsx
   useEffect(() => deck.onDialogMessage(({ view, message }) => {
     const m = message as DialogMessage;
     if (view === 'edit' && m.type === 'save') {
       setSlots((slots) => slots.map((s, i) => (i === m.index ? m.button : s)));
     } else if (view === 'settings' && m.type === 'settings-change') {
       onSettingsChange(m.patch);
     } else if (view === 'activity' && m.type === 'activity-stop') {
       stop(m.buttonId);
     }
   }), []); // deck is stable; functions read latest via configRef/commit
   ```
   Import `DialogMessage` from `./dialog/messages`. Note `setSlots` uses the *active* group — the edit message must apply to the group that was active when the window opened. Since the activity/edit window is modal for edit, the active group cannot change underneath; acceptable. (If a future change makes edit non-modal, thread the group id through the payload/message.)

6. Push live data to the activity window when it is open and data changes:
   ```tsx
   useEffect(() => {
     if (config?.settings.activityInWindow) {
       void deck.updateDialog('activity', { items: panelItems, now, accent, surface: config.settings.surface });
     }
   }, [panelItemsSignature, now, accent]); // see note
   ```
   Compute `panelItemsSignature` as a `useMemo` JSON string of `panelItems` so the effect fires only on real changes, not every render. The dialog host already re-renders from `onDialogUpdate`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/App.test.tsx`
Expected: PASS — the new routing test and all existing App tests.
Run: `npm test`
Expected: PASS (all projects).
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/validate-config.ts src/main/validate-config.test.ts src/renderer/src/components/Settings.tsx src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat: route dialogs to windows + Settings/Activity window-mode toggles"
```

---

## Task 10: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the app**

Run: `npm run dev`

- [ ] **Step 2: Verify EditModal-as-window**

- Click an empty key → a **separate frameless window** opens with the editor.
- The main window is **blocked** (modal) while it is open.
- Edit fields, click Save → the key updates in the main window and the editor window closes.
- Reopen, click Cancel/Escape → no change, window closes.
- Right-click a key → Edit → editor window opens for that key.
- Re-trigger edit while one is open → the existing window **focuses** (no second window).

- [ ] **Step 3: Verify Settings toggle**

- With "Open Settings in its own window" **off**: settings button opens the in-window sheet (unchanged).
- Turn it **on**, reopen settings → opens as a **modal frameless window**; changing accent/grid live-applies to the main window.

- [ ] **Step 4: Verify Activity toggle (independent + live)**

- Turn "Open Activity in its own window" **on**.
- Start a long-running action; click the "running" pill → Activity opens as an **independent window**.
- The main window **stays interactive** (press other keys) while it is open.
- The activity window updates **live** (logs/elapsed/new running entries) — confirms broadcast + `updateDialog` push.
- Stop an action from the activity window → it stops in the main process.

- [ ] **Step 5: Verify teardown**

- With an independent Activity window open, close the main window → the Activity window also closes; the app quits (no orphaned window).

- [ ] **Step 6: Final full-suite check**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

---

## Self-Review Notes

**Spec coverage:**
- EditModal always a frameless modal child window → Tasks 2, 7, 8, 9 (Step 5).
- Settings/Activity toggle → Task 9.
- Settings = modal child, Activity = independent → Task 2 (`dialogWindowOptions`).
- Approach A single `dialog.html` routed by `?view=` → Task 7.
- IPC contract (openDialog/getDialogPayload/messages/close/update) → Tasks 1, 5, 6.
- Live ActivityPanel (broadcast + push) → Tasks 4, 8 (Step 4), 9 (Step 6).
- Dedup/focus existing window → Task 8 (Step 2).
- Teardown on main-window close → Task 8 (Step 5).
- Theming into windows → Task 7 (`DialogHost` applies CSS vars from payload; activity refreshed via `updateDialog`).
- New persisted settings + back-compat → Task 9 (Steps 3–4).

**Open items the implementer must confirm against live code (flagged inline, not placeholders):**
- `EditModal` save control's accessible name (Task 7 Step 2 selector).
- `ToggleRow` prop names (Task 9 Step 4).
- `App.test.tsx` existing mock-deck/config harness (Task 9 Step 1).
- `validate-config.ts` / config-default pattern for new fields (Task 9 Step 3).
- `deck-mock.ts` shape — typed object vs. factory (Task 6 Step 4).

**Type consistency:** `DialogView`, `DialogMessage`, payload interfaces, and `DeckApi` dialog methods use identical names/signatures across Tasks 1, 5, 6, 7, 9.
