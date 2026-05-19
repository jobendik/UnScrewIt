/**
 * Modal overlay surface. The overlay shares one HTML container; callers
 * supply an HTML body via `showOverlay`, and a single delegated click
 * listener dispatches `data-action` clicks to a handler.
 */

import { requireEl } from '@/core/utils';
import { Progress } from '@/core/storage';
import { LEVELS } from '@/game/levels';
import { fmtTime } from '@/core/utils';

export type OverlayAction =
  | { type: 'restart' }
  | { type: 'next' }
  | { type: 'close' }
  | { type: 'level'; index: number };

let cachedOverlay: HTMLElement | null = null;
let cachedCard: HTMLElement | null = null;
let handler: ((a: OverlayAction) => void) | null = null;

function ensureBindings(): { overlay: HTMLElement; card: HTMLElement } {
  if (!cachedOverlay) cachedOverlay = requireEl<HTMLElement>('overlay');
  if (!cachedCard) cachedCard = requireEl<HTMLElement>('overlayCard');
  if (!cachedOverlay.dataset.bound) {
    cachedOverlay.dataset.bound = '1';
    cachedOverlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest<HTMLButtonElement>('button[data-action]');
      if (!btn || !handler) return;
      const action = btn.dataset.action;
      if (action === 'restart') handler({ type: 'restart' });
      else if (action === 'next') handler({ type: 'next' });
      else if (action === 'close') handler({ type: 'close' });
      else if (action === 'level') handler({ type: 'level', index: Number(btn.dataset.level ?? 0) });
    });
  }
  return { overlay: cachedOverlay, card: cachedCard };
}

/** Show the overlay with the supplied HTML body. */
export function showOverlay(html: string): void {
  const { overlay, card } = ensureBindings();
  card.innerHTML = html;
  overlay.classList.add('show');
}

/** Hide the overlay. */
export function hideOverlay(): void {
  const { overlay } = ensureBindings();
  overlay.classList.remove('show');
}

/** Install the action handler for overlay buttons. */
export function setOverlayHandler(fn: (a: OverlayAction) => void): void {
  ensureBindings();
  handler = fn;
}

// ── Prebuilt overlay bodies ─────────────────────────────────────────────────

export function winOverlayHtml(opts: {
  levelIndex: number;
  levelName: string;
  stars: number;
  movesLeft: number;
  timeLeft: number;
  isFinal: boolean;
}): string {
  const stars = `${'★'.repeat(opts.stars)}${'☆'.repeat(3 - opts.stars)}`;
  const actions = opts.isFinal
    ? `<button class="primary-btn" data-action="restart">Replay</button>`
    : `
      <button class="secondary-btn" data-action="restart">Replay</button>
      <button class="primary-btn" data-action="next">Next Level</button>
    `;
  return `
    <h1>${opts.isFinal ? 'Game Clear!' : 'Level Clear!'}</h1>
    <div class="stars">${stars}</div>
    <p>${opts.levelName}</p>
    <p>Moves left: <b>${opts.movesLeft}</b> · Time left: <b>${fmtTime(opts.timeLeft)}</b></p>
    <div class="card-actions ${opts.isFinal ? 'single' : ''}">${actions}</div>
  `;
}

export function loseOverlayHtml(reason: string): string {
  return `
    <h1>Try Again</h1>
    <p>${reason}</p>
    <p>Plan ahead: every moved screw must go into a visible free hole.</p>
    <div class="card-actions single">
      <button class="primary-btn" data-action="restart">Restart Level</button>
    </div>
  `;
}

export function levelsOverlayHtml(): string {
  const best = Progress.bestLevel;
  const rows = LEVELS.map((lvl, i) => {
    const unlocked = i <= best || i === 0;
    const stars = Progress.starsFor(i);
    const subtitle = unlocked ? (stars ? '★'.repeat(stars) : lvl.name) : 'Locked';
    return `
      <button class="level-btn ${unlocked ? '' : 'locked'}"
              data-action="level" data-level="${i}" ${unlocked ? '' : 'disabled'}>
        <span>${i + 1}</span><span class="tool-count">${subtitle}</span>
      </button>
    `;
  }).join('');
  return `
    <h1>Levels</h1>
    <p>Clear boards to unlock the campaign.</p>
    <div class="level-select">${rows}</div>
    <div class="card-actions single">
      <button class="secondary-btn" data-action="close">Close</button>
    </div>
  `;
}
