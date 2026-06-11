export interface QuitDeps {
  runningCount: () => number;
  /** Show the blocking confirm dialog; true = user chose Quit. */
  confirm: (runningCount: number) => boolean;
  killAll: () => void;
}

export function handleQuitRequest(deps: QuitDeps): 'quit' | 'cancel' {
  const n = deps.runningCount();
  if (n === 0) return 'quit';
  if (!deps.confirm(n)) return 'cancel';
  deps.killAll();
  return 'quit';
}
