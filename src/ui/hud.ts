/**
 * HUD updates. Each function targets one or more cached DOM nodes and
 * writes the latest values from the supplied state.
 */

import { fmtTime, requireEl } from '@/core/utils';
import type { GameState } from '@/game/state';

interface HudRefs {
  time: HTMLElement;
  moves: HTMLElement;
  level: HTMLElement;
  undoCount: HTMLElement;
  hintCount: HTMLElement;
  progress: HTMLElement;
  undoBtn: HTMLButtonElement;
  hintBtn: HTMLButtonElement;
}

let cached: HudRefs | null = null;

function refs(): HudRefs {
  if (cached) return cached;
  cached = {
    time:       requireEl('timeText'),
    moves:      requireEl('movesText'),
    level:      requireEl('levelText'),
    undoCount:  requireEl('undoCount'),
    hintCount:  requireEl('hintCount'),
    progress:   requireEl('progressText'),
    undoBtn:    requireEl<HTMLButtonElement>('undoBtn'),
    hintBtn:    requireEl<HTMLButtonElement>('hintBtn'),
  };
  return cached;
}

export function updateHud(state: GameState): void {
  const r = refs();
  r.time.textContent = fmtTime(Math.max(0, state.timeLeft));
  r.moves.textContent = String(Math.max(0, state.movesLeft));
  r.level.textContent = `Level ${state.levelIndex + 1}`;
  r.undoCount.textContent = String(state.undoDepth);
  r.hintCount.textContent = String(state.hintsLeft);
  r.progress.textContent = `${state.levelIndex + 1}/${state.totalLevels}`;
  r.undoBtn.disabled = state.undoDepth === 0 || state.animating || state.completed || state.lost;
  r.hintBtn.disabled = state.hintsLeft <= 0 || state.animating || state.completed || state.lost;
}
