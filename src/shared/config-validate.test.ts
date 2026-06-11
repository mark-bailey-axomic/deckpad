import { describe, expect, it } from 'vitest';
import { validateConfig } from './config-validate';
import { defaultConfig } from '../main/config-store';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function validPopulated() {
  const cfg = defaultConfig();
  // Add a populated slot so we exercise Button validation too
  cfg.groups[0].slots[0] = {
    id: 'btn-1',
    label: 'My Button',
    type: 'command',
    command: 'echo hi',
    icon: { kind: 'letter' }
  };
  return cfg;
}

// ---------------------------------------------------------------------------
// validateConfig — rejection cases
// ---------------------------------------------------------------------------

describe('validateConfig', () => {
  // 1. non-object primitives
  it('rejects a string', () => {
    expect(validateConfig('hello')).toBe(false);
  });

  it('rejects null', () => {
    expect(validateConfig(null)).toBe(false);
  });

  it('rejects an array', () => {
    expect(validateConfig([1, 2, 3])).toBe(false);
  });

  // 2. version gate
  it('rejects version !== 1', () => {
    expect(validateConfig({ ...defaultConfig(), version: 2 })).toBe(false);
  });

  // 3. grid bounds
  it('rejects cols below GRID_LIMITS.cols.min (< 2)', () => {
    const cfg = defaultConfig();
    cfg.grid.cols = 1;
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects cols above GRID_LIMITS.cols.max (> 6)', () => {
    const cfg = defaultConfig();
    cfg.grid.cols = 7;
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects rows below GRID_LIMITS.rows.min (< 2)', () => {
    const cfg = defaultConfig();
    cfg.grid.rows = 1;
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects rows above GRID_LIMITS.rows.max (> 5)', () => {
    const cfg = defaultConfig();
    cfg.grid.rows = 6;
    expect(validateConfig(cfg)).toBe(false);
  });

  // 4. missing settings
  it('rejects missing settings', () => {
    const { settings: _s, ...rest } = defaultConfig() as any;
    expect(validateConfig(rest)).toBe(false);
  });

  it('rejects settings.accent as non-string', () => {
    const cfg = defaultConfig() as any;
    cfg.settings.accent = 42;
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects settings.surface as invalid value', () => {
    const cfg = defaultConfig() as any;
    cfg.settings.surface = 'hot-pink';
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects settings.showLabels as non-boolean', () => {
    const cfg = defaultConfig() as any;
    cfg.settings.showLabels = 'yes';
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects settings.launchStartup as non-boolean', () => {
    const cfg = defaultConfig() as any;
    cfg.settings.launchStartup = 1;
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects settings.alwaysOnTop as non-boolean', () => {
    const cfg = defaultConfig() as any;
    cfg.settings.alwaysOnTop = null;
    expect(validateConfig(cfg)).toBe(false);
  });

  // 5. groups shape
  it('rejects groups as non-array', () => {
    const cfg = defaultConfig() as any;
    cfg.groups = {};
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects groups as empty array', () => {
    const cfg = defaultConfig() as any;
    cfg.groups = [];
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a group missing id', () => {
    const cfg = defaultConfig() as any;
    delete cfg.groups[0].id;
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a group missing name', () => {
    const cfg = defaultConfig() as any;
    delete cfg.groups[0].name;
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a group missing slots', () => {
    const cfg = defaultConfig() as any;
    delete cfg.groups[0].slots;
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects slots.length !== cols * rows', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots = cfg.groups[0].slots.slice(0, 5); // wrong length
    expect(validateConfig(cfg)).toBe(false);
  });

  // 6. Button slot validation
  it('rejects a slot entry that is not null and not a valid Button (missing id)', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = { label: 'No ID', type: 'command', icon: { kind: 'auto' } };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a slot entry that is not null and not a valid Button (missing label)', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = { id: 'x', type: 'command', icon: { kind: 'auto' } };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a slot Button with invalid type', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = { id: 'x', label: 'X', type: 'script', icon: { kind: 'auto' } };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a slot Button with invalid icon.kind', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = { id: 'x', label: 'X', type: 'command', icon: { kind: 'video' } };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a slot Button with missing icon', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = { id: 'x', label: 'X', type: 'app' };
    expect(validateConfig(cfg)).toBe(false);
  });

  // 7. acceptance cases
  it('accepts defaultConfig()', () => {
    expect(validateConfig(defaultConfig())).toBe(true);
  });

  it('accepts a fully populated valid config with Buttons', () => {
    expect(validateConfig(validPopulated())).toBe(true);
  });

  it('accepts all valid icon kinds', () => {
    for (const kind of ['auto', 'letter', 'emoji', 'image'] as const) {
      const cfg = defaultConfig() as any;
      cfg.groups[0].slots[0] = { id: 'x', label: 'X', type: 'file', icon: { kind } };
      expect(validateConfig(cfg)).toBe(true);
    }
  });

  it('accepts all valid surface values', () => {
    for (const surface of ['near-black', 'charcoal', 'ink-blue'] as const) {
      const cfg = defaultConfig() as any;
      cfg.settings.surface = surface;
      expect(validateConfig(cfg)).toBe(true);
    }
  });

  it('accepts grid at boundary values (cols=2, rows=2)', () => {
    const cfg = defaultConfig();
    cfg.grid = { cols: 2, rows: 2 };
    cfg.groups[0].slots = Array(4).fill(null);
    expect(validateConfig(cfg)).toBe(true);
  });

  it('accepts grid at boundary values (cols=6, rows=5)', () => {
    const cfg = defaultConfig();
    cfg.grid = { cols: 6, rows: 5 };
    cfg.groups[0].slots = Array(30).fill(null);
    expect(validateConfig(cfg)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Phase-4 review: grid dims must be integers
  // ---------------------------------------------------------------------------

  it('rejects cols as a float (2.5)', () => {
    const cfg = defaultConfig() as any;
    cfg.grid = { cols: 2.5, rows: 4 };
    cfg.groups[0].slots = Array(10).fill(null); // pad to 2.5 * 4
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects cols as NaN', () => {
    const cfg = defaultConfig() as any;
    cfg.grid = { cols: NaN, rows: 3 };
    cfg.groups[0].slots = Array(cfg.grid.rows).fill(null);
    expect(validateConfig(cfg)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Phase-4 review: optional Button field typing
  // ---------------------------------------------------------------------------

  it('rejects a button where command is an object instead of a string', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = {
      id: 'b1',
      label: 'X',
      type: 'command',
      command: {},
      icon: { kind: 'auto' }
    };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a button where cwd is a number instead of a string', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = {
      id: 'b1',
      label: 'X',
      type: 'command',
      command: 'echo hi',
      cwd: 42,
      icon: { kind: 'auto' }
    };
    expect(validateConfig(cfg)).toBe(false);
  });

  it("rejects a button where showTerminal is the string 'yes' instead of boolean", () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = {
      id: 'b1',
      label: 'X',
      type: 'command',
      command: 'echo hi',
      showTerminal: 'yes',
      icon: { kind: 'auto' }
    };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a button where path is an array instead of a string', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = {
      id: 'b1',
      label: 'X',
      type: 'file',
      path: [],
      icon: { kind: 'auto' }
    };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a button where icon.emoji is a number instead of a string', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = {
      id: 'b1',
      label: 'X',
      type: 'command',
      command: 'echo hi',
      icon: { kind: 'emoji', emoji: 7 }
    };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a button where icon.tileColor is an object instead of a string', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = {
      id: 'b1',
      label: 'X',
      type: 'command',
      command: 'echo hi',
      icon: { kind: 'letter', tileColor: {} }
    };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('rejects a button where icon.sourcePath is a number instead of a string', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = {
      id: 'b1',
      label: 'X',
      type: 'app',
      path: '/Applications/Foo.app',
      icon: { kind: 'image', sourcePath: 1 }
    };
    expect(validateConfig(cfg)).toBe(false);
  });

  it('accepts a button with valid string icon fields', () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = {
      id: 'b1',
      label: 'My Button',
      type: 'command',
      command: 'echo hi',
      cwd: '/tmp',
      showTerminal: true,
      icon: { kind: 'emoji', emoji: '🚀', tileColor: '#34D399', sourcePath: '/some/path.png' }
    };
    expect(validateConfig(cfg)).toBe(true);
  });

  // Per-type required payload deliberately NOT enforced here: the modal lets a
  // user save before picking a path/command (Save is gated on label only), so a
  // payload-less button is a legal persisted state the runner handles gracefully.
  it("accepts type:'file' without a path field (saved before picking)", () => {
    const cfg = defaultConfig() as any;
    cfg.groups[0].slots[0] = {
      id: 'b1',
      label: 'X',
      type: 'file',
      icon: { kind: 'auto' }
    };
    expect(validateConfig(cfg)).toBe(true);
  });
});
