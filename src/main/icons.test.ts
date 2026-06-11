import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractIcon, type GetFileIconFn } from './icons';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckpad-icons-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const goodIcon: GetFileIconFn = vi.fn().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
const emptyIcon: GetFileIconFn = vi.fn().mockResolvedValue({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) });
const failingIcon: GetFileIconFn = vi.fn().mockRejectedValue(new Error('no icon'));

describe('extractIcon', () => {
  it('caches the PNG at <iconsDir>/<buttonId>.png and returns the deckicon URL', async () => {
    const url = await extractIcon({ getFileIcon: goodIcon, iconsDir: dir }, '/Applications/X.app', 'btn-1');
    expect(url).toBe('deckicon://btn-1.png');
    expect(readFileSync(join(dir, 'btn-1.png'))).toEqual(png);
  });

  it('returns null for an empty image (Linux generic case) without writing a file', async () => {
    const url = await extractIcon({ getFileIcon: emptyIcon, iconsDir: dir }, '/usr/bin/thing', 'btn-2');
    expect(url).toBeNull();
    expect(existsSync(join(dir, 'btn-2.png'))).toBe(false);
  });

  it('returns null when extraction throws (non-fatal)', async () => {
    const url = await extractIcon({ getFileIcon: failingIcon, iconsDir: dir }, '/nope', 'btn-3');
    expect(url).toBeNull();
  });

  it('creates the icons dir on demand', async () => {
    const nested = join(dir, 'icons');
    await extractIcon({ getFileIcon: goodIcon, iconsDir: nested }, '/a', 'btn-4');
    expect(existsSync(join(nested, 'btn-4.png'))).toBe(true);
  });
});

import { copyCustomImage, deleteIconFiles, duplicateIconFiles } from './icons';
import { mkdirSync, writeFileSync } from 'node:fs';

describe('icon cache lifecycle', () => {
  it('copyCustomImage copies to <buttonId>-custom.<ext> and returns the URL', () => {
    const src = join(dir, 'source.SVG');
    writeFileSync(src, '<svg/>');
    const iconsDir = join(dir, 'icons');
    const url = copyCustomImage(iconsDir, src, 'b1');
    expect(url).toBe('deckicon://b1-custom.svg');
    expect(readFileSync(join(iconsDir, 'b1-custom.svg'), 'utf8')).toBe('<svg/>');
  });

  it('deleteIconFiles removes auto and custom files for the id only', () => {
    const iconsDir = join(dir, 'icons');
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, 'b1.png'), 'x');
    writeFileSync(join(iconsDir, 'b1-custom.svg'), 'x');
    writeFileSync(join(iconsDir, 'b2.png'), 'keep');
    deleteIconFiles(iconsDir, 'b1');
    expect(existsSync(join(iconsDir, 'b1.png'))).toBe(false);
    expect(existsSync(join(iconsDir, 'b1-custom.svg'))).toBe(false);
    expect(existsSync(join(iconsDir, 'b2.png'))).toBe(true);
  });

  it('duplicateIconFiles copies cached files under the new id', () => {
    const iconsDir = join(dir, 'icons');
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, 'b1.png'), 'png');
    writeFileSync(join(iconsDir, 'b1-custom.ico'), 'ico');
    duplicateIconFiles(iconsDir, 'b1', 'b9');
    expect(readFileSync(join(iconsDir, 'b9.png'), 'utf8')).toBe('png');
    expect(readFileSync(join(iconsDir, 'b9-custom.ico'), 'utf8')).toBe('ico');
  });

  it('lifecycle helpers tolerate a missing icons dir', () => {
    expect(() => deleteIconFiles(join(dir, 'nope'), 'b1')).not.toThrow();
    expect(() => duplicateIconFiles(join(dir, 'nope'), 'b1', 'b2')).not.toThrow();
  });
});
