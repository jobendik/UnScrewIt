/**
 * Hand-designed level catalog (12 levels) ported from the prototype.
 *
 * Each entry is a `LevelTemplate` — a pure description that `makeLevel`
 * resolves into runtime `LevelDefinition` data each time it's loaded.
 *
 * These twelve will become reference templates for the procedural generator
 * in a future pass; today they are the shipped content.
 */

import { GRID } from './grid';
import { bar, slab } from './plates';
import type { Hole, LevelDefinition, LevelTemplate } from './types';

/**
 * Resolve a template into a concrete level. Returns deep-cloned data so
 * callers can mutate it freely (animation state, status changes, etc.).
 */
export function makeLevel(t: LevelTemplate): LevelDefinition {
  const holes: Record<string, Hole> = {};
  for (const id of t.holeIds) {
    const found = GRID[id];
    if (!found) throw new Error(`Unknown hole id in level "${t.name}": ${id}`);
    holes[id] = { ...found };
  }
  const plates = t.plates(holes);
  const screws = t.screws.map((s) => ({
    id: s.id,
    holeId: s.holeId,
    type: s.type ?? 'standard' as const,
  }));
  return {
    name: t.name,
    holes: Object.values(holes),
    plates,
    screws,
    moves: t.moves,
    time: t.time,
    hints: t.hints ?? 3,
  };
}

export const LEVELS: readonly LevelTemplate[] = [
  {
    name: 'First Board',
    holeIds: ['A1', 'C1', 'E1', 'B3', 'D3'],
    plates: (h) => [bar(h, 'basic-red', 'B3', 'D3', 'red')],
    screws: [
      { id: 's1', holeId: 'B3' },
      { id: 's2', holeId: 'D3' },
    ],
    moves: 3,
    time: 70,
  },
  {
    name: 'The Cross',
    holeIds: ['A1', 'C1', 'E1', 'A3', 'E3', 'A5', 'E5', 'C4'],
    plates: (h) => [
      bar(h, 'diag-a', 'A3', 'E5', 'orange', { holeIds: ['A3', 'E5'] }),
      bar(h, 'diag-b', 'E3', 'A5', 'blue',   { holeIds: ['E3', 'A5'] }),
    ],
    screws: [
      { id: 's1', holeId: 'A3' },
      { id: 's2', holeId: 'E5' },
      { id: 's3', holeId: 'E3' },
      { id: 's4', holeId: 'A5' },
    ],
    moves: 5,
    time: 90,
  },
  {
    name: 'Locked Gate',
    holeIds: ['A1', 'C1', 'E1', 'A3', 'E3', 'B3', 'D3', 'B6', 'D6'],
    plates: (h) => [
      bar(h, 'top-lock',   'A3', 'E3', 'yellow', { holeIds: ['A3', 'E3'], extend: 70 }),
      bar(h, 'left-post',  'B3', 'B6', 'green',  { holeIds: ['B3', 'B6'], extend: 62 }),
      bar(h, 'right-post', 'D3', 'D6', 'blue',   { holeIds: ['D3', 'D6'], extend: 62 }),
    ],
    screws: [
      { id: 's1', holeId: 'A3' },
      { id: 's2', holeId: 'E3' },
      { id: 's3', holeId: 'B6' },
      { id: 's4', holeId: 'D6' },
    ],
    moves: 6,
    time: 110,
  },
  {
    name: 'Pinwheel',
    holeIds: ['A1', 'C1', 'E1', 'C2', 'A4', 'C4', 'E4', 'C6', 'B3', 'D5'],
    plates: (h) => [
      bar(h, 'north', 'C2', 'C4', 'purple', { holeIds: ['C2', 'C4'] }),
      bar(h, 'west',  'A4', 'C4', 'red',    { holeIds: ['A4', 'C4'] }),
      bar(h, 'east',  'C4', 'E4', 'teal',   { holeIds: ['C4', 'E4'] }),
      bar(h, 'south', 'C4', 'C6', 'orange', { holeIds: ['C4', 'C6'] }),
    ],
    screws: [
      { id: 's1', holeId: 'C2' },
      { id: 's2', holeId: 'A4' },
      { id: 's3', holeId: 'E4' },
      { id: 's4', holeId: 'C6' },
      { id: 's5', holeId: 'C4' },
    ],
    moves: 8,
    time: 125,
  },
  {
    name: 'Staircase',
    holeIds: ['A1', 'C1', 'E1', 'A2', 'B3', 'C4', 'D5', 'E6', 'A6', 'E2'],
    plates: (h) => [
      bar(h, 'step-1', 'A2', 'C4', 'green',  { holeIds: ['A2', 'C4'] }),
      bar(h, 'step-2', 'B3', 'D5', 'yellow', { holeIds: ['B3', 'D5'] }),
      bar(h, 'step-3', 'C4', 'E6', 'pink',   { holeIds: ['C4', 'E6'] }),
      bar(h, 'brace',  'A6', 'E2', 'blue',   { holeIds: ['A6', 'E2'] }),
    ],
    screws: [
      { id: 's1', holeId: 'A2' },
      { id: 's2', holeId: 'B3' },
      { id: 's3', holeId: 'C4' },
      { id: 's4', holeId: 'D5' },
      { id: 's5', holeId: 'E6' },
      { id: 's6', holeId: 'A6' },
      { id: 's7', holeId: 'E2' },
    ],
    moves: 11,
    time: 150,
  },
  {
    name: 'Box Frame',
    holeIds: ['A1', 'C1', 'E1', 'A3', 'C3', 'E3', 'A5', 'C5', 'E5', 'B4', 'D4'],
    plates: (h) => [
      bar(h, 'top',    'A3', 'E3', 'red',    { holeIds: ['A3', 'E3'], extend: 62 }),
      bar(h, 'bottom', 'A5', 'E5', 'orange', { holeIds: ['A5', 'E5'], extend: 62 }),
      bar(h, 'left',   'A3', 'A5', 'green',  { holeIds: ['A3', 'A5'], extend: 58 }),
      bar(h, 'right',  'E3', 'E5', 'blue',   { holeIds: ['E3', 'E5'], extend: 58 }),
      bar(h, 'middle', 'C3', 'C5', 'purple', { holeIds: ['C3', 'C5'], extend: 58 }),
    ],
    screws: [
      { id: 's1', holeId: 'A3' },
      { id: 's2', holeId: 'E3' },
      { id: 's3', holeId: 'A5' },
      { id: 's4', holeId: 'E5' },
      { id: 's5', holeId: 'C3' },
      { id: 's6', holeId: 'C5' },
    ],
    moves: 10,
    time: 165,
  },
  {
    name: 'Diamond Trap',
    holeIds: ['A1', 'B1', 'D1', 'E1', 'C2', 'A4', 'C4', 'E4', 'C6', 'B3', 'D3', 'B5', 'D5'],
    plates: (h) => [
      bar(h, 'diamond-nw', 'C2', 'A4', 'yellow', { holeIds: ['C2', 'A4'] }),
      bar(h, 'diamond-ne', 'C2', 'E4', 'red',    { holeIds: ['C2', 'E4'] }),
      bar(h, 'diamond-sw', 'A4', 'C6', 'blue',   { holeIds: ['A4', 'C6'] }),
      bar(h, 'diamond-se', 'E4', 'C6', 'green',  { holeIds: ['E4', 'C6'] }),
      bar(h, 'crossbar',   'B3', 'D5', 'pink',   { holeIds: ['B3', 'D5'] }),
      bar(h, 'crossbar2',  'D3', 'B5', 'teal',   { holeIds: ['D3', 'B5'] }),
    ],
    screws: [
      { id: 's1', holeId: 'C2' },
      { id: 's2', holeId: 'A4' },
      { id: 's3', holeId: 'E4' },
      { id: 's4', holeId: 'C6' },
      { id: 's5', holeId: 'B3' },
      { id: 's6', holeId: 'D5' },
      { id: 's7', holeId: 'D3' },
      { id: 's8', holeId: 'B5' },
    ],
    moves: 13,
    time: 190,
  },
  {
    name: 'Sandwich',
    holeIds: ['A1', 'C1', 'E1', 'A2', 'C2', 'E2', 'B4', 'C4', 'D4', 'A6', 'C6', 'E6', 'B3', 'D5'],
    plates: (h) => [
      slab(h, 'big-blue',     'C4', 360, 72, 0, 'blue',   ['B4', 'D4'], { fallSpin: 10 }),
      bar(h, 'top-red',       'A2', 'E2', 'red',    { holeIds: ['A2', 'E2'], extend: 60 }),
      bar(h, 'bottom-green',  'A6', 'E6', 'green',  { holeIds: ['A6', 'E6'], extend: 60 }),
      bar(h, 'diag-yellow',   'B3', 'D5', 'yellow', { holeIds: ['B3', 'D5'] }),
    ],
    screws: [
      { id: 's1', holeId: 'B4' },
      { id: 's2', holeId: 'D4' },
      { id: 's3', holeId: 'A2' },
      { id: 's4', holeId: 'E2' },
      { id: 's5', holeId: 'A6' },
      { id: 's6', holeId: 'E6' },
      { id: 's7', holeId: 'B3' },
      { id: 's8', holeId: 'D5' },
    ],
    moves: 13,
    time: 200,
  },
  {
    name: 'Woven Bars',
    holeIds: [
      'A1', 'B1', 'D1', 'E1',
      'A2', 'C2', 'E2',
      'A4', 'C4', 'E4',
      'A6', 'C6', 'E6',
      'B3', 'D3', 'B5', 'D5',
    ],
    plates: (h) => [
      bar(h, 'left-vertical',  'A2', 'A6', 'green',  { holeIds: ['A2', 'A6'], extend: 60 }),
      bar(h, 'mid-vertical',   'C2', 'C6', 'blue',   { holeIds: ['C2', 'C6'], extend: 60 }),
      bar(h, 'right-vertical', 'E2', 'E6', 'purple', { holeIds: ['E2', 'E6'], extend: 60 }),
      bar(h, 'diag-one',       'B3', 'D5', 'red',    { holeIds: ['B3', 'D5'] }),
      bar(h, 'diag-two',       'D3', 'B5', 'orange', { holeIds: ['D3', 'B5'] }),
      bar(h, 'middle',         'A4', 'E4', 'yellow', { holeIds: ['A4', 'E4'], extend: 70 }),
    ],
    screws: [
      { id: 's1',  holeId: 'A2' },
      { id: 's2',  holeId: 'A6' },
      { id: 's3',  holeId: 'C2' },
      { id: 's4',  holeId: 'C6' },
      { id: 's5',  holeId: 'E2' },
      { id: 's6',  holeId: 'E6' },
      { id: 's7',  holeId: 'B3' },
      { id: 's8',  holeId: 'D5' },
      { id: 's9',  holeId: 'D3' },
      { id: 's10', holeId: 'B5' },
      { id: 's11', holeId: 'A4' },
      { id: 's12', holeId: 'E4' },
    ],
    moves: 18,
    time: 230,
  },
  {
    name: 'The Bridge',
    holeIds: [
      'A1', 'C1', 'E1',
      'A2', 'E2',
      'B3', 'D3',
      'A4', 'C4', 'E4',
      'B5', 'D5',
      'A6', 'E6',
    ],
    plates: (h) => [
      bar(h, 'top-left',     'A2', 'B3', 'red',    { holeIds: ['A2', 'B3'] }),
      bar(h, 'top-right',    'E2', 'D3', 'blue',   { holeIds: ['E2', 'D3'] }),
      bar(h, 'bridge',       'A4', 'E4', 'yellow', { holeIds: ['A4', 'C4', 'E4'], extend: 70 }),
      bar(h, 'low-left',     'B5', 'A6', 'green',  { holeIds: ['B5', 'A6'] }),
      bar(h, 'low-right',    'D5', 'E6', 'pink',   { holeIds: ['D5', 'E6'] }),
      bar(h, 'center-strut', 'C4', 'D5', 'teal',   { holeIds: ['C4', 'D5'] }),
    ],
    screws: [
      { id: 's1',  holeId: 'A2' },
      { id: 's2',  holeId: 'B3' },
      { id: 's3',  holeId: 'E2' },
      { id: 's4',  holeId: 'D3' },
      { id: 's5',  holeId: 'A4' },
      { id: 's6',  holeId: 'C4' },
      { id: 's7',  holeId: 'E4' },
      { id: 's8',  holeId: 'B5' },
      { id: 's9',  holeId: 'A6' },
      { id: 's10', holeId: 'D5' },
      { id: 's11', holeId: 'E6' },
    ],
    moves: 17,
    time: 245,
  },
  {
    name: 'Helix',
    holeIds: [
      'A1', 'B1', 'D1', 'E1',
      'B2', 'D2',
      'A3', 'C3', 'E3',
      'B4', 'D4',
      'A5', 'C5', 'E5',
      'B6', 'D6',
    ],
    plates: (h) => [
      bar(h, 'h1', 'B2', 'D2', 'orange', { holeIds: ['B2', 'D2'] }),
      bar(h, 'd1', 'D2', 'A5', 'blue',   { holeIds: ['D2', 'A5'] }),
      bar(h, 'h2', 'A3', 'E3', 'green',  { holeIds: ['A3', 'C3', 'E3'], extend: 70 }),
      bar(h, 'd2', 'B4', 'E5', 'pink',   { holeIds: ['B4', 'E5'] }),
      bar(h, 'h3', 'A5', 'E5', 'yellow', { holeIds: ['A5', 'C5', 'E5'], extend: 70 }),
      bar(h, 'd3', 'B6', 'D4', 'purple', { holeIds: ['B6', 'D4'] }),
    ],
    screws: [
      { id: 's1',  holeId: 'B2' },
      { id: 's2',  holeId: 'D2' },
      { id: 's3',  holeId: 'A3' },
      { id: 's4',  holeId: 'C3' },
      { id: 's5',  holeId: 'E3' },
      { id: 's6',  holeId: 'B4' },
      { id: 's7',  holeId: 'D4' },
      { id: 's8',  holeId: 'A5' },
      { id: 's9',  holeId: 'C5' },
      { id: 's10', holeId: 'E5' },
      { id: 's11', holeId: 'B6' },
    ],
    moves: 18,
    time: 260,
  },
  {
    name: 'Master Board',
    holeIds: [
      'A1', 'B1', 'C1', 'D1', 'E1',
      'A2', 'C2', 'E2',
      'A3', 'B3', 'D3', 'E3',
      'A4', 'C4', 'E4',
      'A5', 'B5', 'D5', 'E5',
      'A6', 'C6', 'E6',
    ],
    plates: (h) => [
      bar(h, 'top',         'A2', 'E2', 'yellow', { holeIds: ['A2', 'C2', 'E2'], extend: 74 }),
      bar(h, 'left-tower',  'A2', 'A6', 'green',  { holeIds: ['A2', 'A4', 'A6'], extend: 66 }),
      bar(h, 'right-tower', 'E2', 'E6', 'blue',   { holeIds: ['E2', 'E4', 'E6'], extend: 66 }),
      bar(h, 'slash',       'A3', 'E5', 'red',    { holeIds: ['A3', 'C4', 'E5'], extend: 66 }),
      bar(h, 'backslash',   'E3', 'A5', 'purple', { holeIds: ['E3', 'C4', 'A5'], extend: 66 }),
      bar(h, 'center',      'C4', 'C6', 'orange', { holeIds: ['C4', 'C6'], extend: 60 }),
    ],
    screws: [
      { id: 's1',  holeId: 'A2' },
      { id: 's2',  holeId: 'C2' },
      { id: 's3',  holeId: 'E2' },
      { id: 's4',  holeId: 'A4' },
      { id: 's5',  holeId: 'E4' },
      { id: 's6',  holeId: 'A6' },
      { id: 's7',  holeId: 'E6' },
      { id: 's8',  holeId: 'A3' },
      { id: 's9',  holeId: 'E5' },
      { id: 's10', holeId: 'E3' },
      { id: 's11', holeId: 'A5' },
      { id: 's12', holeId: 'C4' },
      { id: 's13', holeId: 'C6' },
    ],
    moves: 20,
    time: 310,
  },
];
