/**
 * Solver — verifies that a procedural level can be cleared from its
 * starting state.
 *
 * The search uses iterative deepening over removable screws. State =
 * (set of remaining screw ids, bucket-slot snapshot). We hash the state
 * to avoid re-exploring equivalent branches.
 *
 * For typical generator output (≤ 18 screws, ≤ 6 colours), this finds a
 * solution in well under 100ms. The verifier is conservative: it returns
 * false on timeout, so generated levels that take too long to verify are
 * rejected and re-rolled (also rare).
 */

import { pointInPlate, pointNearPlatePinHole, pointOverPlateHole } from './plates';
import { canAccept, createBucket, place, SLOT_CAPACITY } from './bucket';
import type { Hole, Plate, Screw } from './types';

const TIMEOUT_MS = 120;

interface Input {
  holes: Hole[];
  plates: Plate[];
  screws: Screw[];
}

interface SearchState {
  screws: Map<string, Screw>;
  plates: Map<string, { plate: Plate; status: 'active' | 'removed' }>;
  bucket: Array<{ color: string | null; count: number }>;
}

function snapshotState(input: Input): SearchState {
  const screws = new Map<string, Screw>();
  for (const s of input.screws) screws.set(s.id, { ...s });
  const plates = new Map<string, { plate: Plate; status: 'active' | 'removed' }>();
  for (const p of input.plates) plates.set(p.id, { plate: p, status: 'active' });
  return { screws, plates, bucket: [] };
}

function hashState(state: SearchState): string {
  const screwIds = Array.from(state.screws.keys()).sort().join(',');
  const platesOpen = Array.from(state.plates.entries())
    .filter(([, v]) => v.status === 'active')
    .map(([k]) => k)
    .sort()
    .join(',');
  const bucket = state.bucket.map((s) => `${s.color ?? '_'}.${s.count}`).join('|');
  return `${screwIds}|${platesOpen}|${bucket}`;
}

function holeBlocked(state: SearchState, hole: Hole): boolean {
  for (const { plate, status } of state.plates.values()) {
    if (status !== 'active') continue;
    if (pointInPlate(plate, hole) && !pointOverPlateHole(plate, hole)) return true;
  }
  return false;
}

function removableScrews(state: SearchState, holesById: Map<string, Hole>): Screw[] {
  const out: Screw[] = [];
  for (const screw of state.screws.values()) {
    const hole = holesById.get(screw.holeId);
    if (!hole) continue;
    if (!holeBlocked(state, hole)) out.push(screw);
  }
  return out;
}

function releaseUnpinned(state: SearchState, holesById: Map<string, Hole>): void {
  for (const entry of state.plates.values()) {
    if (entry.status !== 'active') continue;
    let pinned = false;
    for (const screw of state.screws.values()) {
      const hole = holesById.get(screw.holeId);
      if (hole && pointNearPlatePinHole(entry.plate, hole)) {
        pinned = true;
        break;
      }
    }
    if (!pinned) entry.status = 'removed';
  }
}

/** True if every plate has been removed. */
function allCleared(state: SearchState): boolean {
  for (const entry of state.plates.values()) {
    if (entry.status === 'active') return false;
  }
  return true;
}

/**
 * Check solvability of `input` given a bucket of `bucketSize` slots.
 */
export function solvable(input: Input, bucketSize: number): boolean {
  const start = performance.now();
  const holesById = new Map<string, Hole>();
  for (const h of input.holes) holesById.set(h.id, h);

  const root = snapshotState(input);
  root.bucket = createBucket(bucketSize).slots.map((s) => ({ color: s.color, count: s.count }));

  const seen = new Set<string>();
  const stack: SearchState[] = [root];

  while (stack.length) {
    if (performance.now() - start > TIMEOUT_MS) return false;
    const state = stack.pop();
    if (!state) continue;
    if (allCleared(state)) return true;

    const key = hashState(state);
    if (seen.has(key)) continue;
    seen.add(key);

    const options = removableScrews(state, holesById);
    if (options.length === 0) continue;

    for (const screw of options) {
      const bucketSnapshot = state.bucket.map((s) => ({ color: s.color, count: s.count }));
      const bucketLive = createBucket(bucketSize);
      bucketLive.slots = bucketSnapshot.map((s) => ({
        color: s.color as Screw['color'] | null,
        count: s.count,
      }));
      if (!canAccept(bucketLive, screw.color)) continue;

      // Branch state.
      const next: SearchState = {
        screws: new Map(state.screws),
        plates: new Map(),
        bucket: bucketLive.slots.map((s) => ({ color: s.color, count: s.count })),
      };
      for (const [id, entry] of state.plates) {
        next.plates.set(id, { plate: entry.plate, status: entry.status });
      }
      next.screws.delete(screw.id);
      place(bucketLive, screw.color);
      next.bucket = bucketLive.slots.map((s) => ({ color: s.color, count: s.count }));
      releaseUnpinned(next, holesById);
      stack.push(next);
    }
  }
  return false;
}

/** Re-exported so callers can build the same bucket the solver uses. */
export { SLOT_CAPACITY };
