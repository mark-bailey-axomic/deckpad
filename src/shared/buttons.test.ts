import { describe, expect, it } from 'vitest';
import { deriveLetters, findButton, isUntracked } from './buttons';
import type { Button, Config } from './types';

const cmd = (over: Partial<Button> = {}): Button => ({
  id: 'b1', label: 'Dev Server', type: 'command', command: 'npm run dev',
  icon: { kind: 'auto' }, ...over
});

describe('deriveLetters', () => {
  it('takes uppercase first letters of the first two words', () => {
    expect(deriveLetters('Dev Server')).toBe('DS');
  });
  it('returns one letter for one word', () => {
    expect(deriveLetters('deploy')).toBe('D');
  });
  it('ignores extra words and whitespace', () => {
    expect(deriveLetters('  run all the tests  ')).toBe('RA');
  });
  it('falls back to ? for empty labels', () => {
    expect(deriveLetters('   ')).toBe('?');
  });
});

describe('isUntracked', () => {
  it('plain commands are tracked', () => {
    expect(isUntracked(cmd())).toBe(false);
  });
  it('showTerminal commands are untracked', () => {
    expect(isUntracked(cmd({ showTerminal: true }))).toBe(true);
  });
  it('file and app buttons are untracked', () => {
    expect(isUntracked(cmd({ type: 'file', path: '/tmp/x' }))).toBe(true);
    expect(isUntracked(cmd({ type: 'app', path: '/Applications/X.app' }))).toBe(true);
  });
});

describe('findButton', () => {
  it('finds a button by id across groups and slots', () => {
    const config: Config = {
      version: 1,
      grid: { cols: 2, rows: 2 },
      settings: { accent: '#34D399', surface: 'near-black', showLabels: true, launchStartup: false, alwaysOnTop: false, settingsInWindow: false, activityInWindow: false },
      groups: [
        { id: 'g1', name: 'A', slots: [null, cmd({ id: 'x' }), null, null] },
        { id: 'g2', name: 'B', slots: [cmd({ id: 'y', label: 'Y' }), null, null, null] }
      ]
    };
    expect(findButton(config, 'y')?.label).toBe('Y');
    expect(findButton(config, 'nope')).toBeNull();
  });
});
