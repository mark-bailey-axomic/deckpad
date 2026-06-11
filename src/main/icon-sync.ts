import { existsSync, unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Button, Config } from '@shared/types';
import { copyCustomImage, deleteIconFiles, duplicateIconFiles } from './icons';

function buttonsOf(cfg: Config): Map<string, Button> {
  const map = new Map<string, Button>();
  for (const g of cfg.groups) for (const s of g.slots) if (s) map.set(s.id, s);
  return map;
}

/** Reconcile the icon cache with a config change (runs on every save). */
export function syncIconCache(prev: Config, next: Config, iconsDir: string): void {
  const before = buttonsOf(prev);
  const after = buttonsOf(next);

  // 1. Deletions: button id gone → remove its cached files.
  for (const id of before.keys()) {
    if (!after.has(id)) deleteIconFiles(iconsDir, id);
  }

  for (const [id, b] of after) {
    // 2. Custom images: copy (or refresh) <id>-custom.<ext> for image-kind buttons.
    if (b.icon.kind === 'image' && b.icon.sourcePath) {
      const prevButton = before.get(id);
      const prevSourcePath = prevButton?.icon.kind === 'image' ? prevButton.icon.sourcePath : undefined;
      const sourceChanged = prevSourcePath !== b.icon.sourcePath;
      const newExt = extname(b.icon.sourcePath).toLowerCase();
      const target = join(iconsDir, `${id}-custom${newExt}`);
      const needsCopy = sourceChanged || !existsSync(target);

      if (needsCopy && existsSync(b.icon.sourcePath)) {
        // Remove stale cached file if extension changed.
        if (sourceChanged && prevSourcePath) {
          const oldExt = extname(prevSourcePath).toLowerCase();
          if (oldExt !== newExt) {
            const oldTarget = join(iconsDir, `${id}-custom${oldExt}`);
            try { unlinkSync(oldTarget); } catch { /* already gone */ }
          }
        }
        copyCustomImage(iconsDir, b.icon.sourcePath, id);
      }
    }
    // 3. Duplicates: new auto button sharing a path with a surviving button → copy its cache.
    if (!before.has(id) && b.icon.kind === 'auto' && b.path) {
      const source = [...after.values()].find((o) => o.id !== id && o.path === b.path && before.has(o.id));
      if (source) duplicateIconFiles(iconsDir, source.id, id);
    }
  }
}
