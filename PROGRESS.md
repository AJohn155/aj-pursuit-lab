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

---

## 2026-07-03 — P3 review pass

**Model:** Claude (Fable 5), via Claude Code CLI

Owner-requested audit of the P3 commit (`a8c340c`) against SPEC §4 physics, §7 gate integrity, data safety, and mobile. **Findings: no severity-1 issues (no wrong physics beyond the already-approved deviations, no data-loss paths); gate tolerances verified 1:1 against §7 — none weakened** (tests actually add tighter un-specced assertions: exact record counts, strict 1 Hz spacing). Two severity-2 items found and fixed:

1. **Deviations that P3 implemented but failed to list (§9 requires explicit listing) — recorded here for the permanent record:**
   - **§4.7.3 oscillation check not implemented** (band-passed speed peaks, two-peaks-per-lap check, peak-phase-in-degrees / `peakSpeedPhaseDeg`). Deferred; needed by P4's speed-vs-position overlay and would also enable a calibrated pre-official duration estimate (the gate-2 residuals of −1.20/+1.07 s are almost entirely the uncalibrated raw-4000 m finish crossing).
   - **§4.7.4 interior-c anchors deviate:** spec anchors the 14-lap window on "same-phase oscillation anchors"; implementation uses official-time-anchored lap-line boundaries. The spec's preference clause covers official *splits*, which we don't have (official *total* only) — so this is a real deviation, chosen because official anchoring is more robust than oscillation on these files. Gate 3 still measures a genuine interior 14-lap `c`.
   - **§4.5.5 partially implemented:** the cross-check (±2.5 s) and the effective alignment (distance-anchoring via `calibrationRace`) exist; the ">1 % stretch → quality flag" does not (no quality-flag system until §4.16, P4). Fixture stretches are 0.49 %/0.43 %, under the threshold.
   - **§4.6 display-only synthesized start power profile not implemented** (energy-side reconstruction is done); it's a P4 ride-detail display feature.
   - **§4.7.2 half-lap boundaries not constructed** (needed for §5.9 fastest-half-lap records; P4/P7).
2. **`extrapolateStart` hardening (`detect.ts`):** unguarded `v[start..start+4]` could read out of bounds on a degenerate file (effort ending within 5 samples of segment end) and propagate NaN through the whole analysis; a decelerating fit (slope ≤ 0) could "refine" t0 *forward*. Now returns no-refinement (0) in both cases, and the index-coincidence `ys[x]` loop is rewritten with explicit indices. Fixture outputs unchanged (both fixtures take the slope>0, dt<0 path).

Severity-3/4 items fixed opportunistically: SpeedTrace drag-handle grab area doubled (16→32 viewBox units — was ~8 CSS px on a phone, unusable by touch); dead `officialTimeS` prop removed from SpeedTrace; odd defensive ternary removed in DetectionConfirm.

Severity-3 items **deferred, on the record:** (a) `buildTimeline` selects the race segment by record count — a long gap-free warmup would win instead of the race; P4's historical-file imports should switch selection to "segment containing a valid §4.5 window"; (b) `fit.ts` `force:true` parses CRC-damaged files silently — wire into §4.16 quality flags in P4; (c) final's negative avg line height (−0.17 m) is physically impossible and encodes rollout/track-length error — P4 UI must label it as calibration residual, not hide it.

**Test status after fixes:** full suite re-run — all tests passing; `tsc -b`, `npm run build`, `npm run lint` clean. Fixture gate numbers identical to the P3 entry (fixes are guards/UI-only).

---

## 2026-07-04 — P4 Rides

**Model:** Claude (Sonnet 5), via Claude Code CLI

**Completed:** the full upload flow (drop → confirm → metadata → save & analyze), CSV import wizard, rides list, and ride detail with every §5.1 chart. Live-verified end-to-end in a real browser (not just build/test-level) by uploading the quali fixture through the actual UI, filling in real metadata, and confirming every chart renders — see the worked numbers below.

**Engine additions (`src/engine/`), needed by the UI but not yet built in P2/P3:**
- Cadence threaded into the ingest `Timeline` (was parsed but discarded).
- `cdaRolling` (§4.9): centered ~1-lap window, step ¼ lap, over a distance-carrying sample series (`raceSampleSeries`, new in `laps.ts`).
- `computeAccelDecel` (`accel.ts`), `lapSpeedVsPositionSeries` (`overlay.ts`), `peakSpeedPhaseDeg` (extends `geometry.ts`'s profile function with a lap-range parameter) — §4.15/§4.7.3.
- `assessQuality` (`quality.ts`, §4.16): the 0–100 badge score with a documented deduction rubric (spec names 7 criteria, not point values).
- `report.ts`: `analyzeRideFull()` wraps the gated `analyzeRide()` with all of the above into `FullRideAnalysis` — the compact §4.15 `AnalysisResult` (persisted) plus the rich per-second diagnostics ride detail needs (timeline, overlay, rolling CdA, a continuous W′bal curve) that are **not** persisted.
- `ENGINE_VERSION` left at `0.3.0-p3` — nothing here changes an existing physics formula, only orchestrates already-tested pieces into new aggregates.

**Real bug found and fixed while building the lap table:** `constructLaps`'s per-lap line-height loop used `interpAt(t, d, lapBoundaryTimes[0])` for lap 1's start boundary, but for a `missingStart` race that boundary (`t0`) is extrapolated *before* the timeline's first real sample — `interpAt` silently clamped to the wrong distance, producing a line height of **−2.24 m** (should be centimeters). Fixed to use the already-correct triangular-extrapolated `detection.d0` for that one boundary; lap 1 now reads 0.162 m, consistent with the rest of the race. Regression test added (`ingest.test.ts`). CdA/gate numbers are unaffected — this bug was isolated to the line-height diagnostic.

**Store additions:** `Settings.cpW`/`wPrimeJ` (generic elite-endurance defaults, manually tuned in the UI — see deviations); `Ride.analysis` typed as the engine's `AnalysisResult` (was `unknown`); `Ride.manualAvgPowerW` for CSV-imported rides with no fit file; `resolveRideDensity`, `analyzeStoredRide`, `bytesToBase64`/`base64ToBytes` helpers.

**UI:** `Chart.tsx` (Plotly wrapper, §2 — binds `react-plotly.js`'s dependency-injectable factory to `plotly.js-dist-min` rather than the full `plotly.js` package); `DetectionConfirm` now hands `{fitBytes, officialTimeS}` up via `onConfirm` instead of dead-ending; `MetadataForm` + `UploadFlow` (venue/gear/density-or-T-P-RH/kit/notes/flags → `analyzeRideFull` → save → navigate); `RidesList` (sortable table, normalized time, avg W, CdA, quality badge); `RideDetail/` (traces, lap table, per-lap CdA + trendline, rolling CdA, start panel, W′bal curve, accel/decel, speed-vs-position overlay, quality panel — 8 sub-components + `index.tsx` orchestrator); `CsvImport.tsx` (paste/upload → parse → column-mapping → preview with per-row validation → create rides without fit files, §3.6).

**Live verification (real browser, not just build/tsc):** uploaded the quali fixture through the actual drop zone, confirmed detection (−1.20 s vs official, matches gate 2 exactly), filled in venue/density/mass, saved, and inspected the persisted `Ride` directly in IndexedDB — `cdaRace=0.16940`, `ci=0.00756`, `qualityScore=94.4`, `startEnergyJ=5768.3`, all **exact matches** to independent Node-script probes of the same pipeline. Rides list showed correct normalized-time scaling (246.793 s → 248.829 s for the denser reference density). Ride detail rendered all nine chart sections with real data (peak power 1342 W and accel/decel totals 104 s/99 s also exact-matched the probes); toggling the Speed checkbox correctly hid/showed that trace. CSV import: parsed a 3-row paste (including a quoted comma field), correctly matched two venues, correctly flagged an unmatched venue for skip-with-reason, and created exactly the 2 valid rides (cleaned up after verification). Checked responsiveness at both desktop (1400 px) and mobile (375 px) — Plotly's `useResizeHandler` adapts correctly.

**Test status:** `npm test` **161/161 passing** (16 files; 25 new P4 tests); `tsc -b`, `npm run build`, `npm run lint` all clean. Engine purity re-verified (grep): only `fit-file-parser` is a non-relative import in real `src/engine` code.

**What's next:** P5 Compare + progression — pick 2+ rides for gap/lap-split/CdA/W′bal/speed-vs-position comparison charts, and a progression view of any metric vs date across all rides.

**Deviations / documented judgment calls (SPEC §9):**
- **Line-height is nearly non-discriminating across laps (newly discovered, UI made honest about it rather than silently hidden).** Lap boundaries are placed at `n·L/calibrationRace` — a single global factor — so the raw distance between any two consecutive boundaries is forced to the same value by construction, regardless of how the rider actually rode. Verified directly: spread across all 16 laps was `0.00000` to 5 decimals. This isn't a new bug (P3's calibration architecture is unchanged and still gate-3-correct) — it's an inherent consequence of not having lap boundaries anchored independently of that calibration, i.e. the still-deferred §4.7.3 oscillation-peak detection (flagged in the P3 review, and again here since it's now visibly a UI concern). `LapTable` shows a caption explaining this when the spread is below 1 mm, rather than presenting a misleadingly-precise-looking column. This is also what closes out the P3 review's item (c): final's −0.17 m is a genuine calibration residual, now labeled as such rather than silently displayed.
- **CP/W′ (§4.13/§5.10) is a manually-set Settings default (400 W / 25 kJ), not a fit.** `estimateCpWprime` (built in P2) needs mean-maximal-power points at several *different* durations; the only data on file is ~4-minute pursuit efforts (one duration), so the fit is underdetermined. The W′bal chart is a genuine computation from the ride's real power series — only the CP/W′ *inputs* are a placeholder the owner should tune in Settings.
- **`Ride.analysis` stays a compact cache; ride detail always recomputes fresh from `fitFileB64`.** Per §3.3's "recomputed on demand," `RideDetail` re-runs `analyzeRideFull()` using *current* Settings/Venue every time it's opened (so a Crr or CP/W′ change is reflected immediately), rather than trusting the cached summary. Deliberately **not auto-persisted on every view** — bumping `updatedAt` just from looking at a ride could interact badly with last-write-wins sync (P1's venue-sync incident was exactly this class of bug). An explicit "Save recomputed analysis" button updates the cache (and hence the rides list) only on a genuine user action.
- **CSV import (§3.6) maps date/venue/gear/finish-time/avg-power/notes plus an ordered set of per-lap-split columns; "1k/2k/3k cumulative" is not mapped or stored** — the `Ride` schema has no field for cumulative split marks, only per-lap `officialSplits`, and adding one wasn't requested. Venue matching is exact-name (case-insensitive); an unmatched venue skips that row with a reported reason rather than fabricating a venue reference. "Avg power" for a fit-less CSV row has nowhere to live in engine-derived data, so it's stored in a new `manualAvgPowerW` field that `RidesList` falls back to only when `ride.analysis` is absent.
- **accelDecel classification (§4.15) uses a ±0.02 m/s per-second deadband** to avoid classifying measurement noise on a steady effort as accel/decel — spec names the fields, not a criterion.
- **Detection-confirm drag handles remain visual-only (carried over from P3, now more visible since the UI is complete).** `detectRace()` doesn't accept a manual start/finish override; the corrective path for a mis-detected race is adjusting the `officialTimeS` field (which the ±2.5 s check and the whole-race calibration key off), not repositioning the handles. Both fixtures auto-detect correctly, so this doesn't block the phase, but a genuinely bad auto-detection on a future ride would need this to become real.
- **Bundle size:** now 5.7 MB (1.7 MB gzip), up from ~1 MB, now that Plotly is actually imported by live routes instead of tree-shaken. Flagged as a P8-polish candidate (dynamic `import()` / code-splitting per Vite's own warning), not addressed now — functionality over bundle size at this stage for a single-owner tool.
- **Tooling:** added `plotly.js-dist-min` + `react-plotly.js` (bound via its `/factory` entry point, not the default export, which hardcodes an import of the full `plotly.js` package) + `@types/plotly.js`; added a `src/types/plotly-dist-min.d.ts` ambient declaration since the dist-min package ships no types of its own. Added `.claude/launch.json` for the dev-server preview tool (portable Node needed the direct `node <vite.js>` invocation, not `npm run dev`, to resolve in this sandbox).

---

## 2026-07-04 — P4 review pass

**Model:** Claude (Fable 5), via Claude Code CLI

Owner-requested audit of the P4 commits (`5cc772d`, `076d112`) against SPEC §4 physics, §7 gate integrity, data safety, and mobile. **Findings: no severity-1 issues (no data-loss paths; backup export covers all five collections with full docs; no new delete paths); §7 gate files untouched by P4 — no weakened tolerances** (verified via commit stats: `fixtures.test.ts`/`expected.json` unchanged; new tests only add assertions). Mobile live-verified at 375 px during P4; no breakage. Two severity-2 items found and fixed:

1. **Missing migration for the new `Settings.cpW`/`wPrimeJ` fields → NaN persisted into `Ride.analysis` on existing devices.** `ensureSeeded()` only seeds when no settings doc exists; the owner's real devices carry a P1-era doc *without* the new fields, so `settings.cpW` is `undefined` at runtime, flows into `wPrimeBalance({cp: undefined})`, and produces NaN through every lap's `wPrimeEnd` and the W′bal curve — **saved into the analysis cache** on the next upload. (P4's live verification missed it because the preview browser seeded fresh with the new defaults.) Fix: `withSettingsDefaults()` in `store/types.ts` — a **read-time** backfill (`{...DEFAULT_SETTINGS_VALUES, ...doc}`) applied at every consumer (`GlobalParams`, `MetadataForm`, `analyzeStoredRide`, `RidesList`). Deliberately *not* a write-time migration: writing the backfilled doc would bump `updatedAt`, and a stale device migrating late could clobber a genuine newer edit via last-write-wins — the exact class of bug behind the P1 venue-sync incident. Unit tests simulate a P1-era doc (backfill works, owner edits always win).
2. **§4.16 scored dropout over the whole timeline segment, not "in race".** `report.ts` passed `timeline.dropoutSeconds` (segment-wide) to `assessQuality`; the final fixture's ~23 interpolated seconds are almost entirely standing-at-the-gate time *before* the start, wrongly docking a clean race ~18 points (73.9/yellow). Fixed to count interpolated samples inside the detected race window only. Final fixture: **73.9/yellow → 94.4/green** (its one genuine in-race interpolated second docks −0.5); quali unchanged at 94.4; CdA values byte-identical (0.1694/0.1676 — scoring only, no physics change). `timeline.dropoutSeconds` remains the segment-wide stat gate 1 asserts on. Regression test added.

Severity-4 items fixed opportunistically: the 700 KB guard error message said "it won't be attached" when the save actually aborts entirely (now says so); `SpeedTrace` power axis gets a 1 W floor so a degenerate all-zero power series can't produce NaN polyline points.

Severity-3 items **deferred, on the record:** (a) `peakSpeedPhaseDeg` averages band-passed profiles over laps 1–16 — the standing-start ramp contaminates the average (quali reports 180°, final 50°, same rider/venue; the steady 3–15 window would be more physical). Changing it alters stored analysis values, so it should ride along with the next `ENGINE_VERSION` bump rather than churn now. (b) Detection-confirm prefills "Official time" with the *detected* duration, so the "+0.00s vs official" chip is initially a tautology — enter the real official time before confirming. (c) Rides-list normalized time applies the steady cube-root scale to the whole time with no §4.12 lap-1 blend — matches the owner's historical whole-time convention, documented in `density.ts`, but is a literal §4.12 deviation now user-visible. (d) `ENGINE_VERSION` was not bumped for P4's line-height output fix; no stale cache exists today (the only saved ride post-dates the fix), but the next output-affecting change must bump it — and should fold in (a).

**Test status after fixes:** `npm test` **165/165 passing** (17 files; 4 new regression tests); `tsc -b`, `npm run build`, `npm run lint` all clean. Fixture CdA/gate numbers identical (fixes are scoring/migration/UI-copy only).

---

## 2026-07-04 — P5 Compare + progression

**Model:** Claude (Sonnet 5), via Claude Code CLI

**Completed:** the full §5.2 Compare page — ride picker, gap chart, lap-split grouped bars, per-lap CdA overlay, W′bal overlay, speed-vs-position overlay, and the progression view — plus the pure comparison math it's built on.

- `src/pages/Compare/compare.ts` — pure, unit-tested: `buildDistanceTimeSeries`/`timeAtDistance` (inverts each ride's 1 Hz cumulative-distance-vs-time series so the gap chart can sample every ride at a common distance grid, since different rides' lap boundaries land at different distances even at the same venue), `gapCharts` (first selection = reference, matching §5.2's spec exactly), `speedPositionAverage` (bins each ride's per-lap speed-vs-position points, already computed by `report.ts`'s `overlay`, across its steady laps into one representative line per ride — the per-ride, per-lap version from RideDetail would be 16 lines × N rides and unreadable here).
- `RideSelector.tsx` — ordered multi-select (an array, not a Set: check order determines the gap-chart reference, shown live as "Reference"/"#2"/etc.), color-coded dots shared with every chart via `colorFor`.
- `GapChart.tsx`, `LapSplitChart.tsx`, `CdaOverlayChart.tsx`, `WBalOverlayChart.tsx`, `SpeedPositionOverlayChart.tsx` — one ride/series per selected ride, reusing the same `analyzeStoredRide` → `FullRideAnalysis` pipeline RideDetail uses (so Compare always reflects current Settings/Venue, same "recomputed on demand" contract as §3.3).
- `Progression.tsx` — metric selector (finish time, normalized time, CdA, avg power, start time, avg line height) vs date across **all** rides (not just selected), kit tags on hover, outdoor rides (venue.indoor===false) rendered as hollow markers via a transparent-fill/colored-stroke marker, trendline (`linearTrend`, reused from `RideDetail/trend.ts`) excluding outdoor rides by default with a toggle to include them.
- `src/pages/Compare/index.tsx` — orchestrates selection → per-ride analysis (with a visible per-ride error banner for a missing venue or fit file) → the five compare charts (needs 2+ analyzable rides) → Progression (always visible once any ride exists, independent of selection).

**Real bug found and fixed during browser verification:** Plotly's date axis, given two rides sharing the exact same `date` string, computes a zero-width auto-range and ticks it in **sub-second** increments (`23:59:59.999`, `00:00:00.0005`) — unreadable, and this isn't a contrived case: a qualifying + final on the same day is the normal case for this owner's data. Fixed by pinning `xaxis: { type: 'date', tickformat: '%Y-%m-%d' }` on the Progression chart.

**Live verification (real browser via the preview tool, not just build/tsc):** loaded both fixtures (the quali ride was already saved from a prior P4 session; uploaded the final fixture through the actual drop-zone → detection-confirm → metadata-form flow, simulating the file drop with a real `DataTransfer`/`File` since no OS file-picker is available in this environment — bytes fetched from a fixture copy temporarily placed in `public/` and removed immediately after, never committed). Selected both rides in Compare and confirmed all five charts render with physically sensible shapes: the gap chart shows the final (slower, 248.699 s) losing a steady ~1.5–2.3 s to the quali (246.793 s) reference across the whole 4000 m, matching the ~1.9 s official gap; the CdA overlay lands both rides' per-lap values inside [0.16, 0.19], consistent with the gate-4 race-window numbers (0.1694/0.1676); the speed-vs-position overlay shows the expected two-peaks-per-lap oscillation from the two-bend/two-straight geometry. Checked responsiveness at 375 px (mobile) and native desktop width — Plotly's `useResizeHandler` and the ride-selector table's horizontal scroll both work; no console or server errors at any point. `npm test` **170/170 passing** (18 files; 5 new Compare tests); `tsc -b`, `npm run build`, `npm run lint` all clean.

**What's next:** P6 Scenario tools — Adjuster, Watts to Win (+ event records CRUD), Gains, solve-for-anything, isochrone chart.

**Deviations / documented judgment calls (SPEC §9):**
- **Pinned scenarios are not selectable in Compare yet.** §5.2 says "pick 2+ rides (and/or pinned scenarios)," but Scenario CRUD is P6 (Adjuster) — no scenario can exist with a `result` today, so there's nothing to compare. `CompareItem` (the shape every chart consumes) is ride-agnostic (`{id, label, color, full}`), so wiring in scenario-derived items later shouldn't require touching the chart components.
- **Speed-vs-position overlay averages laps 3 → min(15, lapCount−1) per ride**, matching the steady-window convention already used for CdA (`CRUISE_FIRST_LAP`) and the geometry fit (`STEADY_LAST_LAP`) rather than inventing a new range. Binned (40 bins/lap) rather than raw per-second points, since different rides' laps don't share position samples to overlay directly.
- **Gap-chart resolution is a 20 m grid, not per-sample.** The distance→elapsed-time inversion is linear between each ride's own 1 Hz samples, so 20 m is well inside the interpolation error tolerance (a rider covers ~20 m in little more than 1 sample already) while keeping the chart light.
- **Progression's "start time" metric is `startMetrics.timeTo95PctCruise`** (already computed by `report.ts`) and "avg line height" is the mean of `analysis.laps[].lineHeightM` — §5.2 names both metrics but not their derivation; both reuse fields the P4 ride-detail page already established rather than adding new engine surface.
- **Progression reads only the persisted `ride.analysis`** (not a live recompute per ride), matching `RidesList`'s existing pattern — a ride with no cached analysis (e.g. CSV-imported, fit-less) simply doesn't contribute a point for CdA/avg-power/start-time/line-height, though it still can for finish/normalized time.
