/**
 * Shared domain types. Pure data — no DOM references here.
 *
 * The game logic in `src/game/` operates on these types without touching the DOM.
 * Rendering modules in `src/render/` translate them into SVG.
 */

import type { ScrewColorId } from './colors';

export type PlateKind = 'bar' | 'slab';

export interface LocalPoint { x: number; y: number; }
export interface WorldPoint { x: number; y: number; }

export interface Hole extends WorldPoint { id: string; }

export interface PlateColor {
  fill: string;
  edge: string;
  top: string;
}

export type PlateStatus = 'active' | 'falling' | 'removed';

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
  holes: LocalPoint[];
  status: PlateStatus;
  pinnedBy: string[];
  fallSpin: number;
  fallSide: number;
  fallX?: number;
  fallY?: number;
}

/**
 * Special screw types introduced gradually across chapters:
 *
 * - standard: regular screw, removed in one tap.
 * - frozen:   covered in ice; first tap cracks it, second removes it.
 * - chained:  linked to other chained screws sharing the same `chainId`.
 *             Tapping any one tries to remove the whole chain atomically.
 * - locked:   wrapped in a padlock; can't be tapped until any key with the
 *             same `lockGroup` has been removed.
 * - key:      golden screw; removing it unlocks all `locked` screws sharing
 *             the same `lockGroup`.
 */
export type ScrewType = 'standard' | 'frozen' | 'chained' | 'locked' | 'key';

export interface Screw {
  id: string;
  holeId: string;
  color: ScrewColorId;
  type: ScrewType;
  /** 1 = cracked, 2 = solid ice; absent on non-frozen screws. */
  frozenHits?: number;
  /** Chain group id — all screws sharing this id pop together. */
  chainId?: string;
  /** Lock group id — locked screws hidden until a key of the same group pops. */
  lockGroup?: string;
}

export interface BucketSlot {
  color: ScrewColorId | null;
  count: number;
}

export type RemoveBlocker =
  | 'plate-covers'
  | 'bucket-full'
  | 'animating'
  | 'finished'
  | 'frozen-needs-thaw'
  | 'locked-needs-key'
  | 'chain-blocked';

export interface LevelDefinition {
  id: string;
  name: string;
  chapter: number;
  indexInChapter: number;
  holes: Hole[];
  plates: Plate[];
  screws: Screw[];
  bucketSlots: number;
  time: number;
  parTime: number;
  /**
   * Mastery layer — solving in this many moves or fewer earns the Perfect Solve
   * badge. Players who exceed it still complete the level; they just lose the
   * efficiency bonus. Computed by the generator from the ideal-move count plus
   * a chapter-based buffer.
   */
  parMoves: number;
  /** Special screw types appearing in this level (for intro cards). */
  introTypes: ScrewType[];
}
