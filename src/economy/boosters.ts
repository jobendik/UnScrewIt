/**
 * Booster catalog + inventory + spending logic.
 *
 * Boosters are consumable, mid-level helpers that the player can stockpile
 * (via daily login / quest rewards / shop purchases) and trigger from the
 * in-game HUD when stuck.
 */

import { loadSave, update } from '@/core/save';
import { spendCoins } from './currency';

export type BoosterId = 'extraTime' | 'colorSort' | 'revealHint' | 'undo';

export interface BoosterDef {
  id: BoosterId;
  name: string;
  icon: string;
  short: string;
  description: string;
  /** Coin cost to buy from the shop. */
  cost: number;
}

export const BOOSTERS: readonly BoosterDef[] = [
  {
    id: 'extraTime',
    name: 'Extra Time',
    icon: '⏱',
    short: '+30s',
    description: 'Adds 30 seconds to the timer.',
    cost: 80,
  },
  {
    id: 'colorSort',
    name: 'Color Sort',
    icon: '🎨',
    short: 'Sort',
    description: 'Compacts the bucket: same-colour slots merge.',
    cost: 120,
  },
  {
    id: 'revealHint',
    name: 'Reveal',
    icon: '✨',
    short: 'Hint',
    description: 'Highlights the next safest screw to tap.',
    cost: 100,
  },
  {
    id: 'undo',
    name: 'Undo',
    icon: '↶',
    short: 'Undo',
    description: 'Take back your last move.',
    cost: 60,
  },
];

export const BOOSTER_BY_ID: Readonly<Record<BoosterId, BoosterDef>> = (() => {
  const map: Partial<Record<BoosterId, BoosterDef>> = {};
  for (const b of BOOSTERS) map[b.id] = b;
  return map as Readonly<Record<BoosterId, BoosterDef>>;
})();

export function inventory(): Record<BoosterId, number> {
  const s = loadSave();
  return {
    extraTime: s.inventory.boosters.extraTime,
    colorSort: s.inventory.boosters.colorSort,
    revealHint: s.inventory.boosters.revealHint,
    undo: s.inventory.boosters.undo,
  };
}

export function countOf(id: BoosterId): number {
  return loadSave().inventory.boosters[id];
}

/** Grant boosters (e.g. from daily login, quest reward). */
export function grant(id: BoosterId, n: number): void {
  if (n <= 0) return;
  update((s) => { s.inventory.boosters[id] += n; });
}

/** Consume one booster; returns true on success, false if none available. */
export function consume(id: BoosterId): boolean {
  if (countOf(id) <= 0) return false;
  update((s) => {
    s.inventory.boosters[id] -= 1;
    s.stats.boostersUsed += 1;
  });
  return true;
}

/**
 * Buy `n` boosters using coins. Returns true if the purchase succeeded;
 * false if the player can't afford it.
 */
export function buy(id: BoosterId, n = 1): boolean {
  const def = BOOSTER_BY_ID[id];
  const total = def.cost * n;
  if (!spendCoins(total)) return false;
  grant(id, n);
  return true;
}
