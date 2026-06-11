/** Coalesces output chunks into at most one flush per interval (~50 ms per spec). */
export class OutputBatcher {
  private pending = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private held = false;
  private disposed = false;

  constructor(
    private readonly intervalMs: number,
    private readonly flushFn: (chunk: string) => void
  ) {}

  push(chunk: string): void {
    if (this.disposed) return; // dispose() is terminal: late pushes are dropped
    this.pending += chunk;
    if (!this.held) this.timer ??= setTimeout(() => this.flush(), this.intervalMs);
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  /** Suspend timer flushes but keep accumulating (process exited, stdio still draining). */
  hold(): void {
    this.held = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private flush(): void {
    this.timer = null;
    if (this.pending) {
      const out = this.pending;
      this.pending = '';
      this.flushFn(out);
    }
  }

  /** Flush whatever is pending now (used on process exit). Terminal: later pushes are dropped. */
  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending) {
      const out = this.pending;
      this.pending = '';
      this.flushFn(out);
    }
  }
}
