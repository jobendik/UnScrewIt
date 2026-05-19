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
