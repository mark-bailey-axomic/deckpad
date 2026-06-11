# DeckPad

A cross-platform (macOS/Windows, graceful Linux) Electron Stream Deck–style launcher. A compact dark window shows a grid of large square keys; each key runs a user-defined shell command, opens a file, or launches an app — with live process state, output capture, and icon auto-extraction.

## Run

```sh
npm install && npm start   # electron-vite dev server (hot-reload)
npm test                   # Vitest — 278 tests (npx vitest run)
npm run typecheck          # tsc --noEmit
```

## Package

```sh
npm run package            # electron-vite build + electron-builder → dist/
```

Per-platform targets: **macOS** (default DMG), **Windows** (NSIS installer), **Linux** (AppImage). Output lands in `dist/`.

## Config & data locations

DeckPad stores everything under Electron's `userData` directory:

| Platform | Path |
|----------|------|
| macOS    | `~/Library/Application Support/deckpad/` |
| Windows  | `%APPDATA%\deckpad\` |
| Linux    | `~/.config/deckpad/` |

**`config.json`** — versioned JSON with all groups, buttons, and settings. Atomic writes (write to a temp file then rename). If the file is corrupt on load, it is backed up as `config.json.bak-<timestamp>` and default config is regenerated.

**`icons/`** — PNG icon cache.
- `<buttonId>.png` — auto-extracted from the target file/app via `app.getFileIcon`.
- `<buttonId>-custom.<ext>` — user-supplied image (png/jpg/svg/ico), copied on save.

Icons are served to the sandboxed renderer via a custom `deckicon://` protocol scoped to the icons directory.

## Platform caveats

**Linux icon extraction** — `app.getFileIcon` often returns an empty or generic image on Linux. Keys fall back to a letter tile (uppercase first letters of the first two words, one of 8 tile colors) automatically.

**Terminal handoff** (`showTerminal: true` commands) — handed off to the system terminal, not tracked:
- macOS: `osascript` → Terminal.app
- Windows: `start cmd /k <command>`
- Linux: tries `x-terminal-emulator` → `gnome-terminal` → `konsole` → `xterm` in order

**Bare Linux binaries** — `shell.openPath` cannot launch executables on Linux; they are spawned detached instead.

**Linux WMs** — some window managers ignore programmatic resize requests when the window is marked non-resizable; the window may not resize when the grid size changes.

## Architecture

Three TypeScript targets built by electron-vite:

- **`src/main`** — Node.js/Electron main process: config store, process runner, icon extraction, IPC handlers, window management, quit flow.
- **`src/preload`** — thin `contextBridge` shim that exposes the `deck` API to the renderer without leaking Node APIs.
- **`src/renderer`** — React 19 UI: fully sandboxed (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`). Communicates with main exclusively through the `deck` API (invoke/on) over named IPC channels.

Shared types and constants (`src/shared/`) are the single source of truth for both processes.
