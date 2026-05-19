/**
 * "Welcome back" bonus — fires when the player returns after a meaningful
 * absence (≥ 12 hours). A small instant reward (50 coins + 1 booster) makes
 * the return feel acknowledged before the daily-chest sequence kicks in.
 */

import { loadSave, update } from '@/core/save';
import { awardCoins } from '@/economy/currency';
import { grant } from '@/economy/boosters';
import type { BoosterId } from '@/economy/boosters';

const MIN_GAP_MS = 12 * 60 * 60 * 1000; // 12h
const MAX_GAP_MS = 30 * 24 * 60 * 60 * 1000; // 30d

export interface WelcomeBackReward {
  coins: number;
  booster: { id: BoosterId; n: number };
  /** Hours since last seen. */
  gapHours: number;
}

/**
 * If the player has been away long enough, return the reward to grant.
 * Updates `lastSeenAt` regardless so the function is idempotent per visit.
 */
export function maybeReward(now: number = Date.now()): WelcomeBackReward | null {
  const s = loadSave();
  const gap = now - s.player.lastSeenAt;
  // Update lastSeenAt immediately so this is idempotent per session.
  update((m) => { m.player.lastSeenAt = now; });

  if (gap < MIN_GAP_MS) return null;
  if (gap > MAX_GAP_MS) {
    // Cap stays the same; we don't want a fresh save's huge gap to dwarf real ones.
  }

  // Scale: 50 coins minimum, +25 per full day away (cap 7 days).
  const days = Math.min(7, Math.floor(gap / (24 * 60 * 60 * 1000)));
  const coins = 50 + days * 25;
  const booster: { id: BoosterId; n: number } = days >= 2
    ? { id: 'colorSort', n: 1 }
    : { id: 'undo', n: 1 };

  awardCoins(coins);
  grant(booster.id, booster.n);
  return { coins, booster, gapHours: Math.round(gap / 3_600_000) };
}
