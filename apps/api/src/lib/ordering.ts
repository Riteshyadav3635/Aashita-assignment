import { generateKeyBetween } from 'fractional-indexing';

export function positionBetween(prev: string | null, next: string | null): string {
  return generateKeyBetween(prev, next);
}
