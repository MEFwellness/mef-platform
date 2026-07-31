/**
 * Core Values Snapshot — deterministic per-seed shuffle. Pure, no I/O, no
 * randomness that isn't a function of its seed: called with a stable seed
 * (session id + a per-purpose suffix) so option order is randomized per
 * member but never reshuffles mid-session (a re-render, a back-navigation,
 * a resumed session must all see the same order they already saw).
 * Neither existing question-rendering system in this codebase (WBSA's
 * card, the Daily Check-In's DriverProbeField) has an option-order
 * randomization primitive to reuse — this is new, small, presentation-only
 * logic, not a new engine.
 */

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates using a seeded PRNG — same seed always yields the same order. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const random = mulberry32(hashSeed(seed));
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
