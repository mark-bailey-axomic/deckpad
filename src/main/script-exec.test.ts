import { describe, expect, it, vi } from 'vitest';
import {
  interpreterFor, extensionFor, scriptInvocation, resolveScriptSpawn,
  type ScriptExecDeps
} from './script-exec';
import type { Button } from '@shared/types';

const scriptButton = (over: Partial<Button> = {}): Button => ({
  id: 'b1', label: 'S', type: 'script', language: 'python', script: 'print(1)',
  icon: { kind: 'auto' }, ...over
});

describe('interpreter + extension maps', () => {
  it('maps languages to interpreters', () => {
    expect(interpreterFor('javascript')).toBe('node');
    expect(interpreterFor('typescript')).toBe('tsx');
    expect(interpreterFor('python')).toBe('python3');
    expect(interpreterFor('sh')).toBe('sh');
  });
  it('maps languages to file extensions', () => {
    expect(extensionFor('javascript')).toBe('js');
    expect(extensionFor('typescript')).toBe('ts');
    expect(extensionFor('python')).toBe('py');
    expect(extensionFor('sh')).toBe('sh');
  });
  it('quotes the temp path in the invocation', () => {
    expect(scriptInvocation('python', '/tmp/a b.py')).toBe('python3 "/tmp/a b.py"');
  });
});

const deps = (over: Partial<ScriptExecDeps> = {}): ScriptExecDeps => ({
  writeFile: vi.fn(),
  remove: vi.fn(),
  tmpDir: () => '/tmp',
  uuid: () => 'uuid1',
  join: (...p: string[]) => p.join('/'),
  shell: () => '/bin/zsh',
  platform: 'darwin',
  ...over
});

describe('resolveScriptSpawn', () => {
  it('writes the body to a temp file with the language extension', () => {
    const d = deps();
    resolveScriptSpawn(scriptButton({ language: 'typescript', script: 'export const x = 1' }), d);
    expect(d.writeFile).toHaveBeenCalledWith('/tmp/deckpad-uuid1.ts', 'export const x = 1');
  });

  it('on POSIX, runs via the login shell with -lc', () => {
    const spec = resolveScriptSpawn(scriptButton({ language: 'sh', script: 'echo hi' }), deps());
    expect(spec).toMatchObject({
      file: '/bin/zsh',
      args: ['-lc', 'sh "/tmp/deckpad-uuid1.sh"'],
      shell: false
    });
  });

  it('on POSIX with a bare sh shell, uses -c (since -l is not portable to sh/dash)', () => {
    const spec = resolveScriptSpawn(scriptButton({ language: 'sh', script: 'echo hi' }), deps({ shell: () => '/bin/sh' }));
    expect(spec).toMatchObject({
      file: '/bin/sh',
      args: ['-c', 'sh "/tmp/deckpad-uuid1.sh"'],
      shell: false
    });
  });

  it('on win32, runs the interpreter via shell:true (inherited PATH)', () => {
    const spec = resolveScriptSpawn(scriptButton({ language: 'javascript', script: 'console.log(1)' }), deps({ platform: 'win32' }));
    expect(spec).toMatchObject({ file: 'node "/tmp/deckpad-uuid1.js"', args: [], shell: true });
  });

  it('cleanup removes the temp file', () => {
    const d = deps();
    const spec = resolveScriptSpawn(scriptButton(), d);
    spec.cleanup!();
    expect(d.remove).toHaveBeenCalledWith('/tmp/deckpad-uuid1.py');
  });

  it('defaults a missing language to sh', () => {
    const d = deps();
    resolveScriptSpawn(scriptButton({ language: undefined, script: 'echo hi' }), d);
    expect(d.writeFile).toHaveBeenCalledWith('/tmp/deckpad-uuid1.sh', 'echo hi');
  });
});
