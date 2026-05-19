/**
 * Daily-login streak.
 *
 * Loss-aversion is the active ingredient: if the player misses a day, the
 * streak resets to 1 and they lose access to the day-6/7 jackpot until
 * they rebuild. Rewards escalate across the 7-day cycle; after day 7 the
 * cycle restarts at day 1 the next day.
 */

import { loadSave, update } from '@/core/save';
import { awardCoins } from '@/economy/currency';

export interface DailyReward {
  day: number;
  coins: number;
  /** Optional callout for special days. */
  badge?: 'jackpot' | 'streak-saver';
}

export const DAILY_REWARDS: readonly DailyReward[] = [
  { day: 1, coins: 50 },
  { day: 2, coins: 75 },
  { day: 3, coins: 100 },
  { day: 4, coins: 150, badge: 'streak-saver' },
  { day: 5, coins: 200 },
  { day: 6, coins: 300 },
  { day: 7, coins: 500, badge: 'jackpot' },
];

function utcDay(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  const da = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const db = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return Math.round((db - da) / 86_400_000);
}

export interface DailyStatus {
  /** Day number 1..7 the player can next claim. */
  day: number;
  /** Whether the reward for today is still claimable. */
  claimable: boolean;
  reward: DailyReward;
  streakDay: number;
  /** True if the streak just reset because the player missed a day. */
  resetThisVisit: boolean;
}

/**
 * Compute today's status. Updates the streak counter as a side-effect:
 * - First login ever → streakDay 1, claimable
 * - Same UTC day as lastClaim → not claimable
 * - +1 day from lastClaim → advance streakDay (mod 7), claimable
 * - >+1 day → reset to streakDay 1 (claimable)
 */
export function dailyStatus(now: Date = new Date()): DailyStatus {
  const today = utcDay(now);
  const s = loadSave();
  let resetThisVisit = false;

  if (s.daily.lastClaimUtcDay === today) {
    const day = Math.max(1, s.daily.streakDay) || 1;
    const reward = DAILY_REWARDS[day - 1] ?? DAILY_REWARDS[0];
    if (!reward) throw new Error('rewards table empty');
    return { day, claimable: false, reward, streakDay: s.daily.streakDay, resetThisVisit };
  }

  let nextDay: number;
  if (!s.daily.lastClaimUtcDay) {
    nextDay = 1;
  } else {
    const diff = daysBetween(s.daily.lastClaimUtcDay, today);
    if (diff === 1) {
      nextDay = s.daily.streakDay >= 7 ? 1 : s.daily.streakDay + 1;
    } else if (diff <= 0) {
      // Clock skew — treat as same day.
      const day = Math.max(1, s.daily.streakDay) || 1;
      const reward = DAILY_REWARDS[day - 1] ?? DAILY_REWARDS[0];
      if (!reward) throw new Error('rewards table empty');
      return { day, claimable: false, reward, streakDay: s.daily.streakDay, resetThisVisit };
    } else {
      nextDay = 1;
      resetThisVisit = true;
    }
  }
  const reward = DAILY_REWARDS[nextDay - 1] ?? DAILY_REWARDS[0];
  if (!reward) throw new Error('rewards table empty');
  return { day: nextDay, claimable: true, reward, streakDay: nextDay, resetThisVisit };
}

/** Claim today's reward. Returns the reward granted, or null if not claimable. */
export function claimDaily(now: Date = new Date()): DailyReward | null {
  const status = dailyStatus(now);
  if (!status.claimable) return null;
  awardCoins(status.reward.coins);
  update((s) => {
    s.daily.streakDay = status.day;
    s.daily.lastClaimUtcDay = utcDay(now);
  });
  return status.reward;
}
