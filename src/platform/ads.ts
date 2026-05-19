/**
 * Ad cadence rules. Decides *when* to ask the SDK for interstitials.
 * Rewarded ads remain explicitly player-initiated and bypass these rules.
 */

import { loadSave } from '@/core/save';

const MIN_LEVEL_FOR_ADS = 10;
const LEVELS_BETWEEN_INTERSTITIALS = 4;
const COOLDOWN_MS = 90_000;

let lastAdAt = 0;
let levelsSinceLastAd = 0;

export function noteLevelCleared(): void {
  levelsSinceLastAd += 1;
}

export function shouldShowInterstitial(opts: { justFailed: boolean }): boolean {
  const s = loadSave();
  if (s.stats.levelsCleared < MIN_LEVEL_FOR_ADS) return false;
  if (levelsSinceLastAd < LEVELS_BETWEEN_INTERSTITIALS) return false;
  if (opts.justFailed) return false;
  if (Date.now() - lastAdAt < COOLDOWN_MS) return false;
  return true;
}

export function noteAdShown(): void {
  lastAdAt = Date.now();
  levelsSinceLastAd = 0;
}

/** Player cleared ≥ 60% of screws before failing → eligible for the near-miss continue offer. */
export function eligibleForNearMiss(progress: number): boolean {
  return progress >= 0.6;
}
