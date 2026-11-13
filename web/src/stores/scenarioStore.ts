import { create } from 'zustand'
import type { GeometryTimeseries, HorizonProfile, OpportunityData, OpportunityWindow } from '../types/mission'
import {
  lookupHorizonElevation,
  computeSolarFraction,
  computeEarthVisibility,
  computeSolarPowerWatts,
  computeOpportunityMetrics,
  formatUtcDisplay,
  type EarthCriterion,
  type SolarOrientation,
} from '../utils/scienceMath'

// Upper limb correction in degrees for the Sun
export const SUN_UPPER_LIMB_DEG = 0.267

export interface ComputeWindowsOptions {
  thresholdDeg?: number
  horizonMode?: 'flat' | 'terrain'
  horizonProfile?: HorizonProfile | null
  mastHeightM?: number
  sunThresholdDeg?: number
  dteMarginDeg?: number
  earthCriterion?: EarthCriterion
  solarArrayType?: SolarOrientation
  arrayAreaM2?: number
  arrayEfficiency?: number
}

export interface ExtendedOpportunityData extends OpportunityData {
  start_utc: string
  end_utc: string
  horizon_mode: 'flat' | 'terrain'
  mast_height_m: number
  dem_id?: string
  terrain_coverage?: string
  solar_energy_kwh: number
  flat_sun_hours: number
  flat_earth_hours: number
  flat_joint_hours: number
  delta_sun_hours: number
  delta_earth_hours: number
  delta_joint_hours: number
}

interface ScenarioStore {
  scenarioAId: string
  scenarioBId: string
  utcA: string
  utcB: string
  thresholdDeg: number

  // Science model parameters
  horizonMode: 'flat' | 'terrain'
  mastHeightM: number
  sunThresholdDeg: number
  dteMarginDeg: number
  earthCriterion: EarthCriterion
  solarArrayType: SolarOrientation
  arrayAreaM2: number
  arrayEfficiency: number

  timeseriesCache: Record<string, GeometryTimeseries>
  horizonCache: Record<string, HorizonProfile>
  loading: Record<string, boolean>
  error: Record<string, string | null>

  setScenarioA: (id: string) => void
  setScenarioB: (id: string) => void
  setUtcA: (utc: string) => void
  setUtcB: (utc: string) => void
  setThresholdDeg: (deg: number) => void
  setHorizonMode: (mode: 'flat' | 'terrain') => void
  setMastHeightM: (h: number) => void
  setSunThresholdDeg: (deg: number) => void
  setDteMarginDeg: (deg: number) => void
  setEarthCriterion: (c: EarthCriterion) => void
  setSolarArrayType: (t: SolarOrientation) => void
  setArrayAreaM2: (a: number) => void
  setArrayEfficiency: (eff: number) => void

  loadTimeseries: (siteId: string) => Promise<void>
  loadHorizon: (siteId: string) => Promise<void>
}

export function getMaskForMastHeight(profile?: HorizonProfile | null, mastHeightM: number = 1.5): number[] | null {
  if (!profile || !profile.masks) return null
  if (mastHeightM <= 0.75) return profile.masks.h_0_0m || null
  if (mastHeightM <= 2.25) return profile.masks.h_1_5m || profile.masks.h_0_0m || null
  if (mastHeightM <= 4.0) return profile.masks.h_3_0m || profile.masks.h_1_5m || null
  if (mastHeightM <= 7.5) return profile.masks.h_5_0m || profile.masks.h_3_0m || null
  return profile.masks.h_10_0m || profile.masks.h_5_0m || null
}

export function getDefaultUtcDate(nowDate?: Date): string {
  const now = nowDate ?? new Date()
  const year = now.getUTCFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (year < 2024) {
    return '2024-01-01T00:00:00Z'
  }
  if (year > 2028) {
    return '2028-12-31T23:00:00Z'
  }
  return `${year}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:00Z`
}

export function getDefaultUtcDisplay(nowDate?: Date): string {
  return formatUtcDisplay(getDefaultUtcDate(nowDate))
}

export const useScenarioStore = create<ScenarioStore>((set, get) => ({
  scenarioAId: 'im-2',
  scenarioBId: 'cs-shackleton-rim',
  utcA: getDefaultUtcDate(),
  utcB: getDefaultUtcDate(),
  thresholdDeg: 0.0,

  horizonMode: 'terrain',
  mastHeightM: 1.5,
  sunThresholdDeg: 0.0,
  dteMarginDeg: 0.0,
  earthCriterion: 'center',
  solarArrayType: 'vertical',
  arrayAreaM2: 1.0,
  arrayEfficiency: 0.28,

  timeseriesCache: {},
  horizonCache: {},
  loading: {},
  error: {},

  setScenarioA: (id: string) => {
    set({ scenarioAId: id })
    get().loadTimeseries(id)
    get().loadHorizon(id)
  },

  setScenarioB: (id: string) => {
    set({ scenarioBId: id })
    get().loadTimeseries(id)
    get().loadHorizon(id)
  },

  setUtcA: (utcA: string) => set({ utcA }),
  setUtcB: (utcB: string) => set({ utcB }),
  setThresholdDeg: (thresholdDeg: number) => set({ thresholdDeg, sunThresholdDeg: thresholdDeg }),
  setHorizonMode: (horizonMode) => set({ horizonMode }),
  setMastHeightM: (mastHeightM) => set({ mastHeightM }),
  setSunThresholdDeg: (sunThresholdDeg) => set({ sunThresholdDeg, thresholdDeg: sunThresholdDeg }),
  setDteMarginDeg: (dteMarginDeg) => set({ dteMarginDeg }),
  setEarthCriterion: (earthCriterion) => set({ earthCriterion }),
  setSolarArrayType: (solarArrayType) => set({ solarArrayType }),
  setArrayAreaM2: (arrayAreaM2) => set({ arrayAreaM2 }),
  setArrayEfficiency: (arrayEfficiency) => set({ arrayEfficiency }),

  loadTimeseries: async (siteId: string) => {
    if (get().timeseriesCache[siteId] || get().loading[siteId]) {
      return
    }

    set((state) => ({
      loading: { ...state.loading, [siteId]: true },
      error: { ...state.error, [siteId]: null },
    }))

    try {
      const res = await fetch(`/data/timeseries/${siteId}.json`)
      if (!res.ok) {
        throw new Error(`Timeseries for ${siteId} not available (HTTP ${res.status})`)
      }
      const raw: any = await res.json()
      if (raw.scale) {
        const inv = 1.0 / raw.scale
        raw.sun_azimuth_deg = raw.sun_azimuth_deg.map((v: number) => Math.round(v * inv * 100) / 100)
        raw.sun_elevation_deg = raw.sun_elevation_deg.map((v: number) => Math.round(v * inv * 100) / 100)
        raw.earth_azimuth_deg = raw.earth_azimuth_deg.map((v: number) => Math.round(v * inv * 100) / 100)
        raw.earth_elevation_deg = raw.earth_elevation_deg.map((v: number) => Math.round(v * inv * 100) / 100)
      }
      if (!raw.times && raw.start_utc && raw.step_seconds && raw.sun_elevation_deg) {
        const n = raw.sun_elevation_deg.length
        const stepMs = raw.step_seconds * 1000
        const startMs = new Date(raw.start_utc).getTime()
        raw.times = Array.from({ length: n }, (_, i) =>
          new Date(startMs + i * stepMs).toISOString().replace('.000Z', 'Z')
        )
      }
      const data: GeometryTimeseries = raw
      set((state) => ({
        timeseriesCache: { ...state.timeseriesCache, [siteId]: data },
        loading: { ...state.loading, [siteId]: false },
      }))
    } catch (err: any) {
      set((state) => ({
        loading: { ...state.loading, [siteId]: false },
        error: { ...state.error, [siteId]: err.message || 'Failed to load geometry' },
      }))
    }
  },

  loadHorizon: async (siteId: string) => {
    if (get().horizonCache[siteId]) {
      return
    }
    try {
      const res = await fetch(`/data/horizon/${siteId}.json`)
      if (!res.ok) return
      const data: HorizonProfile = await res.json()
      set((state) => ({
        horizonCache: { ...state.horizonCache, [siteId]: data },
      }))
    } catch {
      // Horizon file optional or fallback to flat
    }
  },
}))

/**
 * Get nearest hourly elevation from timeseries for a given UTC date-time string.
 */
export function getElevationAtTime(
  ts?: GeometryTimeseries,
  targetUtc?: string
): {
  sunElevation: number | null
  earthElevation: number | null
  sunAzimuth: number | null
  earthAzimuth: number | null
  matchedTime: string | null
  isOutRange: boolean
} {
  if (!ts || !ts.times || ts.times.length === 0 || !targetUtc) {
    return {
      sunElevation: null,
      earthElevation: null,
      sunAzimuth: null,
      earthAzimuth: null,
      matchedTime: null,
      isOutRange: false,
    }
  }

  const targetMs = new Date(targetUtc).getTime()
  const firstMs = new Date(ts.times[0]).getTime()
  const lastMs = new Date(ts.times[ts.times.length - 1]).getTime()

  if (targetMs < firstMs || targetMs > lastMs) {
    return {
      sunElevation: null,
      earthElevation: null,
      sunAzimuth: null,
      earthAzimuth: null,
      matchedTime: null,
      isOutRange: true,
    }
  }

  // Hourly index calculation
  const diffHours = Math.round((targetMs - firstMs) / (ts.step_seconds * 1000))
  const idx = Math.max(0, Math.min(ts.times.length - 1, diffHours))

  return {
    sunElevation: ts.sun_elevation_deg[idx],
    earthElevation: ts.earth_elevation_deg[idx],
    sunAzimuth: ts.sun_azimuth_deg[idx],
    earthAzimuth: ts.earth_azimuth_deg[idx],
    matchedTime: ts.times[idx],
    isOutRange: false,
  }
}

/**
 * Compute 30-day opportunities from selected UTC time.
 * Supports dual modes: idealized flat datum (0°) vs terrain-aware horizon skyline.
 */
export function compute30DayWindows(
  ts?: GeometryTimeseries,
  startUtc?: string,
  thresholdOrOptions: number | ComputeWindowsOptions = 0.0
): ExtendedOpportunityData | null {
  if (!ts || !ts.times || ts.times.length === 0 || !startUtc) {
    return null
  }

  const options: ComputeWindowsOptions =
    typeof thresholdOrOptions === 'number'
      ? { sunThresholdDeg: thresholdOrOptions }
      : thresholdOrOptions

  const thresholdDeg =
    options.sunThresholdDeg ??
    (typeof thresholdOrOptions === 'number' ? thresholdOrOptions : 0.0)
  const mode = options.horizonMode ?? (options.horizonProfile ? 'terrain' : 'flat')
  const mastHeightM = options.mastHeightM ?? 1.5
  const dteMarginDeg = options.dteMarginDeg ?? 0.0
  const earthCriterion = options.earthCriterion ?? 'center'
  const orientation = options.solarArrayType ?? 'vertical'
  const areaM2 = options.arrayAreaM2 ?? 1.0
  const efficiency = options.arrayEfficiency ?? 0.28

  const startMs = new Date(startUtc).getTime()
  const firstMs = new Date(ts.times[0]).getTime()
  const lastMs = new Date(ts.times[ts.times.length - 1]).getTime()

  if (startMs < firstMs || startMs > lastMs) {
    return null
  }

  const startIndex = Math.max(
    0,
    Math.round((startMs - firstMs) / (ts.step_seconds * 1000))
  )
  const windowSamples = Math.ceil((30 * 24 * 60 * 60) / ts.step_seconds)// 30 days of hourly samples
  const endIndex = Math.min(ts.times.length, startIndex + windowSamples)

  const sliceTimes = ts.times.slice(startIndex, endIndex)
  const sliceSunEl = ts.sun_elevation_deg.slice(startIndex, endIndex)
  const sliceSunAz = ts.sun_azimuth_deg.slice(startIndex, endIndex)
  const sliceEarthEl = ts.earth_elevation_deg.slice(startIndex, endIndex)
  const sliceEarthAz = ts.earth_azimuth_deg.slice(startIndex, endIndex)

  const mask = mode === 'terrain' ? getMaskForMastHeight(options.horizonProfile, mastHeightM) : null

  // Flat masks for baseline comparison (Sun: upper limb > threshold; Earth: el >= antenna_margin)
  const flatSunMask = sliceSunEl.map((el) => el + SUN_UPPER_LIMB_DEG > thresholdDeg)
  const flatEarthMask = sliceEarthEl.map((el) => el >= dteMarginDeg)
  const flatJointMask = flatSunMask.map((s, i) => s && flatEarthMask[i])

  // Active masks for requested mode
  const activeSunMask: boolean[] = []
  const activeEarthMask: boolean[] = []
  const activeJointMask: boolean[] = []
  let totalSolarPowerWh = 0.0

  for (let i = 0; i < sliceTimes.length; i++) {
    const sunEl = sliceSunEl[i]
    const sunAz = sliceSunAz[i]
    const earthEl = sliceEarthEl[i]
    const earthAz = sliceEarthAz[i]

    if (mode === 'terrain' && mask) {
      const hSun = lookupHorizonElevation(mask, sunAz)
      const fSun = computeSolarFraction(sunAz, sunEl, mask)
      const sunUp = (sunEl + SUN_UPPER_LIMB_DEG) > (hSun + thresholdDeg)
      activeSunMask.push(sunUp)

      const earthUp = computeEarthVisibility(earthAz, earthEl, mask, dteMarginDeg, earthCriterion)
      activeEarthMask.push(earthUp)
      activeJointMask.push(sunUp && earthUp)

      const pWatts = computeSolarPowerWatts(sunEl, sunAz, fSun, orientation, areaM2, efficiency)
      totalSolarPowerWh += pWatts * (ts.step_seconds / 3600.0)
    } else {
      const sunUp = (sunEl + SUN_UPPER_LIMB_DEG) > thresholdDeg
      activeSunMask.push(sunUp)
      const earthUp = earthEl >= dteMarginDeg
      activeEarthMask.push(earthUp)
      activeJointMask.push(sunUp && earthUp)

      const fSun = sunUp ? 1.0 : 0.0
      const pWatts = computeSolarPowerWatts(sunEl, sunAz, fSun, orientation, areaM2, efficiency)
      totalSolarPowerWh += pWatts * (ts.step_seconds / 3600.0)
    }
  }

  const sunMetrics = computeOpportunityMetrics(sliceTimes, activeSunMask, ts.step_seconds)
  const earthMetrics = computeOpportunityMetrics(sliceTimes, activeEarthMask, ts.step_seconds)
  const jointMetrics = computeOpportunityMetrics(sliceTimes, activeJointMask, ts.step_seconds)

  const flatSunMetrics = computeOpportunityMetrics(sliceTimes, flatSunMask, ts.step_seconds)
  const flatEarthMetrics = computeOpportunityMetrics(sliceTimes, flatEarthMask, ts.step_seconds)
  const flatJointMetrics = computeOpportunityMetrics(sliceTimes, flatJointMask, ts.step_seconds)

  const toOppWindows = (wins: any[]): OpportunityWindow[] =>
    wins.map((w) => ({
      start: w.start,
      end: w.end,
      duration_hours: w.durationHours,
    }))

  const totalPeriodHours = Math.round(sliceTimes.length * (ts.step_seconds / 3600) * 10) / 10

  return {
    start_utc: sliceTimes[0],
    end_utc: sliceTimes[sliceTimes.length - 1],
    threshold_deg: thresholdDeg,
    total_period_hours: totalPeriodHours,
    horizon_mode: mode,
    mast_height_m: mastHeightM,
    dem_id: options.horizonProfile?.dem_id,
    terrain_coverage: options.horizonProfile?.coverage_status,
    solar_energy_kwh: Math.round((totalSolarPowerWh / 1000.0) * 100) / 100,
    sun: {
      total_hours: sunMetrics.totalHours,
      percentage: sunMetrics.percentage,
      window_count: sunMetrics.windowCount,
      longest_window_hours: sunMetrics.longestWindowHours,
      longest_dark_gap_hours: sunMetrics.longestDarkGapHours,
      windows: toOppWindows(sunMetrics.windows),
    },
    earth: {
      total_hours: earthMetrics.totalHours,
      percentage: earthMetrics.percentage,
      window_count: earthMetrics.windowCount,
      longest_window_hours: earthMetrics.longestWindowHours,
      longest_dark_gap_hours: earthMetrics.longestDarkGapHours,
      windows: toOppWindows(earthMetrics.windows),
    },
    joint: {
      total_hours: jointMetrics.totalHours,
      percentage: jointMetrics.percentage,
      window_count: jointMetrics.windowCount,
      longest_window_hours: jointMetrics.longestWindowHours,
      longest_dark_gap_hours: jointMetrics.longestDarkGapHours,
      windows: toOppWindows(jointMetrics.windows),
    },
    flat_sun_hours: flatSunMetrics.totalHours,
    flat_earth_hours: flatEarthMetrics.totalHours,
    flat_joint_hours: flatJointMetrics.totalHours,
    delta_sun_hours: Math.round((sunMetrics.totalHours - flatSunMetrics.totalHours) * 10) / 10,
    delta_earth_hours: Math.round((earthMetrics.totalHours - flatEarthMetrics.totalHours) * 10) / 10,
    delta_joint_hours: Math.round((jointMetrics.totalHours - flatJointMetrics.totalHours) * 10) / 10,
  }
}
