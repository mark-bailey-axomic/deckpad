import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_ACCENT, DEFAULT_GRID } from '@shared/constants';
import type { Config } from '@shared/types';

export function defaultConfig(): Config {
  const { cols, rows } = DEFAULT_GRID;
  return {
    version: 1,
    grid: { cols, rows },
    settings: {
      accent: DEFAULT_ACCENT,
      surface: 'near-black',
      showLabels: true,
      launchStartup: false,
      alwaysOnTop: false
    },
    groups: [{ id: randomUUID(), name: 'Actions', slots: Array(cols * rows).fill(null) }]
  };
}

export class ConfigStore {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return join(this.dir, 'config.json');
  }

  load(): Config {
    if (!existsSync(this.file)) return defaultConfig();
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      if ((parsed as { version?: unknown })?.version !== 1) throw new Error('unsupported config version');
      return parsed as Config;
    } catch {
      // Corrupt or future-versioned: back the file up and start fresh.
      copyFileSync(this.file, `${this.file}.bak-${Date.now()}`);
      return defaultConfig();
    }
  }

  save(cfg: Config): void {
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
    renameSync(tmp, this.file);
  }
}
