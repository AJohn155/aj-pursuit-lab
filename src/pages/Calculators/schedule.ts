// Schedule Builder math (owner request 2026-07 item 17 — port of the "Schedule Builder"
// section of the owner's Cadence Calculator sheet): per-lap target times → cumulative
// time and km splits. Pure and unit-tested like the other calculator math.

export interface ScheduleRow {
  lap: number
  distanceM: number
  lapTimeS: number
  cumTimeS: number
  /** Time for the kilometre ENDING at this row (owner's "Km Splits" column), or null off
   * the km boundaries. */
  kmSplitS: number | null
}

/** Builds the schedule table from per-lap times. Km splits land where cumulative distance
 * crosses whole kilometres (every 4th lap on a 250 m track). */
export function buildSchedule(lapTimesS: number[], lapLengthM = 250): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  let cum = 0
  let lastKmTime = 0
  for (let i = 0; i < lapTimesS.length; i++) {
    cum += lapTimesS[i]
    const distanceM = (i + 1) * lapLengthM
    let kmSplitS: number | null = null
    if (distanceM % 1000 === 0) {
      kmSplitS = cum - lastKmTime
      lastKmTime = cum
    }
    rows.push({ lap: i + 1, distanceM, lapTimeS: lapTimesS[i], cumTimeS: cum, kmSplitS })
  }
  return rows
}

/** The sheet's second mode: target first lap + one settle time for every subsequent lap. */
export function scheduleFromFirstAndSettle(firstLapS: number, settleLapS: number, nLaps = 16): number[] {
  return Array.from({ length: nLaps }, (_, i) => (i === 0 ? firstLapS : settleLapS))
}

/** m:ss.t display, matching how the owner reads overall/cumulative times. Rounds to the
 * requested decimals BEFORE decomposing so 59.96 s renders 1:00.0, not 0:60.0. */
export function formatMinSec(totalS: number, decimals = 1): string {
  const factor = 10 ** decimals
  const rounded = Math.round(totalS * factor) / factor
  const m = Math.floor(rounded / 60)
  const s = rounded - m * 60
  const sStr = s.toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0')
  return `${m}:${sStr}`
}
