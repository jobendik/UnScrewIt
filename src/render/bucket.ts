/**
 * Bucket bar renderer — draws the row of colour-bucket slots below the
 * wooden board area, inside the same SVG so it scales with the board.
 *
 * The bucket is the core mechanic; every visual decision here prioritises
 * "can the player tell at a glance what's claimed, how full each slot is,
 * and whether they're about to lock themselves out" — especially on mobile.
 */

import { colorDef } from '@/game/colors';
import { SLOT_CAPACITY } from '@/game/bucket';
import type { BucketSlot } from '@/game/types';
import { svg } from './svg';

const BUCKET_TOP = 790;
const BUCKET_HEIGHT = 92;
const SLOT_GAP = 10;
const SLOT_INSET_X = 36;

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

/**
 * "Tight" = no empty slots remaining. The bucket can still accept any colour
 * that already has an open slot, but the player has no fallback. We pulse the
 * tray border in this state so they notice before they lock themselves out.
 */
function isTightState(slots: readonly BucketSlot[]): boolean {
  return slots.every((s) => s.color !== null);
}

export function drawBucket(slots: readonly BucketSlot[]): SVGGElement {
  const layout = bucketLayout(slots.length);
  const tight = isTightState(slots);
  const g = svg('g', { id: 'bucket-bar' });

  // Backing tray — gains a warning ring when no empty slots remain.
  g.appendChild(
    svg('rect', {
      x: 20,
      y: BUCKET_TOP - 10,
      width: 560,
      height: layout.slotHeight + 26,
      rx: 24,
      fill: '#3a1c08',
      opacity: '.36',
    }),
  );
  if (tight) {
    const warn = svg('rect', {
      x: 20,
      y: BUCKET_TOP - 10,
      width: 560,
      height: layout.slotHeight + 26,
      rx: 24,
      fill: 'none',
      stroke: '#ffae3a',
      'stroke-width': 3,
      opacity: '.8',
      className: 'bucket-tight-warn',
    });
    g.appendChild(warn);
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const center = layout.centers[i];
    if (!slot || !center) continue;
    const x = center.x - layout.slotWidth / 2;
    const y = BUCKET_TOP;

    const filled = slot.color !== null;
    const color = filled ? colorDef(slot.color as string) : null;
    const nearFull = filled && slot.count >= SLOT_CAPACITY - 1;

    // Outer rim
    g.appendChild(
      svg('rect', {
        x,
        y,
        width: layout.slotWidth,
        height: layout.slotHeight,
        rx: 16,
        fill: '#1f0e02',
        opacity: filled ? '.92' : '.78',
      }),
    );
    // Inner pocket — colour matches the slot's claimed colour.
    g.appendChild(
      svg('rect', {
        x: x + 4,
        y: y + 4,
        width: layout.slotWidth - 8,
        height: layout.slotHeight - 8,
        rx: 12,
        fill: color ? color.fill : '#5e3216',
        opacity: filled ? '0.96' : '0.42',
      }),
    );
    // Glossy highlight strip across the top.
    g.appendChild(
      svg('rect', {
        x: x + 8,
        y: y + 7,
        width: layout.slotWidth - 16,
        height: 14,
        rx: 7,
        fill: color ? color.shine : '#fff',
        opacity: filled ? '.65' : '.18',
      }),
    );

    // Vertical fill bar — bottom-up "thermometer" showing slot fullness at a glance.
    const barLeft = x + 8;
    const barRight = x + layout.slotWidth - 8;
    const barBottom = y + layout.slotHeight - 8;
    const barTop = y + 28;
    const barFullHeight = barBottom - barTop;
    const fillRatio = filled ? Math.min(1, slot.count / SLOT_CAPACITY) : 0;
    // Track behind the fill so empty slots still read as "ready"
    g.appendChild(
      svg('rect', {
        x: barLeft,
        y: barTop,
        width: barRight - barLeft,
        height: barFullHeight,
        rx: 8,
        fill: '#000',
        opacity: '.18',
      }),
    );
    if (filled && color) {
      const filledHeight = Math.max(6, barFullHeight * fillRatio);
      g.appendChild(
        svg('rect', {
          x: barLeft,
          y: barBottom - filledHeight,
          width: barRight - barLeft,
          height: filledHeight,
          rx: 8,
          fill: color.shine,
          opacity: '.88',
          className: nearFull ? 'slot-fill-danger' : '',
        }),
      );
    }

    // Big numeric "N/3" counter — readable on small screens.
    const countText = svg('text', {
      x: center.x,
      y: y + 24,
      'text-anchor': 'middle',
      'font-size': 17,
      'font-weight': 900,
      fill: '#fff',
      'paint-order': 'stroke',
      stroke: '#1f0e02',
      'stroke-width': 3.5,
      'stroke-linejoin': 'round',
      opacity: filled ? '1' : '.55',
    });
    countText.textContent = filled ? `${slot.count}/${SLOT_CAPACITY}` : '—';
    g.appendChild(countText);

    // "Near full" yellow ring to draw the eye to slots about to clear.
    if (nearFull) {
      g.appendChild(
        svg('rect', {
          x: x + 1,
          y: y + 1,
          width: layout.slotWidth - 2,
          height: layout.slotHeight - 2,
          rx: 15,
          fill: 'none',
          stroke: '#fff5b0',
          'stroke-width': 3,
          opacity: '.85',
          className: 'slot-near-full-pulse',
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
