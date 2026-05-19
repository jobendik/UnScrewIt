/**
 * Bootstrap: build the runtime DOM shell, wire the GameState to the
 * renderer + UI, and load level 0.
 *
 * Subsequent passes will move scene management out of `main.ts` into a
 * `sceneRouter`, but for now the prototype's flat structure keeps the
 * wiring obvious.
 */

import './styles/index.css';

import { audio } from './core/audio';
import { Progress } from './core/storage';
import { requireEl, reflow } from './core/utils';
import { LEVELS } from './game/levels';
import { GameState } from './game/state';
import { animateScrewMove, confettiBurst } from './render/animations';
import { bindBoard, ensureEffectsLayer, renderBoard } from './render/board';
import { updateHud } from './ui/hud';
import {
  hideOverlay,
  levelsOverlayHtml,
  loseOverlayHtml,
  setOverlayHandler,
  showOverlay,
  winOverlayHtml,
} from './ui/overlay';
import { showToast } from './ui/toast';

/**
 * Build the runtime DOM tree. We render the shell from JS so that the
 * boot-splash markup baked into `index.html` can be removed once we're
 * ready to show the game.
 */
function buildShell(): void {
  const root = requireEl<HTMLElement>('root');
  root.innerHTML = `
    <div id="app">
      <main class="shell" aria-label="Unscrew It">
        <section class="hud-top">
          <div class="pill small">
            <span>⏱</span>
            <span><span class="subline">Time</span><span id="timeText">00:00</span></span>
          </div>
          <div class="pill level"><span id="levelText">Level 1</span></div>
          <div class="pill small">
            <span>🔩</span>
            <span><span class="subline">Moves</span><span id="movesText">0</span></span>
          </div>
        </section>

        <section id="boardStage" class="board-stage">
          <svg id="boardSvg" viewBox="0 0 600 900" role="img" aria-label="Puzzle board"></svg>
        </section>

        <section class="bottom-bar" aria-label="Tools">
          <button id="undoBtn" class="tool-btn" type="button">
            <span class="tool-icon">↶</span><span>Undo</span><span id="undoCount" class="tool-count">0</span>
          </button>
          <button id="hintBtn" class="tool-btn" type="button">
            <span class="tool-icon">💡</span><span>Hint</span><span id="hintCount" class="tool-count">3</span>
          </button>
          <button id="restartBtn" class="tool-btn" type="button">
            <span class="tool-icon">⟳</span><span>Restart</span><span class="tool-count">level</span>
          </button>
          <button id="levelsBtn" class="tool-btn" type="button">
            <span class="tool-icon">☰</span><span>Levels</span><span id="progressText" class="tool-count">1/${LEVELS.length}</span>
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
  buildShell();
  fadeOutBootSplash();

  const stage = requireEl<HTMLElement>('boardStage');
  const svg = requireEl<HTMLElement>('boardSvg') as unknown as SVGSVGElement;
  const undoBtn = requireEl<HTMLButtonElement>('undoBtn');
  const hintBtn = requireEl<HTMLButtonElement>('hintBtn');
  const restartBtn = requireEl<HTMLButtonElement>('restartBtn');
  const levelsBtn = requireEl<HTMLButtonElement>('levelsBtn');

  // Build the game state up front; load the first level once everything is wired.
  const game = new GameState({
    onChange: () => {
      updateHud(game);
      renderBoard(svg, game, renderCallbacks);
    },
    onPromptSelect: () => showToast('Tap a screw first'),
    onInvalidTarget: (reason) => {
      audio.bad();
      if (reason === 'occupied') showToast('That hole already has a screw');
      else if (reason === 'blocked') showToast('A plate blocks that hole');
      else showToast("Can't move there");
      shake(stage);
    },
    onScrewMove: (screwId, from, to, resolve) => {
      const effects = ensureEffectsLayer(svg);
      animateScrewMove(effects, screwId, from, to, () => {
        audio.place();
        resolve();
      });
    },
    onPlatesFalling: (_ids, onFinish) => {
      audio.drop();
      window.setTimeout(onFinish, 760);
    },
    onWin: (result) => {
      audio.win();
      const effects = ensureEffectsLayer(svg);
      confettiBurst(effects);
      const nextUnlock = Math.max(Progress.bestLevel, result.levelIndex + 1);
      Progress.bestLevel = Math.min(nextUnlock, LEVELS.length - 1);
      const existing = Progress.starsFor(result.levelIndex);
      Progress.recordStars(result.levelIndex, result.stars);
      Progress.totalStars = Math.max(
        Progress.totalStars,
        Progress.totalStars - existing + result.stars,
      );
      window.setTimeout(() => {
        showOverlay(
          winOverlayHtml({
            levelIndex: result.levelIndex,
            levelName: game.level.name,
            stars: result.stars,
            movesLeft: result.movesLeft,
            timeLeft: result.timeLeft,
            isFinal: result.isFinal,
          }),
        );
      }, 500);
    },
    onLose: (info) => {
      audio.bad();
      shake(stage);
      showOverlay(loseOverlayHtml(info.reason));
    },
    onHint: () => showToast('Try this screw and target hole'),
  });

  const renderCallbacks = {
    onHoleTap: (id: string) => {
      audio.click();
      game.tapHole(id);
    },
    onScrewTap: (id: string) => {
      audio.click();
      game.selectScrew(id);
    },
    onBoardTap: () => {
      if (game.selected && !game.animating) {
        game.clearSelection();
        updateHud(game);
        renderBoard(svg, game, renderCallbacks);
      }
    },
  };

  bindBoard(svg, renderCallbacks);

  setOverlayHandler((action) => {
    if (action.type === 'restart') game.restart();
    if (action.type === 'next') game.loadLevel(Math.min(game.levelIndex + 1, LEVELS.length - 1));
    if (action.type === 'close') hideOverlay();
    if (action.type === 'level') game.loadLevel(action.index);
    if (action.type !== 'close') hideOverlay();
  });

  // Toolbar wiring.
  undoBtn.addEventListener('click', () => {
    if (game.restoreUndo()) {
      audio.click();
      showToast('Undo');
    }
  });
  hintBtn.addEventListener('click', () => {
    const hint = game.requestHint();
    if (!hint) {
      audio.bad();
      showToast(game.hintsLeft <= 0 ? 'No hints left' : 'No safe move found — restart or undo');
    }
  });
  restartBtn.addEventListener('click', () => game.restart());
  levelsBtn.addEventListener('click', () => showOverlay(levelsOverlayHtml()));

  // Keyboard shortcuts (desktop convenience).
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r') game.restart();
    else if (k === 'h') hintBtn.click();
    else if ((e.ctrlKey || e.metaKey) && k === 'z') undoBtn.click();
    else if (e.key === 'Escape') {
      game.clearSelection();
      hideOverlay();
      updateHud(game);
      renderBoard(svg, game, renderCallbacks);
    }
  });

  // Pause the timer when the tab is hidden; resume when visible.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pauseTimer();
    else game.resumeTimer();
  });

  // First-time audio unlock on any user gesture.
  const unlock = (): void => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  game.loadLevel(0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
