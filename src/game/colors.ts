/**
 * Bucket / screw colour palette.
 *
 * Each `ScrewColor` has a stable id plus visual data for rendering. The list
 * is intentionally small (six colours) so the bucket bar stays scannable.
 */

export interface ColorDef {
  id: string;
  /** Main body fill (used on screw + bucket slot). */
  fill: string;
  /** Darker rim for contrast. */
  rim: string;
  /** Specular highlight. */
  shine: string;
}

export const SCREW_COLORS = [
  { id: 'red',    fill: '#f25245', rim: '#9c1d18', shine: '#ffb1a5' },
  { id: 'yellow', fill: '#ffc43d', rim: '#a86808', shine: '#fff0b1' },
  { id: 'blue',   fill: '#35a9f3', rim: '#0f6daf', shine: '#a8def8' },
  { id: 'green',  fill: '#5acb47', rim: '#1f7a14', shine: '#c2efb6' },
  { id: 'purple', fill: '#9057f6', rim: '#46198d', shine: '#d3bbff' },
  { id: 'orange', fill: '#f68b28', rim: '#a04602', shine: '#ffc78a' },
] as const satisfies readonly ColorDef[];

export type ScrewColorId = (typeof SCREW_COLORS)[number]['id'];

const BY_ID = new Map<string, ColorDef>(SCREW_COLORS.map((c) => [c.id, c]));

export function colorDef(id: string): ColorDef {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown screw color: ${id}`);
  return found;
}

/** All color ids in stable order. */
export const ALL_COLOR_IDS: readonly ScrewColorId[] = SCREW_COLORS.map((c) => c.id);
