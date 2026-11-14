/**
 * scienceMath.ts — Client-side lunar science calculations.
 *
 * Implements identical mathematical formulations to science/lunarsight_core:
 *   - Local horizon elevation lookup via linear interpolation with 360° wraparound
 *   - Local-flat-mask solar disk fraction f_sun in [0, 1]
 *   - Direct-to-Earth (DTE) visibility with clearance margins & criteria
 *   - Solar array orientation models (flat/horizontal, vertical tracking, sun tracking)
 *   - Interval extraction and contiguous window metrics
 */

import {
  SUN_ANGULAR_RADIUS_DEG_ROUNDED,
  EARTH_ANGULAR_RADIUS_DEG,
  SOLAR_IRRADIANCE_W_M2,
} from '../constants/scienceConventions'

export type EarthCriterion = 'center' | 'full_disk' | 'any_limb'
export type SolarOrientation = 'flat' | 'vertical' | 'tracking'

export interface WindowInterval {
  start: string
  end: string
  durationHours: number
}

export interface OpportunitiesSummary {
  totalHours: number
  percentage: number
  windowCount: number
  longestWindowHours: number
  longestDarkGapHours: number
  windows: WindowInterval[]
}

/**
 * Look up local horizon mask elevation at given azimuth (degrees).
 * Uses linear interpolation with 360° periodic wraparound.
 */
export function lookupHorizonElevation(
  mask: number[] | null | undefined,
  azDeg: number
): number {
  if (!mask || mask.length === 0) return 0.0

  const n = mask.length
  const step = 360.0 / n
  const normAz = ((azDeg % 360.0) + 360.0) % 360.0
  const fIdx = normAz / step
  const idx0 = Math.floor(fIdx) % n
  const idx1 = (idx0 + 1) % n
  const frac = fIdx - Math.floor(fIdx)

  const v0 = mask[idx0] ?? 0.0
  const v1 = mask[idx1] ?? 0.0
  return (1.0 - frac) * v0 + frac * v1
}

/**
 * Compute fraction of solar disk visible above horizon skyline f_sun in [0, 1].
 * Formula: circular-segment area of circular disk above effective horizon.
 */
export function computeSolarFraction(
  sunAzDeg: number,
  sunElCenterDeg: number,
  mask?: number[] | null,
  thresholdDeg = 0.0,
  sunRadiusDeg = SUN_ANGULAR_RADIUS_DEG_ROUNDED
): number {
  if (sunRadiusDeg <= 0) return 0.0
  const hMask = lookupHorizonElevation(mask, sunAzDeg)
  const effHorizon = hMask + thresholdDeg
  const hAbove = Math.max(0.0, Math.min(2.0 * sunRadiusDeg, sunElCenterDeg + sunRadiusDeg - effHorizon))
  const dNorm = Math.max(-1.0, Math.min(1.0, 1.0 - hAbove / sunRadiusDeg))
  const theta = Math.acos(dNorm)
  const f = (theta - dNorm * Math.sin(theta)) / Math.PI
  return Math.max(0.0, Math.min(1.0, f))
}

/**
 * Check Direct-to-Earth (DTE) geometric line-of-sight visibility.
 */
export function computeEarthVisibility(
  earthAzDeg: number,
  earthElDeg: number,
  mask?: number[] | null,
  marginDeg = 0.0,
  criterion: EarthCriterion = 'center',
  earthRadiusDeg = EARTH_ANGULAR_RADIUS_DEG
): boolean {
  const hMask = lookupHorizonElevation(mask, earthAzDeg)
  const reqEl = hMask + marginDeg

  if (criterion === 'full_disk') {
    return earthElDeg - earthRadiusDeg >= reqEl
  } else if (criterion === 'any_limb') {
    return earthElDeg + earthRadiusDeg >= reqEl
  } else {
    return earthElDeg >= reqEl
  }
}

/**
 * Compute solar power potential in Watts for an array configuration.
 *   flat (horizontal): cos(i) = sin(el)
 *   vertical: vertical cylinder / azimuth tracking mast: cos(i) = cos(el)
 *   tracking: normal to sun beam whenever sun is visible: cos(i) = 1.0
 */
export function computeSolarPowerWatts(
  sunElDeg: number,
  sunAzDeg: number = 0,
  sunFraction: number = 1.0,
  orientation: SolarOrientation = 'flat',
  areaM2 = 1.0,
  efficiency = 0.28,
  fluxWm2 = SOLAR_IRRADIANCE_W_M2
): number {
  void sunAzDeg // Reserved for azimuth-dependent array calculations
  if (sunFraction <= 0.0) return 0.0

  const elRad = (sunElDeg * Math.PI) / 180.0
  let cosI = 0.0

  if (orientation === 'flat') {
    cosI = Math.sin(elRad)
  } else if (orientation === 'vertical') {
    cosI = Math.cos(elRad)
  } else if (orientation === 'tracking') {
    cosI = 1.0
  }

  cosI = Math.max(0.0, Math.min(1.0, cosI))
  return fluxWm2 * efficiency * areaM2 * cosI * sunFraction
}

/**
 * Extract contiguous active windows from a boolean array.
 */
export function extractIntervals(
  times: string[],
  active: boolean[],
  stepSeconds = 3600
): WindowInterval[] {
  const intervals: WindowInterval[] = []
  let inWindow = false
  let startIdx = 0

  const stepHours = stepSeconds / 3600.0

  for (let i = 0; i < active.length; i++) {
    if (active[i] && !inWindow) {
      inWindow = true
      startIdx = i
    } else if (!active[i] && inWindow) {
      inWindow = false
      const endIdx = i - 1
      intervals.push({
        start: times[startIdx] ?? '',
        end: times[endIdx] ?? '',
        durationHours: Math.round((endIdx - startIdx + 1) * stepHours * 10) / 10,
      })
    }
  }

  if (inWindow && times.length > 0) {
    const endIdx = times.length - 1
    intervals.push({
      start: times[startIdx] ?? '',
      end: times[endIdx] ?? '',
      durationHours: Math.round((endIdx - startIdx + 1) * stepHours * 10) / 10,
    })
  }

  return intervals
}

/**
 * Compute comprehensive opportunity metrics (total hours, percentage, longest window, longest gap).
 */
export function computeOpportunityMetrics(
  times: string[],
  active: boolean[],
  stepSeconds = 3600
): OpportunitiesSummary {
  const n = active.length
  if (n === 0) {
    return {
      totalHours: 0,
      percentage: 0,
      windowCount: 0,
      longestWindowHours: 0,
      longestDarkGapHours: 0,
      windows: [],
    }
  }

  const stepHours = stepSeconds / 3600.0
  const activeCount = active.filter(Boolean).length
  const totalHours = Math.round(activeCount * stepHours * 10) / 10
  const percentage = Math.round((activeCount / n) * 1000) / 10

  const windows = extractIntervals(times, active, stepSeconds)
  let longestWindow = 0
  for (const w of windows) {
    if (w.durationHours > longestWindow) longestWindow = w.durationHours
  }

  // Dark gap intervals
  const darkActive = active.map((a) => !a)
  const gaps = extractIntervals(times, darkActive, stepSeconds)
  let longestGap = 0
  for (const g of gaps) {
    if (g.durationHours > longestGap) longestGap = g.durationHours
  }

  return {
    totalHours,
    percentage,
    windowCount: windows.length,
    longestWindowHours: longestWindow,
    longestDarkGapHours: longestGap,
    windows,
  }
}

/**
 * Format an ISO UTC timestamp as 'YYYY-MM-DD HH:mm UTC'
 */
export function formatUtcDisplay(isoString: string): string {
  if (!isoString) return ''
  const s = isoString.replace('T', ' ').replace('Z', '')
  const parts = s.split(':')
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]} UTC`
  }
  return `${s} UTC`
}

