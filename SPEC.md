# AJ Pursuit Lab — Build Specification v1.0

Single source of truth for building this application. Every implementation session must read this file first. Do not deviate from the physics in §4 without flagging it to the user.

## 1. Project overview

A private, personal web dashboard for analyzing 4 km individual pursuit (IP) races from SRM PM9 `.fit` files. The owner (Anders, "AJ") is an elite track cyclist. The app parses ride files, runs a velodrome-specific physics model to estimate CdA and related metrics, catalogues ~20 historical and ~6/year future rides, and provides simulation tools (scenarios, watts-to-win, pacing, race-day planning).

Primary goals: understand past pursuits deeply; identify concrete paths to going faster.

Users: one owner (write access). Future: read-only share links (out of scope for v1; design must not preclude it).

Devices: desktop (upload + full analysis) and phone (viewing, editing metadata, calculators, adjuster). Fully responsive. `.fit` upload is desktop-only in practice but should not be artificially blocked on mobile.

## 2. Tech stack and architecture

- **Frontend:** React 18 + TypeScript + Vite. Tailwind CSS. Single-page app.
- **Charts:** Plotly.js (scientific interactivity: zoom, hover, overlay). Use one consistent chart wrapper component.
- **FIT parsing:** `fit-file-parser` npm package (verify it exposes record-level power/speed/cadence/distance/temperature; if inadequate, implement a minimal FIT record parser — the two fixture files define the required capability).
- **Storage: local-first with cloud sync.**
  - Local: IndexedDB via Dexie. The app is fully functional offline against local data.
  - Cloud: Firebase (Auth with Google provider; Firestore). A sync layer mirrors local ↔ Firestore, last-write-wins on a per-document `updatedAt` timestamp. All reads happen from local; writes go local-first then push.
  - Storage access goes through a single `DataStore` interface so the sync backend is swappable.
- **`.fit` file storage:** raw file bytes stored base64 inside the ride document (files are ~7 KB; Firestore doc limit 1 MB — enforce a 700 KB guard with a clear error).
- **Hosting:** GitHub Pages, deployed by GitHub Actions on push to `main`. Vite `base` configured for the repo path. SPA fallback via 404.html copy trick.
- **Auth model v1:** single owner. Firestore security rules: all documents live under `users/{uid}/...`; rules allow read/write only when `request.auth.uid == uid`.
- **No server code.** All computation client-side.

### 2.1 Repository layout

```
/SPEC.md              this file
/PROGRESS.md          running build log (see §9)
/data/fixtures/       the two real .fit files + expected-values JSON
/src/engine/          pure TypeScript physics engine (no React imports)
/src/engine/__tests__ vitest unit tests
/src/store/           Dexie schema, Firebase init, sync layer
/src/pages/           one folder per tab
/src/components/      shared UI
/.github/workflows/   deploy.yml
```

Engine purity rule: `src/engine` must be importable in Node (tests) with zero DOM/React dependencies.

## 3. Data model

All persisted objects carry `id`, `createdAt`, `updatedAt` (ISO strings).

### 3.1 Settings (singleton)
```
rolloutM: 2.090            // wheel circumference, meters. One canonical value.
systemMassKg: 100          // rider+bike+kit default
tyreCrr: 0.0014            // drum-measured, Vittoria Pista Speed @ ~110 psi
mechEfficiency: 0.98
comHeightM: 1.10           // rider center-of-mass height above track when upright (for lean geometry)
rotatingMassEqKg: 1.0      // added to mass for KE/acceleration terms only
referenceAirDensity: 1.15  // matches the owner's historical normalization convention
```

### 3.2 Venue
```
name, city, country
lapLengthM: 250 | 333.33 | other
bendRadiusM         // center of the datum-line arc
straightLengthM
bankingDeg
indoor: boolean
altitudeM
surfaceFactor: 1.0  // multiplies tyreCrr; editable
geometrySource: 'published' | 'fitted' | 'user'
fittedBendRadiusM?  // from oscillation fitting, shown alongside
notes
```

Seed venues (create on first run):

| name | lap | bendR | straight | banking | indoor | altitude | notes |
|---|---|---|---|---|---|---|---|
| VELO Sports Center (LA) | 250 | 23.0 | 42 | 45 | yes | 15 | timber |
| Peñalolén (Santiago) | 250 | 23.0 | 42 | 44 | yes | 700 | 2025 Worlds |
| Ballerup Super Arena | 250 | 23.0 | 42 | 44 | yes | 25 | 2024 Worlds |
| Asunción | 250 | 23.0 | 42 | 44 | yes | 90 | |
| Vélodrome National SQY (Paris) | 250 | 23.0 | 42 | 44 | yes | 110 | 2022 Worlds |
| Vicente Chancay (San Juan) | 250 | 23.0 | 42 | 44 | yes | 650 | |
| Cambridge (NZ) | 250 | 23.0 | 42 | 43 | yes | 55 | |
| 7-Eleven Velodrome (COS) | 333.33 | 33.5 | 60 | 33 | **no** | 1840 | concrete, outdoor: interpret CdA with caution |

Bend radius defaults are UCI-typical placeholders (21–26 m range); constraint `lapLengthM = 2·straightLengthM + 2π·bendRadiusM` must hold — when the user edits one field, recompute a dependent field and show the residual. Fitted values (§4.8) refine these.

### 3.3 Ride
```
date, venueId, eventName, round: 'qualifying'|'final'|'other'
officialTimeS            // e.g. 246.793
officialSplits: number[] // cumulative or per-lap times at lap lines; store per-lap seconds
gear: {chainring, cog}   // e.g. {65,15}
airDensity?              // measured at event (owner usually has this)
tempC?, pressureHPa?, humidityPct?  // alternative inputs; if present compute density (§4.2)
systemMassKg (default from settings)
kit: string[]            // free tags: suit, helmet, socks, shoes, overshoes, cranks, position label
notes: string
flags: { outdoor: bool (from venue), caughtRider: bool, interrupted: bool }
result?: string          // "1st", "4th (q)" etc.
fitFileB64?              // raw file
analysis?: AnalysisResult  // cached engine output, recomputed on demand
analysisVersion           // engine version string; recompute when stale
```

### 3.4 Scenario
```
name
baseline: rideId | 'blank'
overrides: { cdA?, avgPowerW? , powerScale?, crr?, massKg?, airDensity?, venueId?, gear? }
result: { predictedTimeS, lapSplits[], note }
pinned: boolean   // pinned scenarios appear as ghost lines in progression/compare charts
```

### 3.5 Event (for Watts-to-Win)
```
name, date, venueId
winners: [{round, name, timeS}]   // e.g. Santiago 2025: Q 242.844 Charlton; F 244.122
myRideIds: rideId[]
```

### 3.6 CSV import
The owner's historical spreadsheet maps: date, venue, air density, gear, finish time, start (first-lap) time, per-lap splits (16×250 m or 12×333 m), 1k/2k/3k cumulative, avg power, notes/kit text. Import wizard: paste CSV or upload; preview mapping; create rides (without fit files); fit files attached later by matching on date.

## 4. Physics engine

Engine version constant `ENGINE_VERSION` bumped on any formula change. All functions pure. SI units internally.

### 4.1 Constants and derived quantities
- g = 9.81 m/s²
- effective inertial mass `mEff = massKg + rotatingMassEqKg` (used in KE and acceleration terms only; gravity/rolling use `massKg`)

### 4.2 Air density from T/P/RH (owner's convention — preserve exactly)
Given T (°C), P (hPa), RH (%):
```
es = 6.11 * exp((2.5e6/461.5) * (1/273.15 - 1/(T+273.15)))   // hPa
e  = (RH/100) * es
rho = (P*100) / (287 * (T+273.15) * (1 + 0.61 * 0.622 * e / P))
```

### 4.3 Track position model
Within one lap of length L: two straights (each S) and two bends (each πR at the datum). Bend fraction `fBend = 2πR/L`. Position-in-lap s ∈ [0,L) maps to segment type. Transition spirals are ignored (acceptable approximation; note in UI docs).

Lean angle at COM speed v in a bend: `theta = atan(v² / (g·R))`.
Normal force multiplier in bends: `kN(v) = sqrt(1 + (v²/(g·R))²)`  (=1/cos θ).
Wheel-path radius when leaned: `Rw = R + comHeightM · sin(theta)` → wheel speed exceeds COM speed in bends by `kV(v) = Rw/R`. On straights kN = kV = 1.

Lap-averaged effective Crr multiplier at speed v: `kCrrLap(v) = (1 - fBend) + fBend·kN(v)`.
Effective venue Crr: `crrEff = tyreCrr · surfaceFactor` (then × kN locally / kCrrLap for lap averages).

### 4.4 FIT ingest
Extract per-record: timestamp, power (W), speed (m/s, wheel-derived), cadence, distance (m), temperature. Build a uniform 1 Hz timeline:
- Gaps ≤ 5 s: linearly interpolate speed/distance; power interpolation: linear; mark interpolated samples.
- Gaps > 5 s: split into segments; the race lives within one segment.
- Record dropout stats for the quality badge.

### 4.5 Race detection
Handle both observed patterns: (a) file begins mid-start (first record already >5 m/s), (b) race embedded after warmup.
Algorithm:
1. Candidate windows: contiguous spans where 10 s rolling mean power > 250 W lasting 150–350 s.
2. Start anchor: walk backward from window start to last sample with v < 1 m/s; if none (pattern a), start = first record and set `missingStart = true`.
3. End anchor: power collapse (rolling 5 s power < 40 % of race mean) sustained; take last high-power sample.
4. Refine t0: fit the first 5 valid speed samples with constant-jerk-free quadratic and extrapolate v→0; clamp extrapolation to ≤ 3.5 s.
5. If `officialTimeS` present: cross-check `|detected − official| ≤ 2.5 s`; if violated, flag for manual adjustment. When confirmed, affine-align the file timeline so detected start/finish match 0 and officialTimeS (stretch ≤ 1 %; larger stretch → quality flag, no stretch applied).
UI: show detected window on the speed trace with draggable start/finish handles; one-click confirm.

### 4.6 Standing-start energy reconstruction
At the first sample with valid power (t₁, v₁): work already done ≈ `0.5·mEff·v₁² + crrEff·massKg·g·d₁` where d₁ = distance covered to t₁ (aero negligible below ~8 m/s over <20 m; include with trapezoid if v₁ > 8). Prepend this as `startEnergyJ` and synthesize a power profile over [t0,t₁] proportional to v·dv/dt for display only. All whole-ride energy metrics include it.

### 4.7 Lap construction and calibration
1. Raw cumulative distance from file (wheel). Apply calibration factor c (below): `dCal = c · dRaw`.
2. Lap boundaries: cumulative dCal crossings of n·L from race start (interpolated within samples). Half-laps at n·L/2.
3. Oscillation check: band-pass speed (subtract centered rolling mean of window ≈ lap time), find peaks; two peaks per constructed lap expected; peak phase gives "position of max wheel speed within lap" (report in degrees of bend arc).
4. **Calibration factor c:** using an interior window of exactly 14 laps (250 m tracks; 10 laps for 333 m) between same-phase oscillation anchors: `c = 14·L / (dRaw over window)`. Since rollout 2.090 is measured, deviations of c below 1 are attributed to line height:
   `avgHeightAboveBlackM (window) = (dRaw·c⁻¹... )` — concretely per lap i: `extraM_i = dRaw,lapᵢ·c* − L` where c* is the *rollout-true* factor (=1.0 by definition); per-lap line height = `extraM_i / (2π)`. Report per lap and race average. When official splits exist, prefer official-split-anchored laps and use oscillation only for within-lap position.
5. If detected lap count ≠ round(4000/L): quality flag.

### 4.8 Venue geometry fitting
From steady laps (laps 3..N−1) of all rides at a venue: fit `R` and `S` (subject to 2S + 2πR = L) minimizing squared error between predicted wheel-speed modulation `kV(v(s))` shape and the observed band-passed speed waveform, averaged across laps. Store as `fittedBendRadiusM`. Show published vs fitted; engine uses `geometrySource` priority user > fitted > published.

### 4.9 CdA estimation (whole-lap energy balance)
Over any integer-lap window [a,b] (default: laps 3 → last full lap; excludable laps flagged `caughtRider` overlap):

```
E_in   = Σ η·P·Δt  + startEnergy(if window includes start)
ΔKE    = 0.5·mEff·(v_b² − v_a²)          // COM speeds at boundaries
E_roll = Σ crrEff·massKg·g·kN(v,s)·v_com·Δt
E_aero = E_in − ΔKE − E_roll
CdA    = E_aero / Σ 0.5·ρ·v_com³·Δt
```
where `v_com = v_wheel / kV(v,s)` sample-by-sample using position-in-lap from §4.7, and η = mechEfficiency. Report:
- `cdaRace` (steady window), with 95 % CI from lap-to-lap scatter
- `cdaPerLap[]` (each single lap)
- `cdaRolling` (centered 1-lap window, step ¼ lap) — display only
- `cdaNormalized = cdaRace` is already density-explicit; additionally report `equivalentTimeAtRefDensity` via §4.12.
Sanity: expected range 0.16–0.26 m²; outside → quality flag, still display.

### 4.10 Forward simulator
State (s, v_com) integrated at dt = 0.1 s over 4000 m of track model:
```
dv/dt = ( η·P(t,s) / v − 0.5·ρ·CdA·v² − crrEff·massKg·g·kN(v,s) ) / mEff
```
Standing start: from v = 0.5 m/s with a start power profile: default = template extracted from the rider's best real start (stored in settings after first analysis; fallback: 3 s linear ramp to 1.3×, decay to steady power by t = 20 s). Steady phase: constant power (or per-lap power schedule). Output: finish time, lap splits, v(s).
Validation requirement: simulating a fixture ride with its own measured power series and fitted CdA must reproduce official time within ±1.5 s.

### 4.11 Inverse solvers ("solve for anything")
Bisection on any single unknown among {avgPowerW, CdA, crr, massKg, rho, targetTimeS} given the others, using §4.10. Watts-to-Win = solve power for winner's time at rider's parameters; also report the ΔCdA alternative (solve CdA at rider's actual power).

### 4.12 Density normalization (owner's convention)
Fast mode: steady-lap times scale by `(ρ_target/ρ_ride)^(1/3)`; lap 1 by `(((ρ_target/ρ_ride)+2)/3)^(1/3)`. Full mode: re-simulate at target density with ride's power. Show both; default display = fast mode for continuity with historical numbers (reference ρ = 1.15).

### 4.13 W′ balance
Skiba differential form: during P > CP, `W′bal -= (P−CP)·dt`; during P < CP, exponential recovery with τ = 546·e^(−0.01(CP−P)) + 316. CP/W′ estimation: fit from the rider's ride history (mean maximal powers at 180/240/300 s) with manual override in settings.

### 4.14 Pacing optimality
Given CP/W′ and the ride's environment/CdA: grid-search a 3-parameter pacing family (start intensity multiplier, settle power, end-kick timing) subject to W′bal ≥ 0, minimize simulated time. Report optimal vs actual: Δtime, and per-lap "time lost to pacing".

### 4.15 Analysis result object
`AnalysisResult` = { detection {t0,tEnd,confirmed}, laps[] {timeS, dist, cda, lineHeightM, avgP, avgV, avgCad, wPrimeEnd}, cdaRace, ci, startMetrics {energyJ, timeTo95PctCruise, peakPower}, accelDecel {sAccel,sDecel,byLap}, peakSpeedPhaseDeg, qualityFlags[], qualityScore, engineVersion }.

### 4.16 Data quality badge
Score 0–100 from: dropout seconds in race (−), detection/official mismatch (−), calibration factor deviation > 1 % (−), lap count mismatch (−), CdA out of range (−), missing density (−), interpolated fraction (−). Badge: green ≥ 85, yellow ≥ 60, red below; hover lists specific flags.

## 5. Pages

Navigation: persistent tab bar (desktop: left rail; mobile: bottom bar). Tabs: **Rides · Compare · Adjuster · Watts to Win · Gains · Pacing · Race Day · Calculators · Records · Settings**.

### 5.1 Rides
- Table/cards of all rides: date, event, venue, time, normalized time, avg W, CdA, quality badge; sort/filter; kit tags visible.
- Upload flow: drop `.fit` → parse → race-detection confirm screen (speed trace, draggable handles, official time field) → metadata form (venue, gear, density or T/P/RH, kit tags, notes, flags) → save & analyze.
- CSV import wizard (§3.6).
- Ride detail: traces (speed/power/cadence, toggleable), lap table (split, official split, CdA, line height, W), per-lap CdA chart with drift trendline, rolling CdA, start panel (§4.6 metrics), W′bal curve, accel/decel summary, speed-vs-position-in-lap overlay (all laps superimposed; shows where in the corner speed peaks/dies), quality panel.

### 5.2 Compare
- Pick 2+ rides (and/or pinned scenarios). Charts: cumulative time-delta vs distance (gap chart, first selection = reference), lap splits grouped bars, per-lap CdA overlay, W′bal overlay, speed-vs-position overlay.
- Progression view: any metric (time, normalized time, CdA, avg W, start time, line quality) vs date across all rides; kit tags on hover; outdoor rides hollow markers, excluded from trendline by default (toggle).

### 5.3 Adjuster
- Baseline selector (ride or blank), override controls (CdA, power or power %, Crr, mass, density, venue, gear), live predicted time + lap splits + overlay vs baseline. Save/pin scenarios. List of saved scenarios with edit/delete/pin.

### 5.4 Watts to Win
- Event records (winners per round). Per event: my time, gap, watts-to-match, ΔCdA-to-match, and "time at +10/+20/+30 W" mini-table.

### 5.5 Gains (marginal gains)
- At chosen baseline ride/scenario: table + tornado chart of Δtime over 4 km per: −0.005 & −0.010 CdA, −0.0002 Crr, −1 kg, −0.02 ρ, +10 W. Unit toggle: seconds ⇄ watts-equivalent (§ Watts saved convention: 1 count = 0.001 CdA).

### 5.6 Pacing
- Ghost builder: target time → schedule (even, or owner-shaped template) → overlay vs any ride.
- Optimality analysis (§4.14) with CP/W′ panel.

### 5.7 Race Day
- Inputs: venue, T/P/RH or density, gear, goal time (or goal power). Outputs: required lap schedule (with owner's start-lap shape), required steady power, cadence per lap for gear, density readout. Big-type phone-friendly card layout; "save as scenario".

### 5.8 Calculators (ports; keep owner's conventions)
- **Cadence:** gear inventory table (editable; seed with 59x14, 60x14, 64x15, 65x15), rollout from settings, grid lap-time (rows, 13.0–17.0 s step 0.1) × gear (cols) → cadence; venue-aware lap length; highlight current ride's gear if opened from a ride.
- **Power for speed:** interactive P(v) per CdA list; flat-equation mode (exact port: `P = (0.5·CdA·ρ·v³ + m·g·Crr·v)/η`) and full-track-model mode toggle.
- **Watts saved (aero):** ΔP = 0.5·(counts/1000)·ρ·v³ grid, speed rows × counts columns.
- **Time adjuster:** two environment blocks (T/P/RH → ρ via §4.2), lap-time vector in, adjusted out; fast mode default, full-sim mode toggle.

### 5.9 Records
Auto-computed from analyzed rides: fastest lap, fastest half-lap, fastest 1k/2k/3k/4k, fastest first lap, best CdA, best line-quality race, best normalized time — each linking to its ride. Indoor-only filter default on.

### 5.10 Settings
Global parameters (§3.1) with provenance notes; venue manager (§3.2, incl. fit-geometry button and published/fitted/user display); CP/W′; start-profile template; export/import full backup JSON; Firebase sign-in state.

## 6. Firestore rules (v1)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 7. Fixtures and validation gates

`/data/fixtures/` contains:
- `SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit` — Worlds quali. Official 246.793 s. File begins mid-start (first record ≈ 8.6 m/s, 18.8 m, P=0). 326 records; contains 2–4 s gaps and post-race riding.
- `SRM_PM9_ANDERS_TP_2025-10-24_18-53-43.fit` — Worlds final. Official 248.699 s. Race embedded after warmup (detected effort ≈ t 877–1124 s); start captured from ≈ 2.6 m/s.
- `expected.json` — machine-readable gates below.

Hard gates (unit tests must assert):
1. Both files parse; 1 Hz timeline built; dropout stats reported.
2. Race detection: quali → missingStart=true; final → start found near v≈2.6 m/s; both detected durations within 2.5 s of official before alignment.
3. Lap construction (with official-time alignment): 16 laps each; interior 14-lap calibration factor within [0.99, 1.01].
4. CdA (ρ: quali 1.122, final 1.116; mass 100; crr 0.0014; η 0.98): cdaRace within [0.16, 0.26] and the two rides within 0.015 m² of each other.
5. Forward sim reproduction (§4.10 validation): within ±1.5 s of official for both.
6. Air density function: T=24, P=1006, RH=55 → 1.1722 (±0.0005).
7. Calculator ports reproduce the spreadsheet examples: power-for-speed at 63 kph, CdA 0.212, ρ 1.12, m 100, Crr 0.002, η 0.98 → 684.29 W (±0.5); watts-saved at 60 kph, 5 counts, ρ 1.15 → 13.31 W (±0.05); time adjuster lap scaling 15.6 s from ρ 1.1722 → 0.9934 gives 14.7626 s (±0.005).

## 8. Build phases

Each phase ends with: all tests green, `npm run build` clean, commit + push, PROGRESS.md updated, and a one-paragraph handoff note. A phase is not complete otherwise.

- **P0 Scaffold:** Vite+React+TS+Tailwind, routing, tab shell, deploy workflow to GitHub Pages, empty pages. Gate: deployed URL loads on phone and desktop.
- **P1 Data layer:** Dexie schema, DataStore interface, Firebase init/auth/sync, settings page, venue seed + manager, backup export/import. Gate: create/edit venue on desktop appears on phone after sign-in.
- **P2 Engine core:** §4.1–4.3, 4.9–4.14 as pure functions with unit tests (synthetic data), calculators' math functions with gate-7 tests.
- **P3 Ingest:** §4.4–4.8 + fixture gates 1–5. Includes detection-confirm UI.
- **P4 Rides:** upload flow, CSV import, rides list, ride detail with all charts.
- **P5 Compare + progression.**
- **P6 Scenario tools:** Adjuster, Watts to Win (+ event records CRUD), Gains, solve-for-anything, isochrone chart (contours of simulated time over CdA×power grid with rides as points; lives in Gains tab).
- **P7 Pacing + Race Day + Calculators UI + Records.**
- **P8 Polish:** mobile QA pass on every page, quality badges everywhere, empty states, loading states, error handling, final deploy.

## 9. PROGRESS.md convention

Append-only log. Each session appends: date, phase, model used, what was completed, test status, what's next, any deviations from SPEC (must be explicitly listed). Implementation sessions read SPEC.md and PROGRESS.md before writing any code.

## 10. Out of scope for v1
Share links / multi-user, team pursuit, rival database, equipment attribution analytics, non-SRM device quirks beyond graceful failure.
