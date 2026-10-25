import { describe, expect, it } from 'vitest';
import { wilson } from './stats.js';

describe('wilson', () => {
  it('matches published 95% intervals', () => {
    // n / (n + z^2) is the closed-form lower bound when every case succeeded.
    expect(wilson(21, 21)!.low).toBeCloseTo(21 / (21 + 1.96 ** 2), 6);
    expect(wilson(21, 21)!.high).toBe(1);
    expect(wilson(0, 10)!.low).toBe(0);
    expect(wilson(0, 10)!.high).toBeCloseTo(0.2775, 4);
    const half = wilson(5, 10)!;
    expect(half.low).toBeCloseTo(0.2366, 4);
    expect(half.high).toBeCloseTo(0.7634, 4);
  });

  it('has no interval without cases', () => {
    expect(wilson(0, 0)).toBeNull();
  });
});
