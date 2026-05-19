/**
 * Modal overlay surface. Renders cards over the play area for win, lose,
 * daily-chest, near-miss continue, settings, chapter, achievements,
 * quests, stats, onboarding, and booster picker.
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
import { BOOSTERS, BOOSTER_BY_ID, countOf } from '@/economy/boosters';
import type { BoosterId } from '@/economy/boosters';
import { activeQuests } from '@/retention/dailyQuests';
import type { QuestState } from '@/retention/dailyQuests';
import { ACHIEVEMENTS, listProgress } from '@/retention/achievements';
import { THEMES } from '@/themes';
import { xpProgress } from '@/economy/currency';
import type { ScrewType } from '@/game/types';

export type OverlayAction =
  | { type: 'restart' }
  | { type: 'next' }
  | { type: 'close' }
  | { type: 'chapter-select'; chapter: number; level: number }
  | { type: 'open-chapters' }
  | { type: 'open-settings' }
  | { type: 'open-quests' }
  | { type: 'open-achievements' }
  | { type: 'open-stats' }
  | { type: 'open-shop' }
  | { type: 'continue-with-ad' }
  | { type: 'decline-continue' }
  | { type: 'claim-daily' }
  | { type: 'claim-quest'; id: string }
  | { type: 'claim-achievement'; id: string }
  | { type: 'buy-booster'; booster: BoosterId }
  | { type: 'ad-for-booster'; booster: BoosterId }
  | { type: 'setting-toggle'; key: 'sound' | 'music' | 'haptics' }
  | { type: 'tutorial-step'; step: number }
  | { type: 'tutorial-complete' }
  | { type: 'screw-type-intro-ack'; introType: ScrewType };

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
      const data = btn.dataset;
      switch (action) {
        case 'restart': return handler({ type: 'restart' });
        case 'next':    return handler({ type: 'next' });
        case 'close':   return handler({ type: 'close' });
        case 'chapter-select': {
          const chapter = Number(data.chapter ?? 1);
          const level = Number(data.level ?? 1);
          return handler({ type: 'chapter-select', chapter, level });
        }
        case 'open-chapters':     return handler({ type: 'open-chapters' });
        case 'open-settings':     return handler({ type: 'open-settings' });
        case 'open-quests':       return handler({ type: 'open-quests' });
        case 'open-achievements': return handler({ type: 'open-achievements' });
        case 'open-stats':        return handler({ type: 'open-stats' });
        case 'open-shop':         return handler({ type: 'open-shop' });
        case 'continue-with-ad':  return handler({ type: 'continue-with-ad' });
        case 'decline-continue':  return handler({ type: 'decline-continue' });
        case 'claim-daily':       return handler({ type: 'claim-daily' });
        case 'claim-quest':       return handler({ type: 'claim-quest', id: String(data.id ?? '') });
        case 'claim-achievement': return handler({ type: 'claim-achievement', id: String(data.id ?? '') });
        case 'buy-booster':       return handler({ type: 'buy-booster', booster: data.booster as BoosterId });
        case 'ad-for-booster':    return handler({ type: 'ad-for-booster', booster: data.booster as BoosterId });
        case 'toggle-sound':      return handler({ type: 'setting-toggle', key: 'sound' });
        case 'toggle-music':      return handler({ type: 'setting-toggle', key: 'music' });
        case 'toggle-haptics':    return handler({ type: 'setting-toggle', key: 'haptics' });
        case 'tutorial-step':     return handler({ type: 'tutorial-step', step: Number(data.step ?? 0) });
        case 'tutorial-complete': return handler({ type: 'tutorial-complete' });
        case 'intro-ack':         return handler({ type: 'screw-type-intro-ack', introType: data.introType as ScrewType });
        default: return;
      }
    });
  }
  return { overlay: cachedOverlay, card: cachedCard };
}

export function showOverlay(html: string): void {
  const { overlay, card } = ensureBindings();
  card.innerHTML = html;
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
    : `<button class="primary-btn primary-btn--big" data-action="next">Next Level →</button>`;
  return `
    <h1>Level Clear!</h1>
    <div class="stars stars--animated">${stars}</div>
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
    <h1>So Close!</h1>
    <p>${reason}</p>
    <div class="progress-strip"><div class="progress-strip-fill" style="width:${pct}%"></div></div>
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
    <h1>You're SO Close!</h1>
    <p>You were <b>${pct}%</b> there.</p>
    <div class="progress-strip"><div class="progress-strip-fill" style="width:${pct}%"></div></div>
    <p class="big-coins">Grab <b>+${secondsToAdd} seconds</b> to finish?</p>
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
    <div class="reveal-burst">🎁</div>
    <h1>+${coins} 🪙</h1>
    <p class="streak-bigtext">Day ${day} reward unlocked!</p>
    <p>Current streak: <b>${streak} ${streak === 1 ? 'day' : 'days'}</b> 🔥</p>
    <div class="card-actions single">
      <button class="primary-btn" data-action="close">Let's Play!</button>
    </div>
  `;
}

export function welcomeBackHtml(coins: number, boosterName: string, gapHours: number): string {
  return `
    <div class="reveal-burst">👋</div>
    <h1>Welcome Back!</h1>
    <p>You've been away for ${gapHours < 24 ? `${gapHours} hours` : `${Math.round(gapHours / 24)} days`}.</p>
    <p class="streak-bigtext">+${coins} 🪙 and 1× ${boosterName}</p>
    <div class="card-actions single">
      <button class="primary-btn" data-action="close">Thanks!</button>
    </div>
  `;
}

export function chapterOverlayHtml(): string {
  const save = loadSave();
  const rows: string[] = [];
  for (let c = 1; c <= TOTAL_CHAPTERS; c++) {
    const unlocked = c <= save.progress.chapterMax;
    const stars = countChapterStars(save.progress.levelStars, c);
    const theme = THEMES[Math.min(THEMES.length - 1, Math.floor((c - 1) / 2))];
    const heading = unlocked
      ? `Ch. ${c} <span class="chapter-theme">${theme?.name ?? ''}</span>`
      : `🔒 Ch. ${c}`;
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
    <button class="settings-toggle ${on ? 'settings-toggle--on' : ''}" data-action="toggle-${key}">
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
    <div class="settings-row">
      <button class="settings-link" data-action="open-stats">📊 Statistics</button>
      <button class="settings-link" data-action="open-achievements">🏆 Achievements</button>
    </div>
    <p class="credits">Made by Jo Bendik</p>
    <div class="card-actions single">
      <button class="primary-btn" data-action="close">Done</button>
    </div>
  `;
}

export function questsOverlayHtml(): string {
  const quests = activeQuests();
  const rows = quests.map((q) => questRowHtml(q)).join('');
  return `
    <h1>Daily Quests</h1>
    <p class="streak-note">Refreshes at midnight UTC.</p>
    <div class="quest-list">${rows}</div>
    <div class="card-actions single">
      <button class="secondary-btn" data-action="close">Close</button>
    </div>
  `;
}

function questRowHtml(q: QuestState): string {
  const pct = Math.min(100, Math.round((q.progress / q.def.target) * 100));
  const done = q.progress >= q.def.target;
  const claimed = q.claimed;
  const boosterPart = q.def.booster
    ? ` + ${q.def.booster.n}× ${BOOSTER_BY_ID[q.def.booster.id as BoosterId]?.icon ?? '🧰'}`
    : '';
  const button = claimed
    ? `<button class="quest-claimed" disabled>Claimed ✓</button>`
    : done
      ? `<button class="quest-claim" data-action="claim-quest" data-id="${q.id}">Claim +${q.def.coins}${boosterPart}</button>`
      : `<button class="quest-progress" disabled>${q.progress}/${q.def.target}</button>`;
  return `
    <div class="quest-row ${done && !claimed ? 'quest-row--ready' : ''} ${claimed ? 'quest-row--claimed' : ''}">
      <div class="quest-icon">${q.def.icon}</div>
      <div class="quest-body">
        <div class="quest-name">${q.def.name}</div>
        <div class="quest-bar"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
      </div>
      ${button}
    </div>
  `;
}

export function achievementsOverlayHtml(): string {
  const list = listProgress();
  const rows = list.map((entry) => {
    const def = entry.def;
    const pct = Math.min(100, Math.round((entry.progress / def.target) * 100));
    const save = loadSave();
    const stored = save.achievements[def.id];
    const claimed = !!stored?.claimedAt;
    const button = entry.unlocked && !claimed
      ? `<button class="ach-claim" data-action="claim-achievement" data-id="${def.id}">Claim</button>`
      : entry.unlocked
        ? `<span class="ach-done">✓</span>`
        : `<span class="ach-pending">${entry.progress}/${def.target}</span>`;
    return `
      <div class="ach-row ${entry.unlocked ? 'ach-row--unlocked' : ''} ${claimed ? 'ach-row--claimed' : ''}">
        <div class="ach-icon">${def.icon}</div>
        <div class="ach-body">
          <div class="ach-name">${def.name}</div>
          <div class="ach-desc">${def.description}</div>
          ${entry.unlocked
            ? `<div class="ach-reward">+${def.reward} 🪙${def.boosterReward ? ` · ${def.boosterReward.n}× ${BOOSTER_BY_ID[def.boosterReward.id]?.icon ?? '🧰'}` : ''}</div>`
            : `<div class="ach-bar"><div class="ach-bar-fill" style="width:${pct}%"></div></div>`
          }
        </div>
        ${button}
      </div>
    `;
  }).join('');
  const totalUnlocked = list.filter((e) => e.unlocked).length;
  return `
    <h1>Achievements</h1>
    <p class="streak-note">${totalUnlocked}/${ACHIEVEMENTS.length} unlocked</p>
    <div class="ach-list">${rows}</div>
    <div class="card-actions single">
      <button class="secondary-btn" data-action="close">Close</button>
    </div>
  `;
}

export function statsOverlayHtml(): string {
  const s = loadSave();
  const xp = xpProgress();
  return `
    <h1>Statistics</h1>
    <div class="stats-grid">
      <div class="stat-tile"><span class="stat-label">Rank</span><b>${xp.rank}</b></div>
      <div class="stat-tile"><span class="stat-label">Levels cleared</span><b>${s.stats.levelsCleared}</b></div>
      <div class="stat-tile"><span class="stat-label">3-star wins</span><b>${s.stats.threeStars}</b></div>
      <div class="stat-tile"><span class="stat-label">Max combo</span><b>×${s.stats.maxCombo}</b></div>
      <div class="stat-tile"><span class="stat-label">Screws popped</span><b>${s.stats.screwsPopped}</b></div>
      <div class="stat-tile"><span class="stat-label">Coins lifetime</span><b>${s.stats.coinsEarnedLifetime}</b></div>
      <div class="stat-tile"><span class="stat-label">Streak</span><b>🔥 ${s.daily.streakDay}</b></div>
      <div class="stat-tile"><span class="stat-label">Boosters used</span><b>${s.stats.boostersUsed}</b></div>
    </div>
    <div class="card-actions single">
      <button class="secondary-btn" data-action="close">Close</button>
    </div>
  `;
}

export function shopOverlayHtml(): string {
  const coins = loadSave().player.coins;
  const rows = BOOSTERS.map((b) => {
    const owned = countOf(b.id);
    return `
      <div class="shop-row">
        <div class="shop-icon">${b.icon}</div>
        <div class="shop-body">
          <div class="shop-name">${b.name} <span class="shop-owned">×${owned}</span></div>
          <div class="shop-desc">${b.description}</div>
        </div>
        <div class="shop-buttons">
          <button class="shop-buy" data-action="buy-booster" data-booster="${b.id}">
            <span>${b.cost} 🪙</span>
          </button>
          <button class="shop-ad" data-action="ad-for-booster" data-booster="${b.id}">
            <span>▶ Free</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
  return `
    <h1>Booster Shop</h1>
    <p class="streak-note">Coins: <b>${coins}</b> 🪙</p>
    <div class="shop-list">${rows}</div>
    <div class="card-actions single">
      <button class="secondary-btn" data-action="close">Close</button>
    </div>
  `;
}

// ── Onboarding tutorial ─────────────────────────────────────────────────

export function tutorialStepHtml(step: number): string {
  const steps = [
    {
      icon: '🔩',
      title: 'Tap a screw',
      body: 'Tap any coloured screw and it flies into a matching slot at the bottom.',
      cta: 'Got it!',
      nextStep: 1,
    },
    {
      icon: '🎨',
      title: 'Match three to clear',
      body: 'Stack 3 of the same colour to clear a slot — that frees up space for more screws.',
      cta: 'Cool!',
      nextStep: 2,
    },
    {
      icon: '⏱',
      title: 'Beat the timer',
      body: 'Clear all the plates before time runs out. Combos earn extra coins!',
      cta: "Let's play!",
      nextStep: -1,
    },
  ];
  const safeStep = Math.max(0, Math.min(steps.length - 1, step));
  const s = steps[safeStep];
  if (!s) return '';
  const action = s.nextStep < 0
    ? `<button class="primary-btn primary-btn--big" data-action="tutorial-complete">${s.cta}</button>`
    : `<button class="primary-btn primary-btn--big" data-action="tutorial-step" data-step="${s.nextStep}">${s.cta}</button>`;
  return `
    <div class="tutorial-icon">${s.icon}</div>
    <h1>${s.title}</h1>
    <p class="tutorial-body">${s.body}</p>
    <div class="tutorial-dots">
      ${steps.map((_, i) => `<span class="tutorial-dot ${i === safeStep ? 'tutorial-dot--active' : ''}"></span>`).join('')}
    </div>
    <div class="card-actions single">${action}</div>
  `;
}

// ── Special-screw type introductions ─────────────────────────────────────

export function screwTypeIntroHtml(type: ScrewType): string {
  switch (type) {
    case 'frozen':
      return `
        <div class="tutorial-icon">❄️</div>
        <h1>Frozen Screws</h1>
        <p class="tutorial-body">Icy screws need <b>two taps</b>: first to crack the ice, then to pop.</p>
        <div class="card-actions single">
          <button class="primary-btn primary-btn--big" data-action="intro-ack" data-intro-type="frozen">Got it!</button>
        </div>
      `;
    case 'chained':
      return `
        <div class="tutorial-icon">⛓️</div>
        <h1>Chained Screws</h1>
        <p class="tutorial-body">Chained screws pop <b>together</b> — make sure they're all reachable and the bucket can take them.</p>
        <div class="card-actions single">
          <button class="primary-btn primary-btn--big" data-action="intro-ack" data-intro-type="chained">Got it!</button>
        </div>
      `;
    case 'locked':
    case 'key':
      return `
        <div class="tutorial-icon">🔑</div>
        <h1>Keys & Locks</h1>
        <p class="tutorial-body">Pop the <b>golden key</b> to unlock all matching <b>locked screws</b>.</p>
        <div class="card-actions single">
          <button class="primary-btn primary-btn--big" data-action="intro-ack" data-intro-type="${type}">Got it!</button>
        </div>
      `;
    default:
      return '';
  }
}

/** Mutate a setting flag in the save. */
export function toggleSetting(key: 'sound' | 'music' | 'haptics'): void {
  update((s) => {
    s.settings[key] = !s.settings[key];
  });
}
