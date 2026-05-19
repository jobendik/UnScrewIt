/**
 * Bucket-color gameplay state machine.
 *
 * Tap a screw → it flies into the bucket bar. If the bucket can't accept
 * its colour (or the screw is covered by a plate above), the tap fails
 * harmlessly with feedback. Once all plates are removed, the level is won.
 *
 * The state machine is intentionally framework-free: it owns no DOM
 * references and emits a single `onChange` callback after every mutation.
 * Side-effects (sounds, animations) flow through dedicated callbacks the
 * host wires up.
 */

import { clamp } from '@/core/utils';
import { canAccept, createBucket, place, snapshot as bucketSnapshot, restore as bucketRestore } from './bucket';
import type { BucketState, PlaceOutcome } from './bucket';
import type { ScrewColorId } from './colors';
import { getLevel, levelId, LEVELS_PER_CHAPTER, nextLevel as advanceLevel } from './levels';
import { pointInPlate, pointNearPlatePinHole, pointOverPlateHole } from './plates';
import type {
  BucketSlot,
  Hole,
  LevelDefinition,
  Plate,
  RemoveBlocker,
  Screw,
} from './types';

interface UndoSnapshot {
  screws: Screw[];
  plates: Array<{ id: string; status: Plate['status']; pinnedBy: string[] }>;
  bucket: BucketSlot[];
  timeLeft: number;
}

export interface LevelResult {
  chapter: number;
  level: number;
  id: string;
  stars: number;
  timeLeft: number;
  totalTime: number;
  /** Coins earned in this level run. */
  coinsEarned: number;
  /** Highest combo reached in this run. */
  maxCombo: number;
  /** Total seconds taken to clear the level. */
  secondsTaken: number;
  isFinal: boolean;
}

export interface FailureInfo {
  chapter: number;
  level: number;
  id: string;
  reason: string;
  /** Number of screws cleared / total — used to drive near-miss offers. */
  progress: number;
}

export interface StateCallbacks {
  onChange?: () => void;
  /**
   * Animation requested: move `screwId` from `from` to the bucket slot at
   * `slotIndex`. The renderer calls `resolve()` when it's ready for the
   * screw to be removed from the board and added to the bucket.
   */
  onScrewToBucket?: (
    screwId: string,
    from: Hole,
    slotIndex: number,
    outcome: PlaceOutcome,
    resolve: () => void,
  ) => void;
  onRemoveBlocked?: (screwId: string, reason: RemoveBlocker) => void;
  onPlatesFalling?: (plateIds: string[], onFinish: () => void) => void;
  onWin?: (result: LevelResult) => void;
  onLose?: (info: FailureInfo) => void;
  /** Fired every time a screw lands in the bucket — host can play SFX. */
  onScrewPopped?: (combo: number) => void;
  /** Fired when a bucket slot just cleared (3-in-a-row). */
  onSlotCleared?: (slotIndex: number, color: ScrewColorId, coins: number, combo: number) => void;
}

const COMBO_WINDOW_MS = 1300;
const COIN_PER_POP = 3;
const COIN_PER_CLEAR = 25;

export class GameState {
  level!: LevelDefinition;
  chapter = 1;
  levelIdx = 1;

  bucket!: BucketState;
  timeLeft = 0;

  animating = false;
  completed = false;
  lost = false;
  startedAt = 0;

  /** Combo counter — increments per pop within the combo window. */
  combo = 0;
  /** Best combo this run. */
  maxCombo = 0;
  /** Coins accumulated since level start. */
  coinsThisLevel = 0;

  private comboTimer: number | null = null;
  private undoStack: UndoSnapshot[] = [];
  private timerId: number | null = null;
  private callbacks: StateCallbacks;
  private screwsCleared = 0;
  private initialScrewCount = 0;
  private bonusTimeAwarded = 0;

  constructor(callbacks: StateCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** Total screws in the active level, for progress %. */
  get totalScrews(): number { return this.initialScrewCount; }
  get screwsRemaining(): number { return this.level.screws.length; }
  get progressFraction(): number {
    return this.initialScrewCount === 0 ? 0 : this.screwsCleared / this.initialScrewCount;
  }
  get bucketSlots(): BucketSlot[] { return this.bucket.slots; }

  loadLevel(chapter: number, level: number): void {
    const def = getLevel(chapter, level);
    this.stopTimer();
    this.cancelComboTimer();
    this.chapter = chapter;
    this.levelIdx = level;
    this.level = def;
    this.bucket = createBucket(def.bucketSlots);
    this.timeLeft = def.time;
    this.animating = false;
    this.completed = false;
    this.lost = false;
    this.combo = 0;
    this.maxCombo = 0;
    this.coinsThisLevel = 0;
    this.screwsCleared = 0;
    this.initialScrewCount = def.screws.length;
    this.bonusTimeAwarded = 0;
    this.undoStack = [];
    this.startedAt = Date.now();
    this.updatePins();
    this.emitChange();
    this.startTimer();
  }

  restart(): void { this.loadLevel(this.chapter, this.levelIdx); }

  pauseTimer(): void { this.stopTimer(); }
  resumeTimer(): void { if (!this.completed && !this.lost) this.startTimer(); }

  /** Grant bonus time (e.g. from a rewarded ad continue). */
  grantContinue(seconds: number): void {
    if (this.lost) {
      this.lost = false;
      this.bonusTimeAwarded += seconds;
      this.timeLeft = Math.max(this.timeLeft, 0) + seconds;
      this.startTimer();
      this.emitChange();
    }
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

  // ── Lookups ────────────────────────────────────────────────────────────

  holeById(id: string): Hole | undefined { return this.level.holes.find((h) => h.id === id); }
  activePlates(): Plate[] { return this.level.plates.filter((p) => p.status === 'active'); }
  livePlates(): Plate[] { return this.level.plates.filter((p) => p.status !== 'removed'); }

  private isHoleBlocked(hole: Hole): boolean {
    for (const p of this.activePlates()) {
      if (pointInPlate(p, hole) && !pointOverPlateHole(p, hole)) return true;
    }
    return false;
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

  /** Why can't this screw be tapped right now? */
  removeBlocker(screw: Screw): RemoveBlocker | null {
    if (this.animating) return 'animating';
    if (this.completed || this.lost) return 'finished';
    const hole = this.holeById(screw.holeId);
    if (!hole || this.isHoleBlocked(hole)) return 'plate-covers';
    if (!canAccept(this.bucket, screw.color)) return 'bucket-full';
    return null;
  }

  /** Handle a tap on a screw. */
  tapScrew(screwId: string): void {
    if (this.animating || this.completed || this.lost) return;
    const screw = this.level.screws.find((s) => s.id === screwId);
    if (!screw) return;
    const blocker = this.removeBlocker(screw);
    if (blocker) {
      this.callbacks.onRemoveBlocked?.(screwId, blocker);
      this.breakCombo();
      return;
    }
    this.popScrew(screw);
  }

  private popScrew(screw: Screw): void {
    const fromHole = this.holeById(screw.holeId);
    if (!fromHole) return;

    // Pre-compute placement outcome so the renderer knows which slot to fly to.
    const projectedBucket = createBucket(this.bucket.slots.length);
    projectedBucket.slots = bucketSnapshot(this.bucket);
    const outcome = place(projectedBucket, screw.color);

    this.saveUndo();
    this.animating = true;
    this.emitChange();

    const commit = (): void => {
      // Apply the actual placement and remove the screw.
      const realOutcome = place(this.bucket, screw.color);
      this.level.screws = this.level.screws.filter((s) => s.id !== screw.id);
      this.screwsCleared += 1;
      this.bumpCombo();
      this.awardCoins(COIN_PER_POP * Math.max(1, this.combo));
      this.callbacks.onScrewPopped?.(this.combo);
      if (realOutcome.kind === 'cleared') {
        const reward = COIN_PER_CLEAR * Math.max(1, this.combo);
        this.awardCoins(reward);
        this.callbacks.onSlotCleared?.(realOutcome.slotIndex, realOutcome.color, reward, this.combo);
      }
      this.updatePins();

      const released = this.releaseUnpinnedPlates();
      this.emitChange();
      if (released.length) {
        this.callbacks.onPlatesFalling?.(released, () => this.finishFalling(released));
      } else {
        this.animating = false;
        this.maybeLoseByLockout();
        this.emitChange();
      }
    };

    if (this.callbacks.onScrewToBucket) {
      this.callbacks.onScrewToBucket(screw.id, fromHole, outcome.slotIndex, outcome, commit);
    } else {
      commit();
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
    if (!this.completed) this.maybeLoseByLockout();
  }

  /**
   * Detect bucket lockout: no removable screw can be accepted by the
   * bucket, so the player is stuck. Triggers a fail-by-lockout.
   */
  private maybeLoseByLockout(): void {
    if (this.completed || this.lost) return;
    if (this.activePlates().length === 0) return;
    for (const screw of this.level.screws) {
      const blocker = this.removeBlocker(screw);
      if (!blocker) return;
    }
    this.fail('Bucket locked — no valid moves');
  }

  private fail(reason: string): void {
    this.lost = true;
    this.stopTimer();
    this.cancelComboTimer();
    this.callbacks.onLose?.({
      chapter: this.chapter,
      level: this.levelIdx,
      id: levelId(this.chapter, this.levelIdx),
      reason,
      progress: this.progressFraction,
    });
  }

  private checkWin(): void {
    if (this.completed || this.lost) return;
    const stillFalling = this.level.plates.some((p) => p.status === 'falling');
    if (this.activePlates().length === 0 && !stillFalling) {
      this.completed = true;
      this.stopTimer();
      this.cancelComboTimer();
      const secondsTaken = clamp(
        this.level.time - this.timeLeft - this.bonusTimeAwarded,
        0,
        this.level.time,
      );
      const timeStar = secondsTaken <= this.level.parTime ? 1 : 0;
      const fastBonus = secondsTaken <= this.level.parTime * 0.75 ? 1 : 0;
      const stars = clamp(1 + timeStar + fastBonus, 1, 3);
      // Time-bonus coins
      const finalBonus = Math.max(0, this.timeLeft) * 2 + (stars - 1) * 25;
      this.awardCoins(finalBonus);
      const result: LevelResult = {
        chapter: this.chapter,
        level: this.levelIdx,
        id: levelId(this.chapter, this.levelIdx),
        stars,
        timeLeft: this.timeLeft,
        totalTime: this.level.time,
        coinsEarned: this.coinsThisLevel,
        maxCombo: this.maxCombo,
        secondsTaken,
        isFinal: !advanceLevel(this.chapter, this.levelIdx),
      };
      this.callbacks.onWin?.(result);
    }
  }

  // ── Combo + currency ──────────────────────────────────────────────────

  private bumpCombo(): void {
    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.cancelComboTimer();
    this.comboTimer = window.setTimeout(() => {
      this.combo = 0;
      this.emitChange();
    }, COMBO_WINDOW_MS);
  }

  private breakCombo(): void {
    if (this.combo === 0) return;
    this.combo = 0;
    this.cancelComboTimer();
    this.emitChange();
  }

  private cancelComboTimer(): void {
    if (this.comboTimer !== null) {
      window.clearTimeout(this.comboTimer);
      this.comboTimer = null;
    }
  }

  private awardCoins(n: number): void {
    this.coinsThisLevel += n;
  }

  // ── Undo ──────────────────────────────────────────────────────────────

  private saveUndo(): void {
    this.undoStack.push({
      screws: this.level.screws.map((s) => ({ ...s })),
      plates: this.level.plates.map((p) => ({
        id: p.id,
        status: p.status,
        pinnedBy: [...(p.pinnedBy ?? [])],
      })),
      bucket: bucketSnapshot(this.bucket),
      timeLeft: this.timeLeft,
    });
    if (this.undoStack.length > 10) this.undoStack.shift();
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
    bucketRestore(this.bucket, snap.bucket);
    this.timeLeft = snap.timeLeft;
    if (this.screwsCleared > 0) this.screwsCleared -= 1;
    this.updatePins();
    this.breakCombo();
    this.emitChange();
    return true;
  }

  get undoDepth(): number { return this.undoStack.length; }

  /** Total levels in the campaign — used for progress display. */
  get campaignTotal(): number { return 10 * LEVELS_PER_CHAPTER; }
  get campaignIndex(): number { return (this.chapter - 1) * LEVELS_PER_CHAPTER + this.levelIdx; }

  private emitChange(): void { this.callbacks.onChange?.(); }
}
