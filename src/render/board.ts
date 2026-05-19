/**
 * Board renderer for the bucket-color mechanic.
 *
 * Differences from the old sliding-screws renderer:
 * - Screws are tinted by their colour (not all gray).
 * - The bucket bar lives at the bottom of the SVG, inside the same viewBox.
 * - Taps go straight to `onScrewTap` — there's no selection / target step.
 */

import {
  BOARD_RECT,
  BOARD_VIEWBOX,
  FALL_MS,
  HOLE_RADIUS,
  SCREW_RADIUS,
} from '@/core/config';
import { colorDef } from '@/game/colors';
import { radToDeg } from '@/core/utils';
import type { GameState } from '@/game/state';
import type { Plate, Screw } from '@/game/types';
import { buildDefs } from './defs';
import { drawBucket } from './bucket';
import { svg, setChildren } from './svg';

const W = BOARD_VIEWBOX.w;

export interface RenderCallbacks {
  onScrewTap: (screwId: string) => void;
}

let attachedRoot: SVGSVGElement | null = null;

export function bindBoard(root: SVGSVGElement): void {
  if (attachedRoot === root) return;
  attachedRoot = root;
  // Background taps are no-ops in bucket mechanic — leaving the listener
  // unwired prevents accidental side-effects.
}

export function renderBoard(root: SVGSVGElement, state: GameState, callbacks: RenderCallbacks): void {
  setChildren(root, [
    buildDefs(),
    backgroundLayer(state),
    platesLayer(state),
    screwsLayer(state, callbacks),
    drawBucket(state.bucketSlots),
    effectsLayer(),
  ]);
}

export function ensureEffectsLayer(root: SVGSVGElement): SVGGElement {
  const existing = root.querySelector<SVGGElement>('#effects');
  if (existing) return existing;
  const fresh = svg('g', { id: 'effects' });
  root.appendChild(fresh);
  return fresh;
}

// ── Layers ──────────────────────────────────────────────────────────────────

function backgroundLayer(state: GameState): SVGGElement {
  const g = svg('g');
  g.appendChild(svg('rect', { x: 0, y: 0, width: W, height: BOARD_VIEWBOX.h, fill: 'url(#skySoft)' }));
  g.appendChild(
    svg('rect', {
      x: BOARD_RECT.x - 8,
      y: BOARD_RECT.y - 8,
      width: BOARD_RECT.w + 16,
      height: BOARD_RECT.h + 16,
      rx: BOARD_RECT.r + 10,
      fill: '#94521f',
      opacity: '.35',
    }),
  );
  g.appendChild(
    svg('rect', {
      x: BOARD_RECT.x,
      y: BOARD_RECT.y,
      width: BOARD_RECT.w,
      height: BOARD_RECT.h,
      rx: BOARD_RECT.r,
      fill: 'url(#wood)',
      stroke: '#8b4a1a',
      'stroke-width': 6,
    }),
  );
  g.appendChild(
    svg('rect', {
      x: BOARD_RECT.x + 16,
      y: BOARD_RECT.y + 14,
      width: BOARD_RECT.w - 32,
      height: BOARD_RECT.h - 28,
      rx: BOARD_RECT.r - 7,
      fill: 'none',
      stroke: '#fff1af',
      'stroke-width': 2,
      opacity: '.32',
    }),
  );

  const title = svg('text', {
    x: W / 2,
    y: BOARD_RECT.y + 36,
    'text-anchor': 'middle',
    fill: '#80410e',
    'font-size': 20,
    'font-weight': 800,
    opacity: '.5',
  });
  title.textContent = `${state.chapter}-${state.levelIdx} · ${state.level.name}`;
  g.appendChild(title);

  // Combo callout (top-right of board)
  if (state.combo >= 2) {
    const cg = svg('g', {
      transform: `translate(${BOARD_RECT.x + BOARD_RECT.w - 70},${BOARD_RECT.y + 36})`,
    });
    cg.appendChild(
      svg('rect', {
        x: -52,
        y: -22,
        width: 104,
        height: 38,
        rx: 18,
        fill: '#fff5b0',
        stroke: '#a45c11',
        'stroke-width': 3,
      }),
    );
    const ct = svg('text', {
      x: 0,
      y: 6,
      'text-anchor': 'middle',
      fill: '#7a3b08',
      'font-size': 18,
      'font-weight': 800,
    });
    ct.textContent = `Combo ×${state.combo}`;
    cg.appendChild(ct);
    g.appendChild(cg);
  }

  return g;
}

function platesLayer(state: GameState): SVGGElement {
  const g = svg('g', { id: 'plates' });
  for (const p of state.livePlates()) {
    g.appendChild(drawPlate(p));
  }
  return g;
}

function drawPlate(p: Plate): SVGGElement {
  const falling = p.status === 'falling';
  const transform = `translate(${p.x},${p.y}) rotate(${radToDeg(p.angle)})`;
  const group = svg('g', {
    className: `plate ${falling ? 'falling-plate' : ''}`,
    transform,
  });

  if (falling) {
    group.appendChild(
      svg('animateTransform', {
        attributeName: 'transform',
        type: 'translate',
        additive: 'sum',
        from: '0 0',
        to: `${p.fallX ?? 0} ${p.fallY ?? 620}`,
        dur: `${FALL_MS}ms`,
        fill: 'freeze',
        calcMode: 'spline',
        keySplines: '.12 .78 .28 1',
      }),
    );
    group.appendChild(
      svg('animateTransform', {
        attributeName: 'transform',
        type: 'rotate',
        additive: 'sum',
        from: '0',
        to: `${p.fallSpin ?? 20}`,
        dur: `${FALL_MS}ms`,
        fill: 'freeze',
        calcMode: 'spline',
        keySplines: '.12 .78 .28 1',
      }),
    );
    group.appendChild(
      svg('animate', { attributeName: 'opacity', from: '1', to: '.15', dur: `${FALL_MS}ms`, fill: 'freeze' }),
    );
  }

  // Plate body
  group.appendChild(
    svg('rect', {
      x: -p.w / 2,
      y: -p.h / 2,
      width: p.w,
      height: p.h,
      rx: 19,
      fill: p.color.edge,
    }),
  );
  group.appendChild(
    svg('rect', {
      x: -p.w / 2 + 4,
      y: -p.h / 2 + 4,
      width: p.w - 8,
      height: p.h - 8,
      rx: 15,
      fill: p.color.fill,
    }),
  );
  group.appendChild(
    svg('path', {
      d: `M${-p.w / 2 + 18},${-p.h / 2 + 10} H${p.w / 2 - 18}`,
      stroke: p.color.top,
      'stroke-width': 6,
      'stroke-linecap': 'round',
      opacity: '.62',
    }),
  );
  group.appendChild(
    svg('path', {
      d: `M${-p.w / 2 + 18},${p.h / 2 - 11} H${p.w / 2 - 18}`,
      stroke: '#57200b',
      'stroke-width': 3,
      'stroke-linecap': 'round',
      opacity: '.18',
    }),
  );

  for (const h of p.holes) {
    group.appendChild(svg('circle', { cx: h.x, cy: h.y, r: HOLE_RADIUS + 5, fill: '#6f3014', opacity: '.55' }));
    group.appendChild(
      svg('circle', {
        cx: h.x,
        cy: h.y,
        r: HOLE_RADIUS,
        fill: 'url(#holeGrad)',
        stroke: '#fff0b2',
        'stroke-width': 3,
      }),
    );
    group.appendChild(svg('circle', { cx: h.x - 4, cy: h.y - 5, r: 4, fill: '#fff', opacity: '.24' }));
  }

  return group;
}

function screwsLayer(state: GameState, callbacks: RenderCallbacks): SVGGElement {
  const g = svg('g', { id: 'screws' });
  for (const s of state.level.screws) {
    const h = state.holeById(s.holeId);
    if (!h) continue;
    const blocker = state.removeBlocker(s);
    const group = drawScrew(s, h.x, h.y, { available: blocker === null });
    group.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      callbacks.onScrewTap(s.id);
    });
    g.appendChild(group);
  }
  return g;
}

interface ScrewVisualFlags {
  available?: boolean;
}

export function drawScrew(screw: Screw, x: number, y: number, flags: ScrewVisualFlags = {}): SVGGElement {
  const c = colorDef(screw.color);
  const group = svg('g', {
    transform: `translate(${x},${y})`,
    className: `svg-button screw-visible ${flags.available ? 'screw-tappable' : 'screw-dim'}`,
    dataset: { screw: screw.id, color: screw.color },
  });
  // Rim
  group.appendChild(svg('circle', { r: SCREW_RADIUS + 3, fill: c.rim }));
  // Body
  group.appendChild(svg('circle', { r: SCREW_RADIUS, fill: c.fill, stroke: c.rim, 'stroke-width': 1.5 }));
  // Highlight ring
  group.appendChild(svg('circle', { r: SCREW_RADIUS - 5, fill: 'none', stroke: c.shine, 'stroke-width': 2, opacity: '.65' }));
  // Cross slot
  group.appendChild(
    svg('path', {
      d: `M${-SCREW_RADIUS + 7} 0 H${SCREW_RADIUS - 7} M0 ${-SCREW_RADIUS + 7} V${SCREW_RADIUS - 7}`,
      stroke: c.rim,
      'stroke-width': 4.5,
      'stroke-linecap': 'round',
      opacity: '.85',
    }),
  );
  // Specular dot
  group.appendChild(svg('circle', { cx: -5, cy: -5, r: 4, fill: '#fff', opacity: '.55' }));
  // Hit target
  group.appendChild(svg('circle', { r: SCREW_RADIUS + 18, fill: 'transparent', className: 'screw-hit' }));
  return group;
}

function effectsLayer(): SVGGElement {
  return svg('g', { id: 'effects' });
}
