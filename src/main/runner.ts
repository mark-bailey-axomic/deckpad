import type { ChildProcess, spawn as nodeSpawn } from 'node:child_process';
import { OUTPUT_BATCH_MS, OUTPUT_RING_CAPACITY, SIGKILL_ESCALATION_MS } from '@shared/constants';
import type { ActionStateEvent, Button, RunningSnapshot } from '@shared/types';
import { OutputBatcher } from './output-batcher';
import { RingBuffer } from './ring-buffer';

export interface RunnerOptions {
  spawn: typeof nodeSpawn;
  send: (e: ActionStateEvent) => void;
  platform?: NodeJS.Platform;
  /** Injectable for tests; defaults to process.kill (negative pid = whole tree). */
  kill?: (pid: number, signal: NodeJS.Signals) => void;
}

interface Run {
  child: ChildProcess;
  startedAt: number;
  output: RingBuffer;
  batcher: OutputBatcher;
  killTimer?: ReturnType<typeof setTimeout>;
}

export class Runner {
  private readonly runs = new Map<string, Run>();
  private readonly spawn: typeof nodeSpawn;
  private readonly send: (e: ActionStateEvent) => void;
  private readonly platform: NodeJS.Platform;
  private readonly kill: (pid: number, signal: NodeJS.Signals) => void;

  constructor(opts: RunnerOptions) {
    this.spawn = opts.spawn;
    this.send = opts.send;
    this.platform = opts.platform ?? process.platform;
    this.kill = opts.kill ?? ((pid, signal) => process.kill(pid, signal));
  }

  isRunning(id: string): boolean {
    return this.runs.has(id);
  }

  hasRunning(): boolean {
    return this.runs.size > 0;
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
      output.push(...chunk.split('\n').filter((l) => l.length > 0));
      this.send({ type: 'output', buttonId: id, chunk });
    });

    const child = this.spawn(button.command ?? '', {
      shell: true,
      cwd: button.cwd || undefined,
      detached: this.platform !== 'win32'
    });

    this.runs.set(id, { child, startedAt, output, batcher });
    this.send({ type: 'started', buttonId: id, startedAt });

    child.stdout?.on('data', (d: Buffer) => batcher.push(d.toString()));
    child.stderr?.on('data', (d: Buffer) => batcher.push(d.toString()));
    child.on('error', (err: Error) => {
      batcher.push(`${err.message}\n`);
      this.finish(id, -1); // spec: spawn error treated as exit -1
    });
    child.on('exit', (code: number | null) => this.finish(id, code ?? -1));
  }

  private finish(id: string, code: number): void {
    const run = this.runs.get(id);
    if (!run) return; // already finished (error + exit double-fire)
    run.batcher.dispose();
    if (run.killTimer) clearTimeout(run.killTimer);
    this.runs.delete(id);
    this.send({ type: 'exited', buttonId: id, code, ranFor: Date.now() - run.startedAt });
  }

  stop(id: string): void {
    const run = this.runs.get(id);
    const pid = run?.child.pid;
    if (!run || !pid) return;
    if (this.platform === 'win32') {
      // taskkill kills the whole tree forcibly; 'exit' on the child fires finish().
      this.spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { shell: false });
      return;
    }
    // POSIX: signal the process group (detached spawn made the child a group leader).
    this.kill(-pid, 'SIGTERM');
    run.killTimer = setTimeout(() => {
      if (this.runs.has(id)) this.kill(-pid, 'SIGKILL');
    }, SIGKILL_ESCALATION_MS);
  }

  killAll(): void {
    for (const id of [...this.runs.keys()]) this.stop(id);
  }
}
