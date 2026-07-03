# Progress log

Append-only. Read this and SPEC.md before starting any session.

---

## 2026-07-02 — P0 Scaffold

**Model:** Claude (Sonnet 4.6), via Claude Code CLI

**Completed:**
- Vite + React 19 + TypeScript scaffold (`npm create vite@latest`, `react-ts` template)
- Tailwind CSS v4 via `@tailwindcss/vite` plugin
- `react-router-dom` for client-side routing, `BrowserRouter` with `basename="/aj-pursuit-lab"`
- Tab shell (`src/components/TabShell.tsx`): left rail on desktop, bottom bar on mobile, all 10 tabs from §5 (Rides, Compare, Adjuster, Watts to Win, Gains, Pacing, Race Day, Calculators, Records, Settings)
- Empty page stub per tab under `src/pages/<Tab>/index.tsx`
- Repo layout scaffolded per §2.1: `src/engine/`, `src/engine/__tests__/`, `src/store/`, `data/fixtures/` (empty, see its README)
- GitHub Pages deploy workflow (`.github/workflows/deploy.yml`): builds on push to `main`, deploys via `actions/deploy-pages`
- SPA fallback for GitHub Pages: `public/404.html` (encodes deep link) + decode script in `index.html` (rafgraph spa-github-pages technique), `pathSegmentsToKeep = 1` for the `/aj-pursuit-lab/` repo path
- Repo visibility changed private → public (owner confirmed; required for GitHub Pages without a paid plan)

**Test status:**
- `npm run build` passes clean (tsc -b && vite build)
- All 10 tab routes verified 200 against local dev server; all 10 tab labels confirmed present in built JS bundle
- Deployed and live: **https://ajohn155.github.io/aj-pursuit-lab/** — verified via curl: root HTML (200), JS/CSS bundle assets (200), all 10 tab labels present in the live bundle, and the `404.html` SPA-fallback redirect confirmed serving on a deep link (`/rides`)
- No visual browser verification was possible in this environment (no Chrome MCP connection, computer-use access declined) — verification was route/build/asset-level via curl, not visual. Recommend the owner open the live URL on phone and desktop to confirm the P0 gate visually.

**What's next:** P1 Data layer — Dexie schema, DataStore interface, Firebase init/auth/sync, settings page, venue seed + manager, backup export/import.

**Deviations from SPEC (explicit):**
- Tailwind CSS v4 used (CSS-first config via `@import "tailwindcss"` in `src/index.css`, no `tailwind.config.js`/`postcss.config.js`) rather than v3 — SPEC didn't pin a version; v4 is current stable and simplifies config.
- Router library not specified in SPEC; used `react-router-dom` v7 as the standard choice for tab/route navigation.
- Development environment had no Node.js, no Homebrew, and no GitHub CLI preinstalled; Node was installed as a portable tarball under `~/.local/node` (not a system-wide install) to build/test locally.
