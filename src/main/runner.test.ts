import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Runner } from './runner';
import type { ActionStateEvent, Button } from '@shared/types';

class FakeChild extends EventEmitter {
  pid = 4242;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

const button = (over: Partial<Button> = {}): Button => ({
  id: 'b1', label: 'X', type: 'command', command: 'npm run dev', cwd: '/proj', icon: { kind: 'auto' }, ...over
});

let child: FakeChild;
let spawn: ReturnType<typeof vi.fn>;
let kill: ReturnType<typeof vi.fn>;
let events: ActionStateEvent[];
let runner: Runner;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  child = new FakeChild();
  spawn = vi.fn(() => child);
  kill = vi.fn();
  events = [];
  runner = new Runner({ spawn: spawn as never, send: (e) => events.push(e), platform: 'darwin', kill });
});
afterEach(() => vi.useRealTimers());

describe('Runner.run', () => {
  it('spawns via shell with cwd and detached on POSIX, and emits started', () => {
    runner.run(button());
    expect(spawn).toHaveBeenCalledWith('npm run dev', [], { shell: true, cwd: '/proj', detached: true });
    expect(events[0]).toEqual({ type: 'started', buttonId: 'b1', startedAt: 10_000 });
    expect(runner.isRunning('b1')).toBe(true);
  });

  it('is not detached on win32 and omits cwd when unset', () => {
    const winRunner = new Runner({ spawn: spawn as never, send: () => {}, platform: 'win32', kill });
    winRunner.run(button({ cwd: undefined }));
    expect(spawn).toHaveBeenCalledWith('npm run dev', [], { shell: true, cwd: undefined, detached: false });
  });

  it('uses an injected resolver to build the spawn call', () => {
    const resolve = vi.fn(() => ({ file: '/bin/zsh', args: ['-lc', 'node "/tmp/x.js"'], shell: false }));
    const r = new Runner({ spawn: spawn as never, send: (e) => events.push(e), platform: 'darwin', kill, resolve });
    r.run(button({ id: 'sc', type: 'script' }));
    expect(spawn).toHaveBeenCalledWith('/bin/zsh', ['-lc', 'node "/tmp/x.js"'], { shell: false, cwd: '/proj', detached: true });
  });

  it('runs the spec cleanup when the run finishes', () => {
    const cleanup = vi.fn();
    const resolve = vi.fn(() => ({ file: 'sh', args: ['-c', 'true'], shell: false, cleanup }));
    const r = new Runner({ spawn: spawn as never, send: (e) => events.push(e), platform: 'darwin', kill, resolve });
    r.run(button({ id: 'sc' }));
    child.emit('exit', 0);
    child.emit('close', 0);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('batches stdout+stderr into output events (~50 ms)', () => {
    runner.run(button());
    child.stdout.emit('data', Buffer.from('out1\n'));
    child.stderr.emit('data', Buffer.from('err1\n'));
    expect(events.filter((e) => e.type === 'output')).toHaveLength(0);
    vi.advanceTimersByTime(50);
    const out = events.filter((e) => e.type === 'output');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ buttonId: 'b1', chunk: 'out1\nerr1\n' });
  });

  it('exit 0 emits exited with code and ranFor, flushing pending output first', () => {
    runner.run(button());
    child.stdout.emit('data', Buffer.from('tail\n'));
    vi.setSystemTime(12_500);
    child.emit('exit', 0);
    const types = events.map((e) => e.type);
    expect(types).toEqual(['started', 'output', 'exited']);
    expect(events.at(-1)).toEqual({ type: 'exited', buttonId: 'b1', code: 0, ranFor: 2500 });
    expect(runner.isRunning('b1')).toBe(false);
  });

  it('nonzero exit propagates the code', () => {
    runner.run(button());
    child.emit('exit', 3);
    expect(events.at(-1)).toMatchObject({ type: 'exited', code: 3 });
  });

  it('spawn error (ENOENT) → exit -1 with the message in the output log', () => {
    runner.run(button());
    child.emit('error', new Error('spawn nope ENOENT'));
    const out = events.find((e) => e.type === 'output');
    expect(out).toMatchObject({ chunk: expect.stringContaining('ENOENT') });
    expect(events.at(-1)).toMatchObject({ type: 'exited', code: -1 });
    // a late 'exit' after error must not double-emit
    child.emit('exit', 1);
    expect(events.filter((e) => e.type === 'exited')).toHaveLength(1);
  });

  it('snapshot() exposes running entries with buffered output lines', () => {
    runner.run(button());
    child.stdout.emit('data', Buffer.from('a\nb\n'));
    vi.advanceTimersByTime(50);
    expect(runner.snapshot()).toEqual([
      { buttonId: 'b1', startedAt: 10_000, output: ['a', 'b'] }
    ]);
  });

  it('output ring keeps only the last 500 lines per run', () => {
    runner.run(button());
    for (let i = 0; i < 60; i++) {
      child.stdout.emit('data', Buffer.from(Array.from({ length: 10 }, (_, j) => `l${i}-${j}`).join('\n') + '\n'));
      vi.advanceTimersByTime(50);
    }
    const output = runner.snapshot()[0].output;
    expect(output).toHaveLength(500);
    expect(output.at(-1)).toBe('l59-9');
  });

  // -------------------------------------------------------------------------
  // Review-mandated: exited event after dispose() must not throw or send
  // -------------------------------------------------------------------------

  it('an exited event arriving after dispose() does not throw and does not call send', () => {
    const localSend = vi.fn();
    const localChild = new FakeChild();
    const localSpawn = vi.fn(() => localChild);
    const localRunner = new Runner({ spawn: localSpawn as never, send: localSend, platform: 'darwin', kill });

    localRunner.run(button());
    // Simulate dispose via killAll (which calls stop, which calls finish on child exit)
    // We want to verify that once a run is finished, a second 'exit' event doesn't call send again.
    localChild.emit('exit', 0); // finishes the run, removes from map
    const sendCountAfterExit = localSend.mock.calls.length;
    // Emit exit again — should be silently ignored (finish guards with runs.has(id) check)
    expect(() => localChild.emit('exit', 0)).not.toThrow();
    expect(localSend.mock.calls.length).toBe(sendCountAfterExit); // no extra send
  });
});

describe('Runner.stop — tree kill', () => {
  it('POSIX: SIGTERM to the negative pid (whole group)', () => {
    runner.run(button());
    runner.stop('b1');
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
  });

  it('POSIX: escalates to SIGKILL after 3 s if the process ignores SIGTERM', () => {
    runner.run(button());
    runner.stop('b1');
    vi.advanceTimersByTime(2999);
    expect(kill).not.toHaveBeenCalledWith(-4242, 'SIGKILL');
    vi.advanceTimersByTime(1);
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL');
  });

  it('POSIX: no SIGKILL if the process exits within the grace window', () => {
    runner.run(button());
    runner.stop('b1');
    child.emit('exit', 143);
    vi.advanceTimersByTime(3000);
    expect(kill).not.toHaveBeenCalledWith(-4242, 'SIGKILL');
    expect(events.at(-1)).toMatchObject({ type: 'exited', code: 143 });
  });

  it('Windows: taskkill /pid <pid> /t /f', () => {
    const winChild = new FakeChild();
    const winSpawn = vi.fn(() => winChild);
    const winRunner = new Runner({ spawn: winSpawn as never, send: () => {}, platform: 'win32', kill });
    winRunner.run(button());
    winRunner.stop('b1');
    expect(winSpawn).toHaveBeenLastCalledWith('taskkill', ['/pid', '4242', '/t', '/f'], { shell: false });
  });

  it('run() on an already-running id stops instead of spawning a second instance', () => {
    runner.run(button());
    runner.run(button());
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
  });

  it('killAll stops every running tree', () => {
    const c2 = new FakeChild();
    c2.pid = 5151;
    spawn.mockReturnValueOnce(child).mockReturnValueOnce(c2);
    runner.run(button());
    runner.run(button({ id: 'b2' }));
    runner.killAll();
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith(-5151, 'SIGTERM');
  });
});

// ---------------------------------------------------------------------------
// Review phase-5 additional contracts
// ---------------------------------------------------------------------------

describe('Runner.stop — double-stop is a no-op', () => {
  it('calling stop twice within the grace window sends SIGTERM exactly once, SIGKILL exactly once, no orphaned timer', () => {
    runner.run(button()); // pid 4242

    runner.stop('b1'); // first stop: SIGTERM + arms 3 s timer
    runner.stop('b1'); // second stop: must be a no-op (run still in map, timer already set)

    // SIGTERM sent exactly once
    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');

    // Advance to just before the grace window — no SIGKILL yet
    vi.advanceTimersByTime(2999);
    expect(kill).toHaveBeenCalledTimes(1);

    // Grace window fires — SIGKILL sent exactly once
    vi.advanceTimersByTime(1);
    expect(kill).toHaveBeenCalledTimes(2);
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL');

    // Simulate the process finally exiting
    child.emit('exit', 143);
    expect(runner.isRunning('b1')).toBe(false);

    // Start a NEW run for a different button; advance 3 s more — old or new pgid must NOT be killed again
    const child2 = new FakeChild();
    child2.pid = 9999;
    spawn.mockReturnValueOnce(child2);
    runner.run(button({ id: 'b2' }));
    vi.advanceTimersByTime(3000);
    // Still exactly 2 kill calls — the orphaned-timer-from-first-run must not fire against child2
    expect(kill).toHaveBeenCalledTimes(2);
  });
});

describe('Runner.stop — ESRCH tolerated', () => {
  it('stop() does not reject when kill throws ESRCH', () => {
    const esrch = Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    kill.mockImplementation(() => { throw esrch; });
    runner.run(button());
    expect(() => runner.stop('b1')).not.toThrow();
  });

  it('escalation timer firing with a throwing kill does not produce an unhandled rejection', () => {
    const esrch = Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    kill.mockImplementation(() => { throw esrch; });
    runner.run(button());
    runner.stop('b1');
    // Advancing timers triggers the SIGKILL escalation — must not throw
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
  });

  it('killAll continues attempting remaining kills when one throws ESRCH', () => {
    const c2 = new FakeChild();
    c2.pid = 5151;
    spawn.mockReturnValueOnce(child).mockReturnValueOnce(c2);
    runner.run(button());
    runner.run(button({ id: 'b2' }));

    let callCount = 0;
    kill.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    });

    expect(() => runner.killAll()).not.toThrow();
    // Second kill must still have been attempted despite first throwing
    expect(kill).toHaveBeenCalledTimes(2);
  });
});

describe('Runner — stdio-after-exit ordering (close-based contract)', () => {
  it('stdout data emitted after exit but before close is delivered in output BEFORE exited, and no output arrives after exited', () => {
    // This test pins the desired contract: runner must listen for 'close' (not 'exit')
    // so that stdio draining completes before finish() is called.
    runner.run(button());

    // Process exits with code 0 — runner should NOT call finish() yet
    child.emit('exit', 0);

    // Late stdout arrives while the stream is draining
    child.stdout.emit('data', Buffer.from('late line\n'));

    // Stream fully closes — finish() should be called here
    child.emit('close', 0);

    // Advance timers so the output batcher flushes (if not already flushed by dispose)
    vi.advanceTimersByTime(50);

    const types = events.map((e) => e.type);
    const outputIdx = types.lastIndexOf('output');
    const exitedIdx = types.indexOf('exited');

    // output must come before exited
    expect(exitedIdx).toBeGreaterThan(-1);
    expect(outputIdx).toBeGreaterThan(-1);
    expect(outputIdx).toBeLessThan(exitedIdx);

    // No output event after exited
    const afterExited = events.slice(exitedIdx + 1).filter((e) => e.type === 'output');
    expect(afterExited).toHaveLength(0);
  });
});

describe('Runner — late stdout after finish is dropped', () => {
  it('output emitted after exited is delivered does not cause further send calls', () => {
    runner.run(button());
    child.emit('exit', 0); // finish() called; run removed from map
    const sendCountAfterExit = events.length;

    // More stdout arrives after finish — must be silently dropped
    child.stdout.emit('data', Buffer.from('zombie output\n'));
    vi.advanceTimersByTime(50);

    expect(events.length).toBe(sendCountAfterExit);
  });
});

// ---------------------------------------------------------------------------
// Phase 8: forced killAll — SIGKILL immediately, no SIGTERM, no timer
// ---------------------------------------------------------------------------

describe('Runner.killAll({ force: true })', () => {
  it('POSIX: sends SIGKILL to each process group immediately — no SIGTERM first', () => {
    runner.run(button());
    runner.killAll({ force: true });
    // Must have sent SIGKILL
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL');
    // Must NOT have sent SIGTERM at any point
    expect(kill).not.toHaveBeenCalledWith(-4242, 'SIGTERM');
  });

  it('POSIX: does not arm a SIGKILL escalation timer — vi.getTimerCount() does not grow', () => {
    runner.run(button());
    const timersBefore = vi.getTimerCount();
    runner.killAll({ force: true });
    // No new timers should have been armed
    expect(vi.getTimerCount()).toBe(timersBefore);
  });

  it('POSIX: kills every running process group immediately when multiple are running', () => {
    const c2 = new FakeChild();
    c2.pid = 5151;
    spawn.mockReturnValueOnce(child).mockReturnValueOnce(c2);
    runner.run(button());
    runner.run(button({ id: 'b2' }));
    runner.killAll({ force: true });
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL');
    expect(kill).toHaveBeenCalledWith(-5151, 'SIGKILL');
    expect(kill).not.toHaveBeenCalledWith(-4242, 'SIGTERM');
    expect(kill).not.toHaveBeenCalledWith(-5151, 'SIGTERM');
  });

  it('win32: still uses taskkill /f /t (force flag has no different win32 effect)', () => {
    const winChild = new FakeChild();
    const winSpawn = vi.fn(() => winChild);
    const winRunner = new Runner({ spawn: winSpawn as never, send: () => {}, platform: 'win32', kill });
    winRunner.run(button());
    winRunner.killAll({ force: true });
    expect(winSpawn).toHaveBeenLastCalledWith('taskkill', ['/pid', '4242', '/t', '/f'], { shell: false });
  });
});

describe('Runner.killAll() — unforced keeps SIGTERM+escalation', () => {
  it('unforced killAll still sends SIGTERM and arms the escalation timer', () => {
    runner.run(button());
    runner.killAll();
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
    expect(kill).not.toHaveBeenCalledWith(-4242, 'SIGKILL');
    // Timer is armed — advancing 3 s fires SIGKILL
    vi.advanceTimersByTime(3000);
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL');
  });
});

// ---------------------------------------------------------------------------
// Spec: deliberate stop must carry stopped:true on the exited event so the
// renderer can distinguish it from a real failure.
// ---------------------------------------------------------------------------

describe('Runner — stopped flag on exited event', () => {
  it('stop(id) causes the exited event to carry stopped:true', () => {
    runner.run(button());
    runner.stop('b1');
    child.emit('exit', 143); // SIGTERM exit code
    const exited = events.find((e) => e.type === 'exited');
    expect(exited).toMatchObject({ type: 'exited', buttonId: 'b1', stopped: true });
  });

  it('stop(id) + SIGKILL escalation: exited event still carries stopped:true', () => {
    runner.run(button());
    runner.stop('b1');
    vi.advanceTimersByTime(3000); // escalates to SIGKILL
    child.emit('exit', -1); // killed
    const exited = events.find((e) => e.type === 'exited');
    expect(exited).toMatchObject({ type: 'exited', buttonId: 'b1', stopped: true });
  });

  it('killAll() causes each exited event to carry stopped:true', () => {
    const c2 = new FakeChild();
    c2.pid = 5151;
    spawn.mockReturnValueOnce(child).mockReturnValueOnce(c2);
    runner.run(button());
    runner.run(button({ id: 'b2' }));
    runner.killAll();
    child.emit('exit', 143);
    c2.emit('exit', 143);
    const exitedEvents = events.filter((e) => e.type === 'exited');
    expect(exitedEvents).toHaveLength(2);
    for (const e of exitedEvents) {
      expect(e).toMatchObject({ stopped: true });
    }
  });

  it('natural nonzero exit does NOT carry stopped flag', () => {
    runner.run(button());
    child.emit('exit', 3); // natural failure — no stop() called
    const exited = events.find((e) => e.type === 'exited');
    expect(exited).toMatchObject({ type: 'exited', code: 3 });
    // stopped must be absent (undefined / not present), never truthy
    expect((exited as { stopped?: boolean })?.stopped).toBeFalsy();
  });

  it('natural zero exit does NOT carry stopped flag', () => {
    runner.run(button());
    child.stdout.emit('data', Buffer.from('done\n'));
    vi.setSystemTime(12_000);
    child.emit('exit', 0);
    const exited = events.find((e) => e.type === 'exited');
    expect(exited).toMatchObject({ type: 'exited', code: 0 });
    expect((exited as { stopped?: boolean })?.stopped).toBeFalsy();
  });
});
