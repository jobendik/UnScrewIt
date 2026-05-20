import { generateLevel } from './game/generator';
import { pointInPlate, pointOverPlateHole } from './game/plates';
import type { Hole, Plate, Screw } from './game/types';
import { canAccept, createBucket, place } from './game/bucket';
import type { ScrewColorId } from './game/colors';

function isHoleBlocked(hole: Hole, plates: Plate[]): boolean {
  const activePlates = plates.filter(p => p.status === 'active');
  let hostIdx = -1;
  for (let i = 0; i < activePlates.length; i++) {
    const p = activePlates[i]!;
    if (pointOverPlateHole(p, hole)) hostIdx = i;
  }
  if (hostIdx < 0) {
    for (const p of activePlates) {
      if (pointInPlate(p, hole) && !pointOverPlateHole(p, hole)) return true;
    }
    return false;
  }
  for (let i = hostIdx + 1; i < activePlates.length; i++) {
    const p = activePlates[i]!;
    if (!p) continue;
    if (pointInPlate(p, hole) && !pointOverPlateHole(p, hole)) return true;
  }
  return false;
}

function analyzeLevel(chapter: number, level: number) {
  const lv = generateLevel({ chapter, level });
  const accessible: Screw[] = [];
  const blocked: Screw[] = [];
  for (const screw of lv.screws) {
    const hole = lv.holes.find(h => h.id === screw.holeId)!;
    if (isHoleBlocked(hole, lv.plates)) blocked.push(screw);
    else accessible.push(screw);
  }
  
  const colorCount = new Set(lv.screws.map(s => s.color)).size;
  const accessibleColors = new Set(accessible.map(s => s.color)).size;
  
  // Simulate: if player clicks all accessible screws in worst order (one of each color),
  // does the bucket ever fill?
  const bucket = createBucket(lv.bucketSlots);
  let bucketWouldFill = false;
  
  // Sort accessible screws to maximize color diversity (worst case for bucket)
  const byColor = new Map<ScrewColorId, Screw[]>();
  for (const s of accessible) {
    const arr = byColor.get(s.color) ?? [];
    arr.push(s);
    byColor.set(s.color, arr);
  }
  // Interleave: take one of each color at a time
  const interleaved: Screw[] = [];
  let more = true;
  while (more) {
    more = false;
    for (const [, screws] of byColor) {
      const next = screws.shift();
      if (next) { interleaved.push(next); more = true; }
    }
  }
  
  for (const s of interleaved) {
    if (!canAccept(bucket, s.color)) {
      bucketWouldFill = true;
      break;
    }
    place(bucket, s.color);
  }
  
  return { 
    ch: chapter, lv: level,
    screws: lv.screws.length, plates: lv.plates.length, 
    blockedCount: blocked.length, colorCount, accessibleColors,
    bucketSlots: lv.bucketSlots, bucketWouldFill
  };
}

const tests: [number, number][] = [
  [1,1],[1,5],[1,10],[2,1],[3,1],[4,1],[5,1],[5,10],[7,10],[9,5],[10,1],[10,10]
];

console.log('Ch.L | screws | plates | colors | accessible_colors | bucket_slots | bucket_fills_if_random? | blocked');
for (const [ch, lv] of tests) {
  const r = analyzeLevel(ch, lv);
  const pct = Math.round(100 * r.blockedCount / r.screws);
  const fill = r.bucketWouldFill ? 'YES-PUZZLE' : 'no';
  console.log(`Ch${r.ch}.L${r.lv}: ${r.screws} screws, ${r.colorCount} colors, ${r.accessibleColors} access_colors, ${r.bucketSlots} slots, bucket_fills=${fill}, ${r.blockedCount}/${r.screws}(${pct}%) blocked`);
}
