# Unscrew It

Retention-focused HTML5 puzzle game for the CrazyGames platform. Mobile-portrait first, desktop secondary. Built with vanilla TypeScript + Vite — no game frameworks.

**Genre**: bucket-color screw puzzle (tap a screw → it flies into a matching colour bucket; clear all plates to win). Same core loop family as Wood Nuts & Bolts.

## Tech stack

- **Vite 5** — build tool, dev server
- **TypeScript 5** — strict mode, no `any`
- **Vanilla DOM + SVG** — no UI framework, no game engine
- **WebAudio** — procedural SFX + a small ambient pad; no audio assets

No runtime dependencies. Everything ships as part of the bundle.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173/unscrewit/
npm run build    # production build to dist/
npm run preview
npm run typecheck
```

## Project layout

```
.
├── .github/workflows/    CI / GitHub Pages deploy
├── public/               Static assets copied verbatim
├── src/
│   ├── main.ts           Entry — wires everything together
│   ├── styles/           CSS (theme custom properties)
│   ├── core/             Foundational, framework-free
│   │   ├── config.ts       Constants, tunables, board dimensions
│   │   ├── utils.ts        Math / DOM helpers, formatters
│   │   ├── storage.ts      localStorage shim with private-browsing fallback
│   │   ├── save.ts         Versioned save schema + debounced writes
│   │   ├── audio.ts        WebAudio kit (procedural SFX + ambient pad)
│   │   ├── haptics.ts      navigator.vibrate wrapper
│   │   └── rng.ts          Seeded Mulberry32 RNG
│   ├── game/             Pure domain logic, no DOM
│   │   ├── types.ts        Shared types
│   │   ├── colors.ts       Screw / bucket colour palette
│   │   ├── grid.ts         A1..E7 hole grid
│   │   ├── plates.ts       Plate factories + geometry helpers
│   │   ├── bucket.ts       Bucket slot operations
│   │   ├── levels.ts       Procedural campaign (10 chapters × 20 levels)
│   │   ├── generator.ts    Procedural level generator
│   │   ├── solver.ts       Forward solver for solvability verification
│   │   └── state.ts        Bucket-color game state machine
│   ├── economy/          Currency + XP + future shop
│   │   └── currency.ts
│   ├── retention/        Daily-login, future quests
│   │   └── dailyLogin.ts
│   ├── platform/         CrazyGames SDK + cadence rules
│   │   ├── crazygames.ts   SDK adapter with standalone shim
│   │   └── ads.ts          When to ask for an interstitial
│   ├── render/           SVG board renderer
│   │   ├── svg.ts          SVG helpers
│   │   ├── defs.ts         Gradients / filters / patterns
│   │   ├── board.ts        Board + plate + screw rendering
│   │   ├── bucket.ts       Bucket bar geometry + render
│   │   ├── animations.ts   Screw-to-bucket arc, confetti, slot flash
│   │   └── particles.ts    Sparks, dust, floating text
│   └── ui/               DOM-driven UI surfaces
│       ├── hud.ts          Top HUD + animated coin tick
│       ├── overlay.ts      Modal overlays (win/lose/daily/settings/chapters)
│       └── toast.ts        Transient messages
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

`UnscrewIt_Polished.html` (the original prototype) is kept verbatim as a reference.

## Where to add things

| Want to add… | Edit… |
|---|---|
| New screw type | `src/game/types.ts` (`ScrewType`), then `state.ts` + `generator.ts` + render in `board.ts` |
| New procedural difficulty curve | `src/game/generator.ts`, `profileFor()` |
| New theme | `src/styles/index.css` (CSS custom properties under `[data-theme="..."]`) |
| CrazyGames SDK config / keys | `src/platform/crazygames.ts` |
| New sound | `src/core/audio.ts` |
| New retention loop | new file in `src/retention/`, wire in `main.ts` |

## Game design highlights

**Core loop**
- **Bucket-color mechanic** — tap a screw → it flies into a colour-matching slot. 3-in-a-row clears the slot and triggers a coin burst.
- **Combo system** — consecutive pops within 1.3 s build a multiplier; each pop pitches up the SFX (rising arpeggio).
- **Star rating** — 1 star for completion, 2 for clearing under par time, 3 for ≤ 75 % of par.
- **Auto-advance** — `level clear → 0.6 s celebration → next level` with zero taps.

**Variety per chapter**
- Chapters 2–4 introduce new screw types one at a time: **frozen** (two taps), **chained** (pop together), and **locked + key** (key unlocks matching locks). Each appearance shows a brief intro card the first time.
- **6 themes** rotate every two chapters (Workshop → Toy Box → Candy Lab → Deep Blue → Space Lab → Neon City). Theme swap is a CSS-property update — instant and smooth.

**Content**
- **200 procedurally generated levels** — 10 chapters × 20 levels, deterministic by seed, solver-verified.

**Economy**
- **Coins** from per-pop + slot-clear bonuses + time-remaining bonus + daily login + quests + achievements.
- **XP / Rank** — visible meter ticks up over levels; rank-up rewards.
- **4 Boosters** — Extra Time (+30 s), Color Sort, Reveal Hint, Undo. Buyable with coins or rewarded ads.
- **In-game booster bar** with one-tap usage during play.

**Retention systems**
- **7-day daily login streak** — escalating to a 500-coin jackpot, **resets on a missed day** (loss-aversion hook).
- **3 daily quests** — refresh at midnight UTC, claim coins + boosters when complete.
- **24 achievements** — passive milestone tracking with toast notifications + coin/booster rewards.
- **Welcome back bonus** — coins + booster if absent ≥ 12 h.
- **Near-miss continue** — failed with ≥ 60 % progress? "Watch ad for +30 s" offer keeps the session alive.

**Onboarding**
- 3-step tutorial on first launch (skippable after first run).
- Per-screw-type intro card on debut.

## Debug mode

Add `?debug=1` to the URL. The console exposes:

- `window._save()` — read the live save
- `window._give(n)` — grant `n` coins
- `window._reset()` — wipe progress
- `window._jump(chapter, level)` — jump to any level

## GitHub Pages deployment

The `deploy.yml` workflow runs in two phases:

- **Build** runs on every push and every PR (including `claude/**` branches) so CI gates regressions everywhere.
- **Deploy** runs only on pushes to `main`, matching GitHub's default `github-pages` environment branch policy.

**One-time setup on the repository:**

1. **Settings → Pages → Source**: set to **GitHub Actions**.
2. Push to `main` (or trigger the workflow manually from the Actions tab).

The live build will appear at `https://<your-username>.github.io/<repo-name>/`.

To allow deploys from feature branches as well, go to **Settings → Environments → github-pages** and add the branches under "Deployment branches".

The `base` path in `vite.config.ts` defaults to `/unscrewit/`. The workflow overrides it via `VITE_BASE_PATH=/${repo-name}/` so it stays in sync if the repo is ever renamed. For a root deploy (custom domain or CrazyGames zip), build with `VITE_BASE_PATH=/ npm run build`.

## CrazyGames submission build

```bash
VITE_BASE_PATH=/ npm run build
cd dist && zip -r ../unscrewit.zip . && cd ..
```

Upload `unscrewit.zip`. The bundle is fully self-contained, fetches the CrazyGames SDK at runtime from their CDN, and degrades gracefully (full game playable) if the SDK fails to load.

## Code style

- Strict TypeScript everywhere — no `any`, no `// @ts-ignore`.
- ES modules only.
- DOM is touched only inside `src/render/` and `src/ui/`. Game logic in `src/game/` is pure.
- Side-effectful bootstrapping happens only in `src/main.ts`.

## Roadmap

Possible future passes:

- **Weekly tournament** — personal-best ladder with AI ghosts
- **Additional screw types** — rusted, magnetic, bomb
- **Localization (i18n)** — strings table, `t()` function (currently English-only)
- **More themes** unlockable via achievements
- **Endless mode** — procedural ladder past chapter 10

## License

MIT.
