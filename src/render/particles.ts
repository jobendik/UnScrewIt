/**
 * Particle effects spawned on top of the board SVG.
 *
 * Particles are cheap — small `<circle>` nodes animated via the WAAPI,
 * self-removing on finish. Each effect is one-shot; callers don't need
 * to track or cleanup individual particles.
 */

import { svg } from './svg';

export interface ParticleOptions {
  /** Override default count. */
  count?: number;
  /** Override default lifetime in ms. */
  duration?: number;
  /** Override default radius (px). */
  radius?: number;
  /** Override default speed (px/s). */
  speed?: number;
}

/**
 * Small spark burst at (x, y). Used when a screw is tapped or lands in
 * the bucket.
 */
export function sparkBurst(
  layer: SVGElement,
  x: number,
  y: number,
  color: string,
  opts: ParticleOptions = {},
): void {
  const count = opts.count ?? 10;
  const duration = opts.duration ?? 600;
  const radius = opts.radius ?? 3.5;
  const speed = opts.speed ?? 140;
  for (let i = 0; i < count; i++) {
    const dot = svg('circle', {
      cx: x,
      cy: y,
      r: radius + Math.random() * 2,
      fill: color,
      opacity: '.95',
    });
    layer.appendChild(dot);
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const dist = speed * (0.4 + Math.random() * 0.8) * (duration / 1000);
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 18;
    const anim = dot.animate(
      [
        { transform: 'translate(0px,0px) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0 },
      ],
      { duration: duration + Math.random() * 120, easing: 'cubic-bezier(.18,.7,.32,1)' },
    );
    anim.onfinish = () => dot.remove();
  }
}

/**
 * Big star burst from (x, y). Used when a bucket slot clears.
 */
export function celebrationBurst(layer: SVGElement, x: number, y: number, color: string): void {
  for (let i = 0; i < 24; i++) {
    const dot = svg('circle', {
      cx: x,
      cy: y,
      r: 5 + Math.random() * 3,
      fill: i % 3 === 0 ? '#fff5b0' : color,
      opacity: '.95',
    });
    layer.appendChild(dot);
    const ang = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 220;
    const dx = Math.cos(ang) * speed * 0.8;
    const dy = Math.sin(ang) * speed * 0.8 - 60;
    const anim = dot.animate(
      [
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) rotate(${360 + Math.random() * 360}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.18,.7,.32,1)' },
    );
    anim.onfinish = () => dot.remove();
  }
}

/**
 * Floating "+N" text that drifts upward and fades. Used for coin gains
 * and combo callouts.
 */
export function floatingText(
  layer: SVGElement,
  x: number,
  y: number,
  text: string,
  color = '#fff7c4',
): void {
  const t = svg('text', {
    x,
    y,
    'text-anchor': 'middle',
    fill: color,
    'font-size': 28,
    'font-weight': 800,
    'paint-order': 'stroke',
    stroke: '#4a2407',
    'stroke-width': 3,
    'stroke-linejoin': 'round',
  });
  t.textContent = text;
  layer.appendChild(t);
  const anim = t.animate(
    [
      { transform: 'translateY(0px)', opacity: 0 },
      { transform: 'translateY(-12px)', opacity: 1, offset: 0.2 },
      { transform: 'translateY(-58px)', opacity: 0 },
    ],
    { duration: 900, easing: 'cubic-bezier(.2,.85,.32,1)' },
  );
  anim.onfinish = () => t.remove();
}

/**
 * Small dust puff at (x, y). Used when a plate falls.
 */
export function dustPuff(layer: SVGElement, x: number, y: number): void {
  for (let i = 0; i < 8; i++) {
    const dot = svg('circle', {
      cx: x + (Math.random() - 0.5) * 60,
      cy: y,
      r: 6 + Math.random() * 6,
      fill: '#caa477',
      opacity: '.6',
    });
    layer.appendChild(dot);
    const dy = -30 - Math.random() * 30;
    const dx = (Math.random() - 0.5) * 50;
    const anim = dot.animate(
      [
        { transform: 'translate(0,0) scale(.6)', opacity: 0.7 },
        { transform: `translate(${dx}px,${dy}px) scale(1.4)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 300, easing: 'ease-out' },
    );
    anim.onfinish = () => dot.remove();
  }
}
