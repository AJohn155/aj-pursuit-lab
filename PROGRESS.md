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

---

## 2026-07-03 — P1 fix: venue sync race + stale UI

**Model:** Claude (Sonnet 4.6), via Claude Code CLI

Owner reported: global params sync correctly phone↔laptop, but venue edits don't seem to. Two real bugs, found by tracing the sync path rather than reproducing directly (no browser access in this environment):

1. **Seed timestamp race (`src/store/db.ts`).** `ensureSeeded()` stamped seed settings/venues with `new Date().toISOString()` — "now" — at first load. A device's *first-ever* app load seeds locally before it has synced with anyone. If that first load happens after a genuine edit was already pushed from another device, the fresh (but unedited) seed data carries a *later* timestamp than the real edit, so last-write-wins picks the stale seed data and overwrites the edit in Firestore. This is why settings appeared to work (the owner's devices had likely already synced once before that test, so the race didn't fire) while venues, tested with a device syncing for the first time, hit it. Fix: seed docs now get a fixed, deliberately-ancient `updatedAt` (`1970-01-01T00:00:00.000Z`) instead of "now", so any real edit — which always carries a current timestamp — wins regardless of seeding order across devices. Added a regression test (`db.test.ts`) simulating exactly this two-device race.
2. **Stale uncontrolled inputs (`VenueManager.tsx`).** Venue edit fields are uncontrolled (`defaultValue`), and `VenueRow` was keyed only by `venue.id`, which never changes. An incoming sync updates the underlying data correctly, but React doesn't remount the row, so the visible input values could stay stale in an already-open tab. Fixed by keying on `` `${v.id}-${v.updatedAt}` `` so a row remounts (and its inputs re-initialize from fresh data) whenever the venue's `updatedAt` changes.

**Note for the owner:** if your earlier venue edit was already overwritten by this race before the fix deployed, you'll need to re-apply it once this is live — the fix prevents the bug going forward but doesn't recover data already lost to it.

**Test status:** `npm test` 17/17 passing (new regression test included); `npm run build` and `npm run lint` both clean.

---

## 2026-07-03 — P2 Engine core

**Model:** Claude (Opus 4.8), via Claude Code CLI

**Completed:** the pure-TypeScript physics engine under `src/engine/` (SPEC §4.1–4.3, §4.9–4.14) plus the four calculator math functions (§5.8). `ENGINE_VERSION = '0.2.0-p2'`. No React/DOM/store/dexie/firebase imports anywhere in `src/engine` (purity rule §2.1 verified by grep).

- `constants.ts` / `params.ts` — g, ENGINE_VERSION; mEff = massKg+rotatingMassEqKg, effectiveCrr (§4.1).
- `atmosphere.ts` — air density from T/P/RH, owner's convention verbatim (§4.2); fast-mode steady + lap-1 density scales (§4.12).
- `track.ts` — track position model (§4.3): bendFraction, isBend segment map, leanAngle, kN, kV, cornerFactors, lapCrrMultiplier, and the wheel→COM speed inversion.
- `cda.ts` — whole-lap energy-balance CdA (§4.9): energyBalanceCda (returns full E_in/ΔKE/E_roll/E_aero breakdown), cdaPerLap, cdaRace with 95 % CI from lap scatter, sane-range predicate.
- `simulate.ts` — forward simulator (§4.10): semi-implicit Euler at dt=0.1 s over the track model, lap-split interpolation, default standing-start power template.
- `solve.ts` — bisection inverse solvers for power/CdA/crr/mass/rho vs a target time; Watts-to-Win (power-to-match + ΔCdA alternative) (§4.11).
- `density.ts` — fast-mode lap-vector normalization + full-mode re-simulation + equivalent-time-at-ref-density (§4.12).
- `wprime.ts` — Skiba W′ balance with the spec τ, plus CP/W′ estimation from mean-maximal points (§4.13).
- `pacing.ts` — 3-parameter pacing-family grid search under W′bal ≥ 0, and actual-vs-optimal comparison with per-lap time lost (§4.14).
- `calculators.ts` — cadence (+grid), power-for-speed flat & full-track modes, watts-saved (+grid), time adjuster (env→ρ→scale) (§5.8).

**Test status:** `npm test` **99/99 passing** (11 files; 82 new engine tests + the 17 pre-existing store tests); `npm run build` and `npm run lint` both clean.
- **Gate 6 (air density) — full:** `airDensity(24,1006,55) = 1.1722` (within 1e-4 of target).
- **Gate 7 (calculators) — full:** power-for-speed@63 kph = 684.29 W; watts-saved@60 kph,5 counts = 13.31 W; time-adjuster 15.6 s @ρ1.1722→0.9934 = 14.7627 s (target 14.7626). All within spec tolerance.
- **Gates 4 & 5 — synthetic** (fixture `.fit` ingest is P3, so these are synthetic-data forms): CdA energy balance recovers the ground-truth CdA to ~1e-8 on constant-COM-speed data and to ~1e-5 on a constant-power interior lap from the forward sim; forward-sim/solver round-trips recover input power and CdA; two synthetic rides land in [0.16,0.26] and within 0.015 m² of each other.
- **Gates 1–3** (parse, race detection, lap construction) depend on §4.4–4.8 and are deferred to P3 with the real fixtures.

**What's next:** P3 Ingest — §4.4–4.8 (FIT parse → 1 Hz timeline, race detection, standing-start reconstruction, lap construction/calibration, venue geometry fitting) + detection-confirm UI, run against the two real fixtures for gates 1–5, and add `data/fixtures/expected.json`.

**Deviations / documented judgment calls (SPEC §9):**
- **Scope:** §4.4–4.8 intentionally NOT built here — they're the P3 phase and gates 1–3 depend on them. Gates 4/5 done in synthetic form; 6/7 in full. This matches P2's charter in §8.
- **Wheel→COM inversion (§4.3/§4.9):** the spec gives `v_com = v_wheel/kV(v,s)` but kV is defined via COM speed, so the inversion is a fixed-point iteration (6 iterations; converges to ~1e-10 because kV≈1.03). Documented in `track.ts`.
- **CI estimator (§4.9):** "95 % CI from lap-to-lap scatter" implemented as the normal approximation 1.96·SD/√n. Spec asks for a 95 % CI but not a specific estimator; normal approx keeps the engine dependency-free.
- **W′ recovery form (§4.13):** spec gives the recovery τ but not the update; used the canonical Skiba exponential relaxation toward W′, `W′bal ← W′ − (W′−W′bal)·e^(−dt/τ)`. Depletion is the exact spec form.
- **Pacing family (§4.14):** the three FREE parameters are (startMult, settleW, endKickFrac) per spec; the opening length (1.5 laps) and end-kick magnitude (×1.10) are fixed structural constants so the search space stays 3-D. Documented in `pacing.ts`.
- **Integrator (§4.10):** semi-implicit (symplectic) Euler at the spec's dt=0.1 s (chosen for stability near the standing start without changing the step); a MAX_ACCEL guard and a propulsion speed-floor tame the v→0 singularity at the start. Absolute ±1.5 s fixture reproduction (gate 5) is verified in P3 with real power series.
- **Geometry closing:** `makeTrack(L,R)` derives the straight length that closes `L = 2S + 2πR` (§3.2). The engine assumes a closing geometry; the store reconciles a venue's published S/R residual before calling the engine. (Note: the seed venues' placeholder R=23/S=42 do NOT close — that's expected per §3.2 and handled at the store/UI layer.)
- **Full-track-model power (§5.8):** interpreted as the lap-average power to hold a constant COM speed — aero unchanged by cornering, rolling lifted by the lap-averaged kCrrLap. Reduces to the flat equation on a straight track.

---

## 2026-07-03 — P3 Ingest

**Model:** Claude (Opus 4.8), via Claude Code CLI

**Completed:** the full FIT-ingest pipeline (SPEC §4.4–4.8) under `src/engine/ingest/`, the two real fixtures wired into automated gate tests, and the detection-confirm UI. `ENGINE_VERSION` bumped `0.2.0-p2` → `0.3.0-p3` (CdA formula changed — see the wheel-path fix below). All ingest is pure TS; the only new dependency, `fit-file-parser`, is DOM-free and isolated in `fit.ts`.

- `fit.ts` — `fit-file-parser` adapter → record-level power/speed/distance/cadence/temperature (§4.4). Verified both fixtures: quali 326 records (first ≈8.63 m/s, 18.8 m, P=0), final 332.
- `timeline.ts` — 1 Hz timeline over the race segment; gaps ≤5 s interpolated (flagged), >5 s split into segments (race = longest); dropout stats for the quality badge (§4.4).
- `detect.ts` — race detection (§4.5): 10 s>250 W window (150–350 s), start anchor (walk back to v<1, else missingStart), t0 refine (linear/jerk-free extrapolation to v→0, clamp ≤3.5 s), finish = 4000 m datum crossing.
- `laps.ts` — calibration + 16 lap boundaries (§4.7); reports interior-14-lap factor c and per-lap line height; builds calibrated-datum-speed sample groups for the CdA.
- `start.ts` — standing-start energy reconstruction (§4.6).
- `geometry.ts` — venue geometry fitting (§4.8): R+phase grid-search matching the kV shape to the band-passed speed.
- `analyze.ts` — end-to-end `analyzeRide()` → detection, calibration, CdA (laps 3→16), start metrics, sim reproduction.
- `src/components/SpeedTrace.tsx` + `src/pages/Rides/DetectionConfirm.tsx` — drop `.fit` → detect → speed trace with draggable start/finish handles + official-time field + one-click confirm (§4.5 / §5.1).
- `data/fixtures/expected.json` — machine-readable gates; `src/engine/__tests__/fixtures.test.ts` asserts gates 1–5 against the real files; `ingest.test.ts` covers timeline/start/geometry.

**Test status:** `npm test` **115/115 passing** (13 files); `tsc -b`, `npm run build`, `npm run lint` all clean. Fixture gates 1–5:

| Gate | Quali | Final | Threshold | ✓ |
|---|---|---|---|---|
| 1 parse / 1 Hz / dropout | 326 rec, 318 s, 0 s | 332 rec, 343 s, 23 s | built + stats | ✓ |
| 2 detection Δ vs official | −1.20 s (missingStart) | +1.07 s (v≈2.58) | ≤ 2.5 s | ✓ |
| 3 lap count / calibration c | 16 / 0.9959 | 16 / 1.0041 | 16 / [0.99,1.01] | ✓ |
| 4 CdA | 0.1694 | 0.1676 | [0.16,0.26], Δ<0.015 (=0.0018) | ✓ |
| 5 sim reproduction Δ | −0.85 s | −0.82 s | ≤ ±1.5 s | ✓ |

**What's next:** P4 Rides — upload flow (drop→confirm→metadata→save&analyze), CSV import, rides list, ride detail with all charts (introduce the Plotly chart wrapper here per §2).

**Deviations / documented judgment calls (SPEC §9):**
- **⚠ Wheel-path double-count between §4.7 and §4.9 (flagged to owner, approved).** As written, §4.7 calibration `c = 4000/dRaw` already absorbs the full wheel-vs-datum path excess (lean + line height), and §4.9 then divides speed by `kV` again — double-counting the lean excess by ~2%. With the literal spec the forward sim (§4.10, the physical ground truth) runs 5–8 s slow, so **gate 5 fails** (CdA also inflated to 0.179/0.183). Fix: calibration owns the wheel→datum conversion; the CdA uses the COM datum speed `v_com = c·v_wheel` and drops the `/kV`. Steady-window reproduction then goes from +4.6/+6.3 s to +0.9/+0.6 s, all gates pass, CdA = 0.169/0.168. Owner confirmed this matches his own iterative calcs (~0.164–0.17 with Crr 0.0014) and approved the deviation. Implemented in `cda.ts` (Sample now carries `vCom`); `kN` rolling lift retained (a separate effect). Consequence: **comHeightM no longer affects CdA** (it lived only in the dropped `kV` term).
- **Detection finish = 4000 m datum crossing, not power-collapse (§4.5.3).** Power-collapse runs ~3.6 s long on the final (rider pedals ~56 m past the line), which fails gate 2; the 4000 m crossing is the timed pursuit distance and what officialTimeS / the lap-16 boundary / §4.5.5 alignment reference. Power-collapse remains the coarse window detector.
- **Gate-5 reproduction handles the under-recorded start.** The SRM reads ~0 W while the rider is already accelerating off the gate, so simulating from a standstill with raw power starves acceleration. Reproduction instead uses the measured (real) elapsed time to the first valid-power sample, then simulates the remaining datum distance with the trustworthy measured power.
- **Crr stays 0.0014 (drum-measured, gate-mandated); track "draggability" belongs in the venue `surfaceFactor`.** The owner's field model inflates Crr to 0.0021 to absorb corner rolling; this engine adds that corner rolling explicitly via `kN`, so it keeps 0.0014 and must not also inflate Crr (that would re-introduce a double-count).
- **Geometry fit (§4.8) is approximate.** It recovers a consistent ~19.5 m across both rides (vs the 23 m UCI placeholder), but the rider's own cornering speed modulation confounds the raw `kV` amplitude, so only the shape/phase is reliable. Adequate as a first-pass; not gated.
- **Detection-confirm UI is SVG, not Plotly.** §2 mandates a single Plotly chart wrapper; that lands in P4 with the ride-detail charts. P3's detection screen needs only a line + two drag handles, so SVG keeps P3 dependency-free.
- **Tooling:** added `fit-file-parser`; added `node` to `tsconfig.app.json` types so the co-located Node-based fixture tests type-check (engine runtime purity is unaffected and separately grep-verified).
