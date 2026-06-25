import { randomUUID } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { Button, ScriptLanguage } from '@shared/types';
import type { ResolvedSpawn } from './runner';

const EXTENSION: Record<ScriptLanguage, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  sh: 'sh'
};

const INTERPRETER: Record<ScriptLanguage, string> = {
  javascript: 'node',
  typescript: 'tsx',
  python: 'python3',
  sh: 'sh'
};

export function interpreterFor(lang: ScriptLanguage): string {
  return INTERPRETER[lang];
}

export function extensionFor(lang: ScriptLanguage): string {
  return EXTENSION[lang];
}

/** The user's login shell so PATH (nvm/homebrew/npm-global tsx) matches their terminal. */
export function loginShell(): string {
  return process.env.SHELL || '/bin/sh';
}

/**
 * `<interpreter> "<tempPath>"` — JSON.stringify double-quotes the path so spaces are
 * handled (matches launchers.ts). This is NOT a general shell escape: a double-quoted
 * string still permits `$VAR`/command substitution. It is safe here only because the
 * path is DeckPad-generated (`deckpad-<uuid>.<ext>` under the system temp dir), never
 * user input — do not reuse this for untrusted strings.
 */
export function scriptInvocation(lang: ScriptLanguage, tempPath: string): string {
  return `${interpreterFor(lang)} ${JSON.stringify(tempPath)}`;
}

export interface ScriptExecDeps {
  writeFile: (path: string, data: string) => void;
  remove: (path: string) => void;
  tmpDir: () => string;
  uuid: () => string;
  join: (...parts: string[]) => string;
  shell: () => string;
  platform: NodeJS.Platform;
}

export const defaultScriptExecDeps: ScriptExecDeps = {
  // Scripts may contain secrets; create the temp file readable only by the owner (0600).
  writeFile: (p, d) => writeFileSync(p, d, { encoding: 'utf8', mode: 0o600 }),
  remove: (p) => rmSync(p, { force: true }),
  tmpDir: tmpdir,
  uuid: randomUUID,
  join,
  shell: loginShell,
  platform: process.platform
};

/** Write the script body to a temp file and return how to spawn it (with cleanup). */
export function resolveScriptSpawn(button: Button, deps: ScriptExecDeps): ResolvedSpawn {
  const lang: ScriptLanguage = button.language ?? 'sh';
  const tempPath = deps.join(deps.tmpDir(), `deckpad-${deps.uuid()}.${extensionFor(lang)}`);
  deps.writeFile(tempPath, button.script ?? '');
  const inner = scriptInvocation(lang, tempPath);
  const cleanup = (): void => deps.remove(tempPath);

  // Windows GUI apps inherit the user PATH, so shell:true resolves the interpreter.
  if (deps.platform === 'win32') {
    return { file: inner, args: [], shell: true, cleanup };
  }
  // POSIX GUI apps get a minimal PATH; running through the user's shell as a login
  // shell (`-l`) sources their profile so PATH matches their terminal. Only a shell
  // invoked as bare `sh` is downgraded to `-c`, since POSIX `sh` is not guaranteed to
  // accept `-l` (any shell named otherwise — zsh/bash/dash/ksh/fish — gets `-lc`).
  const shellPath = deps.shell();
  const flag = basename(shellPath) === 'sh' ? '-c' : '-lc';
  return { file: shellPath, args: [flag, inner], shell: false, cleanup };
}
