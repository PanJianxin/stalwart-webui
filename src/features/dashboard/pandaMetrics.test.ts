import { describe, expect, it } from 'vitest';
import { counterDelta } from './pandaMetrics';
describe('mail counter sampling', () => {
  it('distinguishes idle intervals from restarts, missing samples and initial values', () => {
    expect(counterDelta(8, 5, 60, 60)).toBe(3);
    expect(counterDelta(5, 5, 60, 60)).toBe(0);
    expect(counterDelta(1, 5, 60, 60)).toBeNull();
    expect(counterDelta(8, 5, 600, 60)).toBeNull();
    expect(counterDelta(8, 5, 0, 60)).toBeNull();
    expect(counterDelta(NaN, 5, 60, 60)).toBeNull();
  });
});
