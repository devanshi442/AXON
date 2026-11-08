/**
 * scienceConventions.ts
 * Mirrors science/lunarsight_core/constants.py — the single source of truth
 * for the Methods page table and every UI label.
 */

// ── Physical Constants ───────────────────────────────────────────────────────
export const MOON_RADIUS_KM = 1737.4
export const MOON_FRAME = 'MOON_ME'

export const SUN_RADIUS_KM = 695700.0
export const SOLAR_IRRADIANCE_W_M2 = 1361.0
export const SOLAR_IRRADIANCE_HORIZONS_W_M2 = 1367.6
export const AU_KM = 149597870.7

// Angular radius of the Sun at 1 AU: atan(695700 / 149597870.7) * (180 / PI) ≈ 0.26645°
export const SUN_ANGULAR_RADIUS_DEG = (Math.atan(SUN_RADIUS_KM / AU_KM) * 180) / Math.PI
export const SUN_ANGULAR_RADIUS_DEG_ROUNDED = 0.267

export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137
export const EARTH_MOON_MEAN_DISTANCE_KM = 384400.0
export const EARTH_ANGULAR_RADIUS_DEG =
  (Math.atan(EARTH_EQUATORIAL_RADIUS_KM / EARTH_MOON_MEAN_DISTANCE_KM) * 180) / Math.PI // ≈ 0.949°

export const FLAT_HORIZON_DEG = 0.0
export const DEFAULT_MAST_HEIGHT_M = 0.0
export const HORIZON_MAX_DISTANCE_KM = 50.0
export const HORIZON_AZIMUTH_STEP_DEG = 1.0
export const ABCORR = 'LT+S'

export const LAT_MIN_DEG = -90.0
export const LAT_MAX_DEG = 90.0
export const LON_MIN_DEG = -180.0
export const LON_MAX_DEG = 180.0

export const SCIENCE_CONVENTIONS = [
  { label: 'Time input / display', value: 'UTC' },
  { label: 'Internal time scale', value: 'Ephemeris Time (ET) via NAIF leap-seconds kernel' },
  { label: 'Longitude convention', value: 'East-positive, −180 to +180°' },
  { label: 'Latitude convention', value: 'Planetocentric' },
  { label: 'Reference frame', value: 'MOON_ME — Lunar mean-Earth/polar-axis (same as LOLA and JPL Horizons)' },
  { label: 'Reference radius', value: '1737.4 km (IAU / NAIF pck00011.tpc)' },
  { label: 'Atmospheric refraction', value: 'None (Moon has no atmosphere)' },
  { label: 'Sun "up" definition', value: 'Upper limb above horizon: center elevation + 0.267°' },
  { label: 'Flat-horizon label', value: '"Idealized horizon, not terrain-aware"' },
  { label: 'Earth visibility label', value: '"Geometric only — not a communication link budget"' },
  { label: 'Light-time correction', value: 'LT+S (light-time + stellar aberration)' },
  { label: 'SPICE kernel (ephemeris)', value: 'de440s.bsp' },
  { label: 'SPICE kernel (leap sec.)', value: 'naif0012.tls' },
  { label: 'SPICE kernel (Moon PCK)', value: 'moon_pa_de440_200625.bpc' },
  { label: 'SPICE kernel (frame)', value: 'moon_de440_250416.tf' },
  { label: 'Unknown values', value: 'null in data → "Not published" in UI' },
] as const
