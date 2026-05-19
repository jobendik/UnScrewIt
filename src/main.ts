/**
 * Bootstrap: build the runtime DOM shell, wire the bucket-color GameState
 * to the renderer, ad SDK, currency, daily-login, and overlays. Load a
 * resume-or-fresh level once everything is ready.
 *
 * For now the "scenes" are just modal overlays on top of one play area.
 * A dedicated scene router will arrive when the chapter map gets its own
 * visual treatment.
 */

import './styles/index.css';

import { audio } from './core/audio';
import { pulseClear, pulseFail, pulseTap, pulseWin } from './core/haptics';
import { loadSave, flush as flushSave, update as updateSave } from './core/save';
import { requireEl, reflow } from './core/utils';
import { awardCoins, awardXp } from './economy/currency';
import { getLevel, LEVELS_PER_CHAPTER, nextLevel, TOTAL_CHAPTERS } from './game/levels';
import { GameState } from './game/state';
import type { FailureInfo, LevelResult } from './game/state';
import { eligibleForNearMiss } from './platform/ads';
import { init as initPlatform, requestRewardedAd, gameplayStart, gameplayStop, happytime } from './platform/crazygames';
import { claimDaily, dailyStatus } from './retention/dailyLogin';
import { animateScrewToBucket, confettiBurst, slotClearFlash } from './render/animations';
import { bindBoard, ensureEffectsLayer, renderBoard } from './render/board';
import { bucketCenter } from './render/bucket';
import { celebrationBurst, dustPuff, floatingText, sparkBurst } from './render/particles';
import { resyncCoins, updateHud } from './ui/hud';
import {
  chapterOverlayHtml,
  dailyChestHtml,
  dailyClaimedHtml,
  hideOverlay,
  loseOverlayHtml,
  nearMissOverlayHtml,
  settingsOverlayHtml,
  setOverlayHandler,
  showOverlay,
  toggleSetting,
  winOverlayHtml,
} from './ui/overlay';
import type { OverlayAction } from './ui/overlay';
import { showToast } from './ui/toast';
import { colorDef } from './game/colors';

const NEAR_MISS_SECONDS = 30;
const POST_WIN_AUTOADVANCE_MS = 2200;

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
          <span class="streak-badge" id="streakBadge">🔥 0</span>
        </section>

        <section id="boardStage" class="board-stage">
          <svg id="boardSvg" viewBox="0 0 600 900" role="img" aria-label="Puzzle board"></svg>
        </section>

        <section class="bottom-bar" aria-label="Tools">
          <button id="restartBtn" class="tool-btn" type="button">
            <span class="tool-icon">⟳</span><span>Restart</span>
          </button>
          <button id="undoBtn" class="tool-btn" type="button">
            <span class="tool-icon">↶</span><span>Undo</span>
          </button>
          <button id="dailyBtn" class="tool-btn tool-btn--accent" type="button">
            <span class="tool-icon">🎁</span><span>Daily</span><span id="dailyIndicator" class="tool-dot"></span>
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
  // Kick off platform init in parallel — it doesn't block the boot.
  void initPlatform();

  buildShell();
  fadeOutBootSplash();

  const stage = requireEl<HTMLElement>('boardStage');
  const svgEl = requireEl<HTMLElement>('boardSvg') as unknown as SVGSVGElement;
  const restartBtn = requireEl<HTMLButtonElement>('restartBtn');
  const undoBtn = requireEl<HTMLButtonElement>('undoBtn');
  const dailyBtn = requireEl<HTMLButtonElement>('dailyBtn');
  const chaptersBtn = requireEl<HTMLButtonElement>('chaptersBtn');
  const settingsBtn = requireEl<HTMLButtonElement>('settingsBtn');
  const dailyIndicator = requireEl('dailyIndicator');

  let winInFlight = false;
  let loseInFlight: FailureInfo | null = null;

  const game = new GameState({
    onChange: () => {
      updateHud(game);
      renderBoard(svgEl, game, renderCallbacks);
    },
    onRemoveBlocked: (_id, reason) => {
      if (reason === 'animating' || reason === 'finished') return;
      if (reason === 'bucket-full') {
        audio.bucketFull();
        showToast('Clear a bucket slot first');
      } else {
        audio.blocked();
        showToast('Plate above blocks it');
      }
      shake(stage);
    },
    onScrewToBucket: (screwId, from, slotIndex, _outcome, resolve) => {
      const effects = ensureEffectsLayer(svgEl);
      const screw = game.level.screws.find((s) => s.id === screwId);
      if (!screw) return resolve();
      const c = colorDef(screw.color);
      sparkBurst(effects, from.x, from.y, c.shine, { count: 8 });
      animateScrewToBucket(effects, screw, from, slotIndex, game.bucketSlots.length, () => {
        resolve();
        // Land effect at the bucket slot.
        const center = bucketCenter(game.bucketSlots.length, slotIndex);
        sparkBurst(ensureEffectsLayer(svgEl), center.x, center.y, c.shine, { count: 6, speed: 90, duration: 460 });
        pulseTap();
      });
    },
    onPlatesFalling: (_ids, onFinish) => {
      audio.plateDrop();
      const effects = ensureEffectsLayer(svgEl);
      for (const p of game.level.plates) {
        if (p.status === 'falling') dustPuff(effects, p.x, p.y + p.h / 2);
      }
      window.setTimeout(onFinish, 760);
    },
    onScrewPopped: (combo) => {
      audio.screwPop(combo);
      if (combo >= 3) {
        // Big combo floater near the center.
        floatingText(ensureEffectsLayer(svgEl), 300, 380, `×${combo}!`, '#fff5b0');
      }
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
    onWin: (result) => onLevelWin(result),
    onLose: (info) => onLevelLose(info),
  });

  const renderCallbacks = {
    onScrewTap: (id: string) => {
      audio.click();
      game.tapScrew(id);
    },
  };

  bindBoard(svgEl);

  setOverlayHandler((action) => handleOverlayAction(action));

  // Toolbar wiring.
  restartBtn.addEventListener('click', () => {
    audio.click();
    game.restart();
  });
  undoBtn.addEventListener('click', () => {
    if (game.restoreUndo()) {
      audio.click();
      showToast('Undo');
    }
  });
  dailyBtn.addEventListener('click', () => openDailyChest());
  chaptersBtn.addEventListener('click', () => {
    audio.click();
    game.pauseTimer();
    showOverlay(chapterOverlayHtml());
  });
  settingsBtn.addEventListener('click', () => {
    audio.click();
    game.pauseTimer();
    showOverlay(settingsOverlayHtml());
  });

  // Pause on tab hide; save state defensively.
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

  // First-time audio unlock.
  const unlock = (): void => {
    audio.unlock();
    audio.startMusic();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  // Debug shortcuts (only with ?debug=1).
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    Object.assign(window, {
      _save: loadSave,
      _give: (n: number) => { awardCoins(n); updateHud(game); },
      _reset: () => {
        updateSave((s) => {
          s.player.coins = 0;
          s.player.xp = 0;
          s.player.rank = 1;
          s.progress.levelStars = {};
          s.progress.chapterMax = 1;
          s.progress.levelInChapterMax = 1;
          s.daily.streakDay = 0;
          s.daily.lastClaimUtcDay = null;
        });
        resyncCoins();
        game.loadLevel(1, 1);
      },
      _jump: (chapter: number, level: number) => game.loadLevel(chapter, level),
    });
    showToast('Debug: window._give(1000), _reset(), _jump(c,l)');
  }

  // Boot: check daily login first, then resume where the player left off.
  const initial = pickResumeLevel();
  resyncCoins();
  game.loadLevel(initial.chapter, initial.level);

  // After the level is loaded, show the daily-chest if claimable.
  const status = dailyStatus();
  refreshDailyIndicator();
  if (status.claimable) {
    window.setTimeout(() => openDailyChest(), 350);
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  function handleOverlayAction(action: OverlayAction): void {
    audio.click();
    switch (action.type) {
      case 'restart':
        hideOverlay();
        game.restart();
        gameplayStart();
        break;
      case 'next': {
        hideOverlay();
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
        if (!game.completed && !game.lost) {
          game.resumeTimer();
          gameplayStart();
        }
        break;
      case 'open-chapters':
        showOverlay(chapterOverlayHtml());
        break;
      case 'open-settings':
        showOverlay(settingsOverlayHtml());
        break;
      case 'chapter-select':
        hideOverlay();
        game.loadLevel(action.chapter, action.level);
        gameplayStart();
        break;
      case 'continue-with-ad':
        attemptContinueWithAd();
        break;
      case 'decline-continue':
        if (loseInFlight) {
          showOverlay(loseOverlayHtml(loseInFlight.reason, loseInFlight.progress));
        } else {
          hideOverlay();
        }
        break;
      case 'claim-daily': {
        const reward = claimDaily();
        if (reward) {
          audio.win();
          const save = loadSave();
          resyncCoins();
          updateHud(game);
          showOverlay(dailyClaimedHtml(reward.coins, reward.day, save.daily.streakDay));
        }
        refreshDailyIndicator();
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
    }
  }

  function onLevelWin(result: LevelResult): void {
    if (winInFlight) return;
    winInFlight = true;
    loseInFlight = null;

    audio.win();
    pulseWin();
    gameplayStop();
    confettiBurst(ensureEffectsLayer(svgEl));

    // Persist progression.
    persistWin(result);
    awardCoins(result.coinsEarned);
    awardXp(20 + result.stars * 15);

    updateHud(game);
    refreshDailyIndicator();

    // Auto-advance after a brief celebration unless the player taps to skip.
    window.setTimeout(() => {
      showOverlay(winOverlayHtml(result));
      winInFlight = false;
    }, 600);

    window.setTimeout(() => {
      // Auto-advance if the player hasn't tapped any button on the overlay.
      const overlayCard = document.getElementById('overlayCard');
      if (!overlayCard?.parentElement?.classList.contains('show')) return;
      if (!winInFlight) {
        const adv = nextLevel(result.chapter, result.level);
        if (adv && !result.isFinal) {
          hideOverlay();
          game.loadLevel(adv.chapter, adv.level);
          gameplayStart();
          happytime();
        }
      }
    }, POST_WIN_AUTOADVANCE_MS + 600);
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
  }

  function attemptContinueWithAd(): void {
    if (!loseInFlight) return;
    void requestRewardedAd().then((res) => {
      updateSave((s) => { s.stats.adsWatched += 1; });
      if (res.ok) {
        updateSave((s) => { s.stats.nearMissContinues += 1; });
        hideOverlay();
        game.grantContinue(NEAR_MISS_SECONDS);
        gameplayStart();
        loseInFlight = null;
      } else {
        // Ad failed — grant a smaller mercy bonus so the player isn't punished.
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
      // Campaign frontier.
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
    // Sanity check the generated level exists.
    try { getLevel(chapter, level); } catch { chapter = 1; level = 1; }
    return { chapter, level };
  }

  function refreshDailyIndicator(): void {
    const s = dailyStatus();
    dailyIndicator.style.display = s.claimable ? 'block' : 'none';
  }

  function openDailyChest(): void {
    game.pauseTimer();
    audio.click();
    showOverlay(dailyChestHtml(dailyStatus()));
  }

}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
