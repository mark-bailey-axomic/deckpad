import { BUTTON_ID_RE, GRID_LIMITS, SURFACES } from './constants';
import type { Config } from './types';

const VALID_BUTTON_TYPES = new Set(['command', 'script']);
const VALID_SCRIPT_LANGUAGES = new Set(['javascript', 'typescript', 'python', 'sh']);
const VALID_ICON_KINDS = new Set(['auto', 'letter', 'emoji', 'image']);
const VALID_SURFACES = new Set(Object.keys(SURFACES));

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateButton(slot: unknown): boolean {
  if (!isObject(slot)) return false;
  if (typeof slot['id'] !== 'string' || !BUTTON_ID_RE.test(slot['id'])) return false;
  if (typeof slot['label'] !== 'string') return false;
  const type = slot['type'] as string;
  if (!VALID_BUTTON_TYPES.has(type)) return false;
  if (!isObject(slot['icon'])) return false;
  const icon = slot['icon'] as Record<string, unknown>;
  if (!VALID_ICON_KINDS.has(icon['kind'] as string)) return false;

  // Optional field type checks
  if ('command' in slot && typeof slot['command'] !== 'string') return false;
  if ('cwd' in slot && typeof slot['cwd'] !== 'string') return false;
  if ('showTerminal' in slot && typeof slot['showTerminal'] !== 'boolean') return false;
  if ('script' in slot && typeof slot['script'] !== 'string') return false;
  if ('language' in slot && !VALID_SCRIPT_LANGUAGES.has(slot['language'] as string)) return false;
  if ('emoji' in icon && typeof icon['emoji'] !== 'string') return false;
  if ('tileColor' in icon && typeof icon['tileColor'] !== 'string') return false;
  if ('sourcePath' in icon && typeof icon['sourcePath'] !== 'string') return false;

  // Script buttons must carry a runnable body + known language (UX guarantees this;
  // the guard makes it a hard invariant). Command stays lenient per the note below.
  if (type === 'script') {
    if (!VALID_SCRIPT_LANGUAGES.has(slot['language'] as string)) return false;
    if (typeof slot['script'] !== 'string' || slot['script'].trim().length === 0) return false;
  }

  // Payload fields stay optional for command: the modal allows saving before a
  // command is chosen, so requiredness is UX territory — the runner handles absence.
  return true;
}

export function validateConfig(value: unknown): value is Config {
  if (!isObject(value)) return false;

  // version
  if (value['version'] !== 1) return false;

  // grid
  const grid = value['grid'];
  if (!isObject(grid)) return false;
  const cols = grid['cols'] as number;
  const rows = grid['rows'] as number;
  if (!Number.isInteger(cols) || cols < GRID_LIMITS.cols.min || cols > GRID_LIMITS.cols.max) return false;
  if (!Number.isInteger(rows) || rows < GRID_LIMITS.rows.min || rows > GRID_LIMITS.rows.max) return false;

  // settings
  const settings = value['settings'];
  if (!isObject(settings)) return false;
  if (typeof settings['accent'] !== 'string') return false;
  if (!VALID_SURFACES.has(settings['surface'] as string)) return false;
  if (typeof settings['showLabels'] !== 'boolean') return false;
  if (typeof settings['launchStartup'] !== 'boolean') return false;
  if (typeof settings['alwaysOnTop'] !== 'boolean') return false;
  if (typeof settings['settingsInWindow'] !== 'boolean') return false;
  if (typeof settings['activityInWindow'] !== 'boolean') return false;

  // groups
  const groups = value['groups'];
  if (!Array.isArray(groups) || groups.length < 1) return false;

  const expectedSlots = cols * rows;
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
