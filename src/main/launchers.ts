import type { Button } from '@shared/types';

export interface LaunchDeps {
  platform: NodeJS.Platform;
  openPath: (p: string) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  spawnDetached: (cmd: string) => void;
  runCommand: (cmd: string, args: string[]) => void;
  commandExists: (cmd: string) => boolean;
}

const LINUX_TERMINALS = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm'] as const;

export function pickLinuxTerminal(commandExists: (cmd: string) => boolean): string {
  return LINUX_TERMINALS.find((t) => commandExists(t)) ?? 'xterm';
}

export function terminalCommandFor(
  platform: NodeJS.Platform,
  command: string,
  cwd: string | undefined,
  commandExists: (cmd: string) => boolean
): { cmd: string; args: string[] } {
  const full = cwd ? `cd ${JSON.stringify(cwd)} && ${command}` : command;
  if (platform === 'darwin') {
    return {
      cmd: 'osascript',
      args: [
        '-e', 'tell application "Terminal" to activate',
        '-e', `tell application "Terminal" to do script ${JSON.stringify(full)}`
      ]
    };
  }
  if (platform === 'win32') {
    return { cmd: 'cmd', args: ['/c', 'start', 'cmd', '/k', full] };
  }
  return { cmd: pickLinuxTerminal(commandExists), args: ['-e', `sh -c ${JSON.stringify(full)}`] };
}

const APP_BUNDLE_RE = /\.(app|exe|lnk)$/i;
const HTTP_RE = /^https?:\/\//;

/** Untracked actions per spec: launching flash only, never registered with the runner. */
export async function launchUntracked(button: Button, deps: LaunchDeps): Promise<void> {
  if (button.type === 'command') {
    const { cmd, args } = terminalCommandFor(deps.platform, button.command ?? '', button.cwd || undefined, deps.commandExists);
    deps.runCommand(cmd, args);
    return;
  }
  const p = button.path ?? '';
  if (!p) return; // missing path: graceful no-op, never hand '' to the shell
  if (button.type === 'file') {
    if (HTTP_RE.test(p)) await deps.openExternal(p);
    else await deps.openPath(p);
    return;
  }
  // app
  if (deps.platform === 'linux' && !APP_BUNDLE_RE.test(p)) {
    deps.spawnDetached(p); // bare Linux binary
    return;
  }
  await deps.openPath(p);
}
