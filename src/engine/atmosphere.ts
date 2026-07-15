// Air density and density normalization, SPEC §4.2 and §4.12.

/**
 * Air density ρ (kg/m³) from temperature, pressure, humidity — the owner's exact
 * convention (SPEC §4.2), preserved verbatim. Gate 6: T=24, P=1006, RH=55 → 1.1722.
 *
 * @param tempC        dry-bulb temperature, °C
 * @param pressureHPa  station pressure, hPa
 * @param rhPct        relative humidity, %
 */
export function airDensity(tempC: number, pressureHPa: number, rhPct: number): number {
  const T = tempC + 273.15
  // Saturation vapour pressure via the owner's Clausius–Clapeyron form (hPa).
  const es = 6.11 * Math.exp((2.5e6 / 461.5) * (1 / 273.15 - 1 / T))
  const e = (rhPct / 100) * es
  // Note the owner's humidity term keeps P in hPa in the `e/P` ratio (dimensionless),
  // while the leading P is converted to Pa (×100). Preserved exactly per §4.2.
  return (pressureHPa * 100) / (287 * T * (1 + 0.61 * 0.622 * e / pressureHPa))
}

/**
 * ISA (International Standard Atmosphere) station pressure at an altitude, hPa:
 * P = 1013.25·(1 − 2.25577e−5·h)^5.25588. Sea level → 1013.25; 1,880 m (Colorado
 * Springs) → ≈807 hPa.
 */
export function isaPressureHPa(altitudeM: number): number {
  return 1013.25 * Math.pow(1 - 2.25577e-5 * altitudeM, 5.25588)
}

/**
 * Estimated air density from venue altitude alone (owner request 2026-07 round 10):
 * ISA pressure at the altitude, with an assumed indoor-velodrome temperature of 20 °C and
 * 50 % RH. An ESTIMATE for rides where nothing was measured — always flagged as such
 * (densityKnown stays false → the quality badge keeps its deduction); any measured value
 * (direct ρ or T/P/RH) wins. 1,880 m → ρ ≈ 0.956 kg/m³ vs the flat 1.15 reference that
 * previously made altitude rides look artificially slow in normalized time.
 */
export function densityFromAltitude(altitudeM: number, tempC = 20, rhPct = 50): number {
  return airDensity(tempC, isaPressureHPa(altitudeM), rhPct)
}

/**
 * Fast-mode steady-lap density scale, SPEC §4.12: a steady lap time scales by
 * (ρ_target/ρ_ride)^(1/3). Gate 7c: 15.6 s, ρ_ride 1.1722, ρ_target 0.9934 → ×0.94632.
 */
export function densityScaleSteady(rhoTarget: number, rhoRide: number): number {
  return Math.cbrt(rhoTarget / rhoRide)
}

/**
 * Fast-mode lap-1 (standing-start) density scale, SPEC §4.12:
 * (((ρ_target/ρ_ride)+2)/3)^(1/3). Lap 1 is less aero-dominated than steady laps, so
 * it responds less to density; this blend is the owner's convention.
 */
export function densityScaleLap1(rhoTarget: number, rhoRide: number): number {
  return Math.cbrt((rhoTarget / rhoRide + 2) / 3)
}
