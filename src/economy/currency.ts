/**
 * Currency + XP. Persists through `core/save.ts`.
 *
 * Coins are the primary soft currency: earned per level, per daily login,
 * and from bucket-clear bursts. Gems are reserved for future passes (no
 * IAP on CrazyGames). XP feeds into a visible "Rank" indicator that
 * gives players a meta progress meter beyond stars.
 */

import { loadSave, update } from '@/core/save';

/** XP cost of rank N (1-based). Doubles every 5 ranks for the long tail. */
export function xpForNextRank(rank: number): number {
  return 80 + Math.floor(rank * 24 + Math.pow(rank, 1.45) * 4);
}

export function awardCoins(amount: number): number {
  if (amount <= 0) return loadSave().player.coins;
  update((s) => {
    s.player.coins += amount;
  });
  return loadSave().player.coins;
}

export function spendCoins(amount: number): boolean {
  const s = loadSave();
  if (amount <= 0) return true;
  if (s.player.coins < amount) return false;
  update((m) => {
    m.player.coins -= amount;
  });
  return true;
}

/** Award XP. Returns the number of ranks gained (≥ 0). */
export function awardXp(amount: number): number {
  if (amount <= 0) return 0;
  let ranksGained = 0;
  update((s) => {
    s.player.xp += amount;
    // Roll over excess XP into the next rank.
    while (s.player.xp >= xpForNextRank(s.player.rank)) {
      s.player.xp -= xpForNextRank(s.player.rank);
      s.player.rank += 1;
      ranksGained += 1;
    }
  });
  return ranksGained;
}

export interface XpProgress {
  rank: number;
  xpIntoRank: number;
  xpForNextRank: number;
  fraction: number;
}

export function xpProgress(): XpProgress {
  const s = loadSave();
  const needed = xpForNextRank(s.player.rank);
  return {
    rank: s.player.rank,
    xpIntoRank: s.player.xp,
    xpForNextRank: needed,
    fraction: Math.max(0, Math.min(1, s.player.xp / needed)),
  };
}
