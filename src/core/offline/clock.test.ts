import { describe, expect, it } from 'vitest';
import { nextTimestamp } from './clock';

describe('nextTimestamp', () => {
  it('never returns the same timestamp twice, even called back-to-back', () => {
    const timestamps = Array.from({ length: 50 }, () => nextTimestamp());
    expect(new Set(timestamps).size).toBe(50);
  });

  it('is strictly increasing', () => {
    const a = nextTimestamp();
    const b = nextTimestamp();
    expect(a < b).toBe(true);
  });

  it('produces a valid ISO string', () => {
    expect(() => new Date(nextTimestamp()).toISOString()).not.toThrow();
  });
});
