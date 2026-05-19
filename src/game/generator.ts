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
import { bar, slab, pointInPlate, pointOverPlateHole } from './plates';
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

/**
 * Minimum tap count to clear a level, given the screw composition. Used as
 * the basis for parMoves (the move-efficiency target).
 *
 *  - standard / key / locked screws: 1 tap each
 *  - frozen: 2 taps (crack + pop)
 *  - chained: 1 tap per chain group (regardless of member count)
 */
function idealMoves(screws: Screw[]): number {
  const chainGroups = new Set<string>();
  let nonChained = 0;
  let frozenExtraTaps = 0;
  for (const s of screws) {
    if (s.type === 'chained' && s.chainId) {
      chainGroups.add(s.chainId);
    } else {
      nonChained += 1;
    }
    if (s.type === 'frozen') frozenExtraTaps += 1;
  }
  return nonChained + chainGroups.size + frozenExtraTaps;
}

/**
 * Chapter-based generosity buffer applied on top of `idealMoves`. Earlier
 * chapters get a larger cushion so casual players can still hit Perfect Solve;
 * later chapters tighten the screw (so to speak) for mastery.
 */
function parMovesBuffer(chapter: number, ideal: number): number {
  if (chapter <= 1) return Math.max(4, Math.ceil(ideal * 0.5));
  if (chapter <= 3) return Math.max(3, Math.ceil(ideal * 0.35));
  if (chapter <= 6) return Math.max(2, Math.ceil(ideal * 0.25));
  return Math.max(2, Math.ceil(ideal * 0.18));
}

function computeParMoves(chapter: number, screws: Screw[]): number {
  const ideal = idealMoves(screws);
  return ideal + parMovesBuffer(chapter, ideal);
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

interface HoleRC { col: number; row: number; }
function parseHole(id: string): HoleRC | null {
  const col = GRID_COL_LETTERS.indexOf(id[0] as (typeof GRID_COL_LETTERS)[number]);
  const row = Number(id.slice(1));
  if (col < 0 || !Number.isFinite(row)) return null;
  return { col, row };
}
function holeId(col: number, row: number): string | null {
  const letter = GRID_COL_LETTERS[col];
  if (!letter) return null;
  if (row < 1 || row > NUM_ROWS) return null;
  return `${letter}${row}`;
}

interface BuildResult {
  holes: Hole[];
  plates: Plate[];
  screws: Screw[];
}

type PlateTemplate =
  | 'bar2'        // 2-hole bar (classic)
  | 'bar3'        // 3-hole bar — longer span across collinear holes
  | 'slab2'       // small slab covering 2 collinear holes plus body across a third
  | 'slab3'       // larger slab covering 3 collinear holes
  | 'lShape'      // two short bars forming an L (emitted as two plates)
  | 'tShape'      // T-shape: one horizontal bar + one vertical bar through its centre
  | 'coverBar'    // 2-pin bar deliberately placed over an existing pin hole — adds
                  // both new pins AND covers an existing pin
  | 'coverShared' // post-budget "depth" template: designates two EXISTING pins (so
                  // it shares screws with prior plates) and its body covers a THIRD
                  // existing pin. Adds zero new pins — pure stacking.
  | 'coverSlab';  // post-budget slab variant: larger body, designates 2 existing
                  // pins and covers 1-2 nearby existing pins.

/**
 * Per-chapter template weights. Earlier chapters lean on classic bars; later
 * chapters mix in slabs, L/T shapes, and longer 3-hole bars for visual variety.
 * The weights are a relative bias — final scaffold attempts still need to pass
 * the solver, so unlucky picks are silently dropped.
 */
function templateWeightsFor(chapter: number): Array<[PlateTemplate, number]> {
  // `coverBar` is the stacking workhorse — it places a plate over an existing
  // pin so the player must unscrew it first. Weight climbs with chapter so
  // later levels demand real ordering reasoning.
  if (chapter <= 1) return [['bar2', 10], ['bar3', 1], ['coverBar', 2]];
  if (chapter <= 2) return [['bar2', 6], ['bar3', 2], ['slab2', 1], ['coverBar', 4]];
  if (chapter <= 3) return [['bar2', 5], ['bar3', 3], ['slab2', 2], ['lShape', 1], ['coverBar', 5]];
  if (chapter <= 5) return [['bar2', 4], ['bar3', 3], ['slab2', 3], ['slab3', 1], ['lShape', 2], ['tShape', 1], ['coverBar', 7]];
  if (chapter <= 7) return [['bar2', 3], ['bar3', 3], ['slab2', 3], ['slab3', 2], ['lShape', 3], ['tShape', 2], ['coverBar', 9]];
  return [['bar2', 2], ['bar3', 3], ['slab2', 3], ['slab3', 3], ['lShape', 4], ['tShape', 3], ['coverBar', 11]];
}

function pickWeighted<T>(rng: Rng, weighted: ReadonlyArray<[T, number]>): T {
  let total = 0;
  for (const [, w] of weighted) total += w;
  let roll = rng.next() * total;
  for (const [value, w] of weighted) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return weighted[0]![0];
}

/**
 * Attempt to place a single plate "template" onto the board. Returns the new
 * plates and any holes that the plates pin. May return null if the requested
 * geometry doesn't fit the current scaffold.
 */
function tryTemplate(
  rng: Rng,
  template: PlateTemplate,
  holeMap: Record<string, Hole>,
  holeIds: string[],
  plateIdSeed: number,
  used: Set<string>,
): { plates: Plate[]; pinnedHoles: string[] } | null {
  const id = (n: number) => `pg-${plateIdSeed}-${n}`;
  const candidates = holeIds.filter((h) => !used.has(h));
  if (candidates.length < 2) return null;

  const tryBar = (a: string, b: string): Plate | null => {
    try {
      return bar(holeMap, id(0), a, b, 'brown', { holeIds: [a, b], extend: rng.int(54, 80) });
    } catch { return null; }
  };

  switch (template) {
    case 'bar2': {
      // Pair of nearby holes.
      const shuffled = rng.shuffle(candidates);
      for (const a of shuffled) {
        for (const b of shuffled) {
          if (a === b || !nearby(a, b)) continue;
          const p = tryBar(a, b);
          if (p) return { plates: [p], pinnedHoles: [a, b] };
        }
      }
      return null;
    }
    case 'bar3': {
      // Three collinear holes (e.g. A3-B3-C3 or B2-B3-B4).
      const shuffled = rng.shuffle(candidates);
      for (const a of shuffled) {
        const pa = parseHole(a);
        if (!pa) continue;
        for (const dir of rng.shuffle([[0, 1], [1, 0], [0, -1], [-1, 0]] as ReadonlyArray<readonly [number, number]>)) {
          const [dc, dr] = dir;
          const b = holeId(pa.col + dc, pa.row + dr);
          const c = holeId(pa.col + dc * 2, pa.row + dr * 2);
          if (!b || !c) continue;
          if (!candidates.includes(b) || !candidates.includes(c)) continue;
          try {
            const p = bar(holeMap, id(0), a, c, 'brown', { holeIds: [a, b, c], extend: rng.int(56, 78) });
            return { plates: [p], pinnedHoles: [a, b, c] };
          } catch { continue; }
        }
      }
      return null;
    }
    case 'slab2': {
      // Slab oriented along two adjacent collinear holes.
      const shuffled = rng.shuffle(candidates);
      for (const a of shuffled) {
        const pa = parseHole(a);
        if (!pa) continue;
        for (const dir of rng.shuffle([[0, 1], [1, 0]] as ReadonlyArray<readonly [number, number]>)) {
          const [dc, dr] = dir;
          const b = holeId(pa.col + dc, pa.row + dr);
          if (!b || !candidates.includes(b)) continue;
          const horiz = dr === 0;
          const w = horiz ? 175 : 110;
          const h = horiz ? 110 : 175;
          const ha = holeMap[a];
          const hb = holeMap[b];
          if (!ha || !hb) continue;
          // Centre the slab between the two holes.
          const cx = (ha.x + hb.x) / 2;
          const cy = (ha.y + hb.y) / 2;
          try {
            // We piggyback on `slab()` but recentre via a temporary hole map.
            const tmpId = `_slab_center_${plateIdSeed}`;
            const tmpMap: Record<string, Hole> = {
              ...holeMap,
              [tmpId]: { id: tmpId, x: cx, y: cy },
            };
            const p = slab(tmpMap, id(0), tmpId, w, h, 0, 'brown', [a, b], { fallSide: rng.int(0, 1) === 0 ? -1 : 1 });
            return { plates: [p], pinnedHoles: [a, b] };
          } catch { continue; }
        }
      }
      return null;
    }
    case 'slab3': {
      // Slab covering three collinear holes.
      const shuffled = rng.shuffle(candidates);
      for (const a of shuffled) {
        const pa = parseHole(a);
        if (!pa) continue;
        for (const dir of rng.shuffle([[0, 1], [1, 0]] as ReadonlyArray<readonly [number, number]>)) {
          const [dc, dr] = dir;
          const b = holeId(pa.col + dc, pa.row + dr);
          const c = holeId(pa.col + dc * 2, pa.row + dr * 2);
          if (!b || !c || !candidates.includes(b) || !candidates.includes(c)) continue;
          const horiz = dr === 0;
          const w = horiz ? 270 : 110;
          const h = horiz ? 110 : 270;
          const ha = holeMap[a];
          const hc = holeMap[c];
          if (!ha || !hc) continue;
          const cx = (ha.x + hc.x) / 2;
          const cy = (ha.y + hc.y) / 2;
          try {
            const tmpId = `_slab3_center_${plateIdSeed}`;
            const tmpMap: Record<string, Hole> = {
              ...holeMap,
              [tmpId]: { id: tmpId, x: cx, y: cy },
            };
            const p = slab(tmpMap, id(0), tmpId, w, h, 0, 'brown', [a, b, c], { fallSide: rng.int(0, 1) === 0 ? -1 : 1 });
            return { plates: [p], pinnedHoles: [a, b, c] };
          } catch { continue; }
        }
      }
      return null;
    }
    case 'lShape': {
      // Two bars meeting at a shared corner hole (perpendicular).
      const shuffled = rng.shuffle(candidates);
      for (const corner of shuffled) {
        const pc = parseHole(corner);
        if (!pc) continue;
        const dirs = rng.shuffle([[0, 1], [1, 0], [0, -1], [-1, 0]] as ReadonlyArray<readonly [number, number]>);
        for (let i = 0; i < dirs.length; i++) {
          for (let j = 0; j < dirs.length; j++) {
            if (i === j) continue;
            const da = dirs[i]!;
            const db = dirs[j]!;
            // Reject parallel directions; we want a real L, not a straight line.
            if (da[0] === -db[0] && da[1] === -db[1]) continue;
            if (da[0] === db[0] && da[1] === db[1]) continue;
            const aId = holeId(pc.col + da[0], pc.row + da[1]);
            const bId = holeId(pc.col + db[0], pc.row + db[1]);
            if (!aId || !bId) continue;
            if (!candidates.includes(aId) || !candidates.includes(bId)) continue;
            const p1 = (() => {
              try { return bar(holeMap, id(0), corner, aId, 'brown', { holeIds: [corner, aId], extend: rng.int(50, 70) }); }
              catch { return null; }
            })();
            const p2 = (() => {
              try { return bar(holeMap, id(1), corner, bId, 'brown', { holeIds: [corner, bId], extend: rng.int(50, 70) }); }
              catch { return null; }
            })();
            if (p1 && p2) return { plates: [p1, p2], pinnedHoles: [corner, aId, bId] };
          }
        }
      }
      return null;
    }
    case 'tShape': {
      // One bar across three collinear holes + a perpendicular bar from the centre.
      const shuffled = rng.shuffle(candidates);
      for (const a of shuffled) {
        const pa = parseHole(a);
        if (!pa) continue;
        for (const dir of rng.shuffle([[0, 1], [1, 0]] as ReadonlyArray<readonly [number, number]>)) {
          const [dc, dr] = dir;
          const b = holeId(pa.col + dc, pa.row + dr);
          const c = holeId(pa.col + dc * 2, pa.row + dr * 2);
          if (!b || !c || !candidates.includes(b) || !candidates.includes(c)) continue;
          const perp: ReadonlyArray<readonly [number, number]> = dc === 0
            ? [[1, 0], [-1, 0]]
            : [[0, 1], [0, -1]];
          for (const [pdc, pdr] of rng.shuffle(perp)) {
            const pb = parseHole(b);
            if (!pb) continue;
            const tip = holeId(pb.col + pdc, pb.row + pdr);
            if (!tip || !candidates.includes(tip)) continue;
            const horiz = (() => {
              try { return bar(holeMap, id(0), a, c, 'brown', { holeIds: [a, b, c], extend: rng.int(54, 74) }); }
              catch { return null; }
            })();
            const stem = (() => {
              try { return bar(holeMap, id(1), b, tip, 'brown', { holeIds: [b, tip], extend: rng.int(52, 68) }); }
              catch { return null; }
            })();
            if (horiz && stem) return { plates: [horiz, stem], pinnedHoles: [a, b, c, tip] };
          }
        }
      }
      return null;
    }
    case 'coverBar': {
      // Place a 2-pin bar whose two designated holes are 2 apart, with an
      // EXISTING pin sitting in the middle (in the bar's body, but NOT a
      // designated hole on this plate). Forces the player to remove this
      // plate before the covered screw is reachable — the stacking puzzle.
      if (used.size === 0) return null; // need a target to cover
      const targets = rng.shuffle(Array.from(used));
      for (const targetId of targets) {
        const pt = parseHole(targetId);
        if (!pt) continue;
        for (const dir of rng.shuffle([[0, 1], [1, 0]] as ReadonlyArray<readonly [number, number]>)) {
          const [dc, dr] = dir;
          const a = holeId(pt.col - dc, pt.row - dr);
          const b = holeId(pt.col + dc, pt.row + dr);
          if (!a || !b) continue;
          if (!candidates.includes(a) || !candidates.includes(b)) continue;
          try {
            const p = bar(holeMap, id(0), a, b, 'brown', { holeIds: [a, b], extend: rng.int(58, 78) });
            return { plates: [p], pinnedHoles: [a, b] };
          } catch { continue; }
        }
      }
      return null;
    }
    case 'coverShared': {
      // The depth workhorse. Designate two EXISTING pins as this plate's holes
      // (so it shares screws with prior plates) and span across a third existing
      // pin in the middle. Adds 0 new pins — pure stacking. Removing this plate
      // requires the two endpoint screws to fall, exposing the covered middle.
      if (used.size < 3) return null;
      const targets = rng.shuffle(Array.from(used));
      for (const targetId of targets) {
        const pt = parseHole(targetId);
        if (!pt) continue;
        for (const dir of rng.shuffle([[0, 1], [1, 0]] as ReadonlyArray<readonly [number, number]>)) {
          const [dc, dr] = dir;
          const a = holeId(pt.col - dc, pt.row - dr);
          const b = holeId(pt.col + dc, pt.row + dr);
          if (!a || !b || a === targetId || b === targetId) continue;
          if (!used.has(a) || !used.has(b)) continue;
          try {
            const p = bar(holeMap, id(0), a, b, 'brown', { holeIds: [a, b], extend: rng.int(58, 78) });
            // Sanity: verify the new plate actually covers the target.
            const targetHole = holeMap[targetId];
            if (!targetHole) continue;
            if (!pointInPlate(p, targetHole) || pointOverPlateHole(p, targetHole)) continue;
            return { plates: [p], pinnedHoles: [] };
          } catch { continue; }
        }
      }
      return null;
    }
    case 'coverSlab': {
      // Flexible slab variant: tries pairs of existing pins within a 2-cell
      // window and checks whether the resulting slab body covers any OTHER
      // existing pin (collinear OR perpendicular). Lets us add stacking even
      // when no perfect 3-collinear-pin triple exists.
      if (used.size < 3) return null;
      const pinPositions: Array<{ id: string; hole: Hole; rc: HoleRC }> = [];
      for (const id of used) {
        const hole = holeMap[id];
        const rc = parseHole(id);
        if (hole && rc) pinPositions.push({ id, hole, rc });
      }
      if (pinPositions.length < 3) return null;
      const shuffledA = rng.shuffle(pinPositions);
      for (const A of shuffledA) {
        for (const B of rng.shuffle(pinPositions)) {
          if (A.id === B.id) continue;
          const colDiff = Math.abs(A.rc.col - B.rc.col);
          const rowDiff = Math.abs(A.rc.row - B.rc.row);
          if (colDiff > 2 || rowDiff > 2 || (colDiff === 0 && rowDiff === 0)) continue;
          const cx = (A.hole.x + B.hole.x) / 2;
          const cy = (A.hole.y + B.hole.y) / 2;
          // Slab footprint: roomy enough to catch a perpendicular neighbour.
          const w = 180 + colDiff * 55;
          const h = 130 + rowDiff * 55;
          try {
            const tmpId = `_covslab_center_${plateIdSeed}`;
            const tmpMap: Record<string, Hole> = {
              ...holeMap,
              [tmpId]: { id: tmpId, x: cx, y: cy },
            };
            const p = slab(tmpMap, id(0), tmpId, w, h, 0, 'brown', [A.id, B.id], { fallSide: rng.int(0, 1) === 0 ? -1 : 1 });
            const covered = pinPositions.find((x) =>
              x.id !== A.id && x.id !== B.id && pointInPlate(p, x.hole) && !pointOverPlateHole(p, x.hole),
            );
            if (!covered) continue;
            return { plates: [p], pinnedHoles: [] };
          } catch { continue; }
        }
      }
      return null;
    }
  }
}

/**
 * Count how many of `pinIds` end up under at least one OTHER plate's body
 * (i.e. covered without being a designated hole of that plate). This is the
 * stacking-puzzle density — it's what makes the level a puzzle instead of a
 * tap-test. Used as a generation-time quality gate.
 */
/**
 * Minimum required count of stacked pins per chapter. Tuned so chapter 1 is
 * lenient (some flat layouts are fine for onboarding) and later chapters
 * always demand real "which plate first" reasoning.
 */
function stackingFloor(chapter: number, totalScrews: number): number {
  // What fraction of screws must be BLOCKED at level start. Without this, a
  // level degenerates into "tap them in any order" because most screws sit at
  // their host plate's hole with nothing above them. We aim for a clear
  // ordering puzzle: chapter 1 is gentle (1–2 stacked is enough to teach the
  // mechanic), but mid/late chapters require the majority of screws to be
  // initially gated behind another plate.
  if (chapter <= 1) return Math.max(1, Math.floor(totalScrews * 0.2));
  if (chapter <= 2) return Math.max(2, Math.floor(totalScrews * 0.3));
  if (chapter <= 4) return Math.max(3, Math.floor(totalScrews * 0.4));
  if (chapter <= 7) return Math.max(4, Math.floor(totalScrews * 0.45));
  return Math.max(5, Math.floor(totalScrews * 0.5));
}

function countStackedPins(
  plates: ReadonlyArray<Plate>,
  pinIds: ReadonlyArray<string>,
  holeMap: Record<string, Hole>,
): number {
  // Uses the same z-ordered rule as GameState.isHoleBlocked: a pin counts as
  // "stacked" only when some plate ABOVE its topmost-designating host covers
  // it without designating it. Counting under the strict rule (any covering
  // plate at all) overstates stacking because a plate BELOW the host is not
  // actually a blocker — the screw sits in the host's hole, above that plate.
  let stacked = 0;
  for (const hid of pinIds) {
    const hole = holeMap[hid];
    if (!hole) continue;
    let hostIdx = -1;
    for (let i = 0; i < plates.length; i++) {
      if (pointOverPlateHole(plates[i]!, hole)) hostIdx = i;
    }
    if (hostIdx < 0) continue;
    for (let i = hostIdx + 1; i < plates.length; i++) {
      const p = plates[i]!;
      if (pointInPlate(p, hole) && !pointOverPlateHole(p, hole)) { stacked += 1; break; }
    }
  }
  return stacked;
}

function buildScaffold(rng: Rng, profile: DifficultyProfile, chapter: number): BuildResult | null {
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
  // Phase 1 weights — `coverShared` and `coverSlab` are post-budget only, so
  // we exclude them here. The phase-1 loop's job is to introduce the level's
  // pin set; pure-stacking plates would just stall it (they add zero pins).
  const weights = templateWeightsFor(chapter).filter(([t]) => t !== 'coverShared' && t !== 'coverSlab');
  // Plate count is a soft target. The hard constraint is that screwSpots
  // must end exactly at `totalScrews`, so every screw sits in a plate hole
  // and every plate hole has a screw — no floating "wall screws" and no
  // un-pinnable plates.
  const plateCountCap = profile.plateCount + 2;
  // Higher attempt budget — the no-overlap constraint rejects layouts more
  // aggressively, so we need more shuffles to find a clean fit. Without this
  // bump, harder profiles intermittently fail the inner loop and the outer
  // retry has to take over, which was visible as occasional plain layouts.
  const maxAttempts = plateCountCap * 24;
  let attempts = 0;
  let plateSeed = 0;
  while (screwSpots.size < totalScrews && attempts < maxAttempts) {
    attempts++;
    if (plates.length >= plateCountCap) break;
    const template = pickWeighted(rng, weights);
    const result = tryTemplate(rng, template, holeMap, holeIds, plateSeed++, screwSpots);
    if (!result) continue;
    // Reject anything that would overshoot the exact pin budget. We keep
    // looping for another template instead of padding with floating screws.
    const projectedPins = new Set(screwSpots);
    for (const h of result.pinnedHoles) projectedPins.add(h);
    if (projectedPins.size > totalScrews) continue;
    // A template that adds zero new pin holes wastes a plate slot; skip it.
    if (projectedPins.size === screwSpots.size) continue;
    plates.push(...result.plates);
    for (const h of result.pinnedHoles) screwSpots.add(h);
  }
  // Reject scaffolds that couldn't reach the exact pin budget — the caller
  // retries with a fresh permutation rather than producing floating screws.
  if (screwSpots.size !== totalScrews) return null;
  if (plates.length < 2) return null;

  // ── Phase 2: stacking layer ────────────────────────────────────────────
  // The pin budget is now full and every screw has a host. Most of those
  // screws are still tappable in any order, which makes the level feel like
  // a "tap-everything" demo rather than a puzzle. We now layer on cover-only
  // plates (designating two EXISTING pins, body spanning a third) until the
  // stacking floor is met. Each cover-only plate forces an ordering decision:
  // its two shared screws must be popped first to expose what it covers.
  const stackingGoal = stackingFloor(chapter, totalScrews);
  const phase2Cap = plateCountCap + 6;
  const phase2MaxAttempts = 60;
  let phase2Attempts = 0;
  while (phase2Attempts < phase2MaxAttempts && plates.length < phase2Cap) {
    const stacked = countStackedPins(plates, Array.from(screwSpots), holeMap);
    if (stacked >= stackingGoal) break;
    phase2Attempts++;
    // Alternate between the bar and slab cover templates so layouts stay varied.
    const template: PlateTemplate = rng.next() < 0.65 ? 'coverShared' : 'coverSlab';
    const result = tryTemplate(rng, template, holeMap, holeIds, plateSeed++, screwSpots);
    if (!result || result.plates.length === 0) continue;
    // The cover plate is only worth keeping if it actually increases stacking.
    // (Without this check we'd accept a plate that "covers" a pin which was
    // already covered by an earlier plate, wasting a slot.)
    const before = countStackedPins(plates, Array.from(screwSpots), holeMap);
    const tentative = [...plates, ...result.plates];
    const after = countStackedPins(tentative, Array.from(screwSpots), holeMap);
    if (after <= before) continue;
    plates.push(...result.plates);
  }
  const finalStacked = countStackedPins(plates, Array.from(screwSpots), holeMap);
  if (finalStacked < stackingGoal) return null;

  const screwHoleIds = Array.from(screwSpots);

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
  // Now we additionally require Phase 2 to meet a stacking floor — that's a
  // stricter gate than before, so an unlucky pin layout can fail repeatedly.
  // Higher attempt budget means we re-roll permutations until one finds a
  // layout with enough room for the cover plates.
  for (let attempt = 0; attempt < 80 && !scaffold; attempt++) {
    scaffold = buildScaffold(rng, profile, params.chapter);
  }
  if (!scaffold) {
    // Last-resort fallback. Still aims for the chapter's stacking floor but
    // with a smaller pin budget, which is easier to satisfy. We keep the
    // requested chapter (not chapter 1) so the level still feels like a
    // proper puzzle — just smaller.
    const fallback: DifficultyProfile = { ...profile, plateCount: 3, trios: 2, frozenCount: 0, chainedPairs: 0, lockedPairs: 0 };
    for (let attempt = 0; attempt < 24 && !scaffold; attempt++) {
      scaffold = buildScaffold(rng, fallback, params.chapter);
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
    parMoves: computeParMoves(params.chapter, chosen.screws),
    introTypes,
  };
}
