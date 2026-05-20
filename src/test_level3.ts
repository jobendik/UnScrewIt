// Verify the core issue: bucket constraints by level
import { generateLevel } from './game/generator';

for (let ch = 1; ch <= 5; ch++) {
  for (const lv of [1, 5, 10]) {
    const level = generateLevel({ chapter: ch, level: lv });
    const usedColors = new Set(level.screws.map(s => s.color)).size;
    const slotsNeededForConstraint = usedColors + 1; // would need this many colors to constrain
    const constrained = usedColors > level.bucketSlots; // more colors than slots = constraint
    console.log(`Ch${ch}.L${lv}: ${usedColors} unique colors, ${level.bucketSlots} slots => ${constrained ? 'CONSTRAINED(puzzle!)' : 'NO CONSTRAINT(trivial!)'}`);
  }
}
