import { DEFAULT_ACCENT, DEFAULT_GRID } from '@shared/constants';
import type { ActionStateEvent, Config, DeckApi } from '@shared/types';

function mockDefaultConfig(): Config {
  const { cols, rows } = DEFAULT_GRID;
  return {
    version: 1,
    grid: { cols, rows },
    settings: {
      accent: DEFAULT_ACCENT,
      surface: 'near-black',
      showLabels: true,
      launchStartup: false,
      alwaysOnTop: false,
      settingsInWindow: false,
      activityInWindow: false
    },
    groups: [{ id: 'mock-group', name: 'Actions', slots: Array(cols * rows).fill(null) }]
  };
}

/** Dev/test stand-in for the preload bridge. Pretend runs: start at 200 ms, one output line, exit 0 at 2 s. */
export function createMockDeck(): DeckApi & { __reset(): void } {
  let config = mockDefaultConfig();
  const listeners = new Set<(e: ActionStateEvent) => void>();
  const running = new Map<string, { startedAt: number; exitTimer: ReturnType<typeof setTimeout> }>();
  const emit = (e: ActionStateEvent) => listeners.forEach((cb) => cb(e));

  const finish = (id: string, code: number) => {
    const run = running.get(id);
    if (!run) return;
    clearTimeout(run.exitTimer);
    running.delete(id);
    emit({ type: 'exited', buttonId: id, code, ranFor: Date.now() - run.startedAt });
  };

  return {
    platform: 'darwin',
    getConfig: () => Promise.resolve(structuredClone(config)),
    saveConfig: (cfg) => {
      config = structuredClone(cfg);
      return Promise.resolve();
    },
    runAction: (id) => {
      if (running.has(id)) {
        finish(id, 0);
        return Promise.resolve();
      }
      setTimeout(() => {
        const startedAt = Date.now();
        const exitTimer = setTimeout(() => finish(id, 0), 1800);
        running.set(id, { startedAt, exitTimer });
        emit({ type: 'started', buttonId: id, startedAt });
        setTimeout(() => emit({ type: 'output', buttonId: id, chunk: '[mock] working…\n' }), 100);
      }, 200);
      return Promise.resolve();
    },
    stopAction: (id) => {
      finish(id, 0);
      return Promise.resolve();
    },
    getRunning: () =>
      Promise.resolve([...running.entries()].map(([buttonId, r]) => ({ buttonId, startedAt: r.startedAt, output: [] }))),
    pickFile: () => Promise.resolve(null),
    extractIcon: () => Promise.resolve(null),
    setAlwaysOnTop: () => Promise.resolve(),
    setLoginItem: () => Promise.resolve(),
    onActionState: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    openDialog: async () => 'mock-dialog',
    getDialogPayload: async () => null,
    sendDialogMessage: async () => undefined,
    closeDialog: async () => undefined,
    updateDialog: async () => undefined,
    onDialogMessage: () => () => undefined,
    onDialogUpdate: () => () => undefined,
    /** Test helper: cancel all pending timers and clear the running map. */
    __reset() {
      for (const { exitTimer } of running.values()) clearTimeout(exitTimer);
      running.clear();
    }
  };
}
