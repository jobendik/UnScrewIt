/**
 * Board renderer — rebuilds the SVG board scene on demand.
 *
 * Performance note: the prototype rebuilds the entire SVG on every render.
 * That's adequate while levels stay small (≤ ~24 nodes). When the game
 * grows past a few dozen interactive nodes we'll switch to in-place
 * mutation of plate/screw transforms. For now we prefer the simpler model.
 */

import {
  BOARD_RECT,
  BOARD_VIEWBOX,
  FALL_MS,
  HOLE_RADIUS,
  SCREW_RADIUS,
} from '@/core/config';
import { radToDeg } from '@/core/utils';
import type { GameState } from '@/game/state';
import type { Hole, Plate } from '@/game/types';
import { buildDefs } from './defs';
import { svg, setChildren } from './svg';

const W = BOARD_VIEWBOX.w;

export interface RenderCallbacks {
  onHoleTap: (holeId: string) => void;
  onScrewTap: (screwId: string) => void;
  onBoardTap: () => void;
}

interface RenderContext {
  root: SVGSVGElement;
  state: GameState;
  callbacks: RenderCallbacks;
}

let attachedRoot: SVGSVGElement | null = null;

/**
 * Wire one-time DOM listeners on the root SVG element. Idempotent.
 */
export function bindBoard(root: SVGSVGElement, callbacks: RenderCallbacks): void {
  if (attachedRoot === root) return;
  attachedRoot = root;
  root.addEventListener('pointerdown', (e) => {
    // Only fire when the user taps the background, not a hole or screw.
    if (e.target === root) callbacks.onBoardTap();
  });
}

/**
 * Render (or re-render) the board for the supplied state. Removes all existing
 * children and rebuilds.
 */
export function renderBoard(
  root: SVGSVGElement,
  state: GameState,
  callbacks: RenderCallbacks,
): void {
  const ctx: RenderContext = { root, state, callbacks };
  setChildren(root, [
    buildDefs(),
    backgroundLayer(state),
    holesLayer(ctx),
    platesLayer(state),
    screwsLayer(ctx),
    effectsLayer(),
  ]);
}

/** Convenience accessor for the effects sub-layer (created lazily). */
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
    y: BOARD_RECT.y + 40,
    'text-anchor': 'middle',
    fill: '#80410e',
    'font-size': 20,
    'font-weight': 1000,
    opacity: '.48',
  });
  title.textContent = state.level.name;
  g.appendChild(title);
  return g;
}

function holesLayer(ctx: RenderContext): SVGGElement {
  const g = svg('g', { id: 'holes' });
  const { state } = ctx;
  const occupied = state.occupiedHoleIds();

  for (const h of state.level.holes) {
    const blocked = state.isHoleBlocked(h);
    const selected = state.selected;
    const valid = selected && state.validTargets.has(h.id);
    const invalid = selected && state.invalidTargets.has(h.id) && !occupied.has(h.id);
    const hint = state.hint?.targetId === h.id;

    const cls = [
      'svg-button',
      valid ? 'valid-target' : '',
      invalid ? 'invalid-target' : '',
      hint ? 'hint-pulse' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const group = svg('g', {
      className: cls,
      transform: `translate(${h.x},${h.y})`,
      dataset: { hole: h.id },
    });
    group.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      ctx.callbacks.onHoleTap(h.id);
    });

    group.appendChild(
      svg('circle', {
        r: HOLE_RADIUS + 6,
        fill: valid ? '#67ec75' : invalid ? '#f25b48' : '#6e3919',
        opacity: valid ? '.55' : invalid ? '.24' : '.24',
      }),
    );
    group.appendChild(
      svg('circle', {
        r: HOLE_RADIUS,
        fill: 'url(#holeGrad)',
        stroke: '#fff0b2',
        'stroke-width': 3,
        opacity: blocked && !valid ? '.28' : '1',
      }),
    );
    group.appendChild(svg('circle', { r: HOLE_RADIUS - 5, fill: '#000', opacity: '.42' }));
    group.appendChild(svg('circle', { r: HOLE_RADIUS + 14, fill: 'transparent', className: 'screw-hit' }));

    g.appendChild(group);
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
    opacity: '1',
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
      svg('animate', {
        attributeName: 'opacity',
        from: '1',
        to: '.15',
        dur: `${FALL_MS}ms`,
        fill: 'freeze',
      }),
    );
  }

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
    group.appendChild(
      svg('circle', { cx: h.x, cy: h.y, r: HOLE_RADIUS + 5, fill: '#6f3014', opacity: '.55' }),
    );
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

function screwsLayer(ctx: RenderContext): SVGGElement {
  const g = svg('g', { id: 'screws' });
  const { state } = ctx;
  for (const s of state.level.screws) {
    const h = state.holeById(s.holeId) as Hole | undefined;
    if (!h) continue;
    const isSelected = state.selected === s.id;
    const hint = state.hint?.screwId === s.id;
    const group = drawScrew(s.id, h.x, h.y, { selected: isSelected, hint });
    group.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      ctx.callbacks.onScrewTap(s.id);
    });
    g.appendChild(group);
  }
  return g;
}

interface ScrewFlags {
  selected?: boolean;
  hint?: boolean;
}

/** Render a single screw graphic. Exported for use by the move animation. */
export function drawScrew(id: string, x: number, y: number, flags: ScrewFlags = {}): SVGGElement {
  const group = svg('g', {
    transform: `translate(${x},${y})`,
    className: `svg-button screw-visible ${flags.hint ? 'hint-pulse' : ''}`,
    dataset: { screw: id },
  });
  if (flags.selected) {
    group.appendChild(
      svg('circle', { r: SCREW_RADIUS + 16, fill: '#fff36c', opacity: '.55', filter: 'url(#glow)' }),
    );
    group.appendChild(
      svg('circle', { r: SCREW_RADIUS + 8, fill: 'none', stroke: '#fff', 'stroke-width': 4, opacity: '.85' }),
    );
  }
  group.appendChild(svg('circle', { r: SCREW_RADIUS + 3, fill: '#6d6d6d' }));
  group.appendChild(svg('circle', { r: SCREW_RADIUS, fill: 'url(#screwGrad)', stroke: '#47515b', 'stroke-width': 2 }));
  group.appendChild(
    svg('circle', { r: SCREW_RADIUS - 5, fill: 'none', stroke: '#f8fbff', 'stroke-width': 2, opacity: '.42' }),
  );
  group.appendChild(
    svg('path', {
      d: `M${-SCREW_RADIUS + 7} 0 H${SCREW_RADIUS - 7} M0 ${-SCREW_RADIUS + 7} V${SCREW_RADIUS - 7}`,
      stroke: '#414b55',
      'stroke-width': 5,
      'stroke-linecap': 'round',
    }),
  );
  group.appendChild(
    svg('path', {
      d: `M${-SCREW_RADIUS + 8} -1 H${SCREW_RADIUS - 8} M1 ${-SCREW_RADIUS + 8} V${SCREW_RADIUS - 8}`,
      stroke: '#ffffff',
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
      opacity: '.52',
    }),
  );
  group.appendChild(svg('circle', { r: SCREW_RADIUS + 18, fill: 'transparent', className: 'screw-hit' }));
  return group;
}

function effectsLayer(): SVGGElement {
  return svg('g', { id: 'effects' });
}
