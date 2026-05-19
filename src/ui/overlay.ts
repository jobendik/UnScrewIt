/**
 * Modal overlay surface. Renders cards over the play area for win, lose,
 * daily-chest, near-miss continue, settings, and chapter selection.
 *
 * Buttons inside a card carry `data-action="…"`; a single delegated
 * listener dispatches to the registered handler.
 */

import { fmtTime, requireEl } from '@/core/utils';
import { loadSave, update } from '@/core/save';
import { DAILY_REWARDS } from '@/retention/dailyLogin';
import type { DailyStatus } from '@/retention/dailyLogin';
import type { LevelResult } from '@/game/state';
import { LEVELS_PER_CHAPTER, TOTAL_CHAPTERS } from '@/game/levels';

export type OverlayAction =
  | { type: 'restart' }
  | { type: 'next' }
  | { type: 'close' }
  | { type: 'chapter-select'; chapter: number; level: number }
  | { type: 'open-chapters' }
  | { type: 'open-settings' }
  | { type: 'continue-with-ad' }
  | { type: 'decline-continue' }
  | { type: 'claim-daily' }
  | { type: 'setting-toggle'; key: 'sound' | 'music' | 'haptics' };

let cachedOverlay: HTMLElement | null = null;
let cachedCard: HTMLElement | null = null;
let handler: ((a: OverlayAction) => void) | null = null;

function ensureBindings(): { overlay: HTMLElement; card: HTMLElement } {
  if (!cachedOverlay) cachedOverlay = requireEl('overlay');
  if (!cachedCard) cachedCard = requireEl('overlayCard');
  if (!cachedOverlay.dataset.bound) {
    cachedOverlay.dataset.bound = '1';
    cachedOverlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest<HTMLButtonElement>('button[data-action]');
      if (!btn || !handler) return;
      const action = btn.dataset.action ?? '';
      switch (action) {
        case 'restart': return handler({ type: 'restart' });
        case 'next':    return handler({ type: 'next' });
        case 'close':   return handler({ type: 'close' });
        case 'chapter-select': {
          const chapter = Number(btn.dataset.chapter ?? 1);
          const level = Number(btn.dataset.level ?? 1);
          return handler({ type: 'chapter-select', chapter, level });
        }
        case 'open-chapters': return handler({ type: 'open-chapters' });
        case 'open-settings': return handler({ type: 'open-settings' });
        case 'continue-with-ad': return handler({ type: 'continue-with-ad' });
        case 'decline-continue': return handler({ type: 'decline-continue' });
        case 'claim-daily': return handler({ type: 'claim-daily' });
        case 'toggle-sound':   return handler({ type: 'setting-toggle', key: 'sound' });
        case 'toggle-music':   return handler({ type: 'setting-toggle', key: 'music' });
        case 'toggle-haptics': return handler({ type: 'setting-toggle', key: 'haptics' });
        default: return;
      }
    });
  }
  return { overlay: cachedOverlay, card: cachedCard };
}

export function showOverlay(html: string, opts: { padded?: boolean } = {}): void {
  const { overlay, card } = ensureBindings();
  card.innerHTML = html;
  card.classList.toggle('card--padded', opts.padded !== false);
  overlay.classList.add('show');
}

export function hideOverlay(): void {
  const { overlay } = ensureBindings();
  overlay.classList.remove('show');
}

export function isOverlayOpen(): boolean {
  const { overlay } = ensureBindings();
  return overlay.classList.contains('show');
}

export function setOverlayHandler(fn: (a: OverlayAction) => void): void {
  ensureBindings();
  handler = fn;
}

// ── Prebuilt overlay bodies ─────────────────────────────────────────────────

export function winOverlayHtml(result: LevelResult): string {
  const stars = `${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}`;
  const next = result.isFinal
    ? `<button class="primary-btn" data-action="open-chapters">Levels</button>`
    : `<button class="primary-btn" data-action="next">Next Level →</button>`;
  return `
    <h1>Level Clear!</h1>
    <div class="stars">${stars}</div>
    <p class="big-coins">+${result.coinsEarned} <span class="coin-icon">🪙</span></p>
    <div class="kv-row">
      <div><span class="kv-label">Time</span><b>${fmtTime(result.timeLeft)}</b></div>
      <div><span class="kv-label">Best combo</span><b>×${result.maxCombo}</b></div>
    </div>
    <div class="card-actions">
      <button class="secondary-btn" data-action="restart">Replay</button>
      ${next}
    </div>
  `;
}

export function loseOverlayHtml(reason: string, progress: number): string {
  const pct = Math.round(progress * 100);
  return `
    <h1>Out of Time!</h1>
    <p>${reason}</p>
    <p class="big-coins">${pct}% complete</p>
    <div class="card-actions">
      <button class="secondary-btn" data-action="open-chapters">Levels</button>
      <button class="primary-btn" data-action="restart">Try Again</button>
    </div>
  `;
}

export function nearMissOverlayHtml(progress: number, secondsToAdd: number): string {
  const pct = Math.round(progress * 100);
  return `
    <h1>So Close!</h1>
    <p>You were <b>${pct}%</b> there.</p>
    <p class="big-coins">Get <b>+${secondsToAdd}s</b> to finish?</p>
    <div class="card-actions">
      <button class="secondary-btn" data-action="decline-continue">No thanks</button>
      <button class="primary-btn primary-btn--ad" data-action="continue-with-ad">
        <span>▶ Watch Ad</span>
        <span class="ad-sub">+${secondsToAdd}s</span>
      </button>
    </div>
  `;
}

export function dailyChestHtml(status: DailyStatus): string {
  const dots = DAILY_REWARDS.map((reward, i) => {
    const isCurrent = i + 1 === status.day;
    const isClaimed = i + 1 < status.day || (i + 1 === status.day && !status.claimable);
    const cls = ['day-dot'];
    if (isCurrent && status.claimable) cls.push('day-dot--current');
    if (isClaimed) cls.push('day-dot--claimed');
    if (reward.badge === 'jackpot') cls.push('day-dot--jackpot');
    return `
      <div class="${cls.join(' ')}">
        <span class="day-label">Day ${reward.day}</span>
        <span class="day-coins">+${reward.coins}</span>
        <span class="day-check">${isClaimed ? '✓' : ''}</span>
      </div>
    `;
  }).join('');

  const action = status.claimable
    ? `<button class="primary-btn primary-btn--big" data-action="claim-daily">Open Day ${status.day}</button>`
    : `<button class="secondary-btn" data-action="close">Come back tomorrow</button>`;

  const note = status.resetThisVisit
    ? `<p class="streak-note">Streak reset — let's build it back up! 💪</p>`
    : status.claimable
      ? `<p class="streak-note">Tap to open today's reward!</p>`
      : `<p class="streak-note">Next reward unlocks tomorrow.</p>`;

  return `
    <h1>Daily Streak</h1>
    ${note}
    <div class="day-grid">${dots}</div>
    <div class="card-actions single">${action}</div>
  `;
}

export function dailyClaimedHtml(coins: number, day: number, streak: number): string {
  return `
    <h1>+${coins} 🪙</h1>
    <p class="streak-bigtext">Day ${day} reward unlocked!</p>
    <p>Current streak: <b>${streak} ${streak === 1 ? 'day' : 'days'}</b> 🔥</p>
    <div class="card-actions single">
      <button class="primary-btn" data-action="close">Let's Play!</button>
    </div>
  `;
}

export function chapterOverlayHtml(): string {
  const save = loadSave();
  const rows: string[] = [];
  for (let c = 1; c <= TOTAL_CHAPTERS; c++) {
    const unlocked = c <= save.progress.chapterMax;
    const stars = countChapterStars(save.progress.levelStars, c);
    const heading = unlocked ? `Chapter ${c}` : `🔒 Chapter ${c}`;
    rows.push(`
      <div class="chapter-row">
        <div class="chapter-meta">
          <div class="chapter-title">${heading}</div>
          <div class="chapter-stars">${stars}/${LEVELS_PER_CHAPTER * 3} ★</div>
        </div>
        <div class="chapter-levels">
          ${chapterLevelButtons(c, save, unlocked)}
        </div>
      </div>
    `);
  }
  return `
    <h1>Chapters</h1>
    <div class="chapter-list">${rows.join('')}</div>
    <div class="card-actions single">
      <button class="secondary-btn" data-action="close">Close</button>
    </div>
  `;
}

function chapterLevelButtons(chapter: number, save: ReturnType<typeof loadSave>, unlocked: boolean): string {
  const items: string[] = [];
  const chapterMax = save.progress.chapterMax;
  const inChapter = chapter < chapterMax
    ? LEVELS_PER_CHAPTER
    : save.progress.levelInChapterMax;
  for (let l = 1; l <= LEVELS_PER_CHAPTER; l++) {
    const id = `${chapter}.${l}`;
    const stars = save.progress.levelStars[id] ?? 0;
    const isOpen = unlocked && l <= inChapter;
    const display = isOpen ? `${stars > 0 ? '★'.repeat(stars) : l}` : '🔒';
    items.push(`
      <button class="level-pip ${isOpen ? '' : 'level-pip--locked'}"
              data-action="chapter-select"
              data-chapter="${chapter}"
              data-level="${l}"
              ${isOpen ? '' : 'disabled'}>${display}</button>
    `);
  }
  return items.join('');
}

function countChapterStars(table: Record<string, number>, chapter: number): number {
  let total = 0;
  for (let l = 1; l <= LEVELS_PER_CHAPTER; l++) {
    total += table[`${chapter}.${l}`] ?? 0;
  }
  return total;
}

export function settingsOverlayHtml(): string {
  const s = loadSave().settings;
  const toggle = (label: string, key: 'sound' | 'music' | 'haptics', on: boolean) => `
    <button class="settings-toggle ${on ? 'settings-toggle--on' : ''}"
            data-action="toggle-${key}">
      <span>${label}</span>
      <span class="settings-pill">${on ? 'ON' : 'OFF'}</span>
    </button>
  `;
  return `
    <h1>Settings</h1>
    <div class="settings-list">
      ${toggle('Sound effects', 'sound', s.sound)}
      ${toggle('Background music', 'music', s.music)}
      ${toggle('Haptic feedback', 'haptics', s.haptics)}
    </div>
    <p class="credits">Made by Jo Bendik</p>
    <div class="card-actions single">
      <button class="primary-btn" data-action="close">Done</button>
    </div>
  `;
}

/** Mutate a setting flag in the save. */
export function toggleSetting(key: 'sound' | 'music' | 'haptics'): void {
  update((s) => {
    s.settings[key] = !s.settings[key];
  });
}
