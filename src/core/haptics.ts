/**
 * Haptic feedback wrapper. Falls back silently on platforms that don't
 * support `navigator.vibrate` (i.e. iOS Safari). Toggled by the user's
 * settings; honoured automatically.
 */

import { loadSave } from './save';

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function shouldVibrate(): boolean {
  if (!canVibrate()) return false;
  return loadSave().settings.haptics !== false;
}

export function pulseTap(): void {
  if (!shouldVibrate()) return;
  try { navigator.vibrate(10); } catch { /* ignore */ }
}

export function pulseClear(): void {
  if (!shouldVibrate()) return;
  try { navigator.vibrate([24, 30, 24]); } catch { /* ignore */ }
}

export function pulseFail(): void {
  if (!shouldVibrate()) return;
  try { navigator.vibrate([12, 60, 12]); } catch { /* ignore */ }
}

export function pulseWin(): void {
  if (!shouldVibrate()) return;
  try { navigator.vibrate([10, 40, 10, 40, 30]); } catch { /* ignore */ }
}
