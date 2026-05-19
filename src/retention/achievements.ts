/**
 * Achievement system.
 *
 * Achievements are passive milestones that fire automatically when their
 * trigger condition is met. Each tracks progress, can be claimed for a
 * coin reward, and shows a toast on unlock.
 *
 * `record(eventName, payload)` is called from gameplay events; the
 * relevant achievements update their progress and unlock when full.
 */

import { loadSave, update } from '@/core/save';
import { awardCoins } from '@/economy/currency';
import type { BoosterId } from '@/economy/boosters';
import { grant } from '@/economy/boosters';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Target value to unlock; numeric for counters, 1 for binary. */
  target: number;
  /** Coin reward on unlock. */
  reward: number;
  /** Optional booster reward. */
  boosterReward?: { id: BoosterId; n: number };
  icon: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // First-step encouragement
  { id: 'first-clear',  name: 'First Twist',     description: 'Clear your first level.', target: 1, reward: 25, icon: '🔩' },
  { id: 'first-combo3', name: 'On a Roll',       description: 'Reach a ×3 combo.',        target: 1, reward: 50, icon: '🔥' },
  { id: 'first-3star',  name: 'Perfectionist',   description: 'Earn 3 stars on any level.', target: 1, reward: 75, icon: '⭐' },

  // Level counters
  { id: 'clears-10',  name: 'Apprentice',  description: 'Clear 10 levels.',  target: 10,  reward: 100, icon: '🧰' },
  { id: 'clears-25',  name: 'Tinkerer',    description: 'Clear 25 levels.',  target: 25,  reward: 200, icon: '🛠' },
  { id: 'clears-50',  name: 'Mechanic',    description: 'Clear 50 levels.',  target: 50,  reward: 400, icon: '⚙️' },
  { id: 'clears-100', name: 'Master',      description: 'Clear 100 levels.', target: 100, reward: 800, icon: '🏆',
    boosterReward: { id: 'extraTime', n: 3 } },
  { id: 'clears-200', name: 'Grandmaster', description: 'Clear all 200 levels.', target: 200, reward: 2000, icon: '👑',
    boosterReward: { id: 'colorSort', n: 5 } },

  // Combos
  { id: 'combo-5',  name: 'Speedster',  description: 'Reach a ×5 combo.',  target: 1, reward: 100, icon: '🚀' },
  { id: 'combo-8',  name: 'Lightning',  description: 'Reach a ×8 combo.',  target: 1, reward: 200, icon: '⚡' },
  { id: 'combo-12', name: 'Untouchable', description: 'Reach a ×12 combo.', target: 1, reward: 500, icon: '💫',
    boosterReward: { id: 'revealHint', n: 3 } },

  // Stars
  { id: 'stars-30',  name: 'Star Climber', description: 'Earn 30 stars.',  target: 30,  reward: 150, icon: '✨' },
  { id: 'stars-100', name: 'Star Master',  description: 'Earn 100 stars.', target: 100, reward: 500, icon: '🌟' },
  { id: 'stars-300', name: 'Star Legend',  description: 'Earn 300 stars.', target: 300, reward: 1200, icon: '🌠' },

  // Daily streak
  { id: 'streak-3',  name: 'Habit Forming', description: 'Log in 3 days in a row.', target: 3, reward: 100, icon: '🔥' },
  { id: 'streak-7',  name: 'Dedicated',     description: 'Log in 7 days in a row.', target: 7, reward: 300, icon: '🔥',
    boosterReward: { id: 'undo', n: 3 } },
  { id: 'streak-14', name: 'Devoted',       description: 'Log in 14 days in a row.', target: 14, reward: 600, icon: '🔥' },

  // Economy
  { id: 'coins-1k',   name: 'Saver',     description: 'Earn 1,000 coins total.',   target: 1000,   reward: 100, icon: '🪙' },
  { id: 'coins-10k',  name: 'Wealthy',   description: 'Earn 10,000 coins total.',  target: 10000,  reward: 500, icon: '💰' },

  // Rank
  { id: 'rank-5',  name: 'Rising',  description: 'Reach Rank 5.',  target: 5,  reward: 150, icon: '⬆️' },
  { id: 'rank-15', name: 'Elite',   description: 'Reach Rank 15.', target: 15, reward: 500, icon: '🎖' },

  // Boosters / ads
  { id: 'boost-10', name: 'Tool Belt', description: 'Use 10 boosters.', target: 10, reward: 150, icon: '🧰' },
  { id: 'ads-5',    name: 'Sponsored', description: 'Watch 5 rewarded ads.', target: 5, reward: 250, icon: '▶️' },

  // Themes
  { id: 'themes-3', name: 'Decorator', description: 'Discover 3 themes.', target: 3, reward: 250, icon: '🎨' },
  { id: 'themes-all', name: 'Designer', description: 'Discover all themes.', target: 6, reward: 800, icon: '🖌',
    boosterReward: { id: 'colorSort', n: 5 } },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export interface AchievementProgress {
  def: AchievementDef;
  progress: number;
  unlocked: boolean;
}

export function listProgress(): AchievementProgress[] {
  const s = loadSave();
  return ACHIEVEMENTS.map((def) => {
    const entry = s.achievements[def.id];
    return {
      def,
      progress: entry?.progress ?? 0,
      unlocked: !!entry?.unlocked,
    };
  });
}

export function countUnlocked(): number {
  const s = loadSave();
  return ACHIEVEMENTS.filter((a) => s.achievements[a.id]?.unlocked).length;
}

/**
 * Update one achievement's progress by `delta`. Returns the achievement
 * def if it was unlocked by this call (so the caller can show a toast).
 */
function bumpRaw(id: string, delta: number): AchievementDef | null {
  const def = BY_ID.get(id);
  if (!def) return null;
  let unlockedNow: AchievementDef | null = null;
  update((s) => {
    const cur = s.achievements[id] ?? { progress: 0, unlocked: false };
    if (cur.unlocked) return;
    cur.progress = Math.min(def.target, cur.progress + delta);
    if (cur.progress >= def.target) {
      cur.unlocked = true;
      unlockedNow = def;
    }
    s.achievements[id] = cur;
  });
  return unlockedNow;
}

/** Set absolute progress (used for cumulative metrics tracked elsewhere). */
function setRaw(id: string, value: number): AchievementDef | null {
  const def = BY_ID.get(id);
  if (!def) return null;
  let unlockedNow: AchievementDef | null = null;
  update((s) => {
    const cur = s.achievements[id] ?? { progress: 0, unlocked: false };
    if (cur.unlocked) return;
    cur.progress = Math.min(def.target, Math.max(cur.progress, value));
    if (cur.progress >= def.target) {
      cur.unlocked = true;
      unlockedNow = def;
    }
    s.achievements[id] = cur;
  });
  return unlockedNow;
}

/** Claim an unlocked achievement; returns rewards or null if not claimable. */
export function claim(id: string): { coins: number; boosterReward?: { id: BoosterId; n: number } } | null {
  const def = BY_ID.get(id);
  if (!def) return null;
  const s = loadSave();
  const entry = s.achievements[id];
  if (!entry?.unlocked || entry.claimedAt) return null;
  update((m) => {
    const cur = m.achievements[id];
    if (cur) cur.claimedAt = Date.now();
  });
  awardCoins(def.reward);
  if (def.boosterReward) grant(def.boosterReward.id, def.boosterReward.n);
  return { coins: def.reward, boosterReward: def.boosterReward };
}

// ── Event dispatch ────────────────────────────────────────────────────

export type AchEvent =
  | { kind: 'level-cleared'; stars: number }
  | { kind: 'combo'; combo: number }
  | { kind: 'streak'; day: number }
  | { kind: 'coins-earned-total'; total: number }
  | { kind: 'rank'; rank: number }
  | { kind: 'booster-used' }
  | { kind: 'ad-watched' }
  | { kind: 'theme-discovered'; total: number };

/**
 * Process a gameplay event and return any newly-unlocked achievements
 * so the host can show toast notifications in order.
 */
export function record(event: AchEvent): AchievementDef[] {
  const unlocked: AchievementDef[] = [];
  const push = (def: AchievementDef | null) => { if (def) unlocked.push(def); };

  switch (event.kind) {
    case 'level-cleared':
      push(bumpRaw('first-clear', 1));
      push(bumpRaw('clears-10', 1));
      push(bumpRaw('clears-25', 1));
      push(bumpRaw('clears-50', 1));
      push(bumpRaw('clears-100', 1));
      push(bumpRaw('clears-200', 1));
      if (event.stars === 3) push(bumpRaw('first-3star', 1));
      push(bumpRaw('stars-30', event.stars));
      push(bumpRaw('stars-100', event.stars));
      push(bumpRaw('stars-300', event.stars));
      break;
    case 'combo':
      if (event.combo >= 3)  push(bumpRaw('first-combo3', 1));
      if (event.combo >= 5)  push(bumpRaw('combo-5', 1));
      if (event.combo >= 8)  push(bumpRaw('combo-8', 1));
      if (event.combo >= 12) push(bumpRaw('combo-12', 1));
      break;
    case 'streak':
      push(setRaw('streak-3', event.day));
      push(setRaw('streak-7', event.day));
      push(setRaw('streak-14', event.day));
      break;
    case 'coins-earned-total':
      push(setRaw('coins-1k', event.total));
      push(setRaw('coins-10k', event.total));
      break;
    case 'rank':
      push(setRaw('rank-5', event.rank));
      push(setRaw('rank-15', event.rank));
      break;
    case 'booster-used':
      push(bumpRaw('boost-10', 1));
      break;
    case 'ad-watched':
      push(bumpRaw('ads-5', 1));
      break;
    case 'theme-discovered':
      push(setRaw('themes-3', event.total));
      push(setRaw('themes-all', event.total));
      break;
  }
  return unlocked;
}
