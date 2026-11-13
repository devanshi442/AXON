
const API_BASE = '/api'

// Request for analysing a single lunar site
export interface SiteAnalyzeRequest {
  site_id?: string
  site_name?: string
  lat?: number
  lon?: number
  start_utc: string
  stop_utc: string
  step_seconds?: number
  mast_height_m?: number
  horizon_mode?: 'terrain' | 'flat'
  solar_array_type?: string
  solar_tilt_deg?: number
  solar_azimuth_deg?: number
  array_area_m2?: number
  array_efficiency?: number
  antenna_margin_deg?: number
  earth_criterion?: 'center' | 'full_disk' | 'any_limb'
  refine_precision?: boolean
}

// Request for comparing multiple lunar sites
export interface MultiCompareRequest {
  sites: {
    id?: string
    name?: string
    lat?: number
    lon?: number
    utc?: string
    mast_height_m?: number
  }[]
  baseline_site_id?: string
  start_utc?: string
  stop_utc?: string
  window_days?: number
  threshold_deg?: number
  antenna_margin_deg?: number
  solar_array_type?: string
  array_area_m2?: number
  array_efficiency?: number
  horizon_mode?: 'terrain' | 'flat'
}

// Common API request handler
async function post<TRequest, TResponse>(
  endpoint: string,
  payload: TRequest
): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(
      message || `API request failed: ${response.status}`
    )
  }

  return response.json() as Promise<TResponse>
}

// Analyse a single site, including custom coordinates
export function analyzeSite(payload: SiteAnalyzeRequest) {
  return post<SiteAnalyzeRequest, Record<string, unknown>>(
    '/site/analyze',
    payload
  )
}

// Compare 2–4 lunar sites
export function compareSites(payload: MultiCompareRequest) {
  return post<MultiCompareRequest, Record<string, unknown>>(
    '/compare',
    payload
  )
}
