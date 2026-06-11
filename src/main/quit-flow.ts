export interface KillAllOptions {
  /** Immediate SIGKILL (no SIGTERM grace) — used when the app is going away now. */
  force?: boolean;
}

export interface QuitDeps {
  runningCount: () => number;
  /** Show the blocking confirm dialog; true = user chose Quit. */
  confirm: (runningCount: number) => boolean;
  killAll: (opts?: KillAllOptions) => void;
}

export interface WindowCloseDeps extends QuitDeps {
  /** Cancel the window close (keeps the window open). */
  preventDefault: () => void;
  /** Proceed with app shutdown after the forced kill. */
  initiateQuit: () => void;
}

export function handleQuitRequest(deps: QuitDeps): 'quit' | 'cancel' {
  const n = deps.runningCount();
  if (n === 0) return 'quit';
  if (!deps.confirm(n)) return 'cancel';
  deps.killAll({ force: true });
  return 'quit';
}

export function handleWindowCloseRequest(deps: WindowCloseDeps): void {
  const n = deps.runningCount();
  if (n === 0) return; // nothing running: allow the close
  if (!deps.confirm(n)) {
    deps.preventDefault();
    return;
  }
  deps.killAll({ force: true });
  deps.initiateQuit();
}
