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
 * Animate one or more screws arcing from their hole to their bucket slot.
 * Multi-screw bursts (e.g. chained pops) stagger by 70 ms each so the
 * eye can track every member of the chain.
 */
export function animateScrewsToBucket(
  effectsLayer: SVGElement,
  items: Array<{ screw: Screw; from: { x: number; y: number }; slotIndex: number }>,
  totalSlots: number,
  done: () => void,
): void {
  if (items.length === 0) return done();
  let pending = items.length;
  const onComplete = (): void => {
    pending -= 1;
    if (pending === 0) done();
  };
  items.forEach((item, i) => {
    window.setTimeout(() => {
      animateOne(effectsLayer, item.screw, item.from, item.slotIndex, totalSlots, onComplete);
    }, i * 70);
  });
}

function animateOne(
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
        { transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.16,.72,.32,1)' },
    );
    anim.onfinish = () => c.remove();
  }
}

export function slotClearFlash(
  effectsLayer: SVGElement,
  slotIndex: number,
  totalSlots: number,
  colorId: string,
): void {
  const center = bucketCenter(totalSlots, slotIndex);
  const c = colorDef(colorId);
  const ring = svg('circle', {
    cx: center.x, cy: center.y, r: 12,
    fill: 'none', stroke: c.shine, 'stroke-width': 6, opacity: '.9',
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

/**
 * "Ice cracking" burst — shards fly outward from a frozen screw on the
 * first tap.
 */
export function iceCrackBurst(effectsLayer: SVGElement, x: number, y: number): void {
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 24 + Math.random() * 20;
    const shard = svg('path', {
      d: 'M 0 0 L -3 -8 L 3 -6 Z',
      fill: '#c9e9f8',
      stroke: '#5db4d8',
      'stroke-width': 1,
    });
    shard.setAttribute('transform', `translate(${x},${y}) rotate(${Math.random() * 360})`);
    effectsLayer.appendChild(shard);
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist;
    const anim = shard.animate(
      [
        { transform: `translate(${x}px,${y}px) rotate(0deg) scale(1)`, opacity: 1 },
        { transform: `translate(${x + dx}px,${y + dy}px) rotate(${Math.random() * 540}deg) scale(.4)`, opacity: 0 },
      ],
      { duration: 600, easing: 'ease-out' },
    );
    anim.onfinish = () => shard.remove();
  }
}

/** Bucket "sort" wash — soft horizontal sweep across the slot row. */
export function bucketSortFlash(effectsLayer: SVGElement, totalSlots: number): void {
  const left = bucketCenter(totalSlots, 0);
  const right = bucketCenter(totalSlots, totalSlots - 1);
  const sweep = svg('rect', {
    x: left.x - 40, y: left.y - 50, width: 30, height: 100, rx: 12,
    fill: '#fff5b0', opacity: '.85',
  });
  effectsLayer.appendChild(sweep);
  const dx = right.x - left.x + 80;
  const anim = sweep.animate(
    [
      { transform: 'translateX(0px)', opacity: 0.85 },
      { transform: `translateX(${dx}px)`, opacity: 0 },
    ],
    { duration: 480, easing: 'cubic-bezier(.2,.85,.32,1)' },
  );
  anim.onfinish = () => sweep.remove();
}
