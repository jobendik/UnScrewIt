/**
 * Small dependency-free utilities: math, formatters, dom helpers.
 *
 * Anything here must be pure and reusable; place game-specific helpers
 * in their respective domain modules.
 */

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const mid = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export const radToDeg = (r: number): number => (r * 180) / Math.PI;
export const degToRad = (d: number): number => (d * Math.PI) / 180;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Format seconds as MM:SS. */
export const fmtTime = (s: number): string => {
  const safe = Math.max(0, Math.floor(s));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

/** Type-safe `getElementById` that throws if the element is missing. */
export function requireEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element: #${id}`);
  return el as T;
}

/** Force a reflow on `el` so that an animation class can be re-applied. */
export const reflow = (el: HTMLElement | SVGElement): void => {
  void (el as HTMLElement).offsetWidth;
};
