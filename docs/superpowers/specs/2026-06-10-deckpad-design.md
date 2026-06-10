# DeckPad — Design Spec

2026-06-10 · Approved via brainstorming session.

## Overview

DeckPad is a cross-platform (macOS/Windows, graceful Linux) Electron desktop app: a Stream Deck–style launcher. A compact dark window shows a grid of large square keys; each key runs a user-defined action instantly. Visuals come **verbatim** from the Claude Design handoff bundle vendored at `design/prototype/` (CSS, class names, DOM structure, animations, fonts, screenshots; chat transcript at `design/prototype-chat.md`). Where the prototype simulated behavior (fake timers, demo keys, canned logs), this spec defines the real replacement. **Design file wins on visuals; this spec wins on behavior.**

## Stack & architecture

- **electron-vite** scaffold; three TS targets: `src/main`, `src/preload`, `src/renderer`.
- Renderer: **React 19 + TypeScript**. The prototype's React 18 JSX components port nearly 1:1. `design/prototype/deckpad.css` and Inter fonts copied verbatim into the renderer.
- Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Preload exposes a minimal `deck` API via `contextBridge`. All privileged work (spawn, `shell.openPath`, `app.getFileIcon`, dialogs, fs) lives in main behind `ipcMain.handle`.
- Main modules:
  - `config-store` — versioned JSON at `userData/config.json`, atomic writes (tmp + rename).
  - `runner` — spawn registry, output buffering, process-tree kill, state events.
  - `icons` — extraction + PNG cache at `userData/icons/`.
  - `windows` — window creation + sizing from grid config.
  - `ipc` — all handler registrations; validates payloads.
- Packaging: **electron-builder**. `npm install && npm start` runs dev (`electron-vite dev`).

### Window

- Frameless, not user-resizable; sized by the prototype formula: `winW = 44 + cols·104 + (cols−1)·14`, `winH = 52 + 40 + 44 + rows·104 + (rows−1)·14`. Resizes when grid changes.
- Top bar (`.dp-bar`) is the drag region (`-webkit-app-region: drag`; interactive children `no-drag`).
- macOS: `titleBarStyle: 'hiddenInset'` (traffic lights overlay bar; brand padded right). Win/Linux: slim × close button added at bar-right.
- The prototype's `.dp-stage` scale wrapper and wall backdrop are dropped — the real window replaces them.

### Dropped from prototype

`tweaks-panel.jsx` (design-tool artifact), all demo data (`DEV_SLOTS` etc.), canned logs, fake file picker, fake launch/stop timers, `behavior` field, `uid` counter, stage/scale wrapper.

## Config schema (v1, declarative only — runtime state never persisted)

```ts
interface Config {
  version: 1;
  grid: { cols: number; rows: number };          // default 4×3; cols 2–6, rows 2–5
  settings: {
    accent: string;        // default '#34D399'; 6 design swatches
    surface: 'near-black' | 'charcoal' | 'ink-blue';  // default 'near-black'
    showLabels: boolean;   // default true
    launchStartup: boolean;  // default false
    alwaysOnTop: boolean;    // default false
  };
  groups: Group[];         // min 1; default single group "Actions"
}
interface Group { id: string; name: string; slots: (Button | null)[] }  // length === cols·rows
interface Button {
  id: string; label: string;
  type: 'command' | 'file' | 'app';
  command?: string; cwd?: string; showTerminal?: boolean;  // command type
  path?: string;                                            // file/app type
  icon: { kind: 'auto' | 'letter' | 'emoji' | 'image';
          emoji?: string; tileColor?: string; sourcePath?: string };
}
```

- Style constants frozen from the design's saved tweaks: keySize 104, gap 14, radius 16, glow 0.7. Not user-settable.
- Ids: `crypto.randomUUID()`.
- Corrupt config → back up file, regenerate defaults. `version` gates future migrations.

## Execution & live state

- `deck.runAction(id)`: renderer passes **only the button id**; main resolves the command from saved config (renderer can never inject command strings).
- Command actions: `spawn(command, { shell: true, cwd, detached: process.platform !== 'win32' })`. Main keeps `Map<buttonId, { child, startedAt, output }>` in memory only.
- Main pushes `action-state` events via `webContents.send` (renderer never polls):
  - `started { buttonId, startedAt }`
  - `output { buttonId, chunk }` — stdout+stderr, batched ~50 ms, ring buffer 500 lines per run
  - `exited { buttonId, code, ranFor }`
- Key state machine: press → **launching** (shimmer) → `started` → **running** (breathe glow, pulsing corner dot, label swapped for live `▶ mm:ss` timer) → exit 0 → **success** flash → idle; nonzero exit or spawn error → **failed** flash + persistent red corner dot until next run + toast `"<label> failed (exit N) · View log"`. Commands exiting <300 ms skip visible running and go launching → flash. Renderer's 1 s tick drives elapsed timers only.
- No per-button oneshot/service config — actual process lifetime decides.
- **Press-while-running stops** (no second instance): POSIX `process.kill(-pid, 'SIGTERM')`, escalate SIGKILL after 3 s; Windows `taskkill /pid <pid> /t /f`. Kills the whole tree (npm-style grandchildren). Hover on a running key shows the ■ stop overlay (design).
- `showTerminal: true` commands are **untracked** — handed to the system terminal (macOS: osascript → Terminal.app; Windows: `start cmd /k`; Linux: `x-terminal-emulator` fallback chain); launching flash only.
- Open file: `shell.openPath`; paths matching `^https?://` use `shell.openExternal`. Launch app: `shell.openPath` for `.app`/`.exe`/`.lnk`; bare Linux binaries spawn detached. Both untracked — launching flash only.
- Spawn error (ENOENT etc.) → treated as exit −1; error message appears in the log.
- Quit while anything runs → confirm dialog; on confirm, kill all trees then quit.
- **Activity panel** (slide-up, per design): running entries (icon, group chip, elapsed, live auto-scrolled log, ■ Stop) + failed entries (actual run duration, exit code, frozen log) persisting until that key's next run or app restart. Top-bar "N running" pill aggregates across all groups; tabs of groups containing running keys show the pulsing dot.

## Icons

- Auto: on file/app pick, main runs `app.getFileIcon(path, { size: 'large' })` → PNG cached at `userData/icons/<buttonId>.png`. Served to the sandboxed renderer via a custom `deckicon://` protocol (`protocol.handle`, scoped to the icons dir). "Auto from file" badge in the modal per design.
- Fallbacks: extraction failure or empty image (Linux generic case) → **letter tile**: uppercase first letters of the first two words (1–2 chars), design's 8 tile colors.
- Overrides: user image (png/jpg/svg/ico — copied to `userData/icons/<buttonId>-custom.<ext>`, served via `deckicon://`), emoji (design's 12-emoji grid), letter tile with color swatches.
- Deleting/duplicating a button manages its cached icon files (duplicate copies the PNG under the new id; delete removes them).

## Managing buttons & groups

- Empty slot: dashed outline, "+" on hover → New Action modal (design's EditModal: label, segmented type, conditional fields, icon section).
- Right-click filled key → context menu: Edit / Duplicate / Delete (instant, no confirm — per design). Duplicate goes to first empty slot in the current group; toast if the grid is full.
- Edit mode (pencil toggle): jiggle, × delete badges, drag enabled.
- **Drag = insert/shift reorder**: dropping at slot j splices the slots array (nulls shift too). Persists immediately.
- Grid resize (top-bar popover or Settings steppers, cols 2–6 × rows 2–5): on shrink, filled keys compact into remaining slots; if filled count > new capacity → confirm dialog naming how many buttons will be deleted.
- Groups: tab strip per design — min 1 group; + adds; double-click renames (empty → "Untitled"); edit-mode × deletes with confirm when the group has keys.
- Settings sheet (per design): grid steppers, 6 accent swatches, 3 surface cards, Show labels / Launch at startup / Always on top toggles — last two wired to `app.setLoginItemSettings` / `win.setAlwaysOnTop`.
- Esc closes modal without confirmation (per design).

## Preload `deck` API (contract)

```ts
getConfig(): Promise<Config>
saveConfig(cfg: Config): Promise<void>
runAction(id: string): Promise<void>        // stop if already running
stopAction(id: string): Promise<void>
getRunning(): Promise<RunningSnapshot[]>    // initial sync on load
pickFile(kind: 'file' | 'app' | 'image'): Promise<string | null>
extractIcon(path: string, buttonId: string): Promise<string | null>  // deckicon:// URL
setAlwaysOnTop(v: boolean): Promise<void>
setLoginItem(v: boolean): Promise<void>
onActionState(cb: (e: ActionStateEvent) => void): () => void
```

## Testing (TDD, mandatory)

Vitest. Units: config store (load/save/migrate/corrupt), runner state machine (mocked `child_process` — start/output/exit/kill/tree-kill escalation), reorder + grid-shrink logic, icon cache, letter-tile derivation. React Testing Library: key state rendering (all 5 states), modal validation/conditional fields, activity panel. Acceptance checklist (below) verified manually in the running app at the end.

## Implementation execution requirements

Implementation is performed by an **agent team, in phases**. Within every phase TDD roles are split across different agents:

1. **Test-writer agent** writes failing tests from this spec (never sees implementation).
2. Orchestrator verifies the tests fail for the right reason.
3. A **separate implementer agent** writes the minimum code to make them pass (briefed with tests + spec, not allowed to modify tests).
4. Orchestrator verifies green + reviews the diff before the next phase.

Suggested phase seams (final breakdown belongs to the implementation plan): scaffold/security shell → config store → renderer UI port (against a mocked `deck` API) → IPC/preload contract → runner → icons → buttons/groups/reorder behaviors → window chrome/quit flow → README + manual acceptance pass.

## Error handling summary

| Failure | Behavior |
|---|---|
| Corrupt config JSON | Back up file, start with defaults |
| Spawn error | Failed state, exit −1, message in log, toast |
| Icon extraction fails | Letter-tile fallback, non-fatal |
| Stop ignored (SIGTERM) | SIGKILL after 3 s |
| Quit with running actions | Confirm dialog before killing |

## Out of scope (v1)

Global keyboard shortcuts · per-action parallel runs · system tray · always-on-top compact mode beyond the toggle · import/export config · full emoji picker (12-grid only) · free accent color picker (6 swatches only).

## Acceptance checklist

1. Add a button that runs a shell script; clicking executes it.
2. Add a button that opens a file; key auto-shows the file's real OS icon.
3. Add a button for an application; icon auto-extracted the same way.
4. Override any icon with an image, emoji, or colored letter tile.
5. Edit, duplicate, delete, and drag-reorder buttons.
6. Layout, buttons, and icons survive an app restart.
7. Failing command: red flash, toast, persistent red dot, inspectable output.
8. Running command: pulsing glow, status dot, live elapsed timer, top-bar running count.
9. Pressing a running key kills the entire process tree (verified with an `npm run dev`-style command spawning children).
10. Activity panel lists every running action with live output and working per-action stop buttons.

## README deliverable

Run & package instructions (electron-builder), config + icon-cache locations (`userData`), platform caveats (Linux icon extraction, terminal handoff differences).
