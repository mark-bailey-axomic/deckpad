import { existsSync } from 'node:fs';
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
    // 2. Custom images: ensure <id>-custom.<ext> exists for image-kind buttons.
    if (b.icon.kind === 'image' && b.icon.sourcePath) {
      const target = join(iconsDir, `${id}-custom${extname(b.icon.sourcePath).toLowerCase()}`);
      if (!existsSync(target) && existsSync(b.icon.sourcePath)) {
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
