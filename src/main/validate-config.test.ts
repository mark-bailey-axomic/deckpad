import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate-config';
import { defaultConfig } from './config-store';

describe('validateConfig', () => {
  it('accepts the default config', () => {
    expect(validateConfig(defaultConfig())).toBe(true);
  });

  it('rejects non-objects, wrong version, missing groups', () => {
    expect(validateConfig(null)).toBe(false);
    expect(validateConfig('x')).toBe(false);
    expect(validateConfig({ ...defaultConfig(), version: 2 })).toBe(false);
    expect(validateConfig({ ...defaultConfig(), groups: [] })).toBe(false);
  });

  it('rejects out-of-range grids', () => {
    const cfg = defaultConfig();
    expect(validateConfig({ ...cfg, grid: { cols: 7, rows: 3 } })).toBe(false);
    expect(validateConfig({ ...cfg, grid: { cols: 4, rows: 1 } })).toBe(false);
  });

  it('rejects slot arrays that do not match cols·rows', () => {
    const cfg = defaultConfig();
    cfg.groups[0].slots = Array(5).fill(null);
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects malformed buttons and accepts valid ones', () => {
    const cfg = defaultConfig();
    cfg.groups[0].slots[0] = { id: 'b1', label: 'X', type: 'command', command: 'true', icon: { kind: 'auto' } };
    expect(validateConfig(cfg)).toBe(true);
    cfg.groups[0].slots[1] = { id: 'b2', label: 'Y', type: 'nope', icon: { kind: 'auto' } } as never;
    expect(validateConfig(cfg)).toBe(false);
  });
});
