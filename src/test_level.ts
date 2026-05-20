import { generateLevel } from './game/generator';
import { pointInPlate, pointOverPlateHole } from './game/plates';
import type { Hole, Plate } from './game/types';

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
  let blocked = 0;
  for (const screw of lv.screws) {
    const hole = lv.holes.find(h => h.id === screw.holeId)!;
    if (isHoleBlocked(hole, lv.plates)) blocked++;
  }
  const colors = new Set(lv.screws.map(s => s.color)).size;
  return { 
    ch: chapter, lv: level,
    screws: lv.screws.length, plates: lv.plates.length, 
    blocked, colors
  };
}

const tests: [number, number][] = [
  [1,1],[1,5],[1,10],[2,1],[3,1],[5,1],[5,10],[8,1],[10,10]
];

for (const [ch, lv] of tests) {
  const r = analyzeLevel(ch, lv);
  const pct = Math.round(100 * r.blocked / r.screws);
  console.log(`Ch${r.ch}.L${r.lv}: ${r.screws} screws, ${r.plates} plates, ${r.colors} colors, ${r.blocked}/${r.screws} (${pct}%) blocked initially`);
}
