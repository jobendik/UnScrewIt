/**
 * Bucket bar renderer — draws the row of colour-bucket slots below the
 * wooden board area, inside the same SVG so it scales with the board.
 */

import { colorDef } from '@/game/colors';
import type { BucketSlot } from '@/game/types';
import { svg } from './svg';

const BUCKET_TOP = 800;
const BUCKET_HEIGHT = 78;
const SLOT_GAP = 12;
const SLOT_INSET_X = 40;

interface BucketLayout {
  slotWidth: number;
  slotHeight: number;
  /** World-space centre coordinates per slot index. */
  centers: Array<{ x: number; y: number }>;
}

/** Compute slot geometry for N slots. */
export function bucketLayout(slotCount: number, boardWidth = 600): BucketLayout {
  const usable = boardWidth - SLOT_INSET_X * 2;
  const totalGap = SLOT_GAP * (slotCount - 1);
  const slotWidth = (usable - totalGap) / slotCount;
  const slotHeight = BUCKET_HEIGHT;
  const centers: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < slotCount; i++) {
    const x = SLOT_INSET_X + slotWidth / 2 + i * (slotWidth + SLOT_GAP);
    centers.push({ x, y: BUCKET_TOP + slotHeight / 2 });
  }
  return { slotWidth, slotHeight, centers };
}

export function drawBucket(slots: readonly BucketSlot[]): SVGGElement {
  const layout = bucketLayout(slots.length);
  const g = svg('g', { id: 'bucket-bar' });

  // Backing tray.
  g.appendChild(
    svg('rect', {
      x: 24,
      y: BUCKET_TOP - 8,
      width: 552,
      height: layout.slotHeight + 22,
      rx: 22,
      fill: '#3a1c08',
      opacity: '.32',
    }),
  );

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const center = layout.centers[i];
    if (!slot || !center) continue;
    const x = center.x - layout.slotWidth / 2;
    const y = BUCKET_TOP;

    const filled = slot.color !== null;
    const color = filled ? colorDef(slot.color as string) : null;

    // Outer rim
    g.appendChild(
      svg('rect', {
        x,
        y,
        width: layout.slotWidth,
        height: layout.slotHeight,
        rx: 14,
        fill: '#1f0e02',
        opacity: '.85',
      }),
    );
    // Inner pocket
    g.appendChild(
      svg('rect', {
        x: x + 4,
        y: y + 4,
        width: layout.slotWidth - 8,
        height: layout.slotHeight - 8,
        rx: 10,
        fill: color ? color.fill : '#5e3216',
        opacity: filled ? '0.95' : '0.55',
      }),
    );
    // Glossy highlight
    g.appendChild(
      svg('rect', {
        x: x + 8,
        y: y + 6,
        width: layout.slotWidth - 16,
        height: 12,
        rx: 6,
        fill: color ? color.shine : '#fff',
        opacity: filled ? '.55' : '.15',
      }),
    );

    // Capacity dots (1..3) — filled dots indicate stacked screws
    for (let d = 0; d < 3; d++) {
      const px = x + 14 + d * ((layout.slotWidth - 28) / 2);
      const py = y + layout.slotHeight - 14;
      const isFilled = filled && d < slot.count;
      g.appendChild(
        svg('circle', {
          cx: px,
          cy: py,
          r: 5,
          fill: isFilled ? '#fff' : '#000',
          opacity: isFilled ? '.95' : '.25',
        }),
      );
    }
  }
  return g;
}

/** World-space centre of the slot at `index`. */
export function bucketCenter(slotCount: number, index: number): { x: number; y: number } {
  const layout = bucketLayout(slotCount);
  return layout.centers[index] ?? { x: 300, y: BUCKET_TOP + BUCKET_HEIGHT / 2 };
}
