/**
 * SVG `<defs>` block: gradients, filters, patterns shared across the board.
 */

import { svg } from './svg';

/**
 * Build the defs block. Returns a `<defs>` element; the inner contents are
 * supplied as a raw markup string for compactness (this block has no
 * dynamic per-frame data).
 */
export function buildDefs(): SVGDefsElement {
  const defs = svg('defs');
  defs.innerHTML = `
    <linearGradient id="skySoft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="#bfe8ff"/>
      <stop offset=".48" stop-color="#f8e7b9"/>
      <stop offset="1"   stop-color="#f1bd7c"/>
    </linearGradient>
    <linearGradient id="boardGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="#ffd778"/>
      <stop offset=".55" stop-color="#e9aa4f"/>
      <stop offset="1"   stop-color="#d8913d"/>
    </linearGradient>
    <pattern id="wood" width="118" height="118" patternUnits="userSpaceOnUse">
      <rect width="118" height="118" fill="url(#boardGrad)"/>
      <path d="M3 18 C35 0 76 40 118 17 M-8 52 C33 74 66 25 124 56 M-4 89 C38 68 68 117 122 87"
            fill="none" stroke="#9e5d23" stroke-width="3" opacity=".22"/>
      <path d="M25 0 C35 48 28 84 20 118 M72 0 C82 40 78 72 70 118"
            fill="none" stroke="#fff4bd" stroke-width="2" opacity=".18"/>
    </pattern>
    <radialGradient id="holeGrad" cx="45%" cy="37%" r="65%">
      <stop offset="0"   stop-color="#202020"/>
      <stop offset=".55" stop-color="#0a0a0a"/>
      <stop offset="1"   stop-color="#5a321c"/>
    </radialGradient>
    <radialGradient id="screwGrad" cx="35%" cy="25%" r="72%">
      <stop offset="0"   stop-color="#ffffff"/>
      <stop offset=".25" stop-color="#e8edf1"/>
      <stop offset=".62" stop-color="#9da8b2"/>
      <stop offset="1"   stop-color="#57616d"/>
    </radialGradient>
    <radialGradient id="goldGrad" cx="35%" cy="25%" r="72%">
      <stop offset="0"   stop-color="#fff9c5"/>
      <stop offset=".35" stop-color="#ffd54b"/>
      <stop offset="1"   stop-color="#a86612"/>
    </radialGradient>
    <filter id="plateShadow" x="-35%" y="-35%" width="170%" height="170%">
      <feDropShadow dx="0" dy="8" stdDeviation="5" flood-color="#4f2307" flood-opacity=".32"/>
    </filter>
    <filter id="screwShadow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#2b1609" flood-opacity=".42"/>
    </filter>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  `;
  return defs;
}
