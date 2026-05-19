/**
 * Visual themes. Each theme provides a palette + per-screw colour map and is
 * applied by setting CSS custom properties on `:root`. Themes also swap the
 * board's wood pattern fill in SVG by re-rendering against the active palette.
 *
 * Themes are assigned per chapter: every two chapters gets a fresh palette,
 * giving the player a visible "I've reached a new place" hook mid-campaign.
 */

import { update } from '@/core/save';
import type { ColorDef } from '@/game/colors';

export interface ThemePalette {
  /** Variables applied to `:root`. */
  cssVars: Record<string, string>;
  /** Wood/board surface colour stops. */
  board: { top: string; mid: string; bot: string; rim: string };
  /** Per-screw colour overrides (id → ColorDef). */
  screwColors?: Partial<Record<string, ColorDef>>;
  /** Optional plate colour overrides. */
  plateTint?: { fill: string; edge: string; top: string };
  /** Background sky tones. */
  sky: { top: string; mid: string; bot: string };
}

export interface ThemeDef {
  id: string;
  name: string;
  palette: ThemePalette;
}

export const THEMES: readonly ThemeDef[] = [
  {
    id: 'classic',
    name: 'Workshop',
    palette: {
      cssVars: {
        '--bg-sky-top': '#6aa9ff',
        '--bg-sky-mid': '#b3ddff',
        '--bg-sky-bot': '#f5c68d',
        '--pill-fill-1': '#fff6c8',
        '--pill-fill-2': '#ffc96f',
        '--pill-stroke': '#a55b1f',
        '--pill-shadow': '#6c3815',
        '--btn-fill-1': '#fff3be',
        '--btn-fill-2': '#f39834',
        '--btn-stroke': '#8f4d1d',
        '--card-fill-1': '#fff8da',
        '--card-fill-2': '#ffd888',
        '--card-stroke': '#9e5a24',
      },
      board: { top: '#ffd778', mid: '#e9aa4f', bot: '#d8913d', rim: '#8b4a1a' },
      sky: { top: '#6aa9ff', mid: '#b3ddff', bot: '#f5c68d' },
    },
  },
  {
    id: 'toy',
    name: 'Toy Box',
    palette: {
      cssVars: {
        '--bg-sky-top': '#79e6ff',
        '--bg-sky-mid': '#b6f1ff',
        '--bg-sky-bot': '#ffd9e0',
        '--pill-fill-1': '#fff0c8',
        '--pill-fill-2': '#ffb3d4',
        '--pill-stroke': '#a93267',
        '--pill-shadow': '#6c1d40',
        '--btn-fill-1': '#fbe3ff',
        '--btn-fill-2': '#f0539e',
        '--btn-stroke': '#852960',
        '--card-fill-1': '#fff0fa',
        '--card-fill-2': '#fdc1e3',
        '--card-stroke': '#a93267',
      },
      board: { top: '#fde5ff', mid: '#f0a8e3', bot: '#c067a9', rim: '#7a3375' },
      sky: { top: '#79e6ff', mid: '#b6f1ff', bot: '#ffd9e0' },
    },
  },
  {
    id: 'candy',
    name: 'Candy Lab',
    palette: {
      cssVars: {
        '--bg-sky-top': '#ff9bd4',
        '--bg-sky-mid': '#ffd1f1',
        '--bg-sky-bot': '#fdf1ff',
        '--pill-fill-1': '#fff2b3',
        '--pill-fill-2': '#ff86c8',
        '--pill-stroke': '#8e1f5e',
        '--pill-shadow': '#5b0e3a',
        '--btn-fill-1': '#fff6c8',
        '--btn-fill-2': '#ff479d',
        '--btn-stroke': '#85174c',
        '--card-fill-1': '#fff4e0',
        '--card-fill-2': '#ffb6e2',
        '--card-stroke': '#a93267',
      },
      board: { top: '#ffe7f3', mid: '#f2a3cb', bot: '#cc5c8e', rim: '#691a40' },
      sky: { top: '#ff9bd4', mid: '#ffd1f1', bot: '#fdf1ff' },
    },
  },
  {
    id: 'ocean',
    name: 'Deep Blue',
    palette: {
      cssVars: {
        '--bg-sky-top': '#0d65a8',
        '--bg-sky-mid': '#3ba9d9',
        '--bg-sky-bot': '#b3eaff',
        '--pill-fill-1': '#d6f4ff',
        '--pill-fill-2': '#3ba9d9',
        '--pill-stroke': '#073e5e',
        '--pill-shadow': '#021c2e',
        '--btn-fill-1': '#c7f6ff',
        '--btn-fill-2': '#1788bf',
        '--btn-stroke': '#0b3957',
        '--card-fill-1': '#daf3ff',
        '--card-fill-2': '#7ed2ec',
        '--card-stroke': '#0b4d6f',
      },
      board: { top: '#5dc2ed', mid: '#1d7ea8', bot: '#0d4870', rim: '#031f3a' },
      sky: { top: '#0d65a8', mid: '#3ba9d9', bot: '#b3eaff' },
    },
  },
  {
    id: 'space',
    name: 'Space Lab',
    palette: {
      cssVars: {
        '--bg-sky-top': '#1d0e3a',
        '--bg-sky-mid': '#3a1a6b',
        '--bg-sky-bot': '#774baf',
        '--pill-fill-1': '#e2ccff',
        '--pill-fill-2': '#9d65f5',
        '--pill-stroke': '#3a1a6b',
        '--pill-shadow': '#150633',
        '--btn-fill-1': '#dec9ff',
        '--btn-fill-2': '#854cf7',
        '--btn-stroke': '#3a1a6b',
        '--card-fill-1': '#ece2ff',
        '--card-fill-2': '#b58bff',
        '--card-stroke': '#46199d',
      },
      board: { top: '#9a72d7', mid: '#5a2db0', bot: '#2d0b6b', rim: '#0c0224' },
      sky: { top: '#1d0e3a', mid: '#3a1a6b', bot: '#774baf' },
    },
  },
  {
    id: 'neon',
    name: 'Neon City',
    palette: {
      cssVars: {
        '--bg-sky-top': '#0b0e2a',
        '--bg-sky-mid': '#221752',
        '--bg-sky-bot': '#3f1f6b',
        '--pill-fill-1': '#ffeaff',
        '--pill-fill-2': '#ff39c8',
        '--pill-stroke': '#5b0e3a',
        '--pill-shadow': '#1f0214',
        '--btn-fill-1': '#dcfaff',
        '--btn-fill-2': '#15ecff',
        '--btn-stroke': '#053740',
        '--card-fill-1': '#231352',
        '--card-fill-2': '#7016a5',
        '--card-stroke': '#15ecff',
      },
      board: { top: '#2d1a73', mid: '#15074b', bot: '#06022d', rim: '#15ecff' },
      sky: { top: '#0b0e2a', mid: '#221752', bot: '#3f1f6b' },
    },
  },
];

/** Map chapter (1-based) → theme id. Two chapters per theme. */
export function themeForChapter(chapter: number): ThemeDef {
  const safeChapter = Math.max(1, chapter);
  const themeIndex = Math.min(THEMES.length - 1, Math.floor((safeChapter - 1) / 2));
  return THEMES[themeIndex] ?? THEMES[0]!;
}

/** Apply a theme's CSS variables to `:root`. */
export function applyTheme(theme: ThemeDef): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.palette.cssVars)) {
    root.style.setProperty(k, v);
  }
  root.dataset.theme = theme.id;
  // Record as "owned" in the save.
  update((s) => {
    if (!s.inventory.themes.includes(theme.id)) s.inventory.themes.push(theme.id);
    s.inventory.activeTheme = theme.id;
  });
}

export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}
