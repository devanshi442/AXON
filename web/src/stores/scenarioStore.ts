import { create } from 'zustand'
import type { GeometryTimeseries, OpportunityData, OpportunityWindow } from '../types/mission'

interface ScenarioStore {
  scenarioAId: string
  scenarioBId: string
  utcA: string
  utcB: string
  thresholdDeg: number
  timeseriesCache: Record<string, GeometryTimeseries>
  loading: Record<string, boolean>
  error: Record<string, string | null>

  setScenarioA: (id: string) => void
  setScenarioB: (id: string) => void
  setUtcA: (utc: string) => void
  setUtcB: (utc: string) => void
  setThresholdDeg: (deg: number) => void
  loadTimeseries: (siteId: string) => Promise<void>
}

// Upper limb correction in degrees for the Sun
export const SUN_UPPER_LIMB_DEG = 0.267

export const useScenarioStore = create<ScenarioStore>((set, get) => ({
  scenarioAId: 'im-1',
  scenarioBId: 'blue-ghost-m1',
  utcA: '2026-03-01T12:00:00Z',
  utcB: '2026-03-01T12:00:00Z',
  thresholdDeg: 5.0,
  timeseriesCache: {},
  loading: {},
  error: {},

  setScenarioA: (id: string) => {
    set({ scenarioAId: id })
    get().loadTimeseries(id)
  },

  setScenarioB: (id: string) => {
    set({ scenarioBId: id })
    get().loadTimeseries(id)
  },

  setUtcA: (utcA: string) => set({ utcA }),
  setUtcB: (utcB: string) => set({ utcB }),
  setThresholdDeg: (thresholdDeg: number) => set({ thresholdDeg }),

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
      const data: GeometryTimeseries = await res.json()
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
 * Compute 30-day opportunities from selected UTC time for a given threshold.
 */
export function compute30DayWindows(
  ts?: GeometryTimeseries,
  startUtc?: string,
  thresholdDeg: number = 5.0
): OpportunityData | null {
  if (!ts || !ts.times || ts.times.length === 0 || !startUtc) {
    return null
  }

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
  const windowSamples = 30 * 24 // 30 days of hourly samples
  const endIndex = Math.min(ts.times.length, startIndex + windowSamples)

  const sliceTimes = ts.times.slice(startIndex, endIndex)
  const sliceSun = ts.sun_elevation_deg.slice(startIndex, endIndex)
  const sliceEarth = ts.earth_elevation_deg.slice(startIndex, endIndex)

  const sunMask = sliceSun.map((el) => el + SUN_UPPER_LIMB_DEG >= thresholdDeg)
  const earthMask = sliceEarth.map((el) => el >= thresholdDeg)
  const jointMask = sunMask.map((s, i) => s && earthMask[i])

  const extract = (mask: boolean[]): OpportunityWindow[] => {
    const list: OpportunityWindow[] = []
    let inWin = false
    let startIdx = 0

    for (let i = 0; i < mask.length; i++) {
      if (mask[i] && !inWin) {
        inWin = true
        startIdx = i
      } else if (!mask[i] && inWin) {
        inWin = false
        const dur = (i - startIdx) * (ts.step_seconds / 3600)
        list.push({
          start: sliceTimes[startIdx],
          end: sliceTimes[i - 1],
          duration_hours: Math.round(dur * 10) / 10,
        })
      }
    }
    if (inWin) {
      const dur = (mask.length - startIdx) * (ts.step_seconds / 3600)
      list.push({
        start: sliceTimes[startIdx],
        end: sliceTimes[mask.length - 1],
        duration_hours: Math.round(dur * 10) / 10,
      })
    }
    return list
  }

  const sunWindows = extract(sunMask)
  const earthWindows = extract(earthMask)
  const jointWindows = extract(jointMask)

  const totalPeriodHours = sliceTimes.length * (ts.step_seconds / 3600)
  const sunHours = sunWindows.reduce((acc, w) => acc + w.duration_hours, 0)
  const earthHours = earthWindows.reduce((acc, w) => acc + w.duration_hours, 0)
  const jointHours = jointWindows.reduce((acc, w) => acc + w.duration_hours, 0)

  return {
    threshold_deg: thresholdDeg,
    total_period_hours: Math.round(totalPeriodHours * 10) / 10,
    sun: {
      total_hours: Math.round(sunHours * 10) / 10,
      percentage: Math.round((sunHours / totalPeriodHours) * 1000) / 10,
      windows: sunWindows,
    },
    earth: {
      total_hours: Math.round(earthHours * 10) / 10,
      percentage: Math.round((earthHours / totalPeriodHours) * 1000) / 10,
      windows: earthWindows,
    },
    joint: {
      total_hours: Math.round(jointHours * 10) / 10,
      percentage: Math.round((jointHours / totalPeriodHours) * 1000) / 10,
      windows: jointWindows,
    },
  }
}
