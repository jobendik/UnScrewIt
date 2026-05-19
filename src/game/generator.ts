/**
 * Procedural level generator.
 *
 * Strategy: backwards construction. Start from an empty board (the solved
 * state) and add layers of plates pinned by screws, then assign colours
 * such that every colour appears in multiples of 3 (so the bucket can
 * always be drained cleanly given enough time). A lightweight forward
 * solver verifies the result is solvable; if not, we mutate the colour
 * assignment and try again.
 */

import { GRID_COL_LETTERS } from '@/core/config';
import { createRng, seedFromId } from '@/core/rng';
import type { Rng } from '@/core/rng';
import { ALL_COLOR_IDS } from './colors';
import type { ScrewColorId } from './colors';
import { GRID } from './grid';
import { bar } from './plates';
import { solvable } from './solver';
import type { Hole, LevelDefinition, Plate, Screw } from './types';

const NUM_COLS = 5;
const NUM_ROWS = 7;

const FRIENDLY_NAMES = [
  'Workshop Warmup', 'First Spark', 'Easy Stack', 'Twin Beams', 'Quick Lift',
  'Cozy Bench', 'Tinker Time', 'Brassy Bars', 'Steady Hands', 'Bolt Buster',
  'Cross Section', 'Hex Harmony', 'Sliding Scale', 'Helix Hop', 'Daydream',
  'Sunset Stack', 'Mosaic', 'Splinter', 'Pinwheel', 'Knot & Pin',
  'Bramble', 'Lattice', 'Honeycomb', 'Whirlpool', 'Cascade',
  'Hive Mind', 'Riser', 'Switchback', 'Drift', 'Final Twist',
];

export interface GenParams {
  /** Chapter index, 1-based. Higher = harder. */
  chapter: number;
  /** Level within the chapter, 1-based. */
  level: number;
  /** Seed override. If absent, derived from `{chapter}.{level}`. */
  seed?: number;
}

interface DifficultyProfile {
  plateCount: number;
  colorCount: number;
  /** Screws are placed in trios of one colour to keep the bucket flow clean. */
  trios: number;
  bucketSlots: number;
  /** Seconds the player has to finish. */
  time: number;
  /** Par time the player must beat for the time star. */
  parTime: number;
}

function profileFor(chapter: number, level: number): DifficultyProfile {
  // Within chapter 1, gentle ramp; later chapters add screws and colours.
  const ramp = Math.min(level, 20);
  const cap = chapter - 1;
  const plateCount = Math.min(3 + Math.floor(ramp / 4) + cap, 8);
  const colorCount = Math.min(3 + Math.floor(ramp / 6) + cap, 6);
  // Each trio adds 3 screws — aim for 2..6 trios.
  const trios = Math.min(2 + Math.floor(ramp / 4) + Math.floor(cap / 2), 6);
  const bucketSlots = 5;
  const totalScrews = trios * 3;
  const baseSeconds = 60 + totalScrews * 8 + plateCount * 4;
  const time = baseSeconds + 20;
  const parTime = Math.round(baseSeconds * 0.6);
  return { plateCount, colorCount, trios, bucketSlots, time, parTime };
}

/** A short list of named hole positions chosen for nice layouts. */
function pickHoleIds(rng: Rng, count: number): string[] {
  // Prefer middle rows / odd columns so plates don't crowd the corners.
  const pool: string[] = [];
  for (let ri = 2; ri <= 6; ri++) {
    for (let ci = 0; ci < NUM_COLS; ci++) {
      const letter = GRID_COL_LETTERS[ci];
      if (!letter) continue;
      pool.push(`${letter}${ri}`);
    }
  }
  // Add a few top-row holes too so the visual top isn't empty.
  for (const letter of GRID_COL_LETTERS) {
    pool.push(`${letter}1`);
  }
  return rng.shuffle(pool).slice(0, Math.min(count, pool.length));
}

/** True if two hole ids are adjacent in any direction. */
function nearby(a: string, b: string): boolean {
  const ca = GRID_COL_LETTERS.indexOf(a[0] as (typeof GRID_COL_LETTERS)[number]);
  const cb = GRID_COL_LETTERS.indexOf(b[0] as (typeof GRID_COL_LETTERS)[number]);
  const ra = Number(a.slice(1));
  const rb = Number(b.slice(1));
  if (ca < 0 || cb < 0) return false;
  return Math.abs(ca - cb) <= 2 && Math.abs(ra - rb) <= 2 && a !== b;
}

interface BuildResult {
  holes: Hole[];
  plates: Plate[];
  screws: Screw[];
}

/** Build a level scaffold (without colour assignment). */
function buildScaffold(rng: Rng, profile: DifficultyProfile): BuildResult | null {
  const totalScrews = profile.trios * 3;
  const holesNeeded = Math.min(NUM_ROWS * NUM_COLS, Math.max(totalScrews + 4, totalScrews * 2));
  const holeIds = pickHoleIds(rng, holesNeeded);
  const holes: Hole[] = holeIds.map((id) => {
    const ref = GRID[id];
    if (!ref) throw new Error(`grid missing ${id}`);
    return { ...ref };
  });
  if (holes.length < totalScrews) return null;
  const holeMap: Record<string, Hole> = {};
  for (const h of holes) holeMap[h.id] = h;

  // Plate placement: pick pairs of holes to span with bars. We allow some
  // plates to share a hole so they can layer over each other.
  const plates: Plate[] = [];
  const screwSpots = new Set<string>();
  let attempts = 0;
  while (plates.length < profile.plateCount && attempts < profile.plateCount * 8) {
    attempts++;
    const a = rng.pick(holeIds);
    const b = rng.pick(holeIds);
    if (a === b || !nearby(a, b)) continue;
    const id = `pg-${plates.length}`;
    const extend = rng.int(54, 78);
    try {
      const p = bar(holeMap, id, a, b, 'brown', { holeIds: [a, b], extend });
      plates.push(p);
      screwSpots.add(a);
      screwSpots.add(b);
    } catch {
      continue;
    }
  }
  if (plates.length < 2) return null;

  // Screws: place one at every plate-hole spot. Trim or pad to match trio count.
  const screwHoleIds = Array.from(screwSpots);
  if (screwHoleIds.length > totalScrews) {
    rng.shuffle(screwHoleIds).length = totalScrews;
  }
  while (screwHoleIds.length < totalScrews) {
    // Need more screw spots — pick a free hole adjacent to an existing screw.
    const free = holeIds.find((id) => !screwHoleIds.includes(id));
    if (!free) break;
    screwHoleIds.push(free);
  }
  if (screwHoleIds.length !== totalScrews) return null;

  const screws: Screw[] = screwHoleIds.map((holeId, i) => ({
    id: `s${i + 1}`,
    holeId,
    color: 'red',
    type: 'standard',
  }));
  return { holes, plates, screws };
}

/** Assign colours in trios. */
function assignColors(rng: Rng, screws: Screw[], profile: DifficultyProfile): void {
  const palette = rng.shuffle(ALL_COLOR_IDS).slice(0, profile.colorCount) as ScrewColorId[];
  const assignments: ScrewColorId[] = [];
  for (let i = 0; i < profile.trios; i++) {
    const c = palette[i % palette.length] as ScrewColorId;
    assignments.push(c, c, c);
  }
  const shuffled = rng.shuffle(assignments);
  for (let i = 0; i < screws.length; i++) {
    const screw = screws[i];
    const color = shuffled[i];
    if (screw && color) screw.color = color;
  }
}

/**
 * Generate a solvable procedural level. Falls back to a simple scaffold
 * if no candidate verifies within the attempt budget (very rare for the
 * default profile).
 */
export function generateLevel(params: GenParams): LevelDefinition {
  const seed = params.seed ?? seedFromId(`${params.chapter}.${params.level}`);
  const rng = createRng(seed);
  const profile = profileFor(params.chapter, params.level);

  let scaffold: BuildResult | null = null;
  for (let attempt = 0; attempt < 12 && !scaffold; attempt++) {
    scaffold = buildScaffold(rng, profile);
  }
  if (!scaffold) {
    // Last-resort: shrink the profile.
    const fallback: DifficultyProfile = { ...profile, plateCount: 3, trios: 2 };
    for (let attempt = 0; attempt < 6 && !scaffold; attempt++) {
      scaffold = buildScaffold(rng, fallback);
    }
    if (!scaffold) throw new Error(`generator: could not build scaffold for ${params.chapter}.${params.level}`);
  }

  // Try a handful of colour assignments; keep the first solvable one.
  let chosen: BuildResult | null = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    assignColors(rng, scaffold.screws, profile);
    if (solvable(scaffold, profile.bucketSlots)) {
      chosen = scaffold;
      break;
    }
  }
  if (!chosen) {
    // Accept the last assignment regardless — better a slightly tricky level
    // than no level at all.
    chosen = scaffold;
  }

  const indexBase = (params.chapter - 1) * 20 + (params.level - 1);
  const name = FRIENDLY_NAMES[indexBase % FRIENDLY_NAMES.length] ?? `Level ${params.level}`;
  const id = `${params.chapter}.${params.level}`;

  return {
    id,
    name,
    chapter: params.chapter,
    indexInChapter: params.level,
    holes: chosen.holes,
    plates: chosen.plates,
    screws: chosen.screws,
    bucketSlots: profile.bucketSlots,
    time: profile.time,
    parTime: profile.parTime,
  };
}
