/**
 * Thin localStorage wrapper. Handles private-browsing fallback (where
 * localStorage throws or is null), namespaces keys consistently, and
 * coerces stored values back to numbers.
 *
 * Save schema lives in a future module; this is the low-level shim.
 */

import { STORAGE_NAMESPACE } from './config';

let memoryFallback: Record<string, string> = {};
let storageAvailable: boolean | null = null;

function isLocalStorageAvailable(): boolean {
  if (storageAvailable !== null) return storageAvailable;
  try {
    const probe = '__usit_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

const namespaced = (key: string): string => `${STORAGE_NAMESPACE}.${key}`;

export function readString(key: string): string | null {
  const full = namespaced(key);
  if (isLocalStorageAvailable()) {
    try { return window.localStorage.getItem(full); } catch { /* fall through */ }
  }
  return Object.prototype.hasOwnProperty.call(memoryFallback, full)
    ? memoryFallback[full] ?? null
    : null;
}

export function writeString(key: string, value: string): void {
  const full = namespaced(key);
  if (isLocalStorageAvailable()) {
    try { window.localStorage.setItem(full, value); return; } catch { /* fall through */ }
  }
  memoryFallback[full] = value;
}

export function readNumber(key: string, fallback = 0): number {
  const raw = readString(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function writeNumber(key: string, value: number): void {
  writeString(key, String(value));
}

/**
 * Lightweight player progress accessor. This will be replaced by the full
 * schema-versioned save in a later pass, but it covers what the prototype
 * actually persists today.
 */
export const Progress = {
  get bestLevel(): number { return readNumber('bestLevel', 0); },
  set bestLevel(v: number) { writeNumber('bestLevel', v); },

  get totalStars(): number { return readNumber('totalStars', 0); },
  set totalStars(v: number) { writeNumber('totalStars', v); },

  starsFor(levelIndex: number): number {
    return readNumber(`level.${levelIndex}.stars`, 0);
  },

  recordStars(levelIndex: number, stars: number): void {
    const previous = this.starsFor(levelIndex);
    if (stars > previous) writeNumber(`level.${levelIndex}.stars`, stars);
  },
};
