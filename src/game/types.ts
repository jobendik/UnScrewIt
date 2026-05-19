/**
 * Shared domain types. Pure data — no DOM references here.
 *
 * The game logic in `src/game/` operates on these types without touching the DOM.
 * Rendering modules in `src/render/` translate them into SVG.
 */

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

/**
 * Future-facing — the prototype's screws are uniform. Production passes will
 * extend this with `frozen`, `chained`, `key`, `rusted`, `magnetic`, `bomb`.
 */
export type ScrewType = 'standard';

export interface Screw {
  id: string;
  /** Hole id this screw currently occupies. */
  holeId: string;
  type: ScrewType;
}

export interface LevelDefinition {
  /** Display name (e.g. "First Board"). */
  name: string;
  /** Holes referenced by this level (positions resolved from the grid). */
  holes: Hole[];
  /** Resolved plate list. */
  plates: Plate[];
  /** Resolved screw list. */
  screws: Screw[];
  moves: number;
  time: number;
  hints: number;
}

/**
 * Input shape consumed by `makeLevel`. The `plates(holes)` factory builds
 * concrete plates against a fresh map of resolved holes.
 */
export interface LevelTemplate {
  name: string;
  holeIds: string[];
  plates: (holes: Record<string, Hole>) => Plate[];
  screws: Array<{ id: string; holeId: string; type?: ScrewType }>;
  moves: number;
  time: number;
  hints?: number;
}

/** Status of a hole considered as a target for the currently-selected screw. */
export type TargetStatus = 'valid' | 'blocked' | 'occupied' | 'missing';

/** Hint move suggestion. */
export interface HintMove {
  screwId: string;
  targetId: string;
  score: number;
}
