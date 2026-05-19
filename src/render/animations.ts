/**
 * Animation helpers — runtime tweens that animate transient SVG elements
 * without participating in the main render loop.
 */

import {
  BOARD_RECT,
  BOARD_VIEWBOX,
  MOVE_MS,
} from '@/core/config';
import { clamp } from '@/core/utils';
import { drawScrew } from './board';
import { svg } from './svg';
import type { Hole } from '@/game/types';

/**
 * Animate a "ghost" screw arcing from `from` to `to` over `MOVE_MS`,
 * then remove the ghost and invoke `done`.
 *
 * The ghost reuses the regular `drawScrew` so it visually matches the real
 * screws being rendered on the board.
 */
export function animateScrewMove(
  effectsLayer: SVGElement,
  screwId: string,
  from: Hole,
  to: Hole,
  done: () => void,
): void {
  const ghost = drawScrew(`${screwId}-ghost`, from.x, from.y, { selected: true });
  effectsLayer.appendChild(ghost);
  const start = performance.now();
  const arc = -46 - Math.random() * 22;

  const step = (now: number) => {
    const t = clamp((now - start) / MOVE_MS, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const x = from.x + (to.x - from.x) * ease;
    const y = from.y + (to.y - from.y) * ease + Math.sin(Math.PI * ease) * arc;
    const r = 540 * ease;
    ghost.setAttribute('transform', `translate(${x},${y}) rotate(${r})`);
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
 * Spawn a quick particle burst of colored dots from the board's title row.
 * Used for level-clear celebration.
 */
export function confettiBurst(effectsLayer: SVGElement): void {
  const colors = ['#ff5252', '#ffd740', '#40c4ff', '#69f0ae', '#e040fb', '#ffab40'];
  for (let i = 0; i < 60; i++) {
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
    const speed = 80 + Math.random() * 240;
    const dx = Math.cos(ang) * speed;
    const dy = Math.sin(ang) * speed + 150;
    const anim = c.animate(
      [
        { transform: `translate(0px,0px)`, opacity: 1 },
        {
          transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 720}deg)`,
          opacity: 0,
        },
      ],
      { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.16,.72,.32,1)' },
    );
    anim.onfinish = () => c.remove();
  }
}
