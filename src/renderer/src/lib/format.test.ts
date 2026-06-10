import { describe, expect, it } from 'vitest';
import { fmtElapsed } from './format';

describe('fmtElapsed', () => {
  it('formats seconds as mm:ss', () => {
    expect(fmtElapsed(0)).toBe('00:00');
    expect(fmtElapsed(7)).toBe('00:07');
    expect(fmtElapsed(754)).toBe('12:34');
  });
  it('floors fractional seconds', () => {
    expect(fmtElapsed(59.9)).toBe('00:59');
  });
});
