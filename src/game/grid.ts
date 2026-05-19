/**
 * Hole grid system. The board is divided into a 5×7 grid named like a
 * chessboard (`A1` .. `E7`). Levels reference holes by id; this module
 * resolves those ids to concrete board coordinates.
 */

import { GRID_COLS, GRID_COL_LETTERS, GRID_ROWS } from '@/core/config';
import type { Hole } from './types';

/**
 * The full grid as a frozen lookup. Each hole has a stable id and the
 * board coordinates where it should be drawn.
 */
export const GRID: Readonly<Record<string, Hole>> = (() => {
  const map: Record<string, Hole> = {};
  GRID_COL_LETTERS.forEach((letter, ci) => {
    const x = GRID_COLS[ci];
    if (x === undefined) return;
    GRID_ROWS.forEach((y, ri) => {
      const id = `${letter}${ri + 1}`;
      map[id] = { id, x, y };
    });
  });
  return Object.freeze(map);
})();

/** Resolve a hole id to a fresh `Hole` object. Throws if unknown. */
export function resolveHole(id: string): Hole {
  const found = GRID[id];
  if (!found) throw new Error(`Unknown hole id: ${id}`);
  return { ...found };
}
