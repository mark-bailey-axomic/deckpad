import { describe, expect, it, vi } from 'vitest';
import { broadcastToWebContents } from './broadcast';

const wc = (destroyed = false) => ({ isDestroyed: () => destroyed, send: vi.fn() });

describe('broadcastToWebContents', () => {
  it('sends to every live target', () => {
    const a = wc();
    const b = wc();
    broadcastToWebContents([a, b], 'chan', { x: 1 });
    expect(a.send).toHaveBeenCalledWith('chan', { x: 1 });
    expect(b.send).toHaveBeenCalledWith('chan', { x: 1 });
  });

  it('skips destroyed targets', () => {
    const dead = wc(true);
    const live = wc();
    broadcastToWebContents([dead, live], 'chan', 1);
    expect(dead.send).not.toHaveBeenCalled();
    expect(live.send).toHaveBeenCalledWith('chan', 1);
  });
});
