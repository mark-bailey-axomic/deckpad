import { describe, expect, it } from 'vitest';
import { baseWindowOptions } from './window-options';

describe('baseWindowOptions', () => {
  const opts = baseWindowOptions('/tmp/preload.js');

  it('enforces the spec security shell', () => {
    expect(opts.webPreferences?.contextIsolation).toBe(true);
    expect(opts.webPreferences?.sandbox).toBe(true);
    expect(opts.webPreferences?.nodeIntegration).toBe(false);
    expect(opts.webPreferences?.preload).toBe('/tmp/preload.js');
  });

  it('is frameless and not user-resizable', () => {
    expect(opts.frame).toBe(false);
    expect(opts.resizable).toBe(false);
    expect(opts.show).toBe(false);
  });
});
