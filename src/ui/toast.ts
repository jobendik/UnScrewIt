/**
 * Toast notifications.
 *
 * Two channels:
 * - `showToast(message)` — simple transient message; replaces any current toast.
 * - `enqueueAchievementToast({icon, title, subtitle})` — rich card that pops
 *   from the top of the screen, queued so multiple unlocks don't overlap.
 */

import { requireEl, reflow } from '@/core/utils';

let cachedSimple: HTMLElement | null = null;

function simpleEl(): HTMLElement {
  if (cachedSimple) return cachedSimple;
  cachedSimple = requireEl<HTMLElement>('toast');
  return cachedSimple;
}

export function showToast(message: string): void {
  const t = simpleEl();
  t.textContent = message;
  t.classList.remove('show');
  reflow(t);
  t.classList.add('show');
}

// ── Achievement / quest toast queue ─────────────────────────────────────

interface RichToast {
  icon: string;
  title: string;
  subtitle: string;
}

let queue: RichToast[] = [];
let rendering = false;

export function enqueueAchievementToast(toast: RichToast): void {
  queue.push(toast);
  drain();
}

function drain(): void {
  if (rendering) return;
  const next = queue.shift();
  if (!next) return;
  rendering = true;
  const el = document.createElement('div');
  el.className = 'achievement-toast';
  el.innerHTML = `
    <div class="achievement-toast__icon">${next.icon}</div>
    <div class="achievement-toast__body">
      <div class="achievement-toast__title">${next.title}</div>
      <div class="achievement-toast__sub">${next.subtitle}</div>
    </div>
  `;
  document.body.appendChild(el);
  // Force animation
  requestAnimationFrame(() => el.classList.add('achievement-toast--in'));
  window.setTimeout(() => {
    el.classList.remove('achievement-toast--in');
    el.classList.add('achievement-toast--out');
    window.setTimeout(() => {
      el.remove();
      rendering = false;
      drain();
    }, 350);
  }, 2400);
}
