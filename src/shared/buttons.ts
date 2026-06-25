import type { Button, Config } from './types';

/** Uppercase first letters of the first two words (1–2 chars); '?' if empty. */
export function deriveLetters(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** Untracked = launch-and-forget in a terminal window. Only a command with
 *  showTerminal qualifies; scripts and plain commands run tracked through the Runner. */
export function isUntracked(button: Button): boolean {
  return button.type === 'command' && button.showTerminal === true;
}

export function findButton(config: Config, id: string): Button | null {
  for (const group of config.groups) {
    for (const slot of group.slots) {
      if (slot && slot.id === id) return slot;
    }
  }
  return null;
}
