# Dialogs as Separate Windows — Design

**Date:** 2026-06-22
**Status:** Approved (design)

## Summary

Move deckpad's dialog surfaces out of the single main window and into real OS
`BrowserWindow`s. The **EditModal** always opens as its own window. **Settings**
and **ActivityPanel** each gain a persisted toggle to open as a window or keep
the current in-window sheet/panel. All dialog windows are frameless and carry
their own header + close affordance.

## Goals

- EditModal renders as a frameless, modal child window attached to the main window.
- Settings and ActivityPanel can each be opened as a window via a new setting,
  falling back to today's in-window behavior when the setting is off.
- Reuse the existing `EditModal`, `Settings`, and `ActivityPanel` React
  components with minimal change — swap props-from-parent for data-over-IPC.
- Keep the windowed ActivityPanel live (action-state updates) while independent.

## Non-goals

- ContextMenu and Toast stay as in-window overlays (poor fit for OS windows).
- No change to the native Electron dialogs (file picker, quit confirmation).
- No new UI component library; keep the custom CSS design system.

## Window behavior

| View | Window type | Blocking? | Chrome |
|---|---|---|---|
| EditModal | Modal child (attached to main, `modal: true`, `parent: mainWindow`) | Blocks main window | Frameless |
| Settings (window mode) | Modal child (attached, `modal: true`) | Blocks main window | Frameless |
| ActivityPanel (window mode) | Independent (non-modal, non-blocking) | Main window stays interactive | Frameless |

All windows are frameless (`frame: false`) and render their own header with a
close control and drag region, consistent with the frameless main window.

## Architecture (Approach A — shared dialog renderer, routed by param)

One additional renderer entry, `dialog.html`, mounts a small router that reads
`?view=edit|settings|activity` and renders the matching component inside a shared
frameless window shell (header + close + theme application). electron-vite is
configured with this second renderer input alongside the existing main entry.

The main process owns window creation, lifecycle, and the payload/result
plumbing. The dialog renderer is a thin host: read params → fetch payload →
render existing component → relay events/results back over IPC.

## Data flow & IPC

New preload bridge methods (added to `window.deck`):

- `openDialog(view, payload): Promise<string>` — main creates the window (type per the
  table above), stashes `payload` keyed by a generated `id` token, loads
  `dialog.html?view=<view>&id=<id>`.
- `getDialogPayload(id): Promise<unknown>` — called by the dialog renderer on mount.
- `sendDialogMessage(id, message): Promise<void>` — sends a message from the dialog to
  main (forwarded to the main window as `IPC.dialogMessage` `{ view, message }`).
  Used for all actions: save, cancel, settings-change, activity-stop.
- `closeDialog(id): Promise<void>` — terminal actions (save/cancel) call this after
  `sendDialogMessage` to close the window.
- `updateDialog(view, payload): Promise<void>` — main pushes payload updates to an
  open dialog window.

Main forwards `patch`/`stop`/`save` to the main window (via an event) or to the
existing config/action logic, reusing the current handlers (`commit`,
`saveConfig`, stop-action). Settings live-applies each change exactly as the
in-window sheet does today (`onChange(patch)`), rather than batching on close.

### Opening flow

1. App.tsx, where it currently sets local state to open a dialog, instead calls
   `deck.openDialog(view, payload)`.
   - edit payload: `{ draft, index, accent, surface }`
   - settings payload: `{ settings, accent, surface }`
   - activity payload: `{ items, now, accent, surface }`
2. Dialog window mounts → `getDialogPayload(id)` → renders the component.
3. Terminal actions (save/cancel) call `sendDialogMessage(id, message)` then
   `closeDialog(id)`; non-terminal actions (settings-change, activity-stop) call
   `sendDialogMessage(id, message)` only.

### Live updates into windows

`ActionStateEvent` is currently sent only to `mainWindow.webContents`. Change the
emit to **broadcast** to every tracked window's `webContents` so an independent
ActivityPanel window stays live. The existing `deck.onActionState()` bridge works
per-window unchanged, so the Activity window subscribes the same way.

Theme/data updates are pushed to open windows via `updateDialog(view, payload)` →
`IPC.dialogUpdate` → `onDialogUpdate(cb)` in the dialog renderer, so frameless windows
restyle live.

### File picker

`EditModal`'s `pickFile` / `extractIcon` already go through IPC to the main
process; they work unchanged from any window.

## Window lifecycle

- Main tracks open dialog windows in a map keyed by `view` (and `id`).
- Re-triggering a view that is already open **focuses** the existing window
  instead of opening a second.
- Modal children close automatically with the parent (Electron). The independent
  Activity window is also closed when the main window closes (tracked + closed
  explicitly).
- Closing a window clears its tracking entry and any stashed payload.

## New settings

Persisted in config alongside the existing Settings object:

- `settingsInWindow: boolean` (default `false`)
- `activityInWindow: boolean` (default `false`)

Surfaced as toggles in the Settings UI. When off, current in-window behavior is
unchanged. When on, App.tsx routes the open through `deck.openDialog(...)`.
The Settings toggle lives inside Settings itself; flipping it takes effect on the
next open (acceptable).

## Theming & sizing

- Dialog payload carries current `accent`/`surface`; the window shell applies the
  matching CSS variables on mount, and live theme patches keep it in sync.
- Fixed per-view sizes: edit ≈ current modal size; settings/activity ≈ their panel
  dimensions. Centered on or offset from the parent.

## Affected files (anticipated)

- `electron.vite.config.*` — add `dialog.html` renderer input.
- `src/renderer/dialog.html` + `src/renderer/src/dialog/*` — new dialog host/router/shell.
- `src/renderer/src/App.tsx` — route dialog opens through `openDialog`; remove
  inline EditModal render (and Settings/Activity when in window mode).
- `src/renderer/src/components/{EditModal,Settings,ActivityPanel}.tsx` — accept
  data via the dialog host instead of parent props (thin adapter; components
  largely unchanged).
- `src/main/index.ts`, `src/main/ipc.ts` — dialog window creation, lifecycle,
  payload store, broadcast of action-state/theme.
- `src/main/window-options.ts` / sizing — per-view frameless window options.
- `src/preload/index.ts` — new bridge methods.
- `src/shared/constants.ts` — new IPC channels.

## Testing

- Unit: payload store (stash/fetch/clear), window-options per view, broadcast
  fan-out targets all tracked windows.
- Integration/behavioral: open edit window → save persists to main; cancel
  discards; Settings window patch live-applies; Activity window receives live
  action-state while main window stays interactive; re-trigger focuses existing
  window; main-window close tears down dialog windows.
- Toggle behavior: settings off → in-window; on → window.

## Risks / open questions

- Frameless windows need explicit drag regions + close affordance per view.
- Independent Activity window must not leak (lifecycle teardown verified by test).
- Settings-toggle-inside-settings UX (next-open semantics) accepted as fine.
