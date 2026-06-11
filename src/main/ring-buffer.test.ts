import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  it('keeps insertion order under capacity', () => {
    const rb = new RingBuffer(3);
    rb.push('a', 'b');
    expect(rb.lines()).toEqual(['a', 'b']);
  });
  it('drops oldest lines beyond capacity', () => {
    const rb = new RingBuffer(3);
    rb.push('a', 'b', 'c', 'd', 'e');
    expect(rb.lines()).toEqual(['c', 'd', 'e']);
  });
  it('lines() returns a copy', () => {
    const rb = new RingBuffer(3);
    rb.push('a');
    rb.lines().push('hacked');
    expect(rb.lines()).toEqual(['a']);
  });
});
