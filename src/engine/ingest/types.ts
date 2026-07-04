// Ingest data types (SPEC §4.4–4.8, §4.15). Pure — no DOM/React (§2.1).

/** One decoded FIT `record` message with the fields the engine needs. */
export interface FitRecord {
  /** Elapsed seconds from the file's first record. */
  t: number
  powerW: number
  /** Wheel-derived speed, m/s. */
  speedMs: number
  /** Cumulative wheel distance, m. */
  distanceM: number
  cadenceRpm?: number
  temperatureC?: number
}

/** Uniform 1 Hz timeline over the race segment, with dropout stats (SPEC §4.4). */
export interface Timeline {
  /** Integer seconds (elapsed), uniform 1 Hz. */
  t: number[]
  /** Wheel speed, m/s. */
  v: number[]
  /** Power, W. */
  p: number[]
  /** Cumulative wheel distance, m. */
  d: number[]
  /** Cadence, rpm. */
  cad: number[]
  /** True where the sample was interpolated across a gap (≤5 s). */
  interpolated: boolean[]
  /** Seconds within the race segment that were interpolated (the quality-badge input). */
  dropoutSeconds: number
  interpolatedFraction: number
  /** Number of >5 s-gap-separated segments the file split into. */
  segmentCount: number
  /** Span (s) of the selected race segment. */
  segmentSpanS: number
}

/** Race detection result (SPEC §4.5). */
export interface Detection {
  /** Refined race start time (elapsed s); may be < the first sample for a missing start. */
  t0: number
  /** Race finish time (elapsed s): the datum 4000 m crossing from the start line. */
  tFinish: number
  /** tFinish − t0 (s), the detected race duration before any alignment. */
  detectedDurationS: number
  /** True when the file begins mid-start (no v<1 sample before the effort), SPEC §4.5.2. */
  missingStart: boolean
  /** COM speed at the first captured motion (m/s); ~2.6 for a captured standing start. */
  startVComMs: number
  /** Timeline index of the first moving sample (v ≥ 1 m/s) — the standing-start push-off. */
  firstMotionIdx: number
  /** Index range (into the timeline) of the high-power window. */
  raceWindow: { startIdx: number; endIdx: number }
  raceMeanPowerW: number
  /** File distance at the start line (m). */
  d0: number
  officialTimeS?: number
  /** detectedDurationS − officialTimeS (s), when official time is provided. */
  officialDeltaS?: number
  /** |officialDeltaS| ≤ 2.5 s (SPEC §4.5.5 cross-check). */
  officialWithinTol?: boolean
}

/** Lap construction and calibration (SPEC §4.7). */
export interface LapConstruction {
  /** Whole-race calibration: 4000 m datum ÷ raw wheel distance over the official-time window. */
  calibrationRace: number
  /** Interior 14-lap (250 m) calibration factor c (the reported factor, gate 3). */
  calibrationInterior: number
  d0: number
  /** Elapsed times (s) of the 16 lap-line crossings (datum n·250 m from the start line). */
  lapBoundaryTimes: number[]
  lapCount: number
  /** Per-lap average height above the black line, m (SPEC §4.7.4). */
  lineHeightsM: number[]
  avgLineHeightM: number
}

/** Standing-start energy reconstruction (SPEC §4.6). */
export interface StartMetrics {
  /** Work already done by the first valid-power sample, J. */
  startEnergyJ: number
  /** Elapsed time from t0 to the first valid-power sample, s. */
  timeToFirstPowerS: number
  /** First captured COM speed used for the reconstruction, m/s. */
  firstPowerVComMs: number
}

/** Forward-sim reproduction of the race (SPEC §4.10 validation / gate 5). */
export interface ReproResult {
  simTimeS: number
  officialTimeS: number
  deltaS: number
}
