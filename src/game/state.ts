/**
 * Core gameplay state machine.
 *
 * The state machine is intentionally framework-free: it owns no DOM
 * references and emits a single `onChange` callback after every mutation
 * so the renderer can react. UI side-effects (sounds, toasts) are emitted
 * via dedicated callbacks the host wires up at construction time.
 */

import { UNDO_HISTORY_LIMIT, STAR_THRESHOLDS } from '@/core/config';
import { clamp } from '@/core/utils';
import { LEVELS, makeLevel } from './levels';
import { pointInPlate, pointNearPlatePinHole, pointOverPlateHole } from './plates';
import type {
  HintMove,
  Hole,
  LevelDefinition,
  Plate,
  Screw,
  TargetStatus,
} from './types';

interface UndoSnapshot {
  screws: Screw[];
  plates: Array<{ id: string; status: Plate['status']; pinnedBy: string[] }>;
  movesLeft: number;
  timeLeft: number;
  hintsLeft: number;
}

export interface LevelResult {
  levelIndex: number;
  stars: number;
  movesLeft: number;
  timeLeft: number;
  isFinal: boolean;
}

export interface FailureInfo {
  levelIndex: number;
  reason: string;
}

export interface StateCallbacks {
  /** Fired after any state mutation that should redraw the board. */
  onChange?: () => void;
  /** Player tapped an empty hole without a screw selected. */
  onPromptSelect?: () => void;
  /** Player chose an invalid target. */
  onInvalidTarget?: (reason: 'occupied' | 'blocked' | 'unknown') => void;
  /** Animation requested: move `screwId` from `from` to `to`, then resolve. */
  onScrewMove?: (
    screwId: string,
    from: Hole,
    to: Hole,
    resolve: () => void,
  ) => void;
  /** Plates released this turn; renderer should play the fall animation. */
  onPlatesFalling?: (plateIds: string[], onFinish: () => void) => void;
  /** Level cleared. */
  onWin?: (result: LevelResult) => void;
  /** Level failed. */
  onLose?: (info: FailureInfo) => void;
  /** A hint was just produced. */
  onHint?: () => void;
}

export class GameState {
  level!: LevelDefinition;
  levelIndex = 0;

  movesLeft = 0;
  timeLeft = 0;
  hintsLeft = 0;

  selected: string | null = null;
  validTargets = new Set<string>();
  invalidTargets = new Set<string>();
  hint: HintMove | null = null;

  animating = false;
  completed = false;
  lost = false;
  startedAt = 0;
  starsAwarded = 0;

  private undoStack: UndoSnapshot[] = [];
  private timerId: number | null = null;
  private callbacks: StateCallbacks;

  constructor(callbacks: StateCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get totalLevels(): number {
    return LEVELS.length;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  loadLevel(index: number): void {
    const template = LEVELS[clamp(index, 0, LEVELS.length - 1)];
    if (!template) throw new Error(`No level template at index ${index}`);
    const level = makeLevel(template);
    this.stopTimer();
    this.levelIndex = clamp(index, 0, LEVELS.length - 1);
    this.level = level;
    this.movesLeft = level.moves;
    this.timeLeft = level.time;
    this.hintsLeft = level.hints;
    this.selected = null;
    this.validTargets = new Set();
    this.invalidTargets = new Set();
    this.hint = null;
    this.undoStack = [];
    this.animating = false;
    this.completed = false;
    this.lost = false;
    this.startedAt = Date.now();
    this.starsAwarded = 0;
    this.updatePins();
    this.emitChange();
    this.startTimer();
  }

  /** Restart the current level. */
  restart(): void { this.loadLevel(this.levelIndex); }

  /** Pause the timer (used when the tab is hidden or an overlay is shown). */
  pauseTimer(): void { this.stopTimer(); }
  /** Resume the timer if the level is still in progress. */
  resumeTimer(): void {
    if (!this.completed && !this.lost) this.startTimer();
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerId = window.setInterval(() => {
      if (this.animating || this.completed || this.lost) return;
      this.timeLeft -= 1;
      this.emitChange();
      if (this.timeLeft <= 0) this.fail("Time's up!");
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  // ── Lookups ────────────────────────────────────────────────────────────────

  holeById(id: string): Hole | undefined {
    return this.level.holes.find((h) => h.id === id);
  }

  screwById(id: string): Screw | undefined {
    return this.level.screws.find((s) => s.id === id);
  }

  occupiedHoleIds(except: string | null = null): Set<string> {
    return new Set(
      this.level.screws
        .filter((s) => s.id !== except)
        .map((s) => s.holeId),
    );
  }

  activePlates(): Plate[] {
    return this.level.plates.filter((p) => p.status === 'active');
  }

  livePlates(): Plate[] {
    return this.level.plates.filter((p) => p.status !== 'removed');
  }

  // ── Targeting ─────────────────────────────────────────────────────────────

  isHoleBlocked(hole: Hole): boolean {
    for (const p of this.activePlates()) {
      if (pointInPlate(p, hole) && !pointOverPlateHole(p, hole)) return true;
    }
    return false;
  }

  targetStatus(holeId: string, movingScrewId: string | null): TargetStatus {
    const hole = this.holeById(holeId);
    if (!hole) return 'missing';
    if (this.occupiedHoleIds(movingScrewId).has(holeId)) return 'occupied';
    if (this.isHoleBlocked(hole)) return 'blocked';
    return 'valid';
  }

  private computeTargets(screwId: string): { valid: Set<string>; invalid: Set<string> } {
    const valid = new Set<string>();
    const invalid = new Set<string>();
    const screw = this.screwById(screwId);
    for (const hole of this.level.holes) {
      const status = this.targetStatus(hole.id, screwId);
      if (status === 'valid' && screw?.holeId !== hole.id) {
        valid.add(hole.id);
      } else if (status !== 'occupied') {
        invalid.add(hole.id);
      }
    }
    return { valid, invalid };
  }

  private updatePins(): void {
    for (const p of this.level.plates) p.pinnedBy = [];
    for (const p of this.activePlates()) {
      for (const s of this.level.screws) {
        const h = this.holeById(s.holeId);
        if (h && pointNearPlatePinHole(p, h)) p.pinnedBy.push(s.id);
      }
    }
  }

  // ── Selection & moves ─────────────────────────────────────────────────────

  selectScrew(id: string): void {
    if (this.animating || this.completed || this.lost) return;
    if (this.selected === id) {
      this.clearSelection();
      this.emitChange();
      return;
    }
    this.selected = id;
    const { valid, invalid } = this.computeTargets(id);
    this.validTargets = valid;
    this.invalidTargets = invalid;
    this.hint = null;
    this.emitChange();
  }

  clearSelection(): void {
    this.selected = null;
    this.validTargets = new Set();
    this.invalidTargets = new Set();
    this.hint = null;
  }

  /** Handle a tap on a hole. Returns the result for the caller to feedback on. */
  tapHole(holeId: string): TargetStatus | 'no-selection' {
    if (this.animating || this.completed || this.lost) return 'missing';
    if (!this.selected) {
      const occupied = this.level.screws.find((s) => s.holeId === holeId);
      if (occupied) {
        this.selectScrew(occupied.id);
        return 'valid';
      }
      this.callbacks.onPromptSelect?.();
      return 'no-selection';
    }
    const status = this.targetStatus(holeId, this.selected);
    if (status !== 'valid') {
      const reason: 'occupied' | 'blocked' | 'unknown' =
        status === 'occupied' ? 'occupied' :
        status === 'blocked'  ? 'blocked'  : 'unknown';
      this.callbacks.onInvalidTarget?.(reason);
      return status;
    }
    const screw = this.screwById(this.selected);
    if (screw && screw.holeId === holeId) return 'occupied';
    this.moveSelectedScrew(holeId);
    return 'valid';
  }

  private moveSelectedScrew(targetHoleId: string): void {
    if (!this.selected) return;
    const screw = this.screwById(this.selected);
    if (!screw) return;
    const fromHole = this.holeById(screw.holeId);
    const toHole = this.holeById(targetHoleId);
    if (!fromHole || !toHole) return;

    this.saveUndo();
    this.animating = true;
    const screwId = screw.id;
    this.clearSelection();
    this.emitChange();

    const finish = () => {
      const current = this.screwById(screwId);
      if (!current) return;
      current.holeId = targetHoleId;
      this.movesLeft -= 1;
      this.updatePins();

      const released = this.releaseUnpinnedPlates();
      this.emitChange();
      if (released.length) {
        this.callbacks.onPlatesFalling?.(released, () => this.finishFalling(released));
      } else {
        this.animating = false;
        this.maybeLoseByMoves();
        this.emitChange();
      }
    };

    if (this.callbacks.onScrewMove) {
      this.callbacks.onScrewMove(screwId, fromHole, toHole, finish);
    } else {
      finish();
    }
  }

  private releaseUnpinnedPlates(): string[] {
    const released: string[] = [];
    const W = 600;
    for (const p of this.activePlates()) {
      if (!p.pinnedBy || p.pinnedBy.length === 0) {
        p.status = 'falling';
        p.fallX = (p.fallSide || (p.x < W / 2 ? -1 : 1)) * (45 + Math.random() * 28);
        p.fallY = 540 + Math.random() * 170;
        released.push(p.id);
      }
    }
    return released;
  }

  private finishFalling(ids: string[]): void {
    for (const id of ids) {
      const p = this.level.plates.find((pl) => pl.id === id);
      if (p && p.status === 'falling') p.status = 'removed';
    }
    this.updatePins();
    this.animating = false;
    this.emitChange();
    this.checkWin();
    if (!this.completed) this.maybeLoseByMoves();
  }

  private maybeLoseByMoves(): void {
    if (!this.completed && !this.lost && this.movesLeft <= 0 && this.activePlates().length > 0) {
      this.fail('No moves left!');
    }
  }

  private fail(reason: string): void {
    this.lost = true;
    this.stopTimer();
    this.callbacks.onLose?.({ levelIndex: this.levelIndex, reason });
  }

  private checkWin(): void {
    if (this.completed || this.lost) return;
    const stillFalling = this.level.plates.some((p) => p.status === 'falling');
    if (this.activePlates().length === 0 && !stillFalling) {
      this.completed = true;
      this.stopTimer();
      const moveRatio = clamp(this.movesLeft / Math.max(1, this.level.moves), 0, 1);
      const timeRatio = clamp(this.timeLeft / Math.max(1, this.level.time), 0, 1);
      const stars =
        1 +
        (moveRatio > STAR_THRESHOLDS.movesRatio ? 1 : 0) +
        (timeRatio > STAR_THRESHOLDS.timeRatio ? 1 : 0);
      this.starsAwarded = stars;
      this.callbacks.onWin?.({
        levelIndex: this.levelIndex,
        stars,
        movesLeft: this.movesLeft,
        timeLeft: this.timeLeft,
        isFinal: this.levelIndex === LEVELS.length - 1,
      });
    }
  }

  // ── Undo / Hint ───────────────────────────────────────────────────────────

  private saveUndo(): void {
    this.undoStack.push({
      screws: this.level.screws.map((s) => ({ ...s })),
      plates: this.level.plates.map((p) => ({
        id: p.id,
        status: p.status,
        pinnedBy: [...(p.pinnedBy || [])],
      })),
      movesLeft: this.movesLeft,
      timeLeft: this.timeLeft,
      hintsLeft: this.hintsLeft,
    });
    if (this.undoStack.length > UNDO_HISTORY_LIMIT) this.undoStack.shift();
  }

  restoreUndo(): boolean {
    if (this.animating || this.completed || this.lost) return false;
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.level.screws = snap.screws.map((s) => ({ ...s }));
    for (const p of this.level.plates) {
      const saved = snap.plates.find((x) => x.id === p.id);
      if (saved) {
        p.status = saved.status === 'falling' ? 'active' : saved.status;
        p.pinnedBy = [...saved.pinnedBy];
      }
    }
    this.movesLeft = snap.movesLeft;
    this.timeLeft = snap.timeLeft;
    this.hintsLeft = snap.hintsLeft;
    this.clearSelection();
    this.updatePins();
    this.emitChange();
    return true;
  }

  requestHint(): HintMove | null {
    if (this.animating || this.completed || this.lost) return null;
    if (this.hintsLeft <= 0) return null;
    const hint = this.findHintMove();
    if (!hint) return null;
    this.hintsLeft -= 1;
    this.hint = hint;
    this.selected = hint.screwId;
    const { valid, invalid } = this.computeTargets(hint.screwId);
    this.validTargets = valid;
    this.invalidTargets = invalid;
    this.callbacks.onHint?.();
    this.emitChange();
    return hint;
  }

  private findHintMove(): HintMove | null {
    this.updatePins();
    let best: HintMove | null = null;
    for (const s of this.level.screws) {
      const from = this.holeById(s.holeId);
      if (!from) continue;
      const targets = this.computeTargets(s.id).valid;
      for (const targetId of targets) {
        const snapshot = this.level.screws.map((x) => ({ ...x }));
        const tmp = snapshot.find((x) => x.id === s.id);
        if (!tmp) continue;
        tmp.holeId = targetId;
        const wouldRelease = this.level.plates
          .filter((p) => p.status === 'active' && p.pinnedBy?.includes(s.id))
          .filter((p) => {
            let count = 0;
            for (const ts of snapshot) {
              const h = this.holeById(ts.holeId);
              if (h && pointNearPlatePinHole(p, h)) count++;
            }
            return count === 0;
          }).length;
        const score = wouldRelease * 10 - (this.pointNearAnyActivePlateHole(targetId) ? 2 : 0);
        if (!best || score > best.score) {
          best = { screwId: s.id, targetId, score };
        }
      }
    }
    return best;
  }

  private pointNearAnyActivePlateHole(holeId: string): boolean {
    const h = this.holeById(holeId);
    if (!h) return false;
    return this.activePlates().some((p) => pointNearPlatePinHole(p, h));
  }

  // ── Notification ──────────────────────────────────────────────────────────

  private emitChange(): void {
    this.callbacks.onChange?.();
  }
}
