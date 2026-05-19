/**
 * Plate factories + geometry helpers.
 *
 * Plates are oriented rectangles that may be rotated about their centre.
 * Each plate stores its own "holes" in local (rotated) coordinates so that
 * point-in-plate tests can transform a world point into local space once.
 */

import { HOLE_RADIUS, PIN_TOLERANCE, PLATE_COLORS } from '@/core/config';
import type { PlateColorName } from '@/core/config';
import { dist, mid, degToRad } from '@/core/utils';
import type { Hole, LocalPoint, Plate, PlateColor, WorldPoint } from './types';

interface BarOptions {
  /** Override which hole ids the plate's holes resolve to (defaults to [a, b]). */
  holeIds?: string[];
  /** How far the bar extends past its anchor endpoints. */
  extend?: number;
  /** Bar thickness. */
  thickness?: number;
  /** Forced fall spin (degrees). */
  fallSpin?: number;
  /** Direction the plate falls in (-1 left, 1 right, 0 random). */
  fallSide?: number;
}

interface SlabOptions {
  fallSpin?: number;
  fallSide?: number;
}

function colorFor(name?: string, fallback: PlateColorName = 'red'): PlateColor {
  if (name && Object.prototype.hasOwnProperty.call(PLATE_COLORS, name)) {
    return PLATE_COLORS[name as PlateColorName];
  }
  return PLATE_COLORS[fallback];
}

/**
 * Build a rotated rectangular "bar" plate connecting two holes.
 * The plate's holes (in local coords) are derived from each requested hole.
 */
export function bar(
  levelHoles: Record<string, Hole>,
  id: string,
  aId: string,
  bId: string,
  color: string = 'red',
  options: BarOptions = {},
): Plate {
  const a = levelHoles[aId];
  const b = levelHoles[bId];
  if (!a || !b) throw new Error(`Missing bar holes ${aId}/${bId}`);
  const c = mid(a, b);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const plate: Plate = {
    id,
    kind: 'bar',
    x: c.x,
    y: c.y,
    w: dist(a, b) + (options.extend ?? 64),
    h: options.thickness ?? 58,
    angle,
    color: colorFor(color, 'red'),
    holes: [],
    status: 'active',
    pinnedBy: [],
    fallSpin: options.fallSpin ?? (Math.random() > 0.5 ? 18 : -18),
    fallSide: options.fallSide ?? 0,
  };
  const holeIds = options.holeIds ?? [aId, bId];
  plate.holes = holeIds.map((hid) => {
    const hole = levelHoles[hid];
    if (!hole) throw new Error(`Missing plate hole ${hid}`);
    return localFromWorld(plate, hole);
  });
  return plate;
}

/**
 * Build an axis-aligned (or rotated by `angleDeg`) rectangular slab centred
 * on the given hole id.
 */
export function slab(
  levelHoles: Record<string, Hole>,
  id: string,
  centerId: string,
  w: number,
  h: number,
  angleDeg: number,
  color: string,
  holeIds: string[],
  options: SlabOptions = {},
): Plate {
  const c = levelHoles[centerId];
  if (!c) throw new Error(`Missing slab centre ${centerId}`);
  const plate: Plate = {
    id,
    kind: 'slab',
    x: c.x,
    y: c.y,
    w,
    h,
    angle: degToRad(angleDeg),
    color: colorFor(color, 'blue'),
    holes: [],
    status: 'active',
    pinnedBy: [],
    fallSpin: options.fallSpin ?? (Math.random() > 0.5 ? 16 : -16),
    fallSide: options.fallSide ?? 0,
  };
  plate.holes = holeIds.map((hid) => {
    const hole = levelHoles[hid];
    if (!hole) throw new Error(`Missing slab hole ${hid}`);
    return localFromWorld(plate, hole);
  });
  return plate;
}

/** Convert a world point into a plate's local (rotated) coordinate frame. */
export function localFromWorld(plate: Plate, point: WorldPoint): LocalPoint {
  const a = -plate.angle;
  const dx = point.x - plate.x;
  const dy = point.y - plate.y;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/** True if `point` lies within the plate's rotated rectangle. */
export function pointInPlate(plate: Plate, point: WorldPoint): boolean {
  const p = localFromWorld(plate, point);
  return Math.abs(p.x) <= plate.w / 2 && Math.abs(p.y) <= plate.h / 2;
}

/** True if `point` is roughly over one of the plate's hole positions. */
export function pointOverPlateHole(
  plate: Plate,
  point: WorldPoint,
  tolerance: number = HOLE_RADIUS + 4,
): boolean {
  const p = localFromWorld(plate, point);
  return plate.holes.some(
    (h) => Math.hypot(h.x - p.x, h.y - p.y) <= tolerance,
  );
}

/** Stricter check used for pin detection (smaller tolerance). */
export function pointNearPlatePinHole(plate: Plate, point: WorldPoint): boolean {
  const p = localFromWorld(plate, point);
  return plate.holes.some((h) => Math.hypot(h.x - p.x, h.y - p.y) <= PIN_TOLERANCE);
}
