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

---

## 2026-07-03 — P1 Data layer

**Model:** Claude (Sonnet 4.6), via Claude Code CLI

**Completed:**
- Data model types per §3 (`src/store/types.ts`): `Settings` (singleton), `Venue`, `Ride`, `Scenario`, `Event`, all extending a common `Persisted` (`id`/`createdAt`/`updatedAt`) shape
- Dexie schema (`src/store/db.ts`): tables for settings/venues/rides/scenarios/events; `ensureSeeded()` seeds the default `Settings` singleton (§3.1 values) and all 8 venues (§3.2 table) on first run, idempotently
- `DataStore` interface (`src/store/DataStore.ts`): generic `Collection<T>` (get/getAll/put/delete/observe) per collection, backed today by Dexie; a `put(item, { silent })` escape hatch lets the sync engine apply incoming remote docs without re-triggering an outbound push; `onChange` lets the sync layer observe local writes without coupling to Dexie directly — this is the swap point called out in §2
- Firebase init (`src/store/firebase.ts`) with the owner-supplied config, Google `signInWithPopup` auth, Firestore client
- Sync engine (`src/store/sync.ts`): on sign-in, does a one-time full reconcile per collection against `users/{uid}/{collection}` (via `planMerge`), then keeps a live `onSnapshot` listener per collection (applies remote-wins docs silently) and a local `onChange` listener (pushes local-wins docs) — last-write-wins on `updatedAt`, all reads local per §2
- Pure, unit-tested last-write-wins merge logic (`src/store/merge.ts`): `resolveDoc` (single-doc conflict resolution) and `planMerge` (full-collection reconcile plan)
- `firestore.rules` per §6, committed to the repo; owner manually published it via the Firebase console (no admin/service-account credentials were available to this session to deploy it via CLI/API)
- Settings page (`src/pages/Settings/`): `AuthPanel` (Google sign-in/out + status), `GlobalParams` (editable §3.1 fields with provenance captions, writes on blur), `BackupPanel` (full-DB JSON export/import), `VenueManager` (CRUD over all venue fields; editing `lapLengthM` or `bendRadiusM` auto-recomputes `straightLengthM` to close the §3.2 constraint, editing `straightLengthM` directly leaves a visible residual instead)

**Test status:**
- `npm test` (vitest): 16/16 passing — 6 tests on `resolveDoc`/`planMerge` pure logic (tie-breaking, local-only/remote-only/conflicting docs, mixed batches, true no-op), plus new integration-style tests against a real (via `fake-indexeddb`) IndexedDB: seeding is correct and idempotent, `DataStore` CRUD round-trips, `onChange` fires on put/delete but not on `{ silent: true }` puts
- `npm run build` passes clean; `npm run lint` passes clean (had to restructure `GlobalParams` to avoid a `setState`-in-effect anti-pattern the lint config now flags — settled on a key-based remount instead of a synced draft state)
- **Not verified by me:** the actual cross-device definition of done ("sign in with Google on the deployed site, edit a venue on my laptop, see the change on my phone after reload"). I have no browser or computer-use access in this environment (declined twice this session) — all verification above is build/type/lint/test-level. The owner needs to do this check personally.
- Firebase project state confirmed before building: Firestore database exists, Google sign-in provider enabled, `aj-pursuit-lab.firebaseapp.com`/`ajohn155.github.io` are authorized domains — all confirmed by the owner or via public config endpoints, not assumed.

**What's next:** P2 Engine core — §4.1–4.3, 4.9–4.14 as pure functions with unit tests (synthetic data), calculators' math functions with gate-7 tests.

**Deviations from SPEC (explicit):**
- §5.10 lists CP/W′ settings and the start-profile template as part of the Settings page; both depend on engine functionality (§4.10, §4.13) that doesn't exist yet, so they're deferred to whichever phase builds that engine surface (P2/P6/P7) rather than stubbed now.
- The venue "fit-geometry button" (§5.10, §4.8) is also deferred — venue geometry fitting requires ride lap data and the physics engine, neither of which exist yet in P1.
- Firestore tombstones (remote deletes) are not synced in this pass: local deletes remove the local doc but don't currently propagate a delete to Firestore. SPEC doesn't specify delete-sync semantics; flagging so it's a conscious gap, not an oversight, when ride/scenario deletion UI lands in later phases.
- Backup import is additive/merge-by-put, not a destructive restore — importing a backup won't remove local docs absent from the file. SPEC's "export/import full backup JSON" wording didn't specify restore semantics; merge felt safer as a default than silently deleting local data.
