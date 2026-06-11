import { describe, expect, it } from 'vitest';
import { windowSizeForGrid } from './window-size';

describe('windowSizeForGrid (spec formula)', () => {
  // winW = 44 + cols·104 + (cols−1)·14 ; winH = 52 + 40 + 44 + rows·104 + (rows−1)·14
  it('default 4×3 grid', () => {
    expect(windowSizeForGrid(4, 3)).toEqual({ width: 44 + 4 * 104 + 3 * 14, height: 52 + 40 + 44 + 3 * 104 + 2 * 14 });
    expect(windowSizeForGrid(4, 3)).toEqual({ width: 502, height: 476 });
  });
  it('extremes 2×2 and 6×5', () => {
    expect(windowSizeForGrid(2, 2)).toEqual({ width: 266, height: 358 });
    expect(windowSizeForGrid(6, 5)).toEqual({ width: 738, height: 712 });
  });
});
