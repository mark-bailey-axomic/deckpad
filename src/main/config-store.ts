import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_ACCENT, DEFAULT_GRID } from '@shared/constants';
import { validateConfig } from '@shared/config-validate';
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
      alwaysOnTop: false,
      settingsInWindow: false,
      activityInWindow: false
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
      const p = parsed as { settings?: Record<string, unknown> };
      const normalized = {
        ...(parsed as object),
        settings: {
          ...(p.settings ?? {}),
          settingsInWindow: p.settings?.['settingsInWindow'] ?? false,
          activityInWindow: p.settings?.['activityInWindow'] ?? false
        }
      };
      if (!validateConfig(normalized)) throw new Error('invalid config shape');
      return normalized;
    } catch {
      // Corrupt or future-versioned: back the file up and start fresh.
      try {
        copyFileSync(this.file, `${this.file}.bak-${Date.now()}`);
      } catch {
        // Backup failure is non-fatal — proceed with defaults.
      }
      const defaults = defaultConfig();
      // Best-effort: persist defaults so subsequent launches don't re-backup.
      try {
        this.save(defaults);
      } catch {
        // Save failure is non-fatal — return in-memory defaults.
      }
      return defaults;
    }
  }

  save(cfg: Config): void {
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
    const data = JSON.stringify(cfg, null, 2);
    const fd = openSync(tmp, 'w');
    try {
      try {
        writeSync(fd, data, 0, 'utf8');
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(tmp, this.file);
    } catch (err) {
      try { unlinkSync(tmp); } catch { /* best-effort */ }
      throw err;
    }
  }
}
