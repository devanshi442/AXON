/**
 * scienceConventions.ts
 * Mirrors science/lunarsight_core/constants.py — the single source of truth
 * for the Methods page table and every UI label.
 */
export const SCIENCE_CONVENTIONS = [
  { label: 'Time input / display',  value: 'UTC' },
  { label: 'Internal time scale',   value: 'Ephemeris Time (ET) via NAIF leap-seconds kernel' },
  { label: 'Longitude convention',  value: 'East-positive, −180 to +180°' },
  { label: 'Latitude convention',   value: 'Planetocentric' },
  { label: 'Reference frame',       value: 'MOON_ME — Lunar mean-Earth/polar-axis (same as LOLA and JPL Horizons)' },
  { label: 'Reference radius',      value: '1737.4 km (IAU / NAIF pck00011.tpc)' },
  { label: 'Atmospheric refraction',value: 'None (Moon has no atmosphere)' },
  { label: 'Sun "up" definition',   value: 'Upper limb above horizon: center elevation + 0.267°' },
  { label: 'Flat-horizon label',    value: '"Idealized horizon, not terrain-aware"' },
  { label: 'Earth visibility label',value: '"Geometric only — not a communication link budget"' },
  { label: 'Light-time correction', value: 'LT+S (light-time + stellar aberration)' },
  { label: 'SPICE kernel (ephemeris)','value': 'de440s.bsp' },
  { label: 'SPICE kernel (leap sec.)', value: 'naif0012.tls' },
  { label: 'SPICE kernel (Moon PCK)', value: 'moon_pa_de440_200625.bpc' },
  { label: 'SPICE kernel (frame)',   value: 'moon_de440_250416.tf' },
  { label: 'Unknown values',        value: 'null in data → "Not published" in UI' },
] as const
