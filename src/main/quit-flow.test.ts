import { describe, expect, it, vi } from 'vitest';
import { handleQuitRequest, type QuitDeps } from './quit-flow';

function deps(over: Partial<QuitDeps> = {}): QuitDeps & { killAll: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn> } {
  return {
    runningCount: () => 0,
    confirm: vi.fn().mockReturnValue(true),
    killAll: vi.fn(),
    ...over
  } as never;
}

describe('handleQuitRequest', () => {
  it('quits immediately when nothing is running (no dialog)', () => {
    const d = deps();
    expect(handleQuitRequest(d)).toBe('quit');
    expect(d.confirm).not.toHaveBeenCalled();
    expect(d.killAll).not.toHaveBeenCalled();
  });

  it('with running actions: confirm → kill all trees → quit', () => {
    const d = deps({ runningCount: () => 2 });
    expect(handleQuitRequest(d)).toBe('quit');
    expect(d.confirm).toHaveBeenCalledWith(2);
    expect(d.killAll).toHaveBeenCalled();
  });

  it('with running actions: cancel → no kill, no quit', () => {
    const d = deps({ runningCount: () => 1 });
    d.confirm.mockReturnValue(false);
    expect(handleQuitRequest(d)).toBe('cancel');
    expect(d.killAll).not.toHaveBeenCalled();
  });
});
