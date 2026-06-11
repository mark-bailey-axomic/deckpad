/** Coalesces output chunks into at most one flush per interval (~50 ms per spec). */
export class OutputBatcher {
  private pending = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly flushFn: (chunk: string) => void
  ) {}

  push(chunk: string): void {
    this.pending += chunk;
    this.timer ??= setTimeout(() => this.flush(), this.intervalMs);
  }

  private flush(): void {
    this.timer = null;
    if (this.pending) {
      const out = this.pending;
      this.pending = '';
      this.flushFn(out);
    }
  }

  /** Flush whatever is pending now (used on process exit). */
  dispose(): void {
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
