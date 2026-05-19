/**
 * Tiny SVG element helpers. Keeps the renderer free of `createElementNS`
 * boilerplate and provides a typed `attrs` map.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Attribute bag accepted by `svg()`. Keys map to SVG attributes verbatim
 * except for two special keys:
 * - `className` → set as the `class` attribute.
 * - `dataset` → expanded into individual `data-*` attributes.
 *
 * Values of `null` or `undefined` are skipped, which lets callers conditionally
 * pass attributes without ternaries.
 */
export type SvgAttrs = {
  className?: string;
  dataset?: Record<string, string>;
} & {
  [key: string]: string | number | undefined | null | Record<string, string>;
};

/**
 * Create a namespaced SVG element with the supplied attributes and children.
 */
export function svg<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: SvgAttrs = {},
  children: ReadonlyArray<Element | null | undefined> = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === 'className') {
      node.setAttribute('class', String(value));
    } else if (key === 'dataset' && typeof value === 'object') {
      for (const [dk, dv] of Object.entries(value as Record<string, string>)) {
        (node as unknown as HTMLElement).dataset[dk] = dv;
      }
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child) node.appendChild(child);
  }
  return node;
}

/** Replace the inner contents of `parent` with `children`. */
export function setChildren(parent: SVGElement, children: ReadonlyArray<Element>): void {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  for (const c of children) parent.appendChild(c);
}
