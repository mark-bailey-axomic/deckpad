import { describe, expect, it, vi } from 'vitest';
import { broadcastToWebContents, liveWebContents } from './broadcast';

const wc = (destroyed = false) => ({ isDestroyed: () => destroyed, send: vi.fn() });

describe('liveWebContents', () => {
  it('filters out destroyed windows without accessing their webContents', () => {
    const liveWc = { isDestroyed: () => false, send: vi.fn() };
    const destroyedWindow = {
      isDestroyed: () => true,
      get webContents(): never {
        throw new Error('webContents accessed on destroyed window');
      }
    };
    const liveWindow = { isDestroyed: () => false, webContents: liveWc };
    expect(() => liveWebContents([destroyedWindow, liveWindow])).not.toThrow();
    expect(liveWebContents([destroyedWindow, liveWindow])).toEqual([liveWc]);
  });

  it('maps all live windows to their webContents', () => {
    const wc1 = { isDestroyed: () => false, send: vi.fn() };
    const wc2 = { isDestroyed: () => false, send: vi.fn() };
    const w1 = { isDestroyed: () => false, webContents: wc1 };
    const w2 = { isDestroyed: () => false, webContents: wc2 };
    expect(liveWebContents([w1, w2])).toEqual([wc1, wc2]);
  });
});

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
