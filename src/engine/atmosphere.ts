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
