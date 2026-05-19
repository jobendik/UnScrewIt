/**
 * Transient toast notification. A single global toast element is reused;
 * showing a new message restarts the entry animation.
 */

import { requireEl, reflow } from '@/core/utils';

let cached: HTMLElement | null = null;

function el(): HTMLElement {
  if (cached) return cached;
  cached = requireEl<HTMLElement>('toast');
  return cached;
}

export function showToast(message: string): void {
  const t = el();
  t.textContent = message;
  t.classList.remove('show');
  reflow(t);
  t.classList.add('show');
}
