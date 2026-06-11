import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutputBatcher } from './output-batcher';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('OutputBatcher', () => {
  it('coalesces pushes within 50 ms into one flush', () => {
    const flush = vi.fn();
    const b = new OutputBatcher(50, flush);
    b.push('a');
    b.push('b');
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith('ab');
  });

  it('starts a new window after a flush', () => {
    const flush = vi.fn();
    const b = new OutputBatcher(50, flush);
    b.push('a');
    vi.advanceTimersByTime(50);
    b.push('b');
    vi.advanceTimersByTime(50);
    expect(flush).toHaveBeenNthCalledWith(2, 'b');
  });

  it('dispose() flushes pending output immediately and cancels the timer', () => {
    const flush = vi.fn();
    const b = new OutputBatcher(50, flush);
    b.push('tail');
    b.dispose();
    expect(flush).toHaveBeenCalledWith('tail');
    vi.advanceTimersByTime(100);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('push after dispose is dropped: flush callback never fires', () => {
    const flush = vi.fn();
    const b = new OutputBatcher(50, flush);
    b.dispose();
    b.push('x');
    vi.advanceTimersByTime(50);
    expect(flush).not.toHaveBeenCalled();
  });
});
