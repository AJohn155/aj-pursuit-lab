// Lap-splits text parsing, shared by the upload metadata form (paste splits with the fit
// file, owner request 2026-07 item 16) and the owner-sheet CSV import (item 1).

/**
 * Parses a pasted list of lap times — whitespace/comma/semicolon separated, per-lap or
 * cumulative — into per-lap seconds (§3.3 `officialSplits` stores per-lap).
 *
 * Cumulative detection: strictly increasing AND the maximum exceeds 30 s (no single
 * 250/333 m lap takes 30 s at race pace, but cumulative time passes it by lap 2-3).
 */
export function parseSplitsText(text: string): { splits: number[]; error: string | null } {
  const tokens = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (tokens.length === 0) return { splits: [], error: null }

  const values = tokens.map(Number)
  if (values.some((v) => !Number.isFinite(v) || v <= 0)) {
    return { splits: [], error: 'Splits must all be positive numbers.' }
  }

  const strictlyIncreasing = values.every((v, i) => i === 0 || v > values[i - 1])
  const looksCumulative = strictlyIncreasing && Math.max(...values) > 30

  const perLap = looksCumulative ? values.map((v, i) => (i === 0 ? v : v - values[i - 1])) : values

  if (perLap.some((v) => v < 5 || v > 60)) {
    return {
      splits: [],
      error: 'Parsed lap times fall outside 5–60 s — check the values (per-lap or cumulative both work).',
    }
  }
  return { splits: perLap, error: null }
}
