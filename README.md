# Unscrew It

Retention-focused HTML5 puzzle game for the CrazyGames platform. Mobile-portrait first, desktop secondary. Built with vanilla TypeScript + Vite — no game frameworks.

## Tech stack

- **Vite 5** — build tool, dev server
- **TypeScript 5** — strict mode, no `any`
- **Vanilla DOM + SVG** — no UI framework, no game engine
- **WebAudio** — procedural SFX, no audio assets

No runtime dependencies. Everything ships as part of the bundle.

## Quick start

```bash
npm install      # one-time
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # serve the production build locally
npm run typecheck
```

## Project layout

```
.
├── .github/workflows/    CI / GitHub Pages deploy
├── public/               Static assets copied verbatim (favicon, manifest)
├── src/
│   ├── main.ts           Entry point — bootstraps the game
│   ├── styles/           CSS (theme custom properties, scenes, HUD)
│   ├── core/             Foundational systems
│   │   ├── config.ts       Constants, tunables, board dimensions
│   │   ├── utils.ts        Math helpers, dom helpers, formatters
│   │   ├── storage.ts      localStorage save/load with schema migration
│   │   └── audio.ts        WebAudio kit (SFX + procedural music)
│   ├── game/             Domain logic, no DOM
│   │   ├── types.ts        Shared type definitions
│   │   ├── grid.ts         Hole grid system (A1..E7)
│   │   ├── plates.ts       Plate factory + geometry helpers
│   │   ├── levels.ts       Level catalog (templates for the procedural generator)
│   │   └── state.ts        Game state machine + reducers
│   ├── render/           SVG board rendering
│   │   ├── svg.ts          SVG element helpers
│   │   ├── defs.ts         SVG defs (gradients, filters, patterns)
│   │   ├── board.ts        Board / plate / screw / hole rendering
│   │   └── animations.ts   Tween + particle helpers
│   └── ui/               DOM-driven UI surfaces
│       ├── hud.ts          Top + bottom HUD
│       ├── overlay.ts      Modal overlays (win, lose, levels)
│       └── toast.ts        Transient toast messages
├── index.html            Vite HTML entry
├── vite.config.ts        Vite config (base path for GH Pages)
├── tsconfig.json         TypeScript config (strict)
└── package.json
```

The original single-file prototype is preserved at `UnscrewIt_Polished.html` for reference.

## Where to add things

| Want to add… | Edit… |
|---|---|
| New screw type | `src/game/types.ts` (`ScrewType`), then logic in `src/game/state.ts` and rendering in `src/render/board.ts` |
| New level | `src/game/levels.ts` (or use the procedural generator once implemented) |
| New scene / overlay | new file in `src/ui/`, register in `src/main.ts` |
| New theme | `src/styles/index.css` (CSS custom properties under a `[data-theme="..."]` selector) |
| CrazyGames SDK key | `src/main.ts` — search for `Platform.init` (added in a later pass) |
| New sound | `src/core/audio.ts` |

## GitHub Pages deployment

The `deploy.yml` workflow runs in two phases:

- **Build** runs on every push and every PR (including `claude/**` branches) so CI gates regressions everywhere.
- **Deploy** runs only on pushes to `main`, matching GitHub's default `github-pages` environment branch policy.

**One-time setup on the repository:**

1. **Settings → Pages → Source**: set to **GitHub Actions**.
2. Push to `main` (or trigger the workflow manually from the Actions tab).

The live build will appear at:
`https://<your-username>.github.io/<repo-name>/`

To allow deploys from feature branches as well, go to **Settings → Environments → github-pages** and add the branches under "Deployment branches".

The `base` path in `vite.config.ts` defaults to `/unscrewit/`. The workflow overrides it with `VITE_BASE_PATH=/${repo-name}/` so it always matches the actual repo, regardless of the repo's name. For a root deploy (custom domain or CrazyGames upload), build with `VITE_BASE_PATH=/ npm run build`.

## CrazyGames submission build

When you're ready to submit to CrazyGames:

```bash
VITE_BASE_PATH=/ npm run build
cd dist && zip -r ../unscrewit.zip . && cd ..
```

Upload `unscrewit.zip`. The bundle is fully self-contained.

## Code style

- Strict TypeScript everywhere — no `any`, no `// @ts-ignore`.
- ES modules only.
- Each module has a single clear responsibility.
- DOM is touched only inside `src/render/` and `src/ui/`. Game logic in `src/game/` is pure.
- Side-effectful bootstrapping happens only in `src/main.ts`.

## Roadmap

This scaffold ports the existing prototype gameplay (sliding-screws mechanic) into the new structure. Subsequent passes (in order):

1. **Pivot mechanic** to bucket-color (Wood Nuts & Bolts style).
2. **Progression + save**: stars, chapters, coins, XP, schema-versioned save.
3. **Daily / retention**: login chest, daily quests, daily challenge, weekly tournament.
4. **Themes / SFX / juice**: 6 themes, particles, combos, screen shake.
5. **CrazyGames SDK**: ad cadence, rewarded ads, happytime hooks, user data sync.
6. **Procedural levels**: solver-verified generator, difficulty curve, 200+ levels.
7. **Polish**: onboarding, achievements, accessibility audit.

## License

MIT.
