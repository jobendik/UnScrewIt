/**
 * Runtime tweens. These animate transient SVG elements without joining
 * the main render loop.
 */

import { BOARD_RECT, BOARD_VIEWBOX, MOVE_MS } from '@/core/config';
import { colorDef } from '@/game/colors';
import type { Screw } from '@/game/types';
import { clamp } from '@/core/utils';
import { drawScrew } from './board';
import { bucketCenter } from './bucket';
import { svg } from './svg';

/**
 * Animate a screw arcing from `from` to the centre of bucket slot `slotIndex`.
 * The screw spins as it travels, scales down slightly on impact, then `done`
 * is invoked so the state machine can finalise the placement.
 */
export function animateScrewToBucket(
  effectsLayer: SVGElement,
  screw: Screw,
  from: { x: number; y: number },
  slotIndex: number,
  totalSlots: number,
  done: () => void,
): void {
  const ghost = drawScrew(screw, from.x, from.y, { available: true });
  effectsLayer.appendChild(ghost);
  const start = performance.now();
  const target = bucketCenter(totalSlots, slotIndex);
  const arc = -90 - Math.random() * 20;
  const duration = MOVE_MS + 90;

  const step = (now: number): void => {
    const t = clamp((now - start) / duration, 0, 1);
    const ease = 1 - Math.pow(1 - t, 2.4);
    const x = from.x + (target.x - from.x) * ease;
    const y = from.y + (target.y - from.y) * ease + Math.sin(Math.PI * ease) * arc;
    const r = 720 * ease;
    const scale = 1 - 0.4 * ease;
    ghost.setAttribute('transform', `translate(${x},${y}) rotate(${r}) scale(${scale})`);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      ghost.remove();
      done();
    }
  };
  requestAnimationFrame(step);
}

/**
 * Burst of coloured particles + confetti from the board's title area —
 * used on level clear.
 */
export function confettiBurst(effectsLayer: SVGElement): void {
  const colors = ['#ff5252', '#ffd740', '#40c4ff', '#69f0ae', '#e040fb', '#ffab40'];
  for (let i = 0; i < 70; i++) {
    const colorIndex = i % colors.length;
    const color = colors[colorIndex] ?? '#ffffff';
    const c = svg('circle', {
      cx: BOARD_VIEWBOX.w / 2,
      cy: BOARD_RECT.y + 70,
      r: 4 + Math.random() * 4,
      fill: color,
      opacity: '.95',
    });
    effectsLayer.appendChild(c);
    const ang = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 280;
    const dx = Math.cos(ang) * speed;
    const dy = Math.sin(ang) * speed + 150;
    const anim = c.animate(
      [
        { transform: 'translate(0px,0px)', opacity: 1 },
        {
          transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 720}deg)`,
          opacity: 0,
        },
      ],
      { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.16,.72,.32,1)' },
    );
    anim.onfinish = () => c.remove();
  }
}

/**
 * Glow + pulse around a bucket slot that just cleared.
 */
export function slotClearFlash(effectsLayer: SVGElement, slotIndex: number, totalSlots: number, colorId: string): void {
  const center = bucketCenter(totalSlots, slotIndex);
  const c = colorDef(colorId);
  const ring = svg('circle', {
    cx: center.x,
    cy: center.y,
    r: 12,
    fill: 'none',
    stroke: c.shine,
    'stroke-width': 6,
    opacity: '.9',
  });
  effectsLayer.appendChild(ring);
  const anim = ring.animate(
    [
      { r: '12', opacity: '0.95', 'stroke-width': '8' },
      { r: '90', opacity: '0',    'stroke-width': '1' },
    ] as unknown as Keyframe[],
    { duration: 650, easing: 'cubic-bezier(.18,.7,.32,1)' },
  );
  anim.onfinish = () => ring.remove();
}
