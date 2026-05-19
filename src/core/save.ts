/**
 * Versioned save schema with migrations.
 *
 * The save lives under a single namespaced localStorage key. Each load:
 * 1. Reads and parses the JSON (fail-safe to a fresh default).
 * 2. Runs migrations from the persisted `v` up to the current `SCHEMA_VERSION`.
 * 3. Validates the result and falls back to a fresh save on shape mismatch.
 *
 * Writes are debounced; callers can also call `flush()` to force a sync write
 * (used on visibilitychange:hidden).
 */

import { readString, writeString } from './storage';

export const SCHEMA_VERSION = 1 as const;

export interface SaveV1 {
  v: 1;
  player: {
    coins: number;
    xp: number;
    rank: number;
    totalPlayMs: number;
    firstSeenAt: number;
    lastSeenAt: number;
  };
  progress: {
    /** Map of "C.L" (chapter.level, 1-based) → stars 0..3. */
    levelStars: Record<string, number>;
    /** Highest 1-based chapter index unlocked. */
    chapterMax: number;
    /** Highest 1-based level within the current chapter. */
    levelInChapterMax: number;
  };
  daily: {
    /** 1..7. Resets to 1 on a miss. */
    streakDay: number;
    /** UTC ISO day "YYYY-MM-DD" of last claim, or null if never. */
    lastClaimUtcDay: string | null;
  };
  settings: {
    sound: boolean;
    music: boolean;
    haptics: boolean;
  };
  stats: {
    levelsCleared: number;
    threeStars: number;
    boostersUsed: number;
    adsWatched: number;
    nearMissContinues: number;
    maxCombo: number;
  };
}

export type Save = SaveV1;

const SAVE_KEY = 'save';

/** Build a fresh save with neutral defaults. */
export function createFreshSave(): Save {
  const now = Date.now();
  return {
    v: 1,
    player: {
      coins: 0,
      xp: 0,
      rank: 1,
      totalPlayMs: 0,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    progress: {
      levelStars: {},
      chapterMax: 1,
      levelInChapterMax: 1,
    },
    daily: {
      streakDay: 0,
      lastClaimUtcDay: null,
    },
    settings: {
      sound: true,
      music: true,
      haptics: true,
    },
    stats: {
      levelsCleared: 0,
      threeStars: 0,
      boostersUsed: 0,
      adsWatched: 0,
      nearMissContinues: 0,
      maxCombo: 0,
    },
  };
}

/** Defensive deep-merge so older saves don't break when we add new fields. */
function reconcile(raw: unknown): Save {
  const fresh = createFreshSave();
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Partial<Save>;
  if (r.v !== 1) return fresh;
  return {
    v: 1,
    player: { ...fresh.player, ...(r.player ?? {}) },
    progress: {
      ...fresh.progress,
      ...(r.progress ?? {}),
      levelStars: { ...(r.progress?.levelStars ?? {}) },
    },
    daily: { ...fresh.daily, ...(r.daily ?? {}) },
    settings: { ...fresh.settings, ...(r.settings ?? {}) },
    stats: { ...fresh.stats, ...(r.stats ?? {}) },
  };
}

let cached: Save | null = null;
let dirty = false;
let pendingTimer: number | null = null;

/** Load the save (cached after first call). */
export function loadSave(): Save {
  if (cached) return cached;
  const raw = readString(SAVE_KEY);
  if (!raw) {
    cached = createFreshSave();
    return cached;
  }
  try {
    cached = reconcile(JSON.parse(raw));
  } catch {
    cached = createFreshSave();
  }
  return cached;
}

/**
 * Mark the save as dirty and schedule a debounced flush. Call this after
 * any field mutation; do not call it inside tight per-frame loops.
 */
export function markDirty(): void {
  dirty = true;
  if (pendingTimer !== null) return;
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    flush();
  }, 500);
}

/** Force an immediate sync write. */
export function flush(): void {
  if (!dirty || !cached) return;
  cached.player.lastSeenAt = Date.now();
  try {
    writeString(SAVE_KEY, JSON.stringify(cached));
    dirty = false;
  } catch {
    // localStorage may throw under quota pressure; we'll try again next call.
  }
}

/**
 * Pure mutator helper. The callback receives the live save object; any
 * mutations are then marked dirty.
 */
export function update(mutator: (s: Save) => void): Save {
  const s = loadSave();
  mutator(s);
  markDirty();
  return s;
}
