/**
 * Bootstrap: build the runtime DOM shell, wire the bucket-color GameState
 * to the renderer, ad SDK, currency, daily-login, quests, achievements,
 * boosters, themes, and onboarding overlays.
 */

import './styles/index.css';

import { audio } from './core/audio';
import { pulseClear, pulseFail, pulseTap, pulseWin } from './core/haptics';
import { loadSave, flush as flushSave, update as updateSave } from './core/save';
import { requireEl, reflow } from './core/utils';
import { awardCoins, awardXp, xpProgress } from './economy/currency';
import { consume as consumeBooster, buy as buyBooster, grant as grantBooster, BOOSTER_BY_ID } from './economy/boosters';
import type { BoosterId } from './economy/boosters';
import { getLevel, LEVELS_PER_CHAPTER, nextLevel, TOTAL_CHAPTERS } from './game/levels';
import { GameState } from './game/state';
import type { FailureInfo, LevelResult } from './game/state';
import type { ScrewType } from './game/types';
import { eligibleForNearMiss } from './platform/ads';
import { init as initPlatform, requestRewardedAd, gameplayStart, gameplayStop, happytime } from './platform/crazygames';
import { claimDaily, dailyStatus } from './retention/dailyLogin';
import { activeQuests, claim as claimQuest, record as recordQuestEvent } from './retention/dailyQuests';
import { record as recordAchievement, claim as claimAchievement } from './retention/achievements';
import type { AchievementDef } from './retention/achievements';
import { maybeReward as welcomeBackReward } from './retention/welcomeBack';
import { animateScrewsToBucket, confettiBurst, slotClearFlash, iceCrackBurst, bucketSortFlash } from './render/animations';
import { bindBoard, ensureEffectsLayer, renderBoard } from './render/board';
import { bucketCenter } from './render/bucket';
import { celebrationBurst, dustPuff, floatingText, sparkBurst } from './render/particles';
import { applyTheme, themeForChapter } from './themes';
import { resyncCoins, updateHud } from './ui/hud';
import {
  achievementsOverlayHtml,
  chapterOverlayHtml,
  dailyChestHtml,
  dailyClaimedHtml,
  hideOverlay,
  isOverlayOpen,
  loseOverlayHtml,
  nearMissOverlayHtml,
  questsOverlayHtml,
  screwTypeIntroHtml,
  settingsOverlayHtml,
  setOverlayHandler,
  shopOverlayHtml,
  showOverlay,
  statsOverlayHtml,
  toggleSetting,
  tutorialStepHtml,
  welcomeBackHtml,
  winOverlayHtml,
} from './ui/overlay';
import { enqueueAchievementToast, showToast } from './ui/toast';
import { colorDef } from './game/colors';
import type { OverlayAction } from './ui/overlay';

const NEAR_MISS_SECONDS = 30;
/** Delay between gameplay-stop and the win overlay appearing, so the confetti + audio land first. */
const WIN_OVERLAY_DELAY_MS = 600;

function buildShell(): void {
  const root = requireEl('root');
  root.innerHTML = `
    <div id="app">
      <main class="shell" aria-label="Unscrew It">
        <section class="hud-top">
          <div class="hud-pill hud-pill--time">
            <span class="hud-icon">⏱</span>
            <span class="hud-text"><span class="subline">Time</span><span id="timeText">00:00</span></span>
          </div>
          <div class="hud-pill hud-pill--level">
            <span id="levelText">Lv 1-1</span>
            <span id="progressText" class="subline">1/200</span>
          </div>
          <div class="hud-pill hud-pill--coins">
            <span class="hud-icon">🪙</span>
            <span class="hud-text"><span class="subline">Coins</span><span id="coinsText">0</span></span>
          </div>
        </section>

        <section class="hud-rank">
          <span class="rank-badge" id="rankText">R1</span>
          <span class="rank-bar"><span class="rank-bar-fill" id="xpBarFill"></span></span>
          <span id="movesBadge" class="moves-badge" title="Moves used / par (Perfect Solve target)">
            <span class="moves-badge__icon">🎯</span><span id="movesText">0/0</span>
          </span>
          <span class="streak-badge" id="streakBadge">🔥 0</span>
        </section>

        <section id="boardStage" class="board-stage">
          <svg id="boardSvg" viewBox="0 0 600 900" role="img" aria-label="Puzzle board"></svg>
        </section>

        <section class="booster-bar" aria-label="Boosters">
          <button id="boosterExtraTimeBtn" class="booster-btn" type="button" title="+30 seconds">
            <span class="booster-icon">⏱</span>
            <span class="booster-tag">+30s</span>
            <span id="boosterExtraTimeCount" class="booster-count">0</span>
          </button>
          <button id="boosterColorSortBtn" class="booster-btn" type="button" title="Color Sort">
            <span class="booster-icon">🎨</span>
            <span class="booster-tag">Sort</span>
            <span id="boosterColorSortCount" class="booster-count">0</span>
          </button>
          <button id="boosterRevealHintBtn" class="booster-btn" type="button" title="Reveal next move">
            <span class="booster-icon">✨</span>
            <span class="booster-tag">Hint</span>
            <span id="boosterRevealHintCount" class="booster-count">0</span>
          </button>
          <button id="boosterUndoBtn" class="booster-btn" type="button" title="Undo last move">
            <span class="booster-icon">↶</span>
            <span class="booster-tag">Undo</span>
            <span id="boosterUndoCount" class="booster-count">0</span>
          </button>
          <button id="shopBtn" class="booster-btn booster-btn--shop" type="button" title="Buy more">
            <span class="booster-icon">＋</span>
            <span class="booster-tag">Shop</span>
          </button>
        </section>

        <section class="bottom-bar" aria-label="Tools">
          <button id="restartBtn" class="tool-btn" type="button">
            <span class="tool-icon">⟳</span><span>Restart</span>
          </button>
          <button id="questsBtn" class="tool-btn" type="button">
            <span class="tool-icon">📋</span><span>Quests</span>
            <span id="questDot" class="tool-dot"></span>
          </button>
          <button id="dailyBtn" class="tool-btn tool-btn--accent" type="button">
            <span class="tool-icon">🎁</span><span>Daily</span>
            <span id="dailyIndicator" class="tool-dot"></span>
          </button>
          <button id="chaptersBtn" class="tool-btn" type="button">
            <span class="tool-icon">☰</span><span>Levels</span>
          </button>
          <button id="settingsBtn" class="tool-btn" type="button">
            <span class="tool-icon">⚙</span><span>Settings</span>
          </button>
        </section>

        <div id="toast" class="toast"></div>

        <section id="overlay" class="overlay" aria-live="polite">
          <div id="overlayCard" class="card"></div>
        </section>
      </main>
    </div>
  `;
}

function fadeOutBootSplash(): void {
  const splash = document.getElementById('bootSplash');
  if (!splash) return;
  splash.classList.add('is-fading');
  window.setTimeout(() => splash.remove(), 380);
}

function shake(stage: HTMLElement): void {
  stage.classList.remove('shake');
  reflow(stage);
  stage.classList.add('shake');
}

function bootstrap(): void {
  // Notify the SDK once it's ready that gameplay has started. We resolve the
  // promise immediately if already initialised, so this is always safe.
  void initPlatform().then(() => {
    if (loadSave().onboarding.finishedIntro) gameplayStart();
  });

  buildShell();
  fadeOutBootSplash();

  // Apply initial theme based on save's chapter.
  const saveAtBoot = loadSave();
  applyTheme(themeForChapter(saveAtBoot.progress.chapterMax));

  const stage = requireEl<HTMLElement>('boardStage');
  const svgEl = requireEl<HTMLElement>('boardSvg') as unknown as SVGSVGElement;
  const restartBtn = requireEl<HTMLButtonElement>('restartBtn');
  const questsBtn = requireEl<HTMLButtonElement>('questsBtn');
  const dailyBtn = requireEl<HTMLButtonElement>('dailyBtn');
  const chaptersBtn = requireEl<HTMLButtonElement>('chaptersBtn');
  const settingsBtn = requireEl<HTMLButtonElement>('settingsBtn');
  const shopBtn = requireEl<HTMLButtonElement>('shopBtn');
  const boosterExtraTime = requireEl<HTMLButtonElement>('boosterExtraTimeBtn');
  const boosterColorSort = requireEl<HTMLButtonElement>('boosterColorSortBtn');
  const boosterRevealHint = requireEl<HTMLButtonElement>('boosterRevealHintBtn');
  const boosterUndo = requireEl<HTMLButtonElement>('boosterUndoBtn');

  let winInFlight = false;
  let loseInFlight: FailureInfo | null = null;
  /**
   * Most-recent win result. Cached so that if the player opens a side menu
   * (Quests / Daily / Settings) from the win screen and then closes it, we
   * can restore the win overlay instead of stranding them on a finished
   * level with no overlay.
   */
  let lastWinResult: LevelResult | null = null;
  let lastChapter = -1;

  const game = new GameState({
    onChange: () => {
      updateHud(game);
      renderBoard(svgEl, game, renderCallbacks);
      if (game.chapter !== lastChapter) {
        applyTheme(themeForChapter(game.chapter));
        lastChapter = game.chapter;
        const themesOwned = loadSave().inventory.themes.length;
        const fired = recordAchievement({ kind: 'theme-discovered', total: themesOwned });
        fired.forEach(toastAchievement);
      }
    },
    onRemoveBlocked: (_id, reason) => {
      if (reason === 'animating' || reason === 'finished') return;
      if (reason === 'bucket-full') {
        audio.bucketFull();
        // Differentiate "no matching colour slot" from "tray fully claimed".
        const allClaimed = game.bucketSlots.every((s) => s.color !== null);
        showToast(allClaimed
          ? '🪣 Bucket full — clear a slot first!'
          : '🎨 No matching slot for that colour');
      } else if (reason === 'locked-needs-key') {
        audio.blocked();
        showToast('🔑 Find the matching key first');
      } else if (reason === 'chain-blocked') {
        audio.blocked();
        showToast('⛓️ Chain needs all members reachable');
      } else if (reason === 'frozen-needs-thaw') {
        audio.blocked();
        showToast('❄️ Crack the ice first');
      } else {
        audio.blocked();
        showToast('🔒 Plate above is blocking it');
      }
      shake(stage);
    },
    onScrewToBucket: (contexts, resolve) => {
      const effects = ensureEffectsLayer(svgEl);
      const items = contexts.map((ctx) => {
        const screw = game.level.screws.find((s) => s.id === ctx.screwId);
        const fallback = { id: ctx.screwId, holeId: '', color: 'red' as const, type: 'standard' as const };
        const sourceScrew = screw ?? fallback;
        // Spark at source
        const c = colorDef(sourceScrew.color);
        sparkBurst(effects, ctx.fromHole.x, ctx.fromHole.y, c.shine, { count: 8 });
        return { screw: sourceScrew, from: ctx.fromHole, slotIndex: ctx.slotIndex };
      });
      animateScrewsToBucket(effects, items, game.bucketSlots.length, () => {
        resolve();
        for (const ctx of contexts) {
          const screw = items.find((i) => i.screw.id === ctx.screwId);
          if (!screw) continue;
          const center = bucketCenter(game.bucketSlots.length, ctx.slotIndex);
          const c = colorDef(screw.screw.color);
          sparkBurst(ensureEffectsLayer(svgEl), center.x, center.y, c.shine,
            { count: 6, speed: 90, duration: 460 });
        }
        pulseTap();
      });
    },
    onFrozenCracked: (screwId, hole) => {
      audio.bucketFull(); // ice-crack-ish sound
      iceCrackBurst(ensureEffectsLayer(svgEl), hole.x, hole.y);
      pulseTap();
      void screwId;
    },
    onLockGroupOpened: (_group, lockedIds) => {
      audio.slotClear();
      const effects = ensureEffectsLayer(svgEl);
      for (const id of lockedIds) {
        const screw = game.level.screws.find((s) => s.id === id);
        if (!screw) continue;
        const hole = game.holeById(screw.holeId);
        if (!hole) continue;
        sparkBurst(effects, hole.x, hole.y, '#ffd54b', { count: 14, speed: 140 });
      }
      showToast('Unlocked!');
    },
    onPlatesFalling: (_ids, onFinish) => {
      audio.plateDrop();
      const effects = ensureEffectsLayer(svgEl);
      for (const p of game.level.plates) {
        if (p.status === 'falling') dustPuff(effects, p.x, p.y + p.h / 2);
      }
      window.setTimeout(onFinish, 760);
    },
    onScrewPopped: (combo, _color) => {
      audio.screwPop(combo);
      updateSave((s) => { s.stats.screwsPopped += 1; });
      if (combo >= 3) {
        floatingText(ensureEffectsLayer(svgEl), 300, 380, `×${combo}!`, '#fff5b0');
      }
      recordAchievement({ kind: 'combo', combo }).forEach(toastAchievement);
      recordQuestEvent({ kind: 'pop-screws', n: 1 });
      recordQuestEvent({ kind: 'combo', combo });
    },
    onSlotCleared: (slotIndex, color, coins, combo) => {
      audio.slotClear();
      pulseClear();
      const effects = ensureEffectsLayer(svgEl);
      const c = colorDef(color);
      const center = bucketCenter(game.bucketSlots.length, slotIndex);
      slotClearFlash(effects, slotIndex, game.bucketSlots.length, color);
      celebrationBurst(effects, center.x, center.y, c.fill);
      floatingText(effects, center.x, center.y - 30, `+${coins}`, '#fff5b0');
      audio.coin();
      if (combo >= 2) floatingText(effects, center.x, center.y - 56, `×${combo} combo`, '#ffe0a8');
    },
    onBucketSorted: () => {
      audio.click();
      bucketSortFlash(ensureEffectsLayer(svgEl), game.bucketSlots.length);
      showToast('Bucket sorted!');
    },
    onHintRevealed: (screwId) => {
      if (!screwId) showToast('No safe moves — try a booster');
    },
    onTimeAdded: (seconds) => {
      showToast(`+${seconds} seconds`);
      floatingText(ensureEffectsLayer(svgEl), 300, 240, `+${seconds}s`, '#aff5b0');
    },
    onWin: (result) => onLevelWin(result),
    onLose: (info) => onLevelLose(info),
  });

  const renderCallbacks = {
    onScrewTap: (id: string) => {
      audio.click();
      game.tapScrew(id);
      maybeShowTypeIntro(id);
    },
  };

  bindBoard(svgEl);
  setOverlayHandler(handleOverlayAction);

  // Toolbar wiring.
  restartBtn.addEventListener('click', () => {
    audio.click();
    // If a win/lose/menu overlay is open, dismiss it first so the player isn't
    // left staring at the old result while the new run is already underway.
    if (isOverlayOpen()) hideOverlay();
    loseInFlight = null;
    game.restart();
    gameplayStart();
  });
  questsBtn.addEventListener('click', () => { audio.click(); game.pauseTimer(); showOverlay(questsOverlayHtml()); });
  dailyBtn.addEventListener('click', openDailyChest);
  chaptersBtn.addEventListener('click', () => { audio.click(); game.pauseTimer(); showOverlay(chapterOverlayHtml()); });
  settingsBtn.addEventListener('click', () => { audio.click(); game.pauseTimer(); showOverlay(settingsOverlayHtml()); });
  shopBtn.addEventListener('click', () => { audio.click(); game.pauseTimer(); showOverlay(shopOverlayHtml()); });

  // Booster button wiring (in-game use).
  boosterExtraTime.addEventListener('click', () => useBooster('extraTime'));
  boosterColorSort.addEventListener('click', () => useBooster('colorSort'));
  boosterRevealHint.addEventListener('click', () => useBooster('revealHint'));
  boosterUndo.addEventListener('click', () => useBooster('undo'));

  // Visibility / unload.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.pauseTimer();
      audio.stopMusic();
      flushSave();
    } else {
      game.resumeTimer();
      audio.startMusic();
    }
  });
  window.addEventListener('beforeunload', flushSave);

  // First user gesture unlocks audio.
  const unlock = (): void => {
    audio.unlock();
    audio.startMusic();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  // Debug mode.
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    Object.assign(window, {
      _save: loadSave,
      _give: (n: number) => { awardCoins(n); updateHud(game); },
      _grantBooster: (id: BoosterId, n = 5) => { grantBooster(id, n); updateHud(game); },
      _reset: () => {
        try { window.localStorage.clear(); } catch { /* ignore */ }
        window.location.reload();
      },
      _jump: (chapter: number, level: number) => game.loadLevel(chapter, level),
    });
    showToast('Debug: _give(n) _grantBooster(id,n) _reset() _jump(c,l)');
  }

  // Boot sequence:
  // 1. Pick resume level.
  const initial = pickResumeLevel();
  resyncCoins();
  game.loadLevel(initial.chapter, initial.level);
  lastChapter = initial.chapter;

  // 2. Show onboarding (first launch only).
  const save = loadSave();
  if (!save.onboarding.finishedIntro) {
    window.setTimeout(() => {
      game.pauseTimer();
      showOverlay(tutorialStepHtml(0));
    }, 450);
    return; // skip the rest of the boot popups until tutorial finishes
  }

  // 3. Welcome-back bonus.
  const welcome = welcomeBackReward();
  let welcomeShown = false;
  if (welcome) {
    welcomeShown = true;
    window.setTimeout(() => {
      game.pauseTimer();
      const boosterName = BOOSTER_BY_ID[welcome.booster.id]?.name ?? 'Booster';
      showOverlay(welcomeBackHtml(welcome.coins, boosterName, welcome.gapHours));
      resyncCoins();
      updateHud(game);
    }, 350);
  }

  // 4. Daily chest (after welcome-back closes).
  const dailyDelay = welcomeShown ? 3500 : 600;
  const status = dailyStatus();
  if (status.claimable) {
    window.setTimeout(() => {
      if (isOverlayOpen()) return;
      openDailyChest();
    }, dailyDelay);
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  function handleOverlayAction(action: OverlayAction): void {
    audio.click();
    switch (action.type) {
      case 'restart':
        hideOverlay();
        loseInFlight = null;
        lastWinResult = null;
        game.restart();
        gameplayStart();
        break;
      case 'next': {
        hideOverlay();
        lastWinResult = null;
        const adv = nextLevel(game.chapter, game.levelIdx);
        if (adv) {
          game.loadLevel(adv.chapter, adv.level);
          gameplayStart();
          happytime();
        }
        break;
      }
      case 'close':
        hideOverlay();
        // If the player closed a side menu while a level is already finished,
        // re-surface the win / lose overlay so they aren't stranded with no
        // way to progress (Replay / Next / Levels are only reachable there).
        if (game.completed && lastWinResult) {
          showOverlay(winOverlayHtml(lastWinResult));
        } else if (game.lost && loseInFlight) {
          showOverlay(loseOverlayHtml(loseInFlight.reason, loseInFlight.progress));
        } else if (!game.completed && !game.lost) {
          game.resumeTimer();
          gameplayStart();
        }
        break;
      case 'open-chapters':     showOverlay(chapterOverlayHtml());     break;
      case 'open-settings':     showOverlay(settingsOverlayHtml());    break;
      case 'open-quests':       showOverlay(questsOverlayHtml());      break;
      case 'open-achievements': showOverlay(achievementsOverlayHtml()); break;
      case 'open-stats':        showOverlay(statsOverlayHtml());       break;
      case 'open-shop':         showOverlay(shopOverlayHtml());        break;
      case 'chapter-select':
        hideOverlay();
        loseInFlight = null;
        lastWinResult = null;
        game.loadLevel(action.chapter, action.level);
        gameplayStart();
        break;
      case 'continue-with-ad':  attemptContinueWithAd(); break;
      case 'decline-continue':
        if (loseInFlight) showOverlay(loseOverlayHtml(loseInFlight.reason, loseInFlight.progress));
        else hideOverlay();
        break;
      case 'claim-daily': {
        const reward = claimDaily();
        if (reward) {
          audio.win();
          const fresh = loadSave();
          resyncCoins();
          updateHud(game);
          showOverlay(dailyClaimedHtml(reward.coins, reward.day, fresh.daily.streakDay));
          recordAchievement({ kind: 'streak', day: fresh.daily.streakDay }).forEach(toastAchievement);
        }
        break;
      }
      case 'claim-quest': {
        const claimed = claimQuest(action.id);
        if (claimed) {
          audio.coin();
          resyncCoins();
          updateHud(game);
          showOverlay(questsOverlayHtml());
        }
        break;
      }
      case 'claim-achievement': {
        const reward = claimAchievement(action.id);
        if (reward) {
          audio.coin();
          resyncCoins();
          updateHud(game);
          showOverlay(achievementsOverlayHtml());
        }
        break;
      }
      case 'buy-booster': {
        if (buyBooster(action.booster, 1)) {
          audio.coin();
          resyncCoins();
          updateHud(game);
          showToast(`+1 ${BOOSTER_BY_ID[action.booster].name}`);
          showOverlay(shopOverlayHtml());
        } else {
          audio.blocked();
          showToast("Not enough coins");
        }
        break;
      }
      case 'ad-for-booster': {
        const booster = action.booster;
        void requestRewardedAd().then((res) => {
          updateSave((s) => { s.stats.adsWatched += 1; });
          if (res.ok) {
            grantBooster(booster, 1);
            updateHud(game);
            showToast(`+1 ${BOOSTER_BY_ID[booster].name}`);
            showOverlay(shopOverlayHtml());
            recordAchievement({ kind: 'ad-watched' }).forEach(toastAchievement);
          } else {
            grantBooster(booster, 1);
            updateHud(game);
            showOverlay(shopOverlayHtml());
            showToast("Ad couldn't load — gave you one anyway!");
          }
        });
        break;
      }
      case 'setting-toggle':
        toggleSetting(action.key);
        if (action.key === 'music') {
          if (loadSave().settings.music) audio.startMusic();
          else audio.stopMusic();
        }
        showOverlay(settingsOverlayHtml());
        break;
      case 'tutorial-step':
        showOverlay(tutorialStepHtml(action.step));
        break;
      case 'tutorial-complete':
        updateSave((s) => { s.onboarding.finishedIntro = true; });
        hideOverlay();
        game.resumeTimer();
        gameplayStart();
        // Check daily login after tutorial finishes too.
        if (dailyStatus().claimable) {
          window.setTimeout(openDailyChest, 700);
        }
        break;
      case 'screw-type-intro-ack':
        updateSave((s) => {
          // 'key' and 'locked' share a single intro card — mark both seen at once.
          const related: ScrewType[] = (action.introType === 'key' || action.introType === 'locked')
            ? ['key', 'locked']
            : [action.introType];
          for (const t of related) {
            if (!s.onboarding.seenScrewTypes.includes(t)) {
              s.onboarding.seenScrewTypes.push(t);
            }
          }
        });
        hideOverlay();
        game.resumeTimer();
        gameplayStart();
        break;
    }
  }

  function useBooster(id: BoosterId): void {
    if (game.animating || game.completed || game.lost) return;
    if (!consumeBooster(id)) {
      audio.blocked();
      showToast(`Out of ${BOOSTER_BY_ID[id].name}`);
      return;
    }
    audio.click();
    switch (id) {
      case 'extraTime':  game.addTime(30); break;
      case 'colorSort':  game.colorSortBucket(); break;
      case 'revealHint': game.revealHint(); break;
      case 'undo':       game.restoreUndo(); break;
    }
    updateHud(game);
    recordQuestEvent({ kind: 'use-booster' });
    recordAchievement({ kind: 'booster-used' }).forEach(toastAchievement);
  }

  function maybeShowTypeIntro(_screwId: string): void {
    const intros = game.level.introTypes;
    if (intros.length === 0) return;
    const save = loadSave();
    for (const t of intros) {
      const seen = save.onboarding.seenScrewTypes.includes(t);
      if (!seen) {
        game.pauseTimer();
        gameplayStop();
        showOverlay(screwTypeIntroHtml(t));
        return;
      }
    }
  }

  function onLevelWin(result: LevelResult): void {
    if (winInFlight) return;
    winInFlight = true;
    loseInFlight = null;
    lastWinResult = result;

    audio.win();
    pulseWin();
    gameplayStop();
    confettiBurst(ensureEffectsLayer(svgEl));

    persistWin(result);
    awardCoins(result.coinsEarned);
    updateSave((s) => { s.stats.coinsEarnedLifetime += result.coinsEarned; });
    const efficiencyXp =
      (result.perfectSolve ? 15 : 0) +
      (result.noWastedMoves ? 10 : 0);
    const rankGain = awardXp(20 + result.stars * 15 + efficiencyXp);
    if (rankGain > 0) {
      const xp = xpProgress();
      enqueueAchievementToast({
        icon: '⬆️', title: `Rank ${xp.rank}!`,
        subtitle: rankGain > 1 ? `Up ${rankGain} ranks` : 'Up one rank',
      });
      recordAchievement({ kind: 'rank', rank: xp.rank }).forEach(toastAchievement);
    }

    recordAchievement({ kind: 'level-cleared', stars: result.stars }).forEach(toastAchievement);
    recordAchievement({ kind: 'coins-earned-total', total: loadSave().stats.coinsEarnedLifetime }).forEach(toastAchievement);
    recordQuestEvent({ kind: 'level-cleared', stars: result.stars, failed: game.failedThisRun });

    updateHud(game);

    // Brief delay so confetti / win sound land before the modal interrupts them.
    // The overlay stays open until the player presses Next / Replay; do not
    // auto-advance, or the player never gets to read their reward.
    window.setTimeout(() => {
      showOverlay(winOverlayHtml(result));
      winInFlight = false;
    }, WIN_OVERLAY_DELAY_MS);
  }

  function onLevelLose(info: FailureInfo): void {
    audio.fail();
    pulseFail();
    shake(stage);
    gameplayStop();
    loseInFlight = info;
    if (eligibleForNearMiss(info.progress)) {
      showOverlay(nearMissOverlayHtml(info.progress, NEAR_MISS_SECONDS));
    } else {
      showOverlay(loseOverlayHtml(info.reason, info.progress));
    }
    recordQuestEvent({ kind: 'level-cleared', stars: 0, failed: true });
  }

  function attemptContinueWithAd(): void {
    if (!loseInFlight) return;
    void requestRewardedAd().then((res) => {
      updateSave((s) => { s.stats.adsWatched += 1; });
      recordAchievement({ kind: 'ad-watched' }).forEach(toastAchievement);
      if (res.ok) {
        updateSave((s) => { s.stats.nearMissContinues += 1; });
        hideOverlay();
        game.grantContinue(NEAR_MISS_SECONDS);
        gameplayStart();
        loseInFlight = null;
      } else {
        hideOverlay();
        game.grantContinue(Math.floor(NEAR_MISS_SECONDS / 2));
        gameplayStart();
        showToast("Couldn't load the ad — here's half the bonus on us!");
        loseInFlight = null;
      }
    });
  }

  function persistWin(result: LevelResult): void {
    updateSave((s) => {
      const existing = s.progress.levelStars[result.id] ?? 0;
      if (result.stars > existing) s.progress.levelStars[result.id] = result.stars;
      const wasFrontier =
        result.chapter === s.progress.chapterMax &&
        result.level === s.progress.levelInChapterMax;
      if (wasFrontier) {
        if (result.level < LEVELS_PER_CHAPTER) {
          s.progress.levelInChapterMax = result.level + 1;
        } else if (result.chapter < TOTAL_CHAPTERS) {
          s.progress.chapterMax = result.chapter + 1;
          s.progress.levelInChapterMax = 1;
        }
      }
      s.stats.levelsCleared += 1;
      if (result.stars === 3) s.stats.threeStars += 1;
      if (result.maxCombo > s.stats.maxCombo) s.stats.maxCombo = result.maxCombo;
    });
  }

  function pickResumeLevel(): { chapter: number; level: number } {
    const save = loadSave();
    let chapter = Math.min(Math.max(save.progress.chapterMax, 1), TOTAL_CHAPTERS);
    let level = Math.min(Math.max(save.progress.levelInChapterMax, 1), LEVELS_PER_CHAPTER);
    try { getLevel(chapter, level); } catch { chapter = 1; level = 1; }
    return { chapter, level };
  }

  function openDailyChest(): void {
    // Either branch shows the chest overlay — pause and click in one place so
    // the timer doesn't keep ticking just because today's reward was already
    // claimed.
    game.pauseTimer();
    audio.click();
    showOverlay(dailyChestHtml(dailyStatus()));
  }

  function toastAchievement(def: AchievementDef): void {
    enqueueAchievementToast({
      icon: def.icon,
      title: def.name,
      subtitle: `${def.description} — claim +${def.reward} 🪙`,
    });
  }

  /** Prefetch the active quests so they roll on first day. */
  activeQuests();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
