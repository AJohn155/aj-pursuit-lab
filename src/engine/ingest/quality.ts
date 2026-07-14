// Data quality badge, SPEC §4.16.
//
// Score 0–100, deducting for each listed issue; badge green ≥85, yellow ≥60, red below.
// SPEC names the seven deduction categories but gives no point values — this is a
// documented, defensible rubric (a scoring convention, not physics), flagged per the
// project's judgment-call practice rather than invented silently.

import { cdaInSaneRange } from '../cda'

export interface QualityInputs {
  /** Seconds of the race window that were interpolated across a gap (§4.4). */
  dropoutSeconds: number
  /** dropoutSeconds / race sample count. */
  interpolatedFraction: number
  /** |detected − official| duration, s. Omit when no official time was available to check. */
  officialDeltaS?: number
  /** Interior-14-lap calibration factor c (§4.7.4); should be within 1% of 1. */
  calibrationFactor: number
  detectedLapCount: number
  expectedLapCount: number
  /** cdaRace, when computed. */
  cdaM2?: number
  /** True when air density came from a measurement (direct or T/P/RH), not a default. */
  densityKnown: boolean
  /** True when the speed/distance channels were reconstructed from cadence × gear
   * (speedFallback.ts) because the recorded speed was broken. */
  speedFromCadence?: boolean
}

export interface QualityFlag {
  code:
    | 'dropout'
    | 'detection-mismatch'
    | 'calibration'
    | 'lap-count'
    | 'cda-range'
    | 'density-missing'
    | 'interpolated-fraction'
    | 'speed-from-cadence'
  message: string
  deduction: number
}

export type QualityBadge = 'green' | 'yellow' | 'red'

export interface QualityResult {
  score: number
  badge: QualityBadge
  flags: QualityFlag[]
}

// Deduction caps, points. Each is a documented choice (§4.16 doesn't specify magnitudes):
// heavier weight on structural failures (lap count, calibration, CdA out of range) than on
// soft signal-quality issues (dropout, interpolation).
const DROPOUT_PTS_PER_S = 0.5
const DROPOUT_CAP = 15
const MISMATCH_TOLERANCE_S = 0.5 // sub-half-second timing noise isn't worth flagging
const MISMATCH_PTS_PER_S = 8
const MISMATCH_CAP = 20
const CAL_TOLERANCE = 0.01 // §4.7.4/§7 gate: c should be within 1%
const CAL_BASE_DEDUCTION = 15
const CAL_PTS_PER_EXTRA_PCT = 10
const CAL_CAP = 25
const LAP_COUNT_DEDUCTION = 25
const CDA_RANGE_DEDUCTION = 20
const DENSITY_MISSING_DEDUCTION = 10
const INTERP_FRACTION_CAP = 15
const INTERP_FRACTION_SATURATION = 0.1 // fraction at which the interpolation deduction maxes out
// Cadence-derived speed is physically exact on a fixed gear (wheel rigidly geared to the
// cranks), but integer-rpm rounding and the recording interval soften calibration/line-
// height precision — a small, visible deduction rather than a structural one.
const SPEED_FROM_CADENCE_DEDUCTION = 5

export function assessQuality(inputs: QualityInputs): QualityResult {
  const flags: QualityFlag[] = []

  if (inputs.dropoutSeconds > 0) {
    flags.push({
      code: 'dropout',
      message: `${inputs.dropoutSeconds}s of dropout in the race window`,
      deduction: Math.min(DROPOUT_CAP, DROPOUT_PTS_PER_S * inputs.dropoutSeconds),
    })
  }

  if (inputs.officialDeltaS != null && Math.abs(inputs.officialDeltaS) > MISMATCH_TOLERANCE_S) {
    const over = Math.abs(inputs.officialDeltaS) - MISMATCH_TOLERANCE_S
    flags.push({
      code: 'detection-mismatch',
      message: `Detected duration off official time by ${inputs.officialDeltaS.toFixed(2)}s`,
      deduction: Math.min(MISMATCH_CAP, MISMATCH_PTS_PER_S * over),
    })
  }

  const calDeviation = Math.abs(inputs.calibrationFactor - 1)
  if (calDeviation > CAL_TOLERANCE) {
    const extraPct = (calDeviation - CAL_TOLERANCE) / 0.01
    flags.push({
      code: 'calibration',
      message: `Calibration factor ${inputs.calibrationFactor.toFixed(4)} deviates ${(calDeviation * 100).toFixed(2)}% from 1`,
      deduction: Math.min(CAL_CAP, CAL_BASE_DEDUCTION + CAL_PTS_PER_EXTRA_PCT * extraPct),
    })
  }

  if (inputs.detectedLapCount !== inputs.expectedLapCount) {
    flags.push({
      code: 'lap-count',
      message: `Detected ${inputs.detectedLapCount} laps, expected ${inputs.expectedLapCount}`,
      deduction: LAP_COUNT_DEDUCTION,
    })
  }

  if (inputs.cdaM2 != null && !cdaInSaneRange(inputs.cdaM2)) {
    flags.push({
      code: 'cda-range',
      message: `CdA ${inputs.cdaM2.toFixed(3)} m² outside the [0.16, 0.26] sane range`,
      deduction: CDA_RANGE_DEDUCTION,
    })
  }

  if (!inputs.densityKnown) {
    flags.push({
      code: 'density-missing',
      message: 'Air density defaulted, not measured',
      deduction: DENSITY_MISSING_DEDUCTION,
    })
  }

  if (inputs.speedFromCadence) {
    flags.push({
      code: 'speed-from-cadence',
      message: 'Speed channel was broken — speed & distance reconstructed from cadence × gear',
      deduction: SPEED_FROM_CADENCE_DEDUCTION,
    })
  }

  if (inputs.interpolatedFraction > 0) {
    flags.push({
      code: 'interpolated-fraction',
      message: `${(inputs.interpolatedFraction * 100).toFixed(1)}% of race samples interpolated`,
      deduction: INTERP_FRACTION_CAP * Math.min(1, inputs.interpolatedFraction / INTERP_FRACTION_SATURATION),
    })
  }

  const totalDeduction = flags.reduce((sum, f) => sum + f.deduction, 0)
  const score = Math.max(0, Math.min(100, 100 - totalDeduction))
  const badge: QualityBadge = score >= 85 ? 'green' : score >= 60 ? 'yellow' : 'red'
  return { score, badge, flags }
}
