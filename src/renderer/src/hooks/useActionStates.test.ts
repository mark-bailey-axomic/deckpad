import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActionStates } from './useActionStates';
import type { ActionStateEvent, Button, DeckApi, RunningSnapshot } from '@shared/types';

const cmdButton: Button = { id: 'b1', label: 'X', type: 'command', command: 'sleep 5', icon: { kind: 'auto' } };
const fileButton: Button = { id: 'b2', label: 'Y', type: 'file', path: '/tmp/y.txt', icon: { kind: 'auto' } };

function fakeDeck(snapshots: RunningSnapshot[] = []) {
  let emit: (e: ActionStateEvent) => void = () => {};
  const deck = {
    platform: 'darwin',
    runAction: vi.fn().mockResolvedValue(undefined),
    stopAction: vi.fn().mockResolvedValue(undefined),
    getRunning: vi.fn().mockResolvedValue(snapshots),
    onActionState: vi.fn((cb: (e: ActionStateEvent) => void) => { emit = cb; return () => {}; })
  } as unknown as DeckApi;
  return { deck, emit: (e: ActionStateEvent) => emit(e) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useActionStates', () => {
  it('press → launching, started → running after the 300 ms reveal', async () => {
    const { deck, emit } = fakeDeck();
    const { result } = renderHook(() => useActionStates(deck, () => {}));
    await act(async () => { result.current.press(cmdButton); });
    expect(result.current.runtimes.get('b1')?.state).toBe('launching');
    expect(deck.runAction).toHaveBeenCalledWith('b1');
    act(() => emit({ type: 'started', buttonId: 'b1', startedAt: 1000 }));
    expect(result.current.runtimes.get('b1')?.state).toBe('launching'); // still inside reveal window
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.runtimes.get('b1')?.state).toBe('running');
    expect(result.current.runtimes.get('b1')?.startedAt).toBe(1000);
  });

  it('fast exit (<300 ms) skips running: launching → success flash → idle', async () => {
    const { deck, emit } = fakeDeck();
    const { result } = renderHook(() => useActionStates(deck, () => {}));
    await act(async () => { result.current.press(cmdButton); });
    act(() => emit({ type: 'started', buttonId: 'b1', startedAt: 1000 }));
    act(() => emit({ type: 'exited', buttonId: 'b1', code: 0, ranFor: 120 }));
    expect(result.current.runtimes.get('b1')?.state).toBe('success');
    act(() => vi.advanceTimersByTime(850));
    expect(result.current.runtimes.get('b1')?.state).toBe('idle');
    expect(result.current.runtimes.get('b1')?.failedDot).toBe(false);
  });

  it('nonzero exit → failed flash, persistent failedDot, onFail fired, then idle keeps the dot', async () => {
    const onFail = vi.fn();
    const { deck, emit } = fakeDeck();
    const { result } = renderHook(() => useActionStates(deck, onFail));
    await act(async () => { result.current.press(cmdButton); });
    act(() => emit({ type: 'started', buttonId: 'b1', startedAt: 1000 }));
    act(() => emit({ type: 'exited', buttonId: 'b1', code: 2, ranFor: 80 }));
    expect(result.current.runtimes.get('b1')?.state).toBe('failed');
    expect(onFail).toHaveBeenCalledWith({ buttonId: 'b1', exit: 2 });
    act(() => vi.advanceTimersByTime(650));
    const rt = result.current.runtimes.get('b1')!;
    expect(rt.state).toBe('idle');
    expect(rt.failedDot).toBe(true);
    expect(rt.exit).toBe(2);
  });

  it('pressing again clears the failedDot and old log', async () => {
    const { deck, emit } = fakeDeck();
    const { result } = renderHook(() => useActionStates(deck, () => {}));
    await act(async () => { result.current.press(cmdButton); });
    act(() => emit({ type: 'started', buttonId: 'b1', startedAt: 1 }));
    act(() => emit({ type: 'output', buttonId: 'b1', chunk: 'old\n' }));
    act(() => emit({ type: 'exited', buttonId: 'b1', code: 1, ranFor: 50 }));
    act(() => vi.advanceTimersByTime(650));
    await act(async () => { result.current.press(cmdButton); });
    const rt = result.current.runtimes.get('b1')!;
    expect(rt.failedDot).toBe(false);
    expect(rt.log).toEqual([]);
  });

  it('output chunks append split lines, capped at 500', async () => {
    const { deck, emit } = fakeDeck();
    const { result } = renderHook(() => useActionStates(deck, () => {}));
    await act(async () => { result.current.press(cmdButton); });
    act(() => emit({ type: 'started', buttonId: 'b1', startedAt: 1 }));
    act(() => emit({ type: 'output', buttonId: 'b1', chunk: 'a\nb\n' }));
    expect(result.current.runtimes.get('b1')?.log).toEqual(['a', 'b']);
    act(() => {
      for (let i = 0; i < 60; i++) {
        emit({ type: 'output', buttonId: 'b1', chunk: Array.from({ length: 10 }, (_, j) => `l${i}-${j}`).join('\n') + '\n' });
      }
    });
    const log = result.current.runtimes.get('b1')!.log;
    expect(log).toHaveLength(500);
    expect(log.at(-1)).toBe('l59-9');
  });

  it('untracked press (file/app/showTerminal) flashes launching then returns to idle', async () => {
    const { deck } = fakeDeck();
    const { result } = renderHook(() => useActionStates(deck, () => {}));
    await act(async () => { result.current.press(fileButton); });
    expect(result.current.runtimes.get('b2')?.state).toBe('launching');
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.runtimes.get('b2')?.state).toBe('idle');
  });

  it('pressing a running tracked key calls runAction again (main interprets as stop)', async () => {
    const { deck, emit } = fakeDeck();
    const { result } = renderHook(() => useActionStates(deck, () => {}));
    await act(async () => { result.current.press(cmdButton); });
    act(() => emit({ type: 'started', buttonId: 'b1', startedAt: 1 }));
    act(() => vi.advanceTimersByTime(300));
    await act(async () => { result.current.press(cmdButton); });
    expect(deck.runAction).toHaveBeenCalledTimes(2);
    // and the running state was NOT reset to launching by the second press
    expect(result.current.runtimes.get('b1')?.state).toBe('running');
  });

  it('hydrates from getRunning() on mount (restart resync)', async () => {
    const { deck } = fakeDeck([{ buttonId: 'b9', startedAt: 555, output: ['hello'] }]);
    const { result } = renderHook(() => useActionStates(deck, () => {}));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    const rt = result.current.runtimes.get('b9')!;
    expect(rt.state).toBe('running');
    expect(rt.startedAt).toBe(555);
    expect(rt.log).toEqual(['hello']);
  });

  // -------------------------------------------------------------------------
  // Phase 3 review findings — tests below should be RED until fixed
  // -------------------------------------------------------------------------

  it('unmount clears pending timers — vi.getTimerCount() is 0 immediately after unmount', async () => {
    const { deck, emit } = fakeDeck();
    const { result, unmount } = renderHook(() => useActionStates(deck, () => {}));

    // Start a press so the RUNNING_REVEAL_MS timer is armed
    await act(async () => { result.current.press(cmdButton); });
    act(() => emit({ type: 'started', buttonId: 'b1', startedAt: Date.now() }));

    // The reveal timer should be pending right now
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    // Unmount — the hook must cancel all its pending timers
    unmount();

    // After unmount, no timers should remain — this is the contract under test
    expect(vi.getTimerCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Phase 4 review — adversarial IPC event-ordering contract tests
  // -------------------------------------------------------------------------

  it('started event delivered before runAction invoke resolves — key reaches running', async () => {
    // Simulate IPC reality: the main process can fire 'started' synchronously on the
    // ipcRenderer event loop BEFORE the invoke() promise resolves in the renderer.
    let resolveRun!: () => void;
    let emitStarted!: (e: ActionStateEvent) => void;

    const deck = {
      platform: 'darwin',
      runAction: vi.fn().mockImplementation(() => new Promise<void>((res) => { resolveRun = res; })),
      stopAction: vi.fn().mockResolvedValue(undefined),
      getRunning: vi.fn().mockResolvedValue([]),
      onActionState: vi.fn((cb: (e: ActionStateEvent) => void) => { emitStarted = cb; return () => {}; })
    } as unknown as DeckApi;

    const { result } = renderHook(() => useActionStates(deck, () => {}));

    // Start the press — runAction is now pending (not yet resolved)
    act(() => { result.current.press(cmdButton); });
    expect(result.current.runtimes.get('b1')?.state).toBe('launching');

    // Emit 'started' synchronously before the runAction promise resolves
    act(() => emitStarted({ type: 'started', buttonId: 'b1', startedAt: 2000 }));

    // Still in the 300 ms reveal window
    expect(result.current.runtimes.get('b1')?.state).toBe('launching');

    // Resolve runAction promise AFTER started — must not clobber state
    await act(async () => { resolveRun(); });

    // No double-launch: runAction invoked exactly once
    expect(deck.runAction).toHaveBeenCalledTimes(1);

    // Advance past reveal — must reach running
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.runtimes.get('b1')?.state).toBe('running');
    expect(result.current.runtimes.get('b1')?.startedAt).toBe(2000);
  });

  it('exited without started (spawn error path) — failed state + failedDot + exit recorded', async () => {
    const onFail = vi.fn();
    const { deck, emit } = fakeDeck();
    const { result } = renderHook(() => useActionStates(deck, onFail));

    // Press to get into launching state
    await act(async () => { result.current.press(cmdButton); });
    expect(result.current.runtimes.get('b1')?.state).toBe('launching');

    // Deliver only exited (no started) — simulates spawn error path
    act(() => emit({ type: 'exited', buttonId: 'b1', code: -1, ranFor: 0 }));

    const rt = result.current.runtimes.get('b1')!;
    expect(rt.state).toBe('failed');
    expect(rt.failedDot).toBe(true);
    expect(rt.exit).toBe(-1);
    expect(onFail).toHaveBeenCalledWith({ buttonId: 'b1', exit: -1 });
  });

  it('rapid double-press within pre-start window — second press is a no-op (launching guard)', async () => {
    const { deck } = fakeDeck();
    const { result } = renderHook(() => useActionStates(deck, () => {}));

    // First press
    await act(async () => { result.current.press(cmdButton); });
    expect(result.current.runtimes.get('b1')?.state).toBe('launching');
    expect(deck.runAction).toHaveBeenCalledTimes(1);

    // Second press before any 'started' event — must be a no-op per hook contract
    await act(async () => { result.current.press(cmdButton); });

    // runAction must NOT have been called a second time
    expect(deck.runAction).toHaveBeenCalledTimes(1);

    // State must still be launching (not reset / doubled)
    expect(result.current.runtimes.get('b1')?.state).toBe('launching');

    // No extra timers from the second press
    const timersBefore = vi.getTimerCount();
    // Allow at most one timer (the untracked flash for file-type wouldn't apply here,
    // but tracked commands don't set a timer on press — only on 'started').
    // The hook sets a timer only when started arrives, so for a tracked command
    // that hasn't received 'started' yet, timer count should be 0 or 1 (untracked case).
    // For cmdButton (tracked), we expect 0 timers pending at this point.
    expect(timersBefore).toBeLessThanOrEqual(1);
  });

  it('late getRunning snapshot does not resurrect an already-exited run', async () => {
    // Control the getRunning promise so we can resolve it after the exit event
    let resolveRunning!: (snaps: import('@shared/types').RunningSnapshot[]) => void;
    const getRunningPromise = new Promise<import('@shared/types').RunningSnapshot[]>(
      (res) => { resolveRunning = res; }
    );

    let emit: (e: ActionStateEvent) => void = () => {};
    const deck = {
      platform: 'darwin',
      runAction: vi.fn().mockResolvedValue(undefined),
      stopAction: vi.fn().mockResolvedValue(undefined),
      getRunning: vi.fn().mockReturnValue(getRunningPromise),
      onActionState: vi.fn((cb: (e: ActionStateEvent) => void) => { emit = cb; return () => {}; })
    } as unknown as DeckApi;

    const { result } = renderHook(() => useActionStates(deck, () => {}));

    // Simulate: action started then exited while the snapshot was still in-flight
    act(() => emit({ type: 'started', buttonId: 'bX', startedAt: 1000 }));
    act(() => emit({ type: 'exited', buttonId: 'bX', code: 0, ranFor: 50 }));

    // bX is now 'success' (pre-flash); do NOT advance timers yet — we check before the flash
    expect(result.current.runtimes.get('bX')?.state).toBe('success');

    // Now deliver the late snapshot still listing bX as running
    await act(async () => {
      resolveRunning([{ buttonId: 'bX', startedAt: 1000, output: [] }]);
      // Let the promise microtask queue drain WITHOUT advancing the success-flash timer
      await Promise.resolve();
    });

    // bX must NOT be running — late hydration must not override the exited/success state
    expect(result.current.runtimes.get('bX')?.state).not.toBe('running');
  });
});
