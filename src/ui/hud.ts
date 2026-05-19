/**
 * HUD updates. Each function targets one or more cached DOM nodes and
 * writes the latest values from the supplied state.
 *
 * The coin counter "rolls" up to the latest value rather than snapping —
 * the visible tick is one of the easier and highest-impact pieces of
 * juice on the loop.
 */

import { fmtTime, requireEl } from '@/core/utils';
import { loadSave } from '@/core/save';
import { xpProgress } from '@/economy/currency';
import type { GameState } from '@/game/state';

interface HudRefs {
  time: HTMLElement;
  level: HTMLElement;
  coins: HTMLElement;
  rank: HTMLElement;
  xpBar: HTMLElement;
  streakBadge: HTMLElement;
  progress: HTMLElement;
}

let cached: HudRefs | null = null;
let displayedCoins = -1;
let coinTickRaf = 0;

function refs(): HudRefs {
  if (cached) return cached;
  cached = {
    time:        requireEl('timeText'),
    level:       requireEl('levelText'),
    coins:       requireEl('coinsText'),
    rank:        requireEl('rankText'),
    xpBar:       requireEl('xpBarFill'),
    streakBadge: requireEl('streakBadge'),
    progress:    requireEl('progressText'),
  };
  return cached;
}

export function updateHud(state: GameState): void {
  const r = refs();
  const save = loadSave();
  r.time.textContent = fmtTime(Math.max(0, state.timeLeft));
  r.level.textContent = `Lv ${state.chapter}-${state.levelIdx}`;
  r.progress.textContent = `${state.campaignIndex}/${state.campaignTotal}`;
  const xp = xpProgress();
  r.rank.textContent = `R${xp.rank}`;
  r.xpBar.style.width = `${Math.round(xp.fraction * 100)}%`;
  r.streakBadge.textContent = save.daily.streakDay > 0 ? `🔥 ${save.daily.streakDay}` : '🔥 0';

  // Animated coin tick.
  const target = save.player.coins;
  if (displayedCoins < 0) {
    displayedCoins = target;
    r.coins.textContent = String(target);
    return;
  }
  if (displayedCoins === target) return;
  if (coinTickRaf) cancelAnimationFrame(coinTickRaf);
  const start = displayedCoins;
  const startTime = performance.now();
  const duration = Math.min(900, 200 + Math.abs(target - start) * 6);
  const step = (now: number) => {
    const t = Math.min(1, (now - startTime) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    const v = Math.round(start + (target - start) * ease);
    displayedCoins = v;
    r.coins.textContent = String(v);
    if (t < 1) {
      coinTickRaf = requestAnimationFrame(step);
    } else {
      coinTickRaf = 0;
    }
  };
  coinTickRaf = requestAnimationFrame(step);
}

/** Force the coin counter to reflect the current save without animation. */
export function resyncCoins(): void {
  const r = refs();
  const save = loadSave();
  displayedCoins = save.player.coins;
  if (coinTickRaf) cancelAnimationFrame(coinTickRaf);
  coinTickRaf = 0;
  r.coins.textContent = String(save.player.coins);
}
