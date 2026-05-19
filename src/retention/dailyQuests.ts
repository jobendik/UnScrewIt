/**
 * Daily quest system.
 *
 * Three short-form quests are rolled at the start of each UTC day. The
 * player makes incidental progress while playing; completed quests yield
 * coins + boosters. A "claim" step is required (variable-reward kick) so
 * the player feels the unlock.
 */

import { loadSave, update } from '@/core/save';
import { createRng, seedFromId } from '@/core/rng';
import { awardCoins } from '@/economy/currency';
import { grant } from '@/economy/boosters';
import type { BoosterId } from '@/economy/boosters';

export type QuestKind =
  | 'clear-levels'
  | 'earn-stars'
  | 'pop-screws'
  | 'reach-combo'
  | 'use-boosters'
  | 'clear-no-fail';

export interface QuestDef {
  kind: QuestKind;
  name: string;
  /** Numeric target. */
  target: number;
  /** Reward in coins. */
  coins: number;
  /** Optional booster reward. */
  booster?: { id: BoosterId; n: number };
  /** Icon glyph. */
  icon: string;
}

export interface QuestState {
  id: string; // unique key per day+slot
  def: QuestDef;
  progress: number;
  claimed: boolean;
}

const POOL: QuestDef[] = [
  { kind: 'clear-levels', name: 'Clear 3 levels',  target: 3,  coins: 60,  icon: '✓' },
  { kind: 'clear-levels', name: 'Clear 5 levels',  target: 5,  coins: 100, icon: '✓', booster: { id: 'extraTime', n: 1 } },
  { kind: 'clear-levels', name: 'Clear 10 levels', target: 10, coins: 200, icon: '✓', booster: { id: 'extraTime', n: 2 } },
  { kind: 'earn-stars',   name: 'Earn 6 stars',    target: 6,  coins: 80,  icon: '⭐' },
  { kind: 'earn-stars',   name: 'Earn 12 stars',   target: 12, coins: 150, icon: '⭐', booster: { id: 'undo', n: 1 } },
  { kind: 'pop-screws',   name: 'Pop 30 screws',   target: 30, coins: 60,  icon: '🔩' },
  { kind: 'pop-screws',   name: 'Pop 80 screws',   target: 80, coins: 150, icon: '🔩', booster: { id: 'revealHint', n: 1 } },
  { kind: 'reach-combo',  name: 'Hit a ×4 combo',  target: 4,  coins: 80,  icon: '🔥' },
  { kind: 'reach-combo',  name: 'Hit a ×6 combo',  target: 6,  coins: 150, icon: '🔥', booster: { id: 'colorSort', n: 1 } },
  { kind: 'use-boosters', name: 'Use 2 boosters',  target: 2,  coins: 60,  icon: '🧰' },
  { kind: 'clear-no-fail',name: 'Clear 3 in a row',target: 3,  coins: 100, icon: '🎯', booster: { id: 'undo', n: 1 } },
];

function utcDay(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Pick 3 distinct-kind quests for the day, deterministically by date+save seed. */
function rollQuests(seedKey: string): QuestState[] {
  const rng = createRng(seedFromId(seedKey));
  const byKind = new Map<QuestKind, QuestDef[]>();
  for (const q of POOL) {
    const arr = byKind.get(q.kind) ?? [];
    arr.push(q);
    byKind.set(q.kind, arr);
  }
  const kinds = rng.shuffle(Array.from(byKind.keys())).slice(0, 3);
  return kinds.map((kind, i) => {
    const options = byKind.get(kind) ?? [];
    const def = rng.pick(options);
    return {
      id: `${seedKey}-${i}`,
      def,
      progress: 0,
      claimed: false,
    };
  });
}

export function ensureFreshQuests(): QuestState[] {
  const today = utcDay();
  const s = loadSave();
  if (s.quests.rolledUtcDay === today && s.quests.list.length === 3) {
    // The save persists def as a wider type; cast it back to QuestState shape.
    return s.quests.list.map((q) => ({
      id: q.id,
      def: q.def as unknown as QuestDef,
      progress: q.progress,
      claimed: q.claimed,
    }));
  }
  // Roll new quests
  const fresh = rollQuests(`${today}-${s.player.firstSeenAt}`);
  update((m) => {
    m.quests.rolledUtcDay = today;
    m.quests.list = fresh.map((q) => ({
      id: q.id,
      def: { ...q.def },
      progress: q.progress,
      claimed: q.claimed,
    }));
  });
  return fresh;
}

export function activeQuests(): QuestState[] {
  return ensureFreshQuests();
}

export type QuestEvent =
  | { kind: 'level-cleared'; stars: number; failed: boolean }
  | { kind: 'pop-screws'; n: number }
  | { kind: 'combo'; combo: number }
  | { kind: 'use-booster' };

/**
 * Process a gameplay event; mutate quest progress and return any quests
 * that just transitioned to completed (so we can fire a "Quest complete!"
 * toast). Note: claiming is separate.
 */
export function record(event: QuestEvent): QuestState[] {
  ensureFreshQuests();
  const completed: QuestState[] = [];
  update((s) => {
    for (const q of s.quests.list) {
      if (q.progress >= q.def.target) continue;
      const before = q.progress;
      switch (q.def.kind as QuestKind) {
        case 'clear-levels':
          if (event.kind === 'level-cleared' && !event.failed) q.progress += 1;
          break;
        case 'earn-stars':
          if (event.kind === 'level-cleared' && !event.failed) q.progress += event.stars;
          break;
        case 'pop-screws':
          if (event.kind === 'pop-screws') q.progress += event.n;
          break;
        case 'reach-combo':
          if (event.kind === 'combo' && event.combo > q.progress) q.progress = event.combo;
          break;
        case 'use-boosters':
          if (event.kind === 'use-booster') q.progress += 1;
          break;
        case 'clear-no-fail':
          if (event.kind === 'level-cleared' && !event.failed) q.progress += 1;
          else if (event.kind === 'level-cleared' && event.failed) q.progress = 0;
          break;
      }
      q.progress = Math.min(q.def.target, q.progress);
      if (before < q.def.target && q.progress >= q.def.target) {
        completed.push({
          id: q.id,
          def: q.def as unknown as QuestDef,
          progress: q.progress,
          claimed: q.claimed,
        });
      }
    }
  });
  return completed;
}

export function claim(id: string): QuestState | null {
  ensureFreshQuests();
  let claimed: QuestState | null = null;
  update((s) => {
    const q = s.quests.list.find((qq) => qq.id === id);
    if (!q || q.claimed || q.progress < q.def.target) return;
    q.claimed = true;
    claimed = {
      id: q.id,
      def: q.def as unknown as QuestDef,
      progress: q.progress,
      claimed: q.claimed,
    };
  });
  if (claimed) {
    const c = claimed as QuestState;
    awardCoins(c.def.coins);
    if (c.def.booster) grant(c.def.booster.id as BoosterId, c.def.booster.n);
  }
  return claimed;
}

/** Helper for HUD: count quests ready to claim. */
export function readyToClaimCount(): number {
  return activeQuests().filter((q) => q.progress >= q.def.target && !q.claimed).length;
}
