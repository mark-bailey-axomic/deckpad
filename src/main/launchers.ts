import type { Button } from '@shared/types';

export interface LaunchDeps {
  platform: NodeJS.Platform;
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
  // Separate argv tokens: the terminal passes them straight to exec, no extra shell quoting layer.
  return { cmd: pickLinuxTerminal(commandExists), args: ['-e', 'sh', '-c', full] };
}

/** Untracked = command+terminal only (scripts/commands otherwise run tracked). */
export function launchUntracked(button: Button, deps: LaunchDeps): Promise<void> {
  const { cmd, args } = terminalCommandFor(
    deps.platform,
    button.command ?? '',
    button.cwd || undefined,
    deps.commandExists
  );
  deps.runCommand(cmd, args);
  return Promise.resolve();
}
