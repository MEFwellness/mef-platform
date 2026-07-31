/**
 * Deterministic seeded selection — used so the program generator can
 * "rotate among qualified options via a seed" (pick different, varied
 * exercises across generations) while staying perfectly reproducible for
 * the same seed + inputs, per this engine's own guard tests.
 *
 * Pure, no I/O, no Math.random() — same seed always produces the same
 * sequence of picks, on any machine, forever.
 */

/** FNV-1a string hash -> 32-bit unsigned int, used to turn an arbitrary seed string into a numeric PRNG seed. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG. Returns a function producing floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function createRng(seed: string): Rng {
  return mulberry32(hashSeed(seed));
}

/**
 * Deterministic Fisher-Yates shuffle. Callers must sort `items` by a stable
 * key (e.g. externalId) before calling this — array order from a database
 * query is not guaranteed stable across calls, and shuffling an
 * already-nondeterministic order would silently break reproducibility.
 */
export function seededShuffle<T>(items: T[], rng: Rng): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}
