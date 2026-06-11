/** Fixed-capacity line buffer; oldest lines are discarded first. */
export class RingBuffer {
  private buf: string[] = [];

  constructor(private readonly capacity: number) {}

  push(...lines: string[]): void {
    this.buf.push(...lines);
    if (this.buf.length > this.capacity) this.buf = this.buf.slice(-this.capacity);
  }

  lines(): string[] {
    return [...this.buf];
  }
}
