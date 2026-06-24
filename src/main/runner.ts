import type { ChildProcess, spawn as nodeSpawn } from 'node:child_process';
import { OUTPUT_BATCH_MS, OUTPUT_RING_CAPACITY, SIGKILL_ESCALATION_MS } from '@shared/constants';
import type { ActionStateEvent, Button, RunningSnapshot } from '@shared/types';
import { OutputBatcher } from './output-batcher';
import { RingBuffer } from './ring-buffer';

export interface ResolvedSpawn {
  /** Program to spawn (or the full command string when shell is true). */
  file: string;
  args: string[];
  shell: boolean;
  /** Invoked once when the run finishes — e.g. delete a script temp file. */
  cleanup?: () => void;
}

/** Default resolver: a command button runs its string through the shell. */
export function commandSpawn(button: Button): ResolvedSpawn {
  return { file: button.command ?? '', args: [], shell: true };
}

export interface RunnerOptions {
  spawn: typeof nodeSpawn;
  send: (e: ActionStateEvent) => void;
  platform?: NodeJS.Platform;
  /** Injectable for tests; defaults to process.kill (negative pid = whole tree). */
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  /** Maps a button to its spawn invocation; defaults to commandSpawn. */
  resolve?: (button: Button) => ResolvedSpawn;
}

interface Run {
  child: ChildProcess;
  startedAt: number;
  output: RingBuffer;
  batcher: OutputBatcher;
  killTimer?: ReturnType<typeof setTimeout>;
  /** Set when 'exit' fired but finish() is deferred until 'close' (stdio still draining). */
  exitCode?: number;
  /** Set when stop() or killAll() requested this run to be killed. */
  stopped?: boolean;
  /** Spec cleanup (e.g. delete a script temp file); run once in finish(). */
  cleanup?: () => void;
}

export class Runner {
  private readonly runs = new Map<string, Run>();
  private readonly spawn: typeof nodeSpawn;
  private readonly send: (e: ActionStateEvent) => void;
  private readonly platform: NodeJS.Platform;
  private readonly kill: (pid: number, signal: NodeJS.Signals) => void;
  private readonly resolve: (button: Button) => ResolvedSpawn;

  constructor(opts: RunnerOptions) {
    this.spawn = opts.spawn;
    this.send = opts.send;
    this.platform = opts.platform ?? process.platform;
    this.kill = opts.kill ?? ((pid, signal) => process.kill(pid, signal));
    this.resolve = opts.resolve ?? commandSpawn;
  }

  isRunning(id: string): boolean {
    return this.runs.has(id);
  }

  runningCount(): number {
    return this.runs.size;
  }

  snapshot(): RunningSnapshot[] {
    return [...this.runs.entries()].map(([buttonId, r]) => ({
      buttonId,
      startedAt: r.startedAt,
      output: r.output.lines()
    }));
  }

  /** Spec: press while running = stop, never a second instance. */
  run(button: Button): void {
    if (this.runs.has(button.id)) {
      this.stop(button.id);
      return;
    }
    const id = button.id;
    const startedAt = Date.now();
    const output = new RingBuffer(OUTPUT_RING_CAPACITY);
    const batcher = new OutputBatcher(OUTPUT_BATCH_MS, (chunk) => {
      // pushAll caps a firehose flush to the ring capacity without spreading huge arrays.
      output.pushAll(chunk.split('\n').filter((l) => l.length > 0));
      this.send({ type: 'output', buttonId: id, chunk });
    });

    const spec = this.resolve(button);
    const child = this.spawn(spec.file, spec.args, {
      shell: spec.shell,
      cwd: button.cwd || undefined,
      detached: this.platform !== 'win32'
    });

    this.runs.set(id, { child, startedAt, output, batcher, cleanup: spec.cleanup });
    this.send({ type: 'started', buttonId: id, startedAt });

    child.stdout?.on('data', (d: Buffer) => batcher.push(d.toString()));
    child.stderr?.on('data', (d: Buffer) => batcher.push(d.toString()));
    child.on('error', (err: Error) => {
      batcher.push(`${err.message}\n`);
      this.finish(id, -1); // spec: spawn error treated as exit -1
    });
    child.on('exit', (code: number | null) => {
      const run = this.runs.get(id);
      if (!run) return; // already finished (error path)
      const exitCode = code ?? -1;
      if (exitCode !== 0 || run.batcher.hasPending()) {
        // Failure/signal exits (and exits with output already in hand) deliver immediately.
        this.finish(id, exitCode);
        return;
      }
      // Clean, quiet exit: defer to 'close' so draining stdio is flushed BEFORE 'exited'.
      run.exitCode = exitCode;
      run.batcher.hold();
    });
    child.on('close', (code: number | null) => {
      const run = this.runs.get(id);
      if (!run) return; // double-fire guard (error/exit already finished the run)
      this.finish(id, run.exitCode ?? code ?? -1);
    });
  }

  private finish(id: string, code: number): void {
    const run = this.runs.get(id);
    if (!run) return; // already finished (error + close double-fire)
    run.batcher.dispose(); // flushes final output first; later pushes are dropped
    try {
      run.cleanup?.();
    } catch {
      // temp file already gone / unlink raced with exit — nothing actionable
    }
    if (run.killTimer) {
      clearTimeout(run.killTimer);
      run.killTimer = undefined;
    }
    const stopped = run.stopped === true;
    this.runs.delete(id);
    this.send({
      type: 'exited',
      buttonId: id,
      code,
      ranFor: Date.now() - run.startedAt,
      ...(stopped ? { stopped: true } : {})
    });
  }

  stop(id: string): void {
    const run = this.runs.get(id);
    const pid = run?.child.pid;
    if (!run || !pid) return;
    if (run.killTimer) return; // stop already in progress: never re-signal or re-arm the timer
    run.stopped = true;
    if (this.platform === 'win32') {
      // taskkill kills the whole tree forcibly; 'exit'/'close' on the child fires finish().
      this.spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { shell: false })
        .on('error', () => undefined); // taskkill unavailable/denied: nothing actionable
      return;
    }
    // POSIX: signal the process group (detached spawn made the child a group leader).
    try {
      this.kill(-pid, 'SIGTERM');
    } catch {
      // ESRCH et al: group already gone; the child's 'close' will finish the run
    }
    run.killTimer = setTimeout(() => {
      run.killTimer = undefined;
      if (!this.runs.has(id)) return;
      try {
        this.kill(-pid, 'SIGKILL');
      } catch {
        // already dead between SIGTERM and escalation
      }
    }, SIGKILL_ESCALATION_MS);
  }

  killAll(opts?: { force?: boolean }): void {
    if (opts?.force) {
      for (const run of [...this.runs.values()]) this.forceKill(run);
      return;
    }
    for (const id of [...this.runs.keys()]) {
      try {
        this.stop(id);
      } catch {
        // keep stopping the remaining runs
      }
    }
  }

  /** Immediate kill — no SIGTERM grace, no escalation timer. Used when the app is quitting now. */
  private forceKill(run: Run): void {
    const pid = run.child.pid;
    if (!pid) return;
    run.stopped = true;
    if (this.platform === 'win32') {
      // taskkill /f is already forced; same path as stop().
      this.spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { shell: false })
        .on('error', () => undefined); // taskkill unavailable/denied: nothing actionable
      return;
    }
    try {
      this.kill(-pid, 'SIGKILL');
    } catch {
      // ESRCH et al: group already gone
    }
  }
}
