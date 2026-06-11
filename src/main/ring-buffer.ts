/** Fixed-capacity line buffer; oldest lines are discarded first. */
export class RingBuffer {
  private buf: string[] = [];

  constructor(private readonly capacity: number) {}

  push(...lines: string[]): void {
    this.pushAll(lines);
  }

  /** Array form: no argument spreading, so unbounded batches cannot overflow the call stack. */
  pushAll(lines: string[]): void {
    // Only the tail can survive anyway — slice before concat so one firehose flush stays O(capacity).
    const tail = lines.length > this.capacity ? lines.slice(-this.capacity) : lines;
    this.buf = this.buf.concat(tail);
    if (this.buf.length > this.capacity) this.buf = this.buf.slice(-this.capacity);
  }

  lines(): string[] {
    return [...this.buf];
  }
}
