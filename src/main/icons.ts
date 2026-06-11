import { copyFileSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

export interface IconImage {
  isEmpty(): boolean;
  toPNG(): Buffer;
}

/** Shape of app.getFileIcon — accepts an optional size option; injected for tests. */
export type GetFileIconFn = (path: string, opts?: { size?: 'small' | 'normal' | 'large' }) => Promise<IconImage>;

/** Shape of nativeImage.createThumbnailFromPath — injected for tests (darwin only). */
export type CreateThumbnailFn = (path: string) => Promise<IconImage>;

export interface IconExtractDeps {
  getFileIcon: GetFileIconFn;
  iconsDir: string;
  /** Optional thumbnail creator used on darwin to avoid getFileIcon size:'large' SIGTRAP. */
  createThumbnail?: CreateThumbnailFn;
  /** Defaults to process.platform when omitted. */
  platform?: NodeJS.Platform | string;
}

/** Returns a deckicon:// URL, or null → caller falls back to the letter tile. */
export async function extractIcon(deps: IconExtractDeps, filePath: string, buttonId: string): Promise<string | null> {
  const platform = deps.platform ?? process.platform;
  try {
    let img: IconImage;

    if (platform === 'darwin' && deps.createThumbnail) {
      // On darwin, prefer createThumbnailFromPath — size:'large' SIGTRAPs Electron 35 on macOS 26; do not reintroduce.
      try {
        const thumb = await deps.createThumbnail(filePath);
        if (!thumb.isEmpty()) {
          img = thumb;
        } else {
          // Thumbnail returned empty — fall back to getFileIcon with size:'normal' (never 'large' on darwin).
          img = await deps.getFileIcon(filePath, { size: 'normal' });
        }
      } catch {
        // createThumbnail threw — fall back to getFileIcon with size:'normal' (never 'large' on darwin).
        img = await deps.getFileIcon(filePath, { size: 'normal' });
      }
    } else {
      // win32 / linux: use size:'large' as before.
      img = await deps.getFileIcon(filePath, { size: 'large' });
    }

    if (img.isEmpty()) return null;
    mkdirSync(deps.iconsDir, { recursive: true });
    writeFileSync(join(deps.iconsDir, `${buttonId}.png`), img.toPNG());
    return `deckicon://${buttonId}.png`;
  } catch {
    return null; // extraction failure is non-fatal per spec
  }
}

function listIcons(iconsDir: string): string[] {
  try {
    return readdirSync(iconsDir);
  } catch {
    return [];
  }
}

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.ico']);

/** Copy a user image (png/jpg/jpeg/svg/ico) to <buttonId>-custom.<ext>; returns its deckicon URL, or null for disallowed extensions. */
export function copyCustomImage(iconsDir: string, sourcePath: string, buttonId: string): string | null {
  const ext = extname(sourcePath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.has(ext)) return null;
  const name = `${buttonId}-custom${ext}`;
  mkdirSync(iconsDir, { recursive: true });
  copyFileSync(sourcePath, join(iconsDir, name));
  return `deckicon://${name}`;
}

export function deleteIconFiles(iconsDir: string, buttonId: string): void {
  for (const f of listIcons(iconsDir)) {
    if (f === `${buttonId}.png` || f.startsWith(`${buttonId}-custom.`)) {
      try { unlinkSync(join(iconsDir, f)); } catch { /* ignore individual unlink failures */ }
    }
  }
}

export function duplicateIconFiles(iconsDir: string, fromId: string, toId: string): void {
  for (const f of listIcons(iconsDir)) {
    if (f === `${fromId}.png`) copyFileSync(join(iconsDir, f), join(iconsDir, `${toId}.png`));
    else if (f.startsWith(`${fromId}-custom.`)) {
      copyFileSync(join(iconsDir, f), join(iconsDir, `${toId}-custom${extname(f)}`));
    }
  }
}
