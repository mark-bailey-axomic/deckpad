import { useCallback, useEffect, useRef, useState } from 'react';
import { isUntracked } from '@shared/buttons';
import { OUTPUT_RING_CAPACITY, RUNNING_REVEAL_MS } from '@shared/constants';
import type { ActionStateEvent, Button, DeckApi, KeyRuntime } from '@shared/types';

export const SUCCESS_FLASH_MS = 850; // prototype flash timings
export const FAILED_FLASH_MS = 650;
export const UNTRACKED_FLASH_MS = 600;

export interface FailInfo {
  buttonId: string;
  exit: number;
}

const IDLE: KeyRuntime = { state: 'idle', log: [], failedDot: false };

export function useActionStates(deck: DeckApi, onFail: (f: FailInfo) => void) {
  const [runtimes, setRuntimes] = useState<ReadonlyMap<string, KeyRuntime>>(new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  const update = useCallback((id: string, fn: (prev: KeyRuntime) => KeyRuntime) => {
    setRuntimes((m) => {
      const next = new Map(m);
      next.set(id, fn(next.get(id) ?? IDLE));
      return next;
    });
  }, []);

  const setTimer = useCallback((id: string, ms: number, fn: () => void) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(fn, ms));
  }, []);

  // press() needs the current state without re-creating the callback per render.
  const runtimesRef = useRef(runtimes);
  runtimesRef.current = runtimes;

  const press = useCallback((button: Button) => {
    const id = button.id;
    const current = runtimesRef.current.get(id);
    if (current?.state === 'running') {
      // Press-while-running = stop; main flips it on the same channel. Keep visual state.
      void deck.runAction(id);
      return;
    }
    if (current?.state === 'launching') return;
    update(id, () => ({ state: 'launching', log: [], failedDot: false }));
    if (isUntracked(button)) {
      setTimer(id, UNTRACKED_FLASH_MS, () => update(id, (p) => ({ ...p, state: 'idle' })));
    }
    void deck.runAction(id);
  }, [deck, setTimer, update]);

  const stop = useCallback((id: string) => {
    void deck.stopAction(id);
  }, [deck]);

  useEffect(() => {
    void deck.getRunning().then((snaps) => {
      snaps.forEach((s) =>
        // A late snapshot must not resurrect a run that already settled (success/failed/etc.).
        update(s.buttonId, (prev) =>
          prev.state === 'idle'
            ? { state: 'running', startedAt: s.startedAt, log: s.output, failedDot: false }
            : prev
        )
      );
    });

    const off = deck.onActionState((e: ActionStateEvent) => {
      if (e.type === 'started') {
        update(e.buttonId, (p) => ({ ...p, state: 'launching', startedAt: e.startedAt, failedDot: false }));
        setTimer(e.buttonId, RUNNING_REVEAL_MS, () =>
          update(e.buttonId, (p) => (p.state === 'launching' ? { ...p, state: 'running' } : p))
        );
      } else if (e.type === 'output') {
        update(e.buttonId, (p) => {
          const lines = e.chunk.split('\n').filter((l) => l.length > 0);
          const log = [...p.log, ...lines];
          return { ...p, log: log.length > OUTPUT_RING_CAPACITY ? log.slice(-OUTPUT_RING_CAPACITY) : log };
        });
      } else {
        clearTimeout(timers.current.get(e.buttonId));
        if (e.stopped) {
          // Deliberate user-initiated stop: go directly to idle, no failure UI
          update(e.buttonId, (p) => ({ ...p, state: 'idle', startedAt: undefined, failedDot: p.failedDot }));
        } else if (e.code === 0) {
          update(e.buttonId, (p) => ({ ...p, state: 'success', ranFor: e.ranFor }));
          setTimer(e.buttonId, SUCCESS_FLASH_MS, () =>
            update(e.buttonId, (p) => ({ ...p, state: 'idle', startedAt: undefined }))
          );
        } else {
          update(e.buttonId, (p) => ({ ...p, state: 'failed', failedDot: true, exit: e.code, ranFor: e.ranFor }));
          onFailRef.current({ buttonId: e.buttonId, exit: e.code });
          setTimer(e.buttonId, FAILED_FLASH_MS, () =>
            update(e.buttonId, (p) => ({ ...p, state: 'idle', startedAt: undefined }))
          );
        }
      }
    });
    const pending = timers.current;
    return () => {
      off();
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck]);

  return { runtimes, press, stop };
}
