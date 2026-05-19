/**
 * Procedural level generator with chapter-based difficulty curve.
 *
 * Strategy: backwards construction. Start from an empty board (the solved
 * state) and add layers of plates pinned by screws. Assign colours such
 * that every colour appears in multiples of 3 (so the bucket drains
 * cleanly with care). Then sprinkle special-screw types in by chapter:
 *
 *   chapter 1 → standard only
 *   chapter 2 → 1–2 frozen screws
 *   chapter 3 → +1 chained pair
 *   chapter 4 → +1 locked / key pair
 *   chapter 5+ → escalating mix of all three
 */

import { GRID_COL_LETTERS } from '@/core/config';
import { createRng, seedFromId } from '@/core/rng';
import type { Rng } from '@/core/rng';
import { ALL_COLOR_IDS } from './colors';
import type { ScrewColorId } from './colors';
import { GRID } from './grid';
import { bar } from './plates';
import { solvable } from './solver';
import type { Hole, LevelDefinition, Plate, Screw, ScrewType } from './types';

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
  chapter: number;
  level: number;
  seed?: number;
}

interface DifficultyProfile {
  plateCount: number;
  colorCount: number;
  trios: number;
  bucketSlots: number;
  time: number;
  parTime: number;
  frozenCount: number;
  chainedPairs: number;
  lockedPairs: number;
}

function profileFor(chapter: number, level: number): DifficultyProfile {
  const ramp = Math.min(level, 20);
  const cap = chapter - 1;
  const plateCount = Math.min(3 + Math.floor(ramp / 4) + cap, 8);
  const colorCount = Math.min(3 + Math.floor(ramp / 6) + cap, 6);
  const trios = Math.min(2 + Math.floor(ramp / 4) + Math.floor(cap / 2), 6);
  const bucketSlots = 5;
  const totalScrews = trios * 3;
  const baseSeconds = 60 + totalScrews * 8 + plateCount * 4;
  const time = baseSeconds + 25;
  const parTime = Math.round(baseSeconds * 0.6);

  // Special screw introductions
  let frozenCount = 0;
  let chainedPairs = 0;
  let lockedPairs = 0;
  if (chapter >= 2) frozenCount = Math.min(2, 1 + Math.floor(ramp / 10));
  if (chapter >= 3) chainedPairs = Math.min(2, 1 + Math.floor((chapter - 3) / 2));
  if (chapter >= 4) lockedPairs = Math.min(2, 1 + Math.floor((chapter - 4) / 2));
  // First level of a chapter introducing a type — keep it gentle (just 1).
  if (level === 1) {
    if (chapter === 2) frozenCount = 1;
    if (chapter === 3) chainedPairs = 1;
    if (chapter === 4) lockedPairs = 1;
  }

  return { plateCount, colorCount, trios, bucketSlots, time, parTime, frozenCount, chainedPairs, lockedPairs };
}

function pickHoleIds(rng: Rng, count: number): string[] {
  const pool: string[] = [];
  for (let ri = 2; ri <= 6; ri++) {
    for (let ci = 0; ci < NUM_COLS; ci++) {
      const letter = GRID_COL_LETTERS[ci];
      if (!letter) continue;
      pool.push(`${letter}${ri}`);
    }
  }
  for (const letter of GRID_COL_LETTERS) pool.push(`${letter}1`);
  return rng.shuffle(pool).slice(0, Math.min(count, pool.length));
}

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

  const screwHoleIds = Array.from(screwSpots);
  if (screwHoleIds.length > totalScrews) {
    rng.shuffle(screwHoleIds).length = totalScrews;
  }
  while (screwHoleIds.length < totalScrews) {
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
    if (screw && color) {
      screw.color = color;
      screw.type = 'standard';
      delete screw.frozenHits;
      delete screw.chainId;
      delete screw.lockGroup;
    }
  }
}

/**
 * Sprinkle special screw types onto the standard set. We mutate screws in place
 * so colour distribution is preserved (important for solver constraints).
 */
function assignSpecialTypes(rng: Rng, screws: Screw[], profile: DifficultyProfile): ScrewType[] {
  const introduced = new Set<ScrewType>();
  const pickIndex = (excludeTypes: ScrewType[]): number | null => {
    const candidates: number[] = [];
    for (let i = 0; i < screws.length; i++) {
      const s = screws[i];
      if (!s) continue;
      if (s.type !== 'standard') continue;
      if (excludeTypes.includes(s.type)) continue;
      candidates.push(i);
    }
    if (!candidates.length) return null;
    return rng.pick(candidates);
  };

  // Frozen: standalone screws with extra ice.
  for (let i = 0; i < profile.frozenCount; i++) {
    const idx = pickIndex([]);
    if (idx === null) break;
    const target = screws[idx];
    if (!target) continue;
    target.type = 'frozen';
    target.frozenHits = 2; // solid ice; player taps twice
    introduced.add('frozen');
  }

  // Chained pairs: two screws sharing a chainId; same colour to simplify solver.
  for (let p = 0; p < profile.chainedPairs; p++) {
    const idxA = pickIndex([]);
    if (idxA === null) break;
    const chainId = `chain-${p}`;
    const a = screws[idxA];
    if (!a) continue;
    a.type = 'chained';
    a.chainId = chainId;
    // Find a partner of the same colour if possible, else any standard screw.
    const partnerCandidates: number[] = [];
    for (let i = 0; i < screws.length; i++) {
      if (i === idxA) continue;
      const s = screws[i];
      if (!s || s.type !== 'standard') continue;
      partnerCandidates.push(i);
    }
    if (!partnerCandidates.length) {
      // Revert; can't pair
      a.type = 'standard';
      delete a.chainId;
      break;
    }
    // Prefer same-colour partners.
    const sameColor = partnerCandidates.filter((i) => screws[i]?.color === a.color);
    const partnerIdx = sameColor.length ? rng.pick(sameColor) : rng.pick(partnerCandidates);
    const partner = screws[partnerIdx];
    if (!partner) continue;
    partner.type = 'chained';
    partner.chainId = chainId;
    introduced.add('chained');
  }

  // Locked + key pairs: a "locked" screw can't be tapped until a "key" screw
  // sharing the same lockGroup is removed.
  for (let p = 0; p < profile.lockedPairs; p++) {
    const idxKey = pickIndex([]);
    if (idxKey === null) break;
    const lockGroup = `lock-${p}`;
    const key = screws[idxKey];
    if (!key) continue;
    key.type = 'key';
    key.lockGroup = lockGroup;
    const candidates: number[] = [];
    for (let i = 0; i < screws.length; i++) {
      if (i === idxKey) continue;
      const s = screws[i];
      if (!s || s.type !== 'standard') continue;
      candidates.push(i);
    }
    if (!candidates.length) {
      key.type = 'standard';
      delete key.lockGroup;
      break;
    }
    const lockedIdx = rng.pick(candidates);
    const locked = screws[lockedIdx];
    if (!locked) continue;
    locked.type = 'locked';
    locked.lockGroup = lockGroup;
    introduced.add('key');
    introduced.add('locked');
  }

  return Array.from(introduced);
}

export function generateLevel(params: GenParams): LevelDefinition {
  const seed = params.seed ?? seedFromId(`${params.chapter}.${params.level}`);
  const rng = createRng(seed);
  const profile = profileFor(params.chapter, params.level);

  let scaffold: BuildResult | null = null;
  for (let attempt = 0; attempt < 12 && !scaffold; attempt++) {
    scaffold = buildScaffold(rng, profile);
  }
  if (!scaffold) {
    const fallback: DifficultyProfile = { ...profile, plateCount: 3, trios: 2, frozenCount: 0, chainedPairs: 0, lockedPairs: 0 };
    for (let attempt = 0; attempt < 6 && !scaffold; attempt++) {
      scaffold = buildScaffold(rng, fallback);
    }
    if (!scaffold) throw new Error(`generator: could not build scaffold for ${params.chapter}.${params.level}`);
  }

  let introTypes: ScrewType[] = [];
  let chosen: BuildResult | null = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    assignColors(rng, scaffold.screws, profile);
    if (solvable(scaffold, profile.bucketSlots)) {
      // Once colour assignment passes, sprinkle special screws on top.
      introTypes = assignSpecialTypes(rng, scaffold.screws, profile);
      chosen = scaffold;
      break;
    }
  }
  if (!chosen) {
    introTypes = assignSpecialTypes(rng, scaffold.screws, profile);
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
    introTypes,
  };
}
