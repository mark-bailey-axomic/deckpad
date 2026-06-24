import { describe, expect, it, vi } from 'vitest';
import { launchUntracked, terminalCommandFor, pickLinuxTerminal, type LaunchDeps } from './launchers';
import type { Button } from '@shared/types';

const btn = (over: Partial<Button>): Button => ({
  id: 'b1', label: 'X', type: 'command', icon: { kind: 'auto' }, ...over
});

function deps(platform: NodeJS.Platform): LaunchDeps & { runCommand: ReturnType<typeof vi.fn> } {
  return {
    platform,
    runCommand: vi.fn(),
    commandExists: vi.fn().mockReturnValue(true)
  };
}

describe('launchUntracked — showTerminal command handoff', () => {
  it('runs a command+terminal action via the platform terminal', async () => {
    const runCommand = vi.fn();
    await launchUntracked(
      { id: 'b', label: 'C', type: 'command', command: 'npm run dev', cwd: '/proj', showTerminal: true, icon: { kind: 'auto' } },
      { platform: 'darwin', runCommand, commandExists: () => true }
    );
    expect(runCommand).toHaveBeenCalledTimes(1);
    const [cmd] = runCommand.mock.calls[0];
    expect(cmd).toBe('osascript');
  });
});

describe('terminalCommandFor', () => {
  it('macOS uses osascript → Terminal.app with cwd prepended', () => {
    const { cmd, args } = terminalCommandFor('darwin', 'npm test', '/proj', () => true);
    expect(cmd).toBe('osascript');
    expect(args.join(' ')).toContain('Terminal');
    expect(args.join(' ')).toContain('cd \\"/proj\\" && npm test');
  });
  it('Windows uses start cmd /k', () => {
    const { cmd, args } = terminalCommandFor('win32', 'dir', undefined, () => true);
    expect(cmd).toBe('cmd');
    expect(args).toEqual(['/c', 'start', 'cmd', '/k', 'dir']);
  });
  it('Linux uses the first available terminal in the fallback chain', () => {
    const exists = (c: string) => c === 'konsole';
    const { cmd } = terminalCommandFor('linux', 'ls', undefined, exists);
    expect(cmd).toBe('konsole');
  });
});

describe('pickLinuxTerminal', () => {
  it('prefers x-terminal-emulator, falls back down the chain, defaults to xterm', () => {
    expect(pickLinuxTerminal(() => true)).toBe('x-terminal-emulator');
    expect(pickLinuxTerminal((c) => c === 'gnome-terminal')).toBe('gnome-terminal');
    expect(pickLinuxTerminal(() => false)).toBe('xterm');
  });
});
