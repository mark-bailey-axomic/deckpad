import { randomUUID } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/** `<interpreter> "<tempPath>"` — JSON.stringify quotes the path safely (matches launchers.ts). */
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
  writeFile: (p, d) => writeFileSync(p, d, 'utf8'),
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
  // POSIX GUI apps get a minimal PATH; the login shell restores the terminal's PATH.
  return { file: deps.shell(), args: ['-lc', inner], shell: false, cleanup };
}
