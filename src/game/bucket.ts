/**
 * Bucket bar operations.
 *
 * The bucket bar is a row of N slots (typically 5). Each slot is either
 * empty or claimed by a single colour, and can hold up to 3 screws of
 * that colour. When a slot fills, it clears with a small celebration.
 *
 * This module is pure; rendering and animations live elsewhere.
 */

import type { BucketSlot } from './types';
import type { ScrewColorId } from './colors';

/** Max screws per slot before it clears. */
export const SLOT_CAPACITY = 3;

export interface BucketState {
  slots: BucketSlot[];
}

export function createBucket(slotCount: number): BucketState {
  return {
    slots: Array.from({ length: slotCount }, () => ({ color: null, count: 0 })),
  };
}

/**
 * Index of the slot that should receive a screw of `color`, or null if
 * none can accept it.
 *
 * Priority:
 *  1. A slot already claimed by this colour with space.
 *  2. Any empty slot.
 */
export function targetSlot(bucket: BucketState, color: ScrewColorId): number | null {
  for (let i = 0; i < bucket.slots.length; i++) {
    const s = bucket.slots[i];
    if (s && s.color === color && s.count < SLOT_CAPACITY) return i;
  }
  for (let i = 0; i < bucket.slots.length; i++) {
    if (bucket.slots[i]?.color === null) return i;
  }
  return null;
}

export function canAccept(bucket: BucketState, color: ScrewColorId): boolean {
  return targetSlot(bucket, color) !== null;
}

export type PlaceOutcome =
  | { kind: 'added';   slotIndex: number; slot: BucketSlot }
  | { kind: 'claimed'; slotIndex: number; slot: BucketSlot }
  | { kind: 'cleared'; slotIndex: number; color: ScrewColorId };

/** Place a screw of `color` into the bucket. Caller must verify acceptance first. */
export function place(bucket: BucketState, color: ScrewColorId): PlaceOutcome {
  const idx = targetSlot(bucket, color);
  if (idx === null) throw new Error('bucket cannot accept — verify with canAccept first');
  const slot = bucket.slots[idx];
  if (!slot) throw new Error('invariant: slot exists');
  if (slot.color === null) {
    slot.color = color;
    slot.count = 1;
    return { kind: 'claimed', slotIndex: idx, slot };
  }
  slot.count += 1;
  if (slot.count >= SLOT_CAPACITY) {
    slot.color = null;
    slot.count = 0;
    return { kind: 'cleared', slotIndex: idx, color };
  }
  return { kind: 'added', slotIndex: idx, slot };
}

/** Snapshot for undo. */
export function snapshot(bucket: BucketState): BucketSlot[] {
  return bucket.slots.map((s) => ({ ...s }));
}

export function restore(bucket: BucketState, snap: BucketSlot[]): void {
  for (let i = 0; i < bucket.slots.length; i++) {
    const target = bucket.slots[i];
    const src = snap[i];
    if (target && src) {
      target.color = src.color;
      target.count = src.count;
    }
  }
}

/**
 * Color-sort booster: compact same-colour slots into the fewest possible
 * positions. Returns true if anything changed.
 *
 * Algorithm: sum total count per colour, then refill slots in colour order
 * with up to `SLOT_CAPACITY` each. Any slot that becomes fully-filled is
 * cleared immediately (matches normal pop logic).
 */
export interface SortOutcome {
  changed: boolean;
  /** Slot indices that ended up cleared as a side-effect. */
  clearedSlots: number[];
  /** Colours cleared (parallel to clearedSlots). */
  clearedColors: string[];
}

export function colorSort(bucket: BucketState): SortOutcome {
  const totals = new Map<string, number>();
  for (const s of bucket.slots) {
    if (s.color !== null && s.count > 0) {
      totals.set(s.color, (totals.get(s.color) ?? 0) + s.count);
    }
  }
  const before = bucket.slots.map((s) => ({ color: s.color, count: s.count }));
  // Reset slots
  for (const s of bucket.slots) { s.color = null; s.count = 0; }
  // Re-fill in colour order (stable for determinism)
  const colors = Array.from(totals.keys()).sort();
  let slotIdx = 0;
  const clearedSlots: number[] = [];
  const clearedColors: string[] = [];
  for (const color of colors) {
    let remaining = totals.get(color) ?? 0;
    while (remaining > 0 && slotIdx < bucket.slots.length) {
      const cap = Math.min(SLOT_CAPACITY, remaining);
      const slot = bucket.slots[slotIdx];
      if (!slot) break;
      slot.color = color as BucketSlot['color'];
      slot.count = cap;
      remaining -= cap;
      if (cap === SLOT_CAPACITY) {
        clearedSlots.push(slotIdx);
        clearedColors.push(color);
        slot.color = null;
        slot.count = 0;
      }
      slotIdx += 1;
    }
  }
  const after = bucket.slots.map((s) => ({ color: s.color, count: s.count }));
  const changed = before.some((b, i) => {
    const a = after[i];
    return !a || b.color !== a.color || b.count !== a.count;
  });
  return { changed, clearedSlots, clearedColors };
}
