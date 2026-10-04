import { describe, expect, it } from 'vitest';
import { positionBetween } from '../../src/lib/ordering.js';

function createSeededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('positionBetween', () => {
  it('generates 1,000 sequential append keys with stable byte-order ordering', () => {
    const keys: string[] = [];
    let prev: string | null = null;

    for (let index = 0; index < 1000; index += 1) {
      const key = positionBetween(prev, null);
      keys.push(key);
      prev = key;
    }

    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
  });

  it('generates 1,000 deterministic random-insert keys while preserving insertion order', () => {
    const ordered: string[] = [];
    const random = createSeededRandom(1337);

    for (let index = 0; index < 1000; index += 1) {
      const insertIndex = Math.floor(random() * (ordered.length + 1));
      const prev = insertIndex === 0 ? null : ordered[insertIndex - 1] ?? null;
      const next = insertIndex >= ordered.length ? null : ordered[insertIndex] ?? null;
      const key = positionBetween(prev, next);

      ordered.splice(insertIndex, 0, key);
    }

    expect(new Set(ordered).size).toBe(ordered.length);
    expect([...ordered].sort()).toEqual(ordered);
  });
});
