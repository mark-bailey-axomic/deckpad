import { GRID_LIMITS, SURFACES } from './constants';
import type { Config } from './types';

const VALID_BUTTON_TYPES = new Set(['command', 'file', 'app']);
const VALID_ICON_KINDS = new Set(['auto', 'letter', 'emoji', 'image']);
const VALID_SURFACES = new Set(Object.keys(SURFACES));

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateButton(slot: unknown): boolean {
  if (!isObject(slot)) return false;
  if (typeof slot['id'] !== 'string') return false;
  if (typeof slot['label'] !== 'string') return false;
  if (!VALID_BUTTON_TYPES.has(slot['type'] as string)) return false;
  if (!isObject(slot['icon'])) return false;
  if (!VALID_ICON_KINDS.has((slot['icon'] as Record<string, unknown>)['kind'] as string)) return false;
  return true;
}

export function validateConfig(value: unknown): value is Config {
  if (!isObject(value)) return false;

  // version
  if (value['version'] !== 1) return false;

  // grid
  const grid = value['grid'];
  if (!isObject(grid)) return false;
  const cols = grid['cols'];
  const rows = grid['rows'];
  if (typeof cols !== 'number' || cols < GRID_LIMITS.cols.min || cols > GRID_LIMITS.cols.max) return false;
  if (typeof rows !== 'number' || rows < GRID_LIMITS.rows.min || rows > GRID_LIMITS.rows.max) return false;

  // settings
  const settings = value['settings'];
  if (!isObject(settings)) return false;
  if (typeof settings['accent'] !== 'string') return false;
  if (!VALID_SURFACES.has(settings['surface'] as string)) return false;
  if (typeof settings['showLabels'] !== 'boolean') return false;
  if (typeof settings['launchStartup'] !== 'boolean') return false;
  if (typeof settings['alwaysOnTop'] !== 'boolean') return false;

  // groups
  const groups = value['groups'];
  if (!Array.isArray(groups) || groups.length < 1) return false;

  const expectedSlots = (cols as number) * (rows as number);
  for (const group of groups) {
    if (!isObject(group)) return false;
    if (typeof group['id'] !== 'string') return false;
    if (typeof group['name'] !== 'string') return false;
    const slots = group['slots'];
    if (!Array.isArray(slots)) return false;
    if (slots.length !== expectedSlots) return false;
    for (const slot of slots) {
      if (slot !== null && !validateButton(slot)) return false;
    }
  }

  return true;
}
