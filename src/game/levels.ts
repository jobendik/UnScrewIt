/**
 * Campaign structure: 10 chapters of 20 procedurally generated levels each
 * (200 levels at launch). Difficulty scales by chapter; levels within a
 * chapter ramp gently from the prior level.
 *
 * Levels are generated on demand from a deterministic seed derived from
 * `${chapter}.${level}`, so the same coordinates always produce the same
 * level. The generator's solver verifies solvability before returning.
 */

import { generateLevel } from './generator';
import type { LevelDefinition } from './types';

export const TOTAL_CHAPTERS = 10;
export const LEVELS_PER_CHAPTER = 20;
export const TOTAL_LEVELS = TOTAL_CHAPTERS * LEVELS_PER_CHAPTER;

/** Format a chapter / level pair as a stable id. */
export function levelId(chapter: number, level: number): string {
  return `${chapter}.${level}`;
}

/** Generate (or fetch from cache) the level for the given coordinates. */
const cache = new Map<string, LevelDefinition>();
export function getLevel(chapter: number, level: number): LevelDefinition {
  const id = levelId(chapter, level);
  const hit = cache.get(id);
  if (hit) return cloneLevel(hit);
  const fresh = generateLevel({ chapter, level });
  cache.set(id, fresh);
  return cloneLevel(fresh);
}

/** Deep-clone so callers can mutate animation/status state freely. */
function cloneLevel(src: LevelDefinition): LevelDefinition {
  return {
    ...src,
    holes: src.holes.map((h) => ({ ...h })),
    plates: src.plates.map((p) => ({
      ...p,
      color: { ...p.color },
      holes: p.holes.map((h) => ({ ...h })),
      pinnedBy: [...(p.pinnedBy ?? [])],
    })),
    screws: src.screws.map((s) => ({ ...s })),
  };
}

/** Step forward in the campaign. Returns null past the final level. */
export function nextLevel(chapter: number, level: number): { chapter: number; level: number } | null {
  if (level < LEVELS_PER_CHAPTER) return { chapter, level: level + 1 };
  if (chapter < TOTAL_CHAPTERS) return { chapter: chapter + 1, level: 1 };
  return null;
}
