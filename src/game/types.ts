/**
 * Shared domain types. Pure data — no DOM references here.
 *
 * The game logic in `src/game/` operates on these types without touching the DOM.
 * Rendering modules in `src/render/` translate them into SVG.
 */

import type { ScrewColorId } from './colors';

export type PlateKind = 'bar' | 'slab';

/** A point on a plate's local (rotated) coordinate system. */
export interface LocalPoint {
  x: number;
  y: number;
}

/** A point in world (board) coordinates. */
export interface WorldPoint {
  x: number;
  y: number;
}

/** A named hole position on the board (`A1`, `B3`, etc.). */
export interface Hole extends WorldPoint {
  id: string;
}

/** Color palette entry for a plate. */
export interface PlateColor {
  fill: string;
  edge: string;
  top: string;
}

export type PlateStatus = 'active' | 'falling' | 'removed';

/** A physical plate that screws hold down. */
export interface Plate {
  id: string;
  kind: PlateKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in radians. */
  angle: number;
  color: PlateColor;
  /** Holes through which screws can pin this plate (in local coords). */
  holes: LocalPoint[];
  status: PlateStatus;
  /** Screw IDs currently pinning this plate (recomputed each move). */
  pinnedBy: string[];
  /** Visual variance for fall animation. */
  fallSpin: number;
  fallSide: number;
  /** Targets for the fall animation, populated when status becomes `falling`. */
  fallX?: number;
  fallY?: number;
}

/** Future-facing — extended in later passes with frozen/chained/etc. */
export type ScrewType = 'standard';

export interface Screw {
  id: string;
  /** Hole id this screw currently occupies. */
  holeId: string;
  color: ScrewColorId;
  type: ScrewType;
}

/** A single bucket slot at the bottom of the board. */
export interface BucketSlot {
  /** Color currently claimed by this slot, or null if empty. */
  color: ScrewColorId | null;
  /** Number of screws of `color` placed (0..3). */
  count: number;
}

/** Reason a screw cannot be popped right now. */
export type RemoveBlocker = 'plate-covers' | 'bucket-full' | 'animating' | 'finished';

/** A fully realised level ready to play. */
export interface LevelDefinition {
  /** Stable id like `1.4` (chapter.index, 1-based) or `P.<seed>` for procedural. */
  id: string;
  /** Display name. */
  name: string;
  /** 1-based chapter index. */
  chapter: number;
  /** 1-based index within chapter. */
  indexInChapter: number;
  holes: Hole[];
  plates: Plate[];
  screws: Screw[];
  /** Number of bucket slots available (typically 5). */
  bucketSlots: number;
  /** Time limit in seconds. */
  time: number;
  /** "Par" time — completing under this earns the time star. */
  parTime: number;
}
