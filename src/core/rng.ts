/**
 * Deterministic pseudo-random number generator. Used by the procedural
 * level generator so a given seed always produces the same level.
 *
 * Mulberry32 — small, fast, 32-bit. Quality is adequate for game content
 * generation (not for cryptography).
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
  /** Random element of `arr`. Throws if empty. */
  pick<T>(arr: readonly T[]): T;
  /** Shuffle a copy of `arr`. */
  shuffle<T>(arr: readonly T[]): T[];
  /** Return true with probability `p`. */
  chance(p: number): boolean;
}

export function createRng(seed: number): Rng {
  let s = (seed | 0) || 1;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => Math.floor(next() * (hi - lo + 1)) + lo,
    pick: <T,>(arr: readonly T[]): T => {
      if (arr.length === 0) throw new Error('pick from empty array');
      const idx = Math.floor(next() * arr.length);
      return arr[idx] as T;
    },
    shuffle: <T,>(arr: readonly T[]): T[] => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const a = out[i] as T;
        const b = out[j] as T;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
    chance: (p) => next() < p,
  };
}

/** Convert a deterministic level id into a numeric seed. */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
