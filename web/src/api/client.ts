
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
    const responseText = await response.text()
    let detail = responseText
    let requestId = response.headers.get('X-Request-ID')

    if (responseText) {
      try {
        const body = JSON.parse(responseText) as {
          detail?: unknown
          error?: { message?: unknown; request_id?: unknown }
        }
        const value = body.detail ?? body.error?.message
        if (typeof value === 'string' && value.trim()) detail = value
        else if (value !== undefined) detail = JSON.stringify(value)
        if (typeof body.error?.request_id === 'string') requestId = body.error.request_id
      } catch {
        // Preserve a plain-text reverse-proxy or gateway response.
      }
    }

    if (!detail.trim() && response.status >= 500) {
      let apiHealthy = false
      try {
        const health = await fetch(API_BASE + '/health', { method: 'GET' })
        apiHealthy = health.ok
      } catch {
        apiHealthy = false
      }
      detail = apiHealthy
        ? 'The API is responding, but analysis failed with HTTP ' + response.status + '. Check the backend traceback for this request.'
        : 'The AXON API backend is unavailable or not ready (HTTP ' + response.status + '). Start it with: python -m uvicorn api.main:app --host 127.0.0.1 --port 8000'
    }

    if (requestId) detail += ' (Request ID: ' + requestId + ')'
    throw new Error(detail || 'API request failed: HTTP ' + response.status)
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

// POST /api/geometry/timeseries
export interface TimeseriesRequest { lat: number; lon: number; start_utc: string; stop_utc: string; step_seconds?: number; alt_km?: number }
export function getTimeseries(payload: TimeseriesRequest): Promise<Record<string, unknown>> {
  return post<TimeseriesRequest, Record<string, unknown>>('/geometry/timeseries', payload)
}

// POST /api/geometry/events
export interface EventsRequest { lat: number; lon: number; start_utc: string; stop_utc: string; step_seconds?: number; threshold_deg?: number; antenna_margin_deg?: number }
export function getEvents(payload: EventsRequest): Promise<Record<string, unknown>> {
  return post<EventsRequest, Record<string, unknown>>('/geometry/events', payload)
}

// POST /api/horizon
export interface HorizonApiRequest { lat: number; lon: number; mast_height_m?: number; range_km?: number }
export function getHorizon(payload: HorizonApiRequest): Promise<Record<string, unknown>> {
  return post<HorizonApiRequest, Record<string, unknown>>('/horizon', payload)
}

// POST /api/site/best-windows
export interface BestWindowsRequest { lat: number; lon: number; start_utc: string; stop_utc: string; min_window_hours?: number; horizon_mode?: string; mast_height_m?: number }
export function getBestWindows(payload: BestWindowsRequest): Promise<Record<string, unknown>> {
  return post<BestWindowsRequest, Record<string, unknown>>('/site/best-windows', payload)
}

// POST /api/verify
export interface VerifyRequest { lat: number; lon: number; utc: string }
export interface VerifyResult {
  status: 'success' | 'error'
  lat?: number; lon?: number; utc?: string
  spice?: { sun: { azimuth_deg: number | null; elevation_deg: number | null }; earth: { azimuth_deg: number | null; elevation_deg: number | null } }
  horizons?: { sun: { azimuth_deg: number | null; elevation_deg: number | null }; earth: { azimuth_deg: number | null; elevation_deg: number | null } }
  max_difference_deg?: { sun: number | null; earth: number | null }
  pass_tolerance_0_01_deg?: boolean
  detail?: string; note?: string
}
export function verifySite(payload: VerifyRequest): Promise<VerifyResult> {
  return post<VerifyRequest, VerifyResult>('/verify', payload)
}
