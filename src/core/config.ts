/**
 * Game-wide constants. Tunables only — no per-level data lives here.
 */

import type { PlateColor } from '@/game/types';

/** SVG viewport dimensions for the board. */
export const BOARD_VIEWBOX = { w: 600, h: 900 } as const;

/** Inner board (wooden panel) rect inside the viewport. */
export const BOARD_RECT = { x: 52, y: 126, w: 496, h: 650, r: 28 } as const;

/** Visual radii / tolerances for screws and holes. */
export const SCREW_RADIUS = 17;
export const HOLE_RADIUS = 18;
/** A screw "pins" a plate hole if it lies within this many pixels of it. */
export const PIN_TOLERANCE = 13;

/** Animation timings, in ms. */
export const FALL_MS = 760;
export const MOVE_MS = 250;

/** How many undo snapshots to retain. */
export const UNDO_HISTORY_LIMIT = 10;

/** Grid layout — columns (A..E) and rows (1..7) in board coordinates. */
export const GRID_COLS = [110, 205, 300, 395, 490] as const;
export const GRID_ROWS = [165, 260, 355, 450, 545, 640, 735] as const;
export const GRID_COL_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

/**
 * Plate color palette. Each entry provides `fill` (main), `edge` (border),
 * and `top` (highlight stripe). Future themes will swap these out via
 * a higher-level theme system; for now this is the single classic palette.
 */
export const PLATE_COLORS: Readonly<Record<string, PlateColor>> = Object.freeze({
  red:    { fill: '#f25245', edge: '#ad221d', top: '#ff8a79' },
  yellow: { fill: '#ffc43d', edge: '#b77612', top: '#ffe06f' },
  blue:   { fill: '#35a9f3', edge: '#1372aa', top: '#73cdfb' },
  green:  { fill: '#63c84f', edge: '#2e8d24', top: '#9ee989' },
  pink:   { fill: '#f45dbb', edge: '#ad2b79', top: '#ff9ddb' },
  purple: { fill: '#9057f6', edge: '#5b2bb7', top: '#b392ff' },
  orange: { fill: '#f68b28', edge: '#ad5513', top: '#ffb35d' },
  teal:   { fill: '#20c6c3', edge: '#0d8384', top: '#6de8e3' },
  brown:  { fill: '#a76635', edge: '#6c3718', top: '#ca8a55' },
  gray:   { fill: '#aab0bd', edge: '#626a77', top: '#d7dce6' },
});

export type PlateColorName = keyof typeof PLATE_COLORS;

/** localStorage namespace. Bumping the version invalidates older saves. */
export const STORAGE_NAMESPACE = 'unscrewit.v1';

/** Stars threshold ratios for awarding additional stars on level clear. */
export const STAR_THRESHOLDS = {
  /** Move-headroom ratio above this awards an extra star. */
  movesRatio: 0.22,
  /** Time-headroom ratio above this awards an extra star. */
  timeRatio: 0.28,
} as const;
