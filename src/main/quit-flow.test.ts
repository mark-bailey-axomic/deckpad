import { describe, expect, it, vi } from 'vitest';
import { handleQuitRequest, handleWindowCloseRequest, type QuitDeps, type WindowCloseDeps } from './quit-flow';

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

  it('with running actions: confirm → killAll({force:true}) → quit', () => {
    const d = deps({ runningCount: () => 2 });
    expect(handleQuitRequest(d)).toBe('quit');
    expect(d.confirm).toHaveBeenCalledWith(2);
    expect(d.killAll).toHaveBeenCalledWith({ force: true });
  });

  it('with running actions: cancel → no kill, no quit', () => {
    const d = deps({ runningCount: () => 1 });
    d.confirm.mockReturnValue(false);
    expect(handleQuitRequest(d)).toBe('cancel');
    expect(d.killAll).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 8: handleWindowCloseRequest — close-intercept contract
// ---------------------------------------------------------------------------

function closeDeps(over: Partial<WindowCloseDeps> = {}): WindowCloseDeps & {
  killAll: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  preventDefault: ReturnType<typeof vi.fn>;
  initiateQuit: ReturnType<typeof vi.fn>;
} {
  return {
    runningCount: () => 0,
    confirm: vi.fn().mockReturnValue(true),
    killAll: vi.fn(),
    preventDefault: vi.fn(),
    initiateQuit: vi.fn(),
    ...over
  } as never;
}

describe('handleWindowCloseRequest', () => {
  it('0 running → allows close (no preventDefault, no initiateQuit)', () => {
    const d = closeDeps({ runningCount: () => 0 });
    handleWindowCloseRequest(d);
    expect(d.preventDefault).not.toHaveBeenCalled();
    expect(d.initiateQuit).not.toHaveBeenCalled();
    expect(d.killAll).not.toHaveBeenCalled();
  });

  it('running + user confirms → killAll({force:true}) then initiateQuit, no preventDefault', () => {
    const d = closeDeps({ runningCount: () => 3 });
    handleWindowCloseRequest(d);
    expect(d.confirm).toHaveBeenCalledWith(3);
    expect(d.killAll).toHaveBeenCalledWith({ force: true });
    expect(d.initiateQuit).toHaveBeenCalled();
    expect(d.preventDefault).not.toHaveBeenCalled();
  });

  it('running + user cancels → preventDefault called, no killAll, no initiateQuit', () => {
    const d = closeDeps({ runningCount: () => 2 });
    d.confirm.mockReturnValue(false);
    handleWindowCloseRequest(d);
    expect(d.confirm).toHaveBeenCalledWith(2);
    expect(d.preventDefault).toHaveBeenCalled();
    expect(d.killAll).not.toHaveBeenCalled();
    expect(d.initiateQuit).not.toHaveBeenCalled();
  });
});
