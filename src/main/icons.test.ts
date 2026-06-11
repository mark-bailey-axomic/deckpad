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

import { copyCustomImage, deleteIconFiles, duplicateIconFiles, type CreateThumbnailFn } from './icons';
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

  // ---------------------------------------------------------------------------
  // Phase-6 review: copyCustomImage extension whitelist
  // ---------------------------------------------------------------------------

  it('rejects sourcePath with a disallowed extension (x.html) — returns null and writes nothing', () => {
    const src = join(dir, 'x.html');
    writeFileSync(src, '<html/>');
    const iconsDir = join(dir, 'icons-html');
    // copyCustomImage should return null for disallowed extensions without writing files.
    const result = copyCustomImage(iconsDir, src, 'b1');
    expect(result).toBeNull();
    expect(existsSync(join(iconsDir, 'b1-custom.html'))).toBe(false);
  });

  it('accepts sourcePath with uppercase extension (.PNG) and normalises to lowercase in the cache filename', () => {
    const src = join(dir, 'icon.PNG');
    writeFileSync(src, 'png-content');
    const iconsDir = join(dir, 'icons-upper');
    const url = copyCustomImage(iconsDir, src, 'b2');
    // Extension must be lowercased in the URL and in the cache filename.
    expect(url).toBe('deckicon://b2-custom.png');
    expect(readFileSync(join(iconsDir, 'b2-custom.png'), 'utf8')).toBe('png-content');
  });
});

// ---------------------------------------------------------------------------
// macOS thumbnail seam + platform-aware extractIcon
// ---------------------------------------------------------------------------

describe('extractIcon — darwin thumbnail path', () => {
  it('uses createThumbnail on darwin, writes PNG, returns URL, never calls getFileIcon', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => Buffer.alloc(4) });
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'darwin' },
      '/Applications/X.app',
      'mac-1'
    );

    expect(url).toBe('deckicon://mac-1.png');
    expect(readFileSync(join(dir, 'mac-1.png'))).toEqual(png);
    expect(getFileIcon).not.toHaveBeenCalled();
    expect(createThumbnail).toHaveBeenCalledWith('/Applications/X.app');
  });

  it('falls back to getFileIcon with size "normal" (not "large") when createThumbnail throws', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockRejectedValue(new Error('thumbnail fail'));

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'darwin' },
      '/Applications/Y.app',
      'mac-2'
    );

    expect(url).toBe('deckicon://mac-2.png');
    expect(getFileIcon).toHaveBeenCalledWith('/Applications/Y.app', { size: 'normal' });
  });

  it('falls back to getFileIcon with size "normal" when createThumbnail returns an empty image', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockResolvedValue({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) });

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'darwin' },
      '/Applications/Z.app',
      'mac-3'
    );

    expect(url).toBe('deckicon://mac-3.png');
    expect(getFileIcon).toHaveBeenCalledWith('/Applications/Z.app', { size: 'normal' });
    // Must NOT have been called with 'large'
    expect(getFileIcon).not.toHaveBeenCalledWith(expect.anything(), { size: 'large' });
  });
});

// ---------------------------------------------------------------------------
// macOS .app bundle icon seam (extractBundleIcon)
// ---------------------------------------------------------------------------

describe('extractIcon — darwin .app bundle seam', () => {
  it('.app uses extractBundleIcon only: writes PNG to destPngPath, returns URL, createThumbnail+getFileIcon never called', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => Buffer.alloc(4) });
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => Buffer.alloc(4) });
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xde, 0xad]);
    const extractBundleIcon = vi.fn(async (_path: string, destPngPath: string): Promise<boolean> => {
      mkdirSync(join(destPngPath, '..'), { recursive: true });
      writeFileSync(destPngPath, fakePng);
      return true;
    });

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'darwin', extractBundleIcon },
      '/Applications/Foo.app',
      'bundle-1'
    );

    expect(url).toBe('deckicon://bundle-1.png');
    expect(readFileSync(join(dir, 'bundle-1.png'))).toEqual(fakePng);
    expect(extractBundleIcon).toHaveBeenCalledWith('/Applications/Foo.app', join(dir, 'bundle-1.png'));
    expect(createThumbnail).not.toHaveBeenCalled();
    expect(getFileIcon).not.toHaveBeenCalled();
  });

  it('.app seam returns false → falls back to createThumbnail chain', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
    const extractBundleIcon = vi.fn(async (): Promise<boolean> => false);

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'darwin', extractBundleIcon },
      '/Applications/Fallback.app',
      'bundle-2'
    );

    expect(url).toBe('deckicon://bundle-2.png');
    expect(extractBundleIcon).toHaveBeenCalledOnce();
    expect(createThumbnail).toHaveBeenCalledWith('/Applications/Fallback.app');
    expect(getFileIcon).not.toHaveBeenCalled();
  });

  it('.app seam throws → falls back to createThumbnail chain', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
    const extractBundleIcon = vi.fn(async (): Promise<boolean> => { throw new Error('sips failed'); });

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'darwin', extractBundleIcon },
      '/Applications/Throws.app',
      'bundle-3'
    );

    expect(url).toBe('deckicon://bundle-3.png');
    expect(extractBundleIcon).toHaveBeenCalledOnce();
    expect(createThumbnail).toHaveBeenCalledWith('/Applications/Throws.app');
    expect(getFileIcon).not.toHaveBeenCalled();
  });

  it('non-.app darwin path never calls extractBundleIcon, uses createThumbnail as normal', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
    const extractBundleIcon = vi.fn(async (): Promise<boolean> => true);

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'darwin', extractBundleIcon },
      '/usr/bin/myapp',
      'bundle-4'
    );

    expect(url).toBe('deckicon://bundle-4.png');
    expect(extractBundleIcon).not.toHaveBeenCalled();
    expect(createThumbnail).toHaveBeenCalledWith('/usr/bin/myapp');
  });

  it('.APP uppercase extension is treated as .app (case-insensitive match)', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => Buffer.alloc(4) });
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => Buffer.alloc(4) });
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xca, 0xfe]);
    const extractBundleIcon = vi.fn(async (_path: string, destPngPath: string): Promise<boolean> => {
      mkdirSync(join(destPngPath, '..'), { recursive: true });
      writeFileSync(destPngPath, fakePng);
      return true;
    });

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'darwin', extractBundleIcon },
      '/Applications/MyApp.APP',
      'bundle-5'
    );

    expect(url).toBe('deckicon://bundle-5.png');
    expect(extractBundleIcon).toHaveBeenCalledWith('/Applications/MyApp.APP', join(dir, 'bundle-5.png'));
    expect(createThumbnail).not.toHaveBeenCalled();
    expect(getFileIcon).not.toHaveBeenCalled();
  });
});

describe('extractIcon — win32/linux path unchanged', () => {
  it('on win32 calls getFileIcon with size "large" and never calls createThumbnail', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockResolvedValue({ isEmpty: () => false, toPNG: () => png });

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'win32' },
      'C:\\Program Files\\App\\app.exe',
      'win-1'
    );

    expect(url).toBe('deckicon://win-1.png');
    expect(getFileIcon).toHaveBeenCalledWith('C:\\Program Files\\App\\app.exe', { size: 'large' });
    expect(createThumbnail).not.toHaveBeenCalled();
  });

  it('on darwin: returns null when both createThumbnail and getFileIcon fallback both fail', async () => {
    const getFileIcon = vi.fn<GetFileIconFn>().mockRejectedValue(new Error('getFileIcon fail'));
    const createThumbnail = vi.fn<CreateThumbnailFn>().mockRejectedValue(new Error('thumbnail fail'));

    const url = await extractIcon(
      { getFileIcon, createThumbnail, iconsDir: dir, platform: 'darwin' },
      '/Applications/Bad.app',
      'mac-4'
    );

    expect(url).toBeNull();
    expect(existsSync(join(dir, 'mac-4.png'))).toBe(false);
  });
});
