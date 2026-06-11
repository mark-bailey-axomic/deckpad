import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncIconCache } from './icon-sync';
import { defaultConfig } from './config-store';
import type { Button, Config } from '@shared/types';

let dir: string;
let iconsDir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deckpad-sync-'));
  iconsDir = join(dir, 'icons');
  mkdirSync(iconsDir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const btn = (id: string, over: Partial<Button> = {}): Button => ({
  id, label: id, type: 'command', command: 'true', icon: { kind: 'auto' }, ...over
});

function cfgWith(...buttons: Button[]): Config {
  const cfg = defaultConfig();
  buttons.forEach((b, i) => { cfg.groups[0].slots[i] = b; });
  return cfg;
}

describe('syncIconCache', () => {
  it('deletes cached icons for buttons removed from the config', () => {
    writeFileSync(join(iconsDir, 'gone.png'), 'x');
    writeFileSync(join(iconsDir, 'gone-custom.svg'), 'x');
    syncIconCache(cfgWith(btn('gone')), cfgWith(), iconsDir);
    expect(existsSync(join(iconsDir, 'gone.png'))).toBe(false);
    expect(existsSync(join(iconsDir, 'gone-custom.svg'))).toBe(false);
  });

  it('copies the custom source image for image-kind buttons missing a cache file', () => {
    const src = join(dir, 'logo.png');
    writeFileSync(src, 'imagedata');
    const next = cfgWith(btn('b1', { icon: { kind: 'image', sourcePath: src } }));
    syncIconCache(cfgWith(), next, iconsDir);
    expect(readFileSync(join(iconsDir, 'b1-custom.png'), 'utf8')).toBe('imagedata');
  });

  it('ignores image buttons whose source no longer exists (renderer falls back to letters)', () => {
    const next = cfgWith(btn('b1', { icon: { kind: 'image', sourcePath: join(dir, 'missing.png') } }));
    expect(() => syncIconCache(cfgWith(), next, iconsDir)).not.toThrow();
  });

  it('duplicated buttons (new id, same path as an existing auto button) get the PNG copied under the new id', () => {
    writeFileSync(join(iconsDir, 'orig.png'), 'pngdata');
    const orig = btn('orig', { type: 'app', path: '/Applications/X.app' });
    const dupe = btn('dupe', { type: 'app', path: '/Applications/X.app' });
    syncIconCache(cfgWith(orig), cfgWith(orig, dupe), iconsDir);
    expect(readFileSync(join(iconsDir, 'dupe.png'), 'utf8')).toBe('pngdata');
  });

  it('does nothing when configs are identical', () => {
    const cfg = cfgWith(btn('b1'));
    expect(() => syncIconCache(cfg, cfg, iconsDir)).not.toThrow();
  });
});
