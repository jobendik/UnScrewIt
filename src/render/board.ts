/**
 * Board renderer for the bucket-color mechanic.
 *
 * Renders coloured screws (standard / frozen / chained / locked / key),
 * the bucket bar, and overlays. Performance: full SVG rebuild per state
 * change — adequate for our level sizes.
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
import { pointOverPlateHole } from '@/game/plates';
import { themeForChapter } from '@/themes';
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
}

export function renderBoard(root: SVGSVGElement, state: GameState, callbacks: RenderCallbacks): void {
  setChildren(root, [
    buildDefs(),
    backgroundLayer(state),
    chainsLayer(state),
    platesAndScrewsLayer(state, callbacks),
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
  const theme = themeForChapter(state.chapter);
  const g = svg('g');
  g.appendChild(svg('rect', { x: 0, y: 0, width: W, height: BOARD_VIEWBOX.h, fill: 'url(#skySoft)' }));
  g.appendChild(
    svg('rect', {
      x: BOARD_RECT.x - 8,
      y: BOARD_RECT.y - 8,
      width: BOARD_RECT.w + 16,
      height: BOARD_RECT.h + 16,
      rx: BOARD_RECT.r + 10,
      fill: theme.palette.board.rim,
      opacity: '.5',
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
      stroke: theme.palette.board.rim,
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
      stroke: '#ffffff',
      'stroke-width': 2,
      opacity: '.32',
    }),
  );

  const title = svg('text', {
    x: W / 2,
    y: BOARD_RECT.y + 36,
    'text-anchor': 'middle',
    fill: '#ffffff',
    'font-size': 20,
    'font-weight': 800,
    opacity: '.7',
    'paint-order': 'stroke',
    stroke: theme.palette.board.rim,
    'stroke-width': 4,
    'stroke-linejoin': 'round',
  });
  title.textContent = `${state.chapter}-${state.levelIdx} · ${state.level.name}`;
  g.appendChild(title);

  if (state.combo >= 2) {
    const cg = svg('g', {
      transform: `translate(${BOARD_RECT.x + BOARD_RECT.w - 70},${BOARD_RECT.y + 36})`,
    });
    cg.appendChild(
      svg('rect', {
        x: -52, y: -22, width: 104, height: 38, rx: 18,
        fill: '#fff5b0', stroke: '#a45c11', 'stroke-width': 3,
      }),
    );
    const ct = svg('text', {
      x: 0, y: 6, 'text-anchor': 'middle', fill: '#7a3b08',
      'font-size': 18, 'font-weight': 800,
    });
    ct.textContent = `Combo ×${state.combo}`;
    cg.appendChild(ct);
    g.appendChild(cg);
  }

  return g;
}

/**
 * Render plates and screws interleaved by Z-order so plates drawn above
 * visually cover the screws of plates below. The host plate of a screw is
 * the LAST plate (highest Z) whose designated holes include the screw's
 * position; the screw is drawn immediately after that plate, so any plate
 * later in the array renders on top of it. This is what makes the engine's
 * "Plate above is blocking it" message match what the player actually sees.
 */
function platesAndScrewsLayer(state: GameState, callbacks: RenderCallbacks): SVGGElement {
  const g = svg('g', { id: 'plates' });
  const plates = state.livePlates();

  // Map each screw to the index of its latest host plate (which becomes its
  // visual "anchor"). A screw whose host has already fallen/removed reverts
  // to being drawn on top of everything.
  const latestHost = new Map<string, number>();
  for (const s of state.level.screws) {
    const h = state.holeById(s.holeId);
    if (!h) continue;
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      if (!p || p.status !== 'active') continue;
      if (pointOverPlateHole(p, h)) latestHost.set(s.id, i);
    }
  }

  const drawScrewAt = (s: Screw): SVGGElement | null => {
    const h = state.holeById(s.holeId);
    if (!h) return null;
    const blocker = state.removeBlocker(s);
    // 'animating' and 'finished' are transient harness states — we still draw
    // the screw at full opacity so the player can see what they were about to
    // tap. Every other blocker (plate-covers, bucket-full, locked-needs-key,
    // frozen-needs-thaw) is a real "can't tap right now" signal and should be
    // dimmed. Previously bucket-full was treated as visually available, which
    // mismatched the actual tap rejection.
    const flags: ScrewVisualFlags = {
      available: blocker === null || blocker === 'animating' || blocker === 'finished',
      hint: state.highlightedScrews.has(s.id),
    };
    const group = drawScrew(s, h.x, h.y, flags);
    group.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      callbacks.onScrewTap(s.id);
    });
    return group;
  };

  for (let i = 0; i < plates.length; i++) {
    const p = plates[i];
    if (!p) continue;
    g.appendChild(drawPlate(p));
    for (const s of state.level.screws) {
      if (latestHost.get(s.id) !== i) continue;
      const node = drawScrewAt(s);
      if (node) g.appendChild(node);
    }
  }
  // Orphan screws (no active host plate hosts them) draw last, on top of
  // everything — they are by definition unblocked and tappable.
  for (const s of state.level.screws) {
    if (latestHost.has(s.id)) continue;
    const node = drawScrewAt(s);
    if (node) g.appendChild(node);
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
        attributeName: 'transform', type: 'translate', additive: 'sum',
        from: '0 0', to: `${p.fallX ?? 0} ${p.fallY ?? 620}`,
        dur: `${FALL_MS}ms`, fill: 'freeze',
        calcMode: 'spline', keySplines: '.12 .78 .28 1',
      }),
    );
    group.appendChild(
      svg('animateTransform', {
        attributeName: 'transform', type: 'rotate', additive: 'sum',
        from: '0', to: `${p.fallSpin ?? 20}`,
        dur: `${FALL_MS}ms`, fill: 'freeze',
        calcMode: 'spline', keySplines: '.12 .78 .28 1',
      }),
    );
    group.appendChild(
      svg('animate', { attributeName: 'opacity', from: '1', to: '.15', dur: `${FALL_MS}ms`, fill: 'freeze' }),
    );
  }

  group.appendChild(svg('rect', { x: -p.w / 2, y: -p.h / 2, width: p.w, height: p.h, rx: 19, fill: p.color.edge }));
  group.appendChild(svg('rect', { x: -p.w / 2 + 4, y: -p.h / 2 + 4, width: p.w - 8, height: p.h - 8, rx: 15, fill: p.color.fill }));
  group.appendChild(svg('path', {
    d: `M${-p.w / 2 + 18},${-p.h / 2 + 10} H${p.w / 2 - 18}`,
    stroke: p.color.top, 'stroke-width': 6, 'stroke-linecap': 'round', opacity: '.62',
  }));
  group.appendChild(svg('path', {
    d: `M${-p.w / 2 + 18},${p.h / 2 - 11} H${p.w / 2 - 18}`,
    stroke: '#57200b', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: '.18',
  }));

  for (const h of p.holes) {
    group.appendChild(svg('circle', { cx: h.x, cy: h.y, r: HOLE_RADIUS + 5, fill: '#6f3014', opacity: '.55' }));
    group.appendChild(svg('circle', { cx: h.x, cy: h.y, r: HOLE_RADIUS, fill: 'url(#holeGrad)', stroke: '#fff0b2', 'stroke-width': 3 }));
    group.appendChild(svg('circle', { cx: h.x - 4, cy: h.y - 5, r: 4, fill: '#fff', opacity: '.24' }));
  }

  return group;
}

/** Visualise chain links between chained screws. */
function chainsLayer(state: GameState): SVGGElement {
  const g = svg('g', { id: 'chains' });
  const chains = new Map<string, Screw[]>();
  for (const s of state.level.screws) {
    if (s.type !== 'chained' || !s.chainId) continue;
    const arr = chains.get(s.chainId) ?? [];
    arr.push(s);
    chains.set(s.chainId, arr);
  }
  for (const members of chains.values()) {
    if (members.length < 2) continue;
    for (let i = 0; i < members.length - 1; i++) {
      const a = members[i];
      const b = members[i + 1];
      if (!a || !b) continue;
      const ha = state.holeById(a.holeId);
      const hb = state.holeById(b.holeId);
      if (!ha || !hb) continue;
      g.appendChild(svg('line', {
        x1: ha.x, y1: ha.y, x2: hb.x, y2: hb.y,
        stroke: '#ffd54b', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: '.55',
      }));
      g.appendChild(svg('line', {
        x1: ha.x, y1: ha.y, x2: hb.x, y2: hb.y,
        stroke: '#7a4308', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '8 6', opacity: '.85',
      }));
    }
  }
  return g;
}

export interface ScrewVisualFlags {
  available?: boolean;
  hint?: boolean;
}

export function drawScrew(screw: Screw, x: number, y: number, flags: ScrewVisualFlags = {}): SVGGElement {
  const c = colorDef(screw.color);
  const group = svg('g', {
    transform: `translate(${x},${y})`,
    className: `svg-button screw-visible ${flags.available ? 'screw-tappable' : 'screw-dim'} ${flags.hint ? 'hint-pulse' : ''}`,
    dataset: { screw: screw.id, color: screw.color, type: screw.type },
  });

  // Hint glow
  if (flags.hint) {
    group.appendChild(
      svg('circle', { r: SCREW_RADIUS + 16, fill: '#fff36c', opacity: '.55', filter: 'url(#glow)' }),
    );
    group.appendChild(
      svg('circle', { r: SCREW_RADIUS + 8, fill: 'none', stroke: '#fff', 'stroke-width': 4, opacity: '.85' }),
    );
  }

  // Base screw graphic
  group.appendChild(svg('circle', { r: SCREW_RADIUS + 3, fill: c.rim }));
  group.appendChild(svg('circle', { r: SCREW_RADIUS, fill: c.fill, stroke: c.rim, 'stroke-width': 1.5 }));
  group.appendChild(svg('circle', { r: SCREW_RADIUS - 5, fill: 'none', stroke: c.shine, 'stroke-width': 2, opacity: '.65' }));
  group.appendChild(svg('path', {
    d: `M${-SCREW_RADIUS + 7} 0 H${SCREW_RADIUS - 7} M0 ${-SCREW_RADIUS + 7} V${SCREW_RADIUS - 7}`,
    stroke: c.rim, 'stroke-width': 4.5, 'stroke-linecap': 'round', opacity: '.85',
  }));
  group.appendChild(svg('circle', { cx: -5, cy: -5, r: 4, fill: '#fff', opacity: '.55' }));

  // Type-specific overlays
  if (screw.type === 'frozen' && (screw.frozenHits ?? 0) > 0) {
    drawFrozenOverlay(group, screw.frozenHits ?? 2);
  }
  if (screw.type === 'key') {
    drawKeyOverlay(group);
  }
  if (screw.type === 'locked') {
    drawLockOverlay(group);
  }
  if (screw.type === 'chained') {
    drawChainBadge(group);
  }

  // Hit target
  group.appendChild(svg('circle', { r: SCREW_RADIUS + 18, fill: 'transparent', className: 'screw-hit' }));
  return group;
}

function drawFrozenOverlay(group: SVGGElement, hits: number): void {
  // Solid ice (hits=2) covers most of the screw; cracked (hits=1) shows
  // a crack pattern but stays mostly transparent.
  if (hits >= 2) {
    group.appendChild(svg('circle', { r: SCREW_RADIUS + 4, fill: '#bfeeff', opacity: '.78', stroke: '#5db4d8', 'stroke-width': 2 }));
    group.appendChild(svg('path', {
      d: 'M -10 -6 L -2 6 L 6 -4 L 10 4',
      stroke: '#fff', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round', opacity: '.85',
    }));
  } else {
    group.appendChild(svg('circle', { r: SCREW_RADIUS + 4, fill: '#dff7ff', opacity: '.4', stroke: '#5db4d8', 'stroke-width': 1.5 }));
    group.appendChild(svg('path', {
      d: 'M -12 -8 L -4 0 L 2 -6 L 8 4 M -6 8 L 4 6',
      stroke: '#5da6c0', 'stroke-width': 1.5, fill: 'none', 'stroke-linecap': 'round', opacity: '.9',
    }));
  }
}

function drawKeyOverlay(group: SVGGElement): void {
  group.appendChild(svg('circle', { r: SCREW_RADIUS + 6, fill: 'none', stroke: '#ffd54b', 'stroke-width': 3, opacity: '.85' }));
  const k = svg('text', {
    x: 0, y: 5, 'text-anchor': 'middle', fill: '#fff',
    'font-size': 18, 'font-weight': 900,
    'paint-order': 'stroke', stroke: '#7a4308', 'stroke-width': 2,
  });
  k.textContent = '🔑';
  group.appendChild(k);
}

function drawLockOverlay(group: SVGGElement): void {
  group.appendChild(svg('circle', { r: SCREW_RADIUS + 5, fill: 'rgba(40, 40, 50, .55)' }));
  const k = svg('text', {
    x: 0, y: 6, 'text-anchor': 'middle', fill: '#fff',
    'font-size': 18, 'font-weight': 900,
  });
  k.textContent = '🔒';
  group.appendChild(k);
}

function drawChainBadge(group: SVGGElement): void {
  // Small ring of "links" around the screw rim
  group.appendChild(svg('circle', { r: SCREW_RADIUS + 4, fill: 'none', stroke: '#a06208', 'stroke-width': 3, 'stroke-dasharray': '4 4', opacity: '.65' }));
}

function effectsLayer(): SVGGElement {
  return svg('g', { id: 'effects' });
}
