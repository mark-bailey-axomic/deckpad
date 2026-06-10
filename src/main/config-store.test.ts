import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore, defaultConfig } from './config-store';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckpad-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('defaultConfig', () => {
  it('matches the spec defaults', () => {
    const cfg = defaultConfig();
    expect(cfg.version).toBe(1);
    expect(cfg.grid).toEqual({ cols: 4, rows: 3 });
    expect(cfg.settings).toEqual({
      accent: '#34D399', surface: 'near-black',
      showLabels: true, launchStartup: false, alwaysOnTop: false
    });
    expect(cfg.groups).toHaveLength(1);
    expect(cfg.groups[0].name).toBe('Actions');
    expect(cfg.groups[0].slots).toHaveLength(12); // cols * rows
    expect(cfg.groups[0].slots.every((s) => s === null)).toBe(true);
  });

  it('generates a UUID group id', () => {
    expect(defaultConfig().groups[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('ConfigStore', () => {
  it('returns defaults when no file exists', () => {
    const store = new ConfigStore(dir);
    expect(store.load().groups[0].name).toBe('Actions');
  });

  it('round-trips save → load', () => {
    const store = new ConfigStore(dir);
    const cfg = defaultConfig();
    cfg.settings.accent = '#F04438';
    cfg.groups[0].name = 'Renamed';
    store.save(cfg);
    const loaded = new ConfigStore(dir).load();
    expect(loaded.settings.accent).toBe('#F04438');
    expect(loaded.groups[0].name).toBe('Renamed');
  });

  it('writes atomically via tmp + rename (no tmp file left behind)', () => {
    const store = new ConfigStore(dir);
    store.save(defaultConfig());
    const files = readdirSync(dir);
    expect(files).toContain('config.json');
    expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
    expect(() => JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))).not.toThrow();
  });

  it('creates the directory if missing', () => {
    const store = new ConfigStore(join(dir, 'nested', 'userData'));
    store.save(defaultConfig());
    expect(store.load().version).toBe(1);
  });

  it('backs up a corrupt file and returns defaults', () => {
    writeFileSync(join(dir, 'config.json'), '{not json!!', 'utf8');
    const store = new ConfigStore(dir);
    const cfg = store.load();
    expect(cfg.groups[0].name).toBe('Actions');
    const backups = readdirSync(dir).filter((f) => f.startsWith('config.json.bak-'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(dir, backups[0]), 'utf8')).toBe('{not json!!');
  });

  it('treats an unknown future version as corrupt (version gate)', () => {
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ version: 99 }), 'utf8');
    const cfg = new ConfigStore(dir).load();
    expect(cfg.version).toBe(1);
    expect(readdirSync(dir).some((f) => f.startsWith('config.json.bak-'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // NEW: reviewer-requested regression tests
  // -------------------------------------------------------------------------

  it('load() treats invalid-shape-but-valid-JSON as corrupt and creates .bak-*', () => {
    // valid JSON but fails deep shape validation (no settings, empty groups)
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ version: 1, groups: [] }), 'utf8');
    const store = new ConfigStore(dir);
    const cfg = store.load();
    expect(cfg.groups[0].name).toBe('Actions'); // got defaults
    const backups = readdirSync(dir).filter((f) => f.startsWith('config.json.bak-'));
    expect(backups).toHaveLength(1);
  });

  it('load() returns defaults even when backup write fails (read-only dir)', () => {
    writeFileSync(join(dir, 'config.json'), '{not json!!', 'utf8');
    // Make dir read-only so copyFileSync cannot create the .bak file
    chmodSync(dir, 0o555);
    const store = new ConfigStore(dir);
    let cfg: ReturnType<typeof store.load> | undefined;
    try {
      expect(() => { cfg = store.load(); }).not.toThrow();
      expect(cfg?.version).toBe(1);
    } finally {
      chmodSync(dir, 0o755); // restore perms so afterEach can rmSync
    }
  });

  it('failed save preserves previous config.json', () => {
    const store = new ConfigStore(dir);
    const first = defaultConfig();
    first.settings.accent = '#F04438';
    store.save(first);

    // Create a circular reference to force JSON.stringify to throw
    const circular = defaultConfig() as any;
    circular.self = circular;

    expect(() => store.save(circular as never)).toThrow();

    // The original file must still contain the first config
    const onDisk = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    expect(onDisk.settings.accent).toBe('#F04438');
  });
});
