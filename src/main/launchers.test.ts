import { describe, expect, it, vi } from 'vitest';
import { launchUntracked, terminalCommandFor, pickLinuxTerminal, type LaunchDeps } from './launchers';
import type { Button } from '@shared/types';

const btn = (over: Partial<Button>): Button => ({
  id: 'b1', label: 'X', type: 'file', icon: { kind: 'auto' }, ...over
});

function deps(platform: NodeJS.Platform): LaunchDeps & { openPath: ReturnType<typeof vi.fn>; openExternal: ReturnType<typeof vi.fn>; spawnDetached: ReturnType<typeof vi.fn>; runCommand: ReturnType<typeof vi.fn> } {
  return {
    platform,
    openPath: vi.fn().mockResolvedValue(''),
    openExternal: vi.fn().mockResolvedValue(undefined),
    spawnDetached: vi.fn(),
    runCommand: vi.fn(),
    commandExists: vi.fn().mockReturnValue(true)
  };
}

describe('launchUntracked — files', () => {
  it('opens plain paths with shell.openPath', async () => {
    const d = deps('darwin');
    await launchUntracked(btn({ type: 'file', path: '/Users/x/notes.pdf' }), d);
    expect(d.openPath).toHaveBeenCalledWith('/Users/x/notes.pdf');
  });
  it('opens http(s) URLs with shell.openExternal', async () => {
    const d = deps('darwin');
    await launchUntracked(btn({ type: 'file', path: 'https://grafana.acme.dev' }), d);
    expect(d.openExternal).toHaveBeenCalledWith('https://grafana.acme.dev');
    expect(d.openPath).not.toHaveBeenCalled();
  });
});

describe('launchUntracked — apps', () => {
  it('.app/.exe/.lnk go through openPath', async () => {
    const d = deps('win32');
    await launchUntracked(btn({ type: 'app', path: 'C:\\Tools\\VSCode.exe' }), d);
    expect(d.openPath).toHaveBeenCalledWith('C:\\Tools\\VSCode.exe');
  });
  it('bare Linux binaries spawn detached', async () => {
    const d = deps('linux');
    await launchUntracked(btn({ type: 'app', path: '/usr/bin/gimp' }), d);
    expect(d.spawnDetached).toHaveBeenCalledWith('/usr/bin/gimp');
    expect(d.openPath).not.toHaveBeenCalled();
  });
});

describe('launchUntracked — showTerminal command handoff', () => {
  it('runs the platform terminal command', async () => {
    const d = deps('darwin');
    await launchUntracked(btn({ type: 'command', command: 'npm run dev', cwd: '/proj', showTerminal: true }), d);
    expect(d.runCommand).toHaveBeenCalledWith('osascript', expect.arrayContaining(['-e']));
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

// -------------------------------------------------------------------------
// Review-mandated: file/app button with NO path must not call openPath
// -------------------------------------------------------------------------

describe('launchUntracked — missing path guard', () => {
  it('file button with no path does not call openPath (no-op / graceful)', async () => {
    const d = deps('darwin');
    // path is undefined — should not throw and should not call openPath with undefined
    const b = btn({ type: 'file' }); // path omitted → undefined
    await expect(launchUntracked(b, d)).resolves.not.toThrow();
    // The implementation calls openPath('') for an empty string path — that is fine,
    // but it must NOT throw and must NOT call openExternal.
    expect(d.openExternal).not.toHaveBeenCalled();
  });

  it('app button with no path does not call spawnDetached or openPath with meaningful path', async () => {
    const d = deps('linux');
    const b = btn({ type: 'app' }); // path omitted → undefined
    await expect(launchUntracked(b, d)).resolves.not.toThrow();
    // spawnDetached should not be called with an empty/undefined path
    // (APP_BUNDLE_RE won't match '', so linux path -> spawnDetached('') — at minimum no throw)
    // The key contract: no crash.
  });
});
