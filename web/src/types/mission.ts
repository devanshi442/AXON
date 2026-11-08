/**
 * TypeScript types for AXON LunarSight mission & science geometry data.
 * Must stay in sync with data/schema/missions.schema.json and lunarsight_core/constants.py.
 */

export type MissionStatus =
  | 'planned'
  | 'launched'
  | 'landed_success'
  | 'landed_partial'
  | 'failed'
  | 'cancelled'
  | 'unknown_needs_check'

export type DatePrecision = 'day' | 'month' | 'quarter' | 'year' | null
export type DateKind = 'actual' | 'planned' | null

export interface MissionDate {
  date: string | null
  precision: DatePrecision
  kind: DateKind
}

export type CoordKind = 'actual' | 'planned' | 'planned_region_center' | 'unknown'
export type TerrainTier = 'T1' | 'T2' | 'T3'
export type RegionType =
  | 'nearside_mare'
  | 'nearside_swirl'
  | 'south_polar_highlands'
  | 'south_polar_massif'
  | 'south_polar_crater_region'
  | 'south_polar'
  | 'farside'
  | string

export interface MissionSite {
  name: string
  region_type: RegionType
  lat: number | null
  lon: number | null
  coord_kind: CoordKind
  elevation_m: number | null
  uncertainty_km: number | null
  terrain_tier: TerrainTier
}

export interface MissionSource {
  url: string
  title: string
  accessed: string
  supports: string
}

export interface Mission {
  id: string
  name: string
  program_label: string | null
  clps_task_order: string | null
  provider: string
  lander: string
  status: MissionStatus
  dates: {
    launch: MissionDate
    landing: MissionDate
  }
  site: MissionSite
  payload_highlights: string[]
  notes: string | null
  sources: MissionSource[]
  verified: boolean
}

export interface ReferenceSite {
  id: string
  name: string
  lat: number
  lon: number
  source: string
  note: string | null
}

export interface MissionsData {
  generated_at: string
  schema_version: number
  compiled_on: string
  missions: Mission[]
  reference_sites: ReferenceSite[]
}

// ── Geometry & Precomputed Ephemeris Types ───────────────────────────────────

export interface GeometryTimeseries {
  site_id?: string
  site_name?: string
  lat?: number
  lon?: number
  start_utc: string
  stop_utc: string
  step_seconds: number
  sample_count?: number
  scale?: number
  times: string[]
  sun_azimuth_deg: number[]
  sun_elevation_deg: number[]
  earth_azimuth_deg: number[]
  earth_elevation_deg: number[]
  sun_distance_km?: number[]
  earth_distance_km?: number[]
  sun_angular_radius_deg?: number[]
  earth_angular_radius_deg?: number[]
  frame: string
  abcorr: string
  horizon_mode: string
}

export interface OpportunityWindow {
  start: string
  end: string
  duration_hours: number
}

export interface BodyOpportunity {
  total_hours: number
  percentage: number
  windows: OpportunityWindow[]
  window_count?: number
  longest_window_hours?: number
  longest_dark_gap_hours?: number
}

export interface OpportunityData {
  threshold_deg: number
  total_period_hours: number
  sun: BodyOpportunity
  earth: BodyOpportunity
  joint: BodyOpportunity
}

export interface SiteSummary {
  site_id: string
  site_name: string
  lat: number
  lon: number
  period: string
  sun_hours: number
  sun_percentage: number
  earth_hours: number
  earth_percentage: number
  joint_hours: number
  joint_percentage: number
  sun_windows_count: number
  earth_windows_count: number
  joint_windows_count: number
}

export interface ManifestData {
  schema_version: number
  generated_at: string
  coverage: {
    start_utc: string
    stop_utc: string
    step_seconds: number
    resolution: string
  }
  conventions: {
    time_scale: string
    frame: string
    abcorr: string
    moon_radius_km: number
    sun_angular_radius_deg: number
    sun_upper_limb_correction: boolean
    horizon_mode: string
  }
  kernels: Record<string, string>
  validation_status: {
    horizons_golden_tests: string
    far_side_isolation: string
  }
  sites: Record<
    string,
    {
      name: string
      lat: number
      lon: number
      samples: number
      sun_hours: number
      earth_hours: number
    }
  >
}

export interface SelectableSite {
  id: string
  name: string
  lat: number | null
  lon: number | null
  isMission: boolean
  status?: MissionStatus
  provider?: string
  lander?: string
  region_type?: string
  coord_kind?: CoordKind
  verified?: boolean
  sources?: MissionSource[]
  notes?: string | null
}
