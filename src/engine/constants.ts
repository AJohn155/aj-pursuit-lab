// Physics engine constants, SPEC §4.1.
//
// Engine purity rule (SPEC §2.1): this module — and everything under src/engine —
// must be importable in Node with zero DOM/React dependencies.

/**
 * Engine version string. Bump on ANY formula change (SPEC §4). Stored on rides as
 * `analysisVersion` so cached analysis can be recomputed when stale.
 */
export const ENGINE_VERSION = '0.5.0'

/** Gravitational acceleration, m/s² (SPEC §4.1). */
export const G = 9.81
