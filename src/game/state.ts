/**
 * Bucket-color gameplay state machine.
 *
 * Tap a screw → it flies into the bucket bar. Special screws have their
 * own rules:
 *
 * - frozen: first tap cracks the ice (changes visual + plays a sound),
 *   second tap removes it normally.
 * - chained: all screws sharing the same `chainId` must be tappable in
 *   one go (no plates above them, bucket can accept all colours). They
 *   then pop in sequence with a single combo bump per pop.
 * - locked: cannot be tapped until a "key" screw of the same lockGroup
 *   has been removed.
 * - key: removing one unlocks all locked screws in the same lockGroup.
 *
 * Boosters mutate state directly via dedicated methods (`addTime`,
 * `colorSortBucket`, etc.).
 */

import { clamp } from '@/core/utils';
import { canAccept, createBucket, place, snapshot as bucketSnapshot, restore as bucketRestore, colorSort, SLOT_CAPACITY } from './bucket';
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
  screwsCleared: number;
}

export interface LevelResult {
  chapter: number;
  level: number;
  id: string;
  stars: number;
  timeLeft: number;
  totalTime: number;
  coinsEarned: number;
  maxCombo: number;
  secondsTaken: number;
  isFinal: boolean;
  /** Screws cleared this run — fed to quests. */
  screwsCleared: number;
}

export interface FailureInfo {
  chapter: number;
  level: number;
  id: string;
  reason: string;
  progress: number;
}

export interface PopAnimationContext {
  screwId: string;
  fromHole: Hole;
  slotIndex: number;
  outcome: PlaceOutcome;
}

export interface StateCallbacks {
  onChange?: () => void;
  /** A screw popped (after the animation resolves). */
  onScrewPopped?: (combo: number, color: ScrewColorId) => void;
  /** Caller should animate the screw flying to the bucket; call `resolve()` when done. */
  onScrewToBucket?: (
    contexts: PopAnimationContext[],
    resolve: () => void,
  ) => void;
  /** First tap on a frozen screw — cracked, not yet removed. */
  onFrozenCracked?: (screwId: string, hole: Hole) => void;
  /** Removing a key unlocked one or more locked screws. */
  onLockGroupOpened?: (group: string, lockedIds: string[]) => void;
  /** Tap rejected. */
  onRemoveBlocked?: (screwId: string, reason: RemoveBlocker) => void;
  /** Plates went into the "falling" status. */
  onPlatesFalling?: (plateIds: string[], onFinish: () => void) => void;
  /** Bucket slot just hit capacity and cleared. */
  onSlotCleared?: (slotIndex: number, color: ScrewColorId, coins: number, combo: number) => void;
  onWin?: (result: LevelResult) => void;
  onLose?: (info: FailureInfo) => void;
  /** Color-sort booster animated the bucket. */
  onBucketSorted?: () => void;
  /** Reveal-hint booster picked a target screw. */
  onHintRevealed?: (screwId: string | null) => void;
  /** Time was added (e.g. extraTime booster, near-miss continue). */
  onTimeAdded?: (seconds: number) => void;
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

  combo = 0;
  maxCombo = 0;
  coinsThisLevel = 0;
  screwsCleared = 0;

  /** Screw IDs to highlight as hint targets (visual ring on screw). */
  highlightedScrews = new Set<string>();

  private comboTimer: number | null = null;
  private undoStack: UndoSnapshot[] = [];
  private timerId: number | null = null;
  private callbacks: StateCallbacks;
  private initialScrewCount = 0;
  private bonusTimeAwarded = 0;
  private hadFailureThisRun = false;

  constructor(callbacks: StateCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get totalScrews(): number { return this.initialScrewCount; }
  get screwsRemaining(): number { return this.level.screws.length; }
  get progressFraction(): number {
    return this.initialScrewCount === 0 ? 0 : this.screwsCleared / this.initialScrewCount;
  }
  get bucketSlots(): BucketSlot[] { return this.bucket.slots; }
  get undoDepth(): number { return this.undoStack.length; }
  get campaignTotal(): number { return 10 * LEVELS_PER_CHAPTER; }
  get campaignIndex(): number { return (this.chapter - 1) * LEVELS_PER_CHAPTER + this.levelIdx; }

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
    this.hadFailureThisRun = false;
    this.highlightedScrews.clear();
    this.undoStack = [];
    this.startedAt = Date.now();
    this.updatePins();
    this.emitChange();
    this.startTimer();
  }

  restart(): void {
    this.hadFailureThisRun = true;
    this.loadLevel(this.chapter, this.levelIdx);
  }

  pauseTimer(): void { this.stopTimer(); }
  resumeTimer(): void { if (!this.completed && !this.lost) this.startTimer(); }

  /** Award bonus time (booster / near-miss continue). */
  grantContinue(seconds: number): void {
    if (this.lost) {
      this.lost = false;
      this.bonusTimeAwarded += seconds;
      this.timeLeft = Math.max(this.timeLeft, 0) + seconds;
      this.startTimer();
      this.emitChange();
    }
  }

  addTime(seconds: number): void {
    if (this.completed || this.lost) return;
    this.bonusTimeAwarded += seconds;
    this.timeLeft += seconds;
    this.callbacks.onTimeAdded?.(seconds);
    this.emitChange();
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
  screwById(id: string): Screw | undefined { return this.level.screws.find((s) => s.id === id); }
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

  /** Reason this single screw cannot be tapped. */
  removeBlocker(screw: Screw): RemoveBlocker | null {
    if (this.animating) return 'animating';
    if (this.completed || this.lost) return 'finished';
    const hole = this.holeById(screw.holeId);
    if (!hole || this.isHoleBlocked(hole)) return 'plate-covers';
    if (screw.type === 'locked') {
      const groupKey = screw.lockGroup;
      const keyStillThere = this.level.screws.some(
        (s) => s.type === 'key' && s.lockGroup === groupKey,
      );
      if (keyStillThere) return 'locked-needs-key';
    }
    // Frozen screws can be tapped to crack first — the bucket check only
    // happens on the final removal tap.
    if (screw.type === 'frozen' && (screw.frozenHits ?? 0) > 0) {
      return null;
    }
    if (!canAccept(this.bucket, screw.color)) return 'bucket-full';
    return null;
  }

  /** Tap on a screw. */
  tapScrew(screwId: string): void {
    if (this.animating || this.completed || this.lost) return;
    const screw = this.screwById(screwId);
    if (!screw) return;
    const blocker = this.removeBlocker(screw);
    if (blocker) {
      this.callbacks.onRemoveBlocked?.(screwId, blocker);
      this.breakCombo();
      return;
    }
    // Frozen screws with ice left: first tap just cracks.
    if (screw.type === 'frozen' && (screw.frozenHits ?? 0) > 0) {
      this.saveUndo();
      screw.frozenHits = (screw.frozenHits ?? 0) - 1;
      const hole = this.holeById(screw.holeId);
      if (hole) this.callbacks.onFrozenCracked?.(screw.id, hole);
      this.emitChange();
      return;
    }
    if (screw.type === 'chained') {
      this.popChain(screw.chainId);
      return;
    }
    this.popSingle(screw);
  }

  private popSingle(screw: Screw): void {
    const fromHole = this.holeById(screw.holeId);
    if (!fromHole) return;

    const projectedBucket = createBucket(this.bucket.slots.length);
    projectedBucket.slots = bucketSnapshot(this.bucket);
    const outcome = place(projectedBucket, screw.color);

    this.saveUndo();
    this.animating = true;
    this.emitChange();

    const commit = (): void => {
      const realOutcome = place(this.bucket, screw.color);
      const removedId = screw.id;
      const removedColor = screw.color;
      const removedType = screw.type;
      const removedGroup = screw.lockGroup;
      this.level.screws = this.level.screws.filter((s) => s.id !== removedId);
      this.screwsCleared += 1;
      this.bumpCombo();
      this.awardCoins(COIN_PER_POP * Math.max(1, this.combo));
      this.callbacks.onScrewPopped?.(this.combo, removedColor);
      if (realOutcome.kind === 'cleared') {
        const reward = COIN_PER_CLEAR * Math.max(1, this.combo);
        this.awardCoins(reward);
        this.callbacks.onSlotCleared?.(realOutcome.slotIndex, realOutcome.color, reward, this.combo);
      }
      // If the removed screw was a key, unlock its group.
      if (removedType === 'key' && removedGroup) {
        const unlocked = this.level.screws
          .filter((s) => s.type === 'locked' && s.lockGroup === removedGroup)
          .map((s) => s.id);
        for (const s of this.level.screws) {
          if (s.type === 'locked' && s.lockGroup === removedGroup) {
            s.type = 'standard';
            delete s.lockGroup;
          }
        }
        if (unlocked.length) this.callbacks.onLockGroupOpened?.(removedGroup, unlocked);
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
      this.callbacks.onScrewToBucket(
        [{ screwId: screw.id, fromHole, slotIndex: outcome.slotIndex, outcome }],
        commit,
      );
    } else {
      commit();
    }
  }

  /**
   * Pop an entire chain. All members must be currently removable
   * (their holes unblocked and the bucket able to absorb every colour
   * in sequence). On success, each screw pops in turn.
   */
  private popChain(chainId: string | undefined): void {
    if (!chainId) return;
    const members = this.level.screws.filter((s) => s.chainId === chainId);
    if (members.length === 0) return;

    // Verify every member is unblocked.
    for (const s of members) {
      const hole = this.holeById(s.holeId);
      if (!hole || this.isHoleBlocked(hole)) {
        this.callbacks.onRemoveBlocked?.(s.id, 'plate-covers');
        this.breakCombo();
        return;
      }
    }
    // Verify the bucket can accept all of them (sequentially).
    const projectedBucket = createBucket(this.bucket.slots.length);
    projectedBucket.slots = bucketSnapshot(this.bucket);
    const outcomes: PlaceOutcome[] = [];
    for (const s of members) {
      if (!canAccept(projectedBucket, s.color)) {
        this.callbacks.onRemoveBlocked?.(s.id, 'bucket-full');
        this.breakCombo();
        return;
      }
      outcomes.push(place(projectedBucket, s.color));
    }

    this.saveUndo();
    this.animating = true;
    this.emitChange();

    const contexts: PopAnimationContext[] = members.map((s, i) => {
      const hole = this.holeById(s.holeId);
      const out = outcomes[i];
      if (!hole || !out) throw new Error('chain invariant');
      return { screwId: s.id, fromHole: hole, slotIndex: out.slotIndex, outcome: out };
    });

    const commit = (): void => {
      const memberIds = members.map((m) => m.id);
      // Apply real placements
      for (const s of members) {
        const real = place(this.bucket, s.color);
        if (real.kind === 'cleared') {
          this.bumpCombo();
          const reward = COIN_PER_CLEAR * Math.max(1, this.combo);
          this.awardCoins(reward);
          this.callbacks.onSlotCleared?.(real.slotIndex, real.color, reward, this.combo);
        } else {
          this.bumpCombo();
        }
        this.awardCoins(COIN_PER_POP * Math.max(1, this.combo));
        this.screwsCleared += 1;
        this.callbacks.onScrewPopped?.(this.combo, s.color);
      }
      this.level.screws = this.level.screws.filter((s) => !memberIds.includes(s.id));
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
      this.callbacks.onScrewToBucket(contexts, commit);
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

  /** Detect bucket lockout. */
  private maybeLoseByLockout(): void {
    if (this.completed || this.lost) return;
    if (this.activePlates().length === 0 && this.level.screws.length === 0) return;
    for (const screw of this.level.screws) {
      const blocker = this.removeBlocker(screw);
      if (!blocker || blocker === 'animating' || blocker === 'finished') return;
      // A locked screw is technically blocked, but a key may still be unlockable.
      if (blocker === 'locked-needs-key') return;
    }
    this.fail('Bucket locked — no valid moves');
  }

  private fail(reason: string): void {
    this.lost = true;
    this.hadFailureThisRun = true;
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

  /** Whether this attempt failed (for "clear without failing" quest tracking). */
  get failedThisRun(): boolean { return this.hadFailureThisRun; }

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
        screwsCleared: this.screwsCleared,
        isFinal: !advanceLevel(this.chapter, this.levelIdx),
      };
      this.callbacks.onWin?.(result);
    }
  }

  // ── Boosters ──────────────────────────────────────────────────────────

  /** Color-sort the bucket. Returns true if anything changed. */
  colorSortBucket(): boolean {
    if (this.animating || this.completed || this.lost) return false;
    this.saveUndo();
    const outcome = colorSort(this.bucket);
    if (!outcome.changed) {
      // No change — pop the undo we just saved.
      this.undoStack.pop();
      return false;
    }
    // Reward slot-clears caused by the sort itself.
    for (let i = 0; i < outcome.clearedSlots.length; i++) {
      const slotIdx = outcome.clearedSlots[i] ?? 0;
      const colorId = (outcome.clearedColors[i] ?? 'yellow') as ScrewColorId;
      const reward = COIN_PER_CLEAR;
      this.awardCoins(reward);
      this.callbacks.onSlotCleared?.(slotIdx, colorId, reward, 1);
    }
    this.callbacks.onBucketSorted?.();
    this.emitChange();
    return true;
  }

  /** Reveal the safest next screw to tap. Returns the screw id or null. */
  revealHint(): string | null {
    if (this.animating || this.completed || this.lost) return null;
    let best: { id: string; score: number } | null = null;
    for (const screw of this.level.screws) {
      const blocker = this.removeBlocker(screw);
      if (blocker) continue;
      let score = 0;
      // Prefer screws whose colour is already in a bucket slot.
      const existing = this.bucket.slots.find((s) => s.color === screw.color);
      if (existing) score += 5 + existing.count * 2;
      // Prefer screws that would clear plates immediately.
      for (const p of this.activePlates()) {
        if (p.pinnedBy.length === 1 && p.pinnedBy[0] === screw.id) score += 8;
      }
      // Prefer keys when locked screws exist.
      if (screw.type === 'key') score += 6;
      // Frozen needs two taps — slight penalty.
      if (screw.type === 'frozen' && (screw.frozenHits ?? 0) > 0) score -= 3;
      if (!best || score > best.score) best = { id: screw.id, score };
    }
    if (!best) {
      this.callbacks.onHintRevealed?.(null);
      return null;
    }
    this.highlightedScrews.clear();
    this.highlightedScrews.add(best.id);
    this.callbacks.onHintRevealed?.(best.id);
    this.emitChange();
    // Fade highlight after a couple of seconds.
    window.setTimeout(() => {
      this.highlightedScrews.delete(best!.id);
      this.emitChange();
    }, 3000);
    return best.id;
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
      screwsCleared: this.screwsCleared,
    });
    if (this.undoStack.length > 12) this.undoStack.shift();
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
    this.screwsCleared = snap.screwsCleared;
    this.updatePins();
    this.breakCombo();
    this.emitChange();
    return true;
  }

  private emitChange(): void { this.callbacks.onChange?.(); }
}

// Re-export for callers that want the bucket capacity constant.
export { SLOT_CAPACITY };
