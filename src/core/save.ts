/**
 * Versioned save schema with migrations.
 *
 * The save lives under a single namespaced localStorage key. Each load:
 * 1. Reads and parses the JSON (fail-safe to a fresh default).
 * 2. Reconciles missing fields against the current default shape.
 * 3. Re-saves on next mutation.
 *
 * Writes are debounced; callers can also call `flush()` to force a sync write.
 */

import { readString, writeString } from './storage';

export const SCHEMA_VERSION = 1 as const;

export interface QuestSaveEntry {
  id: string;
  def: {
    kind: string;
    name: string;
    target: number;
    coins: number;
    booster?: { id: string; n: number };
    icon: string;
  };
  progress: number;
  claimed: boolean;
}

export interface AchievementSaveEntry {
  progress: number;
  unlocked: boolean;
  claimedAt: number | null;
}

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
    levelStars: Record<string, number>;
    chapterMax: number;
    levelInChapterMax: number;
  };
  daily: {
    streakDay: number;
    lastClaimUtcDay: string | null;
  };
  quests: {
    rolledUtcDay: string | null;
    list: QuestSaveEntry[];
  };
  achievements: Record<string, AchievementSaveEntry>;
  inventory: {
    boosters: {
      extraTime: number;
      colorSort: number;
      revealHint: number;
      undo: number;
    };
    themes: string[];
    activeTheme: string;
  };
  onboarding: {
    finishedIntro: boolean;
    seenScrewTypes: string[];
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
    screwsPopped: number;
    coinsEarnedLifetime: number;
  };
}

export type Save = SaveV1;

const SAVE_KEY = 'save';

export function createFreshSave(): Save {
  const now = Date.now();
  return {
    v: 1,
    player: { coins: 0, xp: 0, rank: 1, totalPlayMs: 0, firstSeenAt: now, lastSeenAt: now },
    progress: { levelStars: {}, chapterMax: 1, levelInChapterMax: 1 },
    daily: { streakDay: 0, lastClaimUtcDay: null },
    quests: { rolledUtcDay: null, list: [] },
    achievements: {},
    inventory: {
      boosters: { extraTime: 1, colorSort: 1, revealHint: 1, undo: 2 },
      themes: ['classic'],
      activeTheme: 'classic',
    },
    onboarding: { finishedIntro: false, seenScrewTypes: ['standard'] },
    settings: { sound: true, music: true, haptics: true },
    stats: {
      levelsCleared: 0, threeStars: 0, boostersUsed: 0, adsWatched: 0,
      nearMissContinues: 0, maxCombo: 0, screwsPopped: 0, coinsEarnedLifetime: 0,
    },
  };
}

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
    quests: {
      rolledUtcDay: r.quests?.rolledUtcDay ?? null,
      list: Array.isArray(r.quests?.list) ? r.quests.list : [],
    },
    achievements: { ...(r.achievements ?? {}) },
    inventory: {
      boosters: { ...fresh.inventory.boosters, ...(r.inventory?.boosters ?? {}) },
      themes: Array.isArray(r.inventory?.themes) ? r.inventory.themes : ['classic'],
      activeTheme: r.inventory?.activeTheme ?? 'classic',
    },
    onboarding: {
      finishedIntro: r.onboarding?.finishedIntro ?? false,
      seenScrewTypes: Array.isArray(r.onboarding?.seenScrewTypes)
        ? r.onboarding.seenScrewTypes
        : ['standard'],
    },
    settings: { ...fresh.settings, ...(r.settings ?? {}) },
    stats: { ...fresh.stats, ...(r.stats ?? {}) },
  };
}

let cached: Save | null = null;
let dirty = false;
let pendingTimer: number | null = null;

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

export function markDirty(): void {
  dirty = true;
  if (pendingTimer !== null) return;
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    flush();
  }, 500);
}

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

export function update(mutator: (s: Save) => void): Save {
  const s = loadSave();
  mutator(s);
  markDirty();
  return s;
}
