/**
 * TypeScript types for AXON LunarSight mission data.
 * These must stay in sync with data/schema/missions.schema.json.
 *
 * Key conventions (see science/lunarsight_core/constants.py for the full list):
 *  - lat / lon: planetocentric, east-positive, degrees
 *  - null means "not published" — display as "Not published" in the UI
 *  - verified: only true after a second teammate re-checks the cited source
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
  | string   // allow forward-compat

export interface MissionSite {
  name: string
  region_type: RegionType
  /** Planetocentric latitude, degrees. null = not published. */
  lat: number | null
  /** East-positive longitude, degrees, −180..180. null = not published. */
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
