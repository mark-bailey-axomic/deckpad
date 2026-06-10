import { describe, expect, it, vi } from 'vitest';
import { createMockDeck } from './deck-mock';
import type { ActionStateEvent } from '@shared/types';

describe('createMockDeck', () => {
  it('serves spec-default config and round-trips saveConfig', async () => {
    const deck = createMockDeck();
    const cfg = await deck.getConfig();
    expect(cfg.grid).toEqual({ cols: 4, rows: 3 });
    cfg.settings.accent = '#22D3EE';
    await deck.saveConfig(cfg);
    expect((await deck.getConfig()).settings.accent).toBe('#22D3EE');
  });

  it('emits started → output → exited(0) for runAction', async () => {
    vi.useFakeTimers();
    const deck = createMockDeck();
    const events: ActionStateEvent[] = [];
    deck.onActionState((e) => events.push(e));
    void deck.runAction('b1');
    await vi.runAllTimersAsync();
    expect(events.map((e) => e.type)).toEqual(['started', 'output', 'exited']);
    expect(events[2]).toMatchObject({ type: 'exited', buttonId: 'b1', code: 0 });
    vi.useRealTimers();
  });

  it('stopAction exits the pretend process with code 0', async () => {
    vi.useFakeTimers();
    const deck = createMockDeck();
    const events: ActionStateEvent[] = [];
    deck.onActionState((e) => events.push(e));
    void deck.runAction('b1');
    await vi.advanceTimersByTimeAsync(600); // started fired, still "running"
    void deck.stopAction('b1');
    await vi.runAllTimersAsync();
    expect(events.at(-1)).toMatchObject({ type: 'exited', buttonId: 'b1' });
    vi.useRealTimers();
  });

  it('onActionState returns an unsubscribe function', async () => {
    vi.useFakeTimers();
    const deck = createMockDeck();
    const cb = vi.fn();
    const off = deck.onActionState(cb);
    off();
    void deck.runAction('b1');
    await vi.runAllTimersAsync();
    expect(cb).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
