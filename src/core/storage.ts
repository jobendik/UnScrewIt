/**
 * Low-level localStorage shim. Handles private-browsing fallback (where
 * localStorage throws or is null) and namespaces keys consistently.
 *
 * Application save state goes through `core/save.ts`, which builds on
 * this module for the actual storage.
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
