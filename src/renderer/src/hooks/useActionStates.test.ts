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
});
