# AXON LunarSight — Backend & API Integration Guide

This document defines the complete backend integration contract for **AXON LunarSight**. It specifies all available REST endpoints, request/response models, scientific conventions, error semantics, caching behavior, and integration code snippets for frontend and external client consumers.

---

## 1. Architectural Overview & Conventions

AXON LunarSight pairs high-precision astronomical ephemerides from **NASA NAIF SPICE** with 3D ray-marching through **LOLA Digital Elevation Models (DEMs)** to evaluate lunar surface landing sites.

### Planetary Reference Conventions
- **Lunar Body-Fixed Frame:** `MOON_ME` (Mean-Earth / Polar Axis reference frame; IAU / LOLA / JPL Horizons convention).
- **Coordinate Conventions:**
  - **Latitude:** Planetocentric, range $[-90.0^\circ, +90.0^\circ]$. Both poles (+90° and -90°) supported.
  - **Longitude:** East-positive, range $[-180.0^\circ, +180.0^\circ]$. Both boundaries (+180° and -180°) supported.
- **Reference Radius:** $R_0 = 1,737.4\text{ km}$ ($1,737,400\text{ m}$, IAU / NAIF `pck00011.tpc`).
- **Time Scale:** Inputs and outputs are in **UTC ISO 8601** strings (e.g. `2026-03-01T00:00:00Z`). Internal ephemeris computations use Ephemeris Time ($\text{ET}$ / $\text{TDB}$) through NAIF leap-seconds kernel `naif0012.tls`.
- **Light-Time Correction:** `LT+S` (light-time plus stellar aberration correction).
- **Solar Disk Upper Limb:** The Sun is modeled as an extended spherical source of angular radius $r_{\text{sun}} \approx 0.2665^\circ$ ($0.267^\circ$ rounded-up). A site is illuminated whenever:
  $$\text{el}_{\text{sun, center}} + 0.267^\circ > h_{\text{horizon}}(\text{az}) + \tau_{\text{threshold}}$$
- **Direct-to-Earth (DTE) Clearance:** Geometric line-of-sight to Earth's center of mass with configurable antenna elevation clearance margin $\mu \ge 0.0^\circ$.
- **Terrain Tiers:**
  - **T1:** High-resolution polar LOLA DEM ($20\text{--}40\text{ m/px}$, polar stereographic).
  - **T2:** Global LOLA DEM (`LDEM_64`, $\approx 474\text{ m/px}$, equirectangular).
  - **T3:** Idealized flat spherical horizon datum ($0.0^\circ$ tangent).

---

## 2. Server Startup, Base URL & CORS Configuration

### Authoritative Server Startup Command
Start the FastAPI backend with single-process SPICE thread serialization:
```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers 1
```

- **Default Local Development URL:** `http://127.0.0.1:8000`
- **Frontend Development Origin:** `http://localhost:5173`
- **Configurable Origins Environment Variable:** `AXON_ALLOWED_ORIGINS` (comma-separated list, e.g. `http://localhost:5173,https://lunarsight.spaceapps.org`).

---

## 3. API Endpoints Reference

### 3.1 Service Health & Readiness

#### `GET /api/health`
Basic service liveness check returning version and kernel availability.

**Response (200 OK):**
```json
{
  "status": "ok",
  "version": "0.3.0",
  "service": "AXON LunarSight API",
  "kernels_loaded": true
}
```

#### `GET /api/ready`
Detailed readiness check distinguishing a running HTTP server from a fully functional scientific calculation engine.

**Response (200 OK):**
```json
{
  "status": "ready",
  "ready": true,
  "kernels_loaded": true,
  "kernels_available": [
    "naif0012.tls",
    "pck00011.tpc",
    "de440s.bsp",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf"
  ],
  "terrain_dems_available": [
    "LDEM_875S_20M",
    "LDEM_85S_20M",
    "LDEM_85S_40M",
    "LDEM_80S_20M",
    "LDEM_80S_40M",
    "LDEM_75S_30M",
    "LDEM_64"
  ],
  "benchmark_status": "present",
  "warnings": []
}
```

#### `GET /api/provenance`
Returns planetary reference frames, physical constants, kernel hashes from `kernels.lock`, and verified benchmark results against NASA JPL Horizons.

---

### 3.2 Site Registry

#### `GET /api/sites`
Returns the normalized site catalog (missions, reference points, and candidate regions).

#### `GET /api/sites/{site_id}`
Returns details for a single site, including availability flags for precomputed static JSON assets.

---

### 3.3 Custom Lunar Coordinate & Site Analysis

#### `POST /api/site/analyze`
**The primary dynamic analysis endpoint.** Performs full topocentric illumination, direct-to-Earth visibility, solar array power generation modeling, and 3D terrain horizon ray-marching. Works for **arbitrary lunar coordinates** or catalog site IDs.

**Request Body:**
```json
{
  "site_name": "Custom South Polar Ridge",
  "lat": -89.534,
  "lon": -150.052,
  "start_utc": "2026-03-01T00:00:00Z",
  "stop_utc": "2026-03-15T00:00:00Z",
  "step_seconds": 3600,
  "mast_height_m": 2.0,
  "horizon_mode": "terrain",
  "solar_array_type": "vertical",
  "array_area_m2": 2.0,
  "array_efficiency": 0.30,
  "antenna_margin_deg": 1.0,
  "earth_criterion": "center",
  "refine_precision": false
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `site_id` | string | No | null | Optional catalog site ID (e.g. `"im-2"`, `"cs-connecting-ridge"`). If omitted, `lat` and `lon` are required. |
| `site_name` | string | No | `"Custom Site"` | User-friendly label for the analysed location. |
| `lat` | float | Conditional | null | Planetocentric latitude $[-90.0^\circ, +90.0^\circ]$. |
| `lon` | float | Conditional | null | East-positive longitude $[-180.0^\circ, +180.0^\circ]$. |
| `start_utc` | string | Yes | - | Start UTC timestamp in ISO 8601 format. |
| `stop_utc` | string | Yes | - | Stop UTC timestamp in ISO 8601 format (maximum 90 days from `start_utc`). |
| `step_seconds` | integer | No | 3600 | Time step in seconds (minimum 60s). |
| `mast_height_m` | float | No | 1.5 | Observer/hardware mast height in meters $[0.0, 100.0]$. |
| `horizon_mode` | string | No | `"terrain"` | `"terrain"` (3D DEM ray-march) or `"flat"` (idealized 0° sphere). |
| `solar_array_type`| string | No | `"vertical"` | `"vertical"`, `"horizontal"`, `"tracking"`, or `"tilted"`. |
| `solar_tilt_deg` | float | No | null | Tilt relative to horizontal $[0.0^\circ, 90.0^\circ]$ for tilted arrays. |
| `solar_azimuth_deg`| float | No | null | Azimuth normal direction $[0.0^\circ, 360.0^\circ]$ for fixed arrays. |
| `array_area_m2` | float | No | 1.0 | Photovoltaic panel surface area ($m^2$). |
| `array_efficiency`| float | No | 0.28 | Solar conversion efficiency ($0.28 = 28\%$). |
| `antenna_margin_deg`| float | No | 0.0 | Elevation clearance margin above topography for DTE ($^\circ$). |
| `earth_criterion` | string | No | `"center"` | `"center"`, `"full_disk"`, or `"any_limb"`. |
| `refine_precision`| boolean | No | false | Refines rising/setting window edges to ~1-minute via SPICE root-finding. |

**Response (200 OK):**
```json
{
  "analysis_id": "scn-9a2df340b1e84a2f",
  "site_id": "custom--89.5340--150.0520",
  "site_name": "Custom South Polar Ridge",
  "lat": -89.534,
  "lon": -150.052,
  "mast_height_m": 2.0,
  "start_utc": "2026-03-01T00:00:00Z",
  "stop_utc": "2026-03-15T00:00:00Z",
  "total_period_hours": 336.0,
  "horizon_mode": "terrain",
  "dem_id": "LDEM_875S_20M",
  "coverage_status": "full",
  "coverage_tier": "T1",
  "tier": "T1",
  "site_origin": "published_candidate",
  "site_elevation_m": 1653.0,
  "instantaneous": {
    "utc": "2026-03-01T00:00:00Z",
    "sun_azimuth_deg": 182.4,
    "sun_elevation_deg": -0.85,
    "terrain_elevation_at_sun_deg": -1.42,
    "earth_azimuth_deg": 28.1,
    "earth_elevation_deg": 4.12,
    "sun_visible": true,
    "earth_visible": true
  },
  "sun": {
    "total_hours": 196.0,
    "percentage": 58.3,
    "windows_count": 3,
    "longest_window_hours": 142.0,
    "longest_dark_gap_hours": 48.0,
    "windows": [
      {
        "start": "2026-03-01T00:00:00Z",
        "end": "2026-03-06T22:00:00Z",
        "duration_hours": 142.0,
        "precision": "hourly"
      }
    ]
  },
  "earth": {
    "total_hours": 164.0,
    "percentage": 48.8,
    "windows_count": 1,
    "longest_window_hours": 164.0,
    "longest_dark_gap_hours": 0.0,
    "criterion": "center",
    "margin_deg": 1.0,
    "windows": []
  },
  "joint": {
    "total_hours": 112.0,
    "percentage": 33.3,
    "windows_count": 2,
    "longest_window_hours": 78.0,
    "longest_joint_gap_hours": 54.0,
    "windows": []
  },
  "power": {
    "area_m2": 2.0,
    "efficiency": 0.30,
    "orientation": "vertical",
    "total_energy_kwh": 76.42,
    "specific_energy_kwh_m2": 38.21,
    "peak_power_watts": 816.5,
    "mean_power_watts": 227.4,
    "caveat": "Geometric potential under clear-sky solar irradiance, not a mission power subsystem prediction."
  },
  "flat": { ... },
  "terrain": { ... },
  "delta_terrain_minus_flat": {
    "sun_hours": 16.0,
    "sun_percentage": 4.8,
    "longest_dark_gap_hours": -12.0,
    "earth_hours": -2.0,
    "energy_kwh": 6.2
  },
  "provenance": {
    "frame": "MOON_ME",
    "abcorr": "LT+S",
    "time_scale": "UTC (internal Ephemeris Time)",
    "api_version": "0.3.0",
    "kernels": { "de440s.bsp": "697a..." }
  },
  "warnings": [],
  "caveats": [
    "Sun above horizon is direct geometric line of sight to the solar upper limb.",
    "Direct line-of-sight geometry is not a telecommunications RF link budget.",
    "Solar power potential is a clear-sky geometric proxy, not a complete spacecraft power simulation."
  ],
  "elapsed_ms": 28.5,
  "cached": false
}
```

---

### 3.4 Multi-Site Comparison Engine

#### `POST /api/compare`
Compares 2 to 4 lunar locations across a common, synchronized analysis window (or legacy per-site window). Supports custom coordinates, catalog sites, and mixed selections. Partial failures on individual sites are reported explicitly without aborting successful results.

**Request Body:**
```json
{
  "start_utc": "2026-03-01T00:00:00Z",
  "window_days": 15,
  "baseline_site_id": "im-2",
  "sites": [
    {
      "id": "im-2",
      "name": "IM-2 (Mons Mouton)"
    },
    {
      "name": "Custom Shackleton Flank",
      "lat": -89.80,
      "lon": 100.00,
      "mast_height_m": 2.5
    }
  ],
  "threshold_deg": 0.0,
  "antenna_margin_deg": 1.0,
  "solar_array_type": "vertical"
}
```

**Response (200 OK):**
```json
{
  "sites": [
    {
      "id": "im-2",
      "name": "IM-2 (Mons Mouton)",
      "site_origin": "official_mission",
      "status": "success",
      "lat": -84.7906,
      "lon": 29.1957,
      "mast_height_m": 1.5,
      "dem_id": "LDEM_80S_20M",
      "coverage_tier": "T1",
      "tier": "T1",
      "instantaneous": { ... },
      "flat": { ... },
      "terrain": { ... },
      "power": { ... }
    },
    {
      "id": "custom--89.8000-+100.0000",
      "name": "Custom Shackleton Flank",
      "site_origin": "user_defined",
      "status": "success",
      "lat": -89.8,
      "lon": 100.0,
      "mast_height_m": 2.5,
      "dem_id": "LDEM_85S_20M",
      "coverage_tier": "T1",
      "tier": "T1",
      "instantaneous": { ... },
      "flat": { ... },
      "terrain": { ... },
      "power": { ... }
    }
  ],
  "baseline_site_id": "im-2",
  "deltas_vs_baseline": {
    "im-2": {
      "site_name": "IM-2 (Mons Mouton)",
      "sun_hours": 0.0,
      "sun_pct": 0.0,
      "dte_hours": 0.0,
      "dte_pct": 0.0,
      "energy_kwh": 0.0,
      "energy_kwh_m2": 0.0
    },
    "custom--89.8000-+100.0000": {
      "site_name": "Custom Shackleton Flank",
      "sun_hours": 24.5,
      "sun_pct": 6.8,
      "dte_hours": 0.0,
      "dte_pct": 0.0,
      "energy_kwh": 9.42,
      "energy_kwh_m2": 9.42
    }
  },
  "pairwise_delta_1_minus_0": {
    "sun_hours": 24.5,
    "sun_pct": 6.8,
    "dte_hours": 0.0,
    "dte_pct": 0.0,
    "energy_kwh": 9.42,
    "energy_kwh_m2": 9.42
  },
  "rankings": {
    "by_sunlight_percentage": ["Custom Shackleton Flank", "IM-2 (Mons Mouton)"],
    "by_earth_visibility_percentage": ["Custom Shackleton Flank", "IM-2 (Mons Mouton)"],
    "by_joint_availability_hours": ["Custom Shackleton Flank", "IM-2 (Mons Mouton)"],
    "by_shortest_dark_gap": ["Custom Shackleton Flank", "IM-2 (Mons Mouton)"],
    "by_solar_energy": ["Custom Shackleton Flank", "IM-2 (Mons Mouton)"]
  },
  "window_days": 15,
  "common_window": true,
  "start_utc": "2026-03-01T00:00:00Z",
  "stop_utc": "2026-03-16T00:00:00Z",
  "threshold_deg": 0.0,
  "antenna_margin_deg": 1.0,
  "solar_array_type": "vertical",
  "warnings": [],
  "api_version": "0.3.0",
  "elapsed_ms": 34.2
}
```

---

### 3.5 Best Operating Window Search

#### `POST /api/site/best-windows`
Scans an extended search interval (e.g. 30–90 days) to identify and rank candidate continuous joint operating windows (simultaneous Sun and Earth visibility).

**Request Body:**
```json
{
  "lat": -89.5,
  "lon": 120.0,
  "search_start_utc": "2026-03-01T00:00:00Z",
  "search_stop_utc": "2026-04-15T00:00:00Z",
  "min_window_hours": 24.0,
  "horizon_mode": "terrain",
  "mast_height_m": 1.5,
  "top_n": 5
}
```

---

### 3.6 Terrain Horizons & Ephemeris Geometry

#### `POST /api/geometry/timeseries`
Generates hourly Sun/Earth ephemerides.
- `horizon_mode: "flat"`: Idealized 0° sphere.
- `horizon_mode: "terrain"`: Evaluates upper limb above local 360° ray-marched horizon.

#### `POST /api/horizon`
Ray-marches the complete 360° terrain skyline mask for a given coordinate.

---

### 3.7 Cache Inspection & Live Verification

#### `GET /api/cache/stats`
Reports cache size, hits, misses, hit ratio, and evictions.

#### `POST /api/cache/clear`
Clears in-memory scientific caches.

#### `POST /api/verify`
Performs live comparison of SPICE coordinates against NASA JPL Horizons web service with a 15-second timeout.

---

## 4. Error Responses & Handling

The API returns standard HTTP status codes with structured JSON error details:

- **400 Bad Request:** Chronological error, coordinate out of range, or invalid parameters.
- **404 Not Found:** Specified `site_id` does not exist in registry.
- **422 Unprocessable Content:** Pydantic schema validation failure.
- **503 Service Unavailable:** SPICE kernels uninitialized.

**Example 400 Response:**
```json
{
  "detail": "stop_utc must be strictly after start_utc"
}
```

---

## 5. Client Integration Code Examples

### 5.1 JavaScript / TypeScript `fetch` Library

Create `web/src/api/lunarsightApi.ts` with these client functions:

```typescript
const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export interface AnalysisParams {
  site_id?: string;
  lat?: number;
  lon?: number;
  site_name?: string;
  start_utc: string;
  stop_utc: string;
  step_seconds?: number;
  mast_height_m?: number;
  horizon_mode?: 'flat' | 'terrain';
  threshold_deg?: number;
  antenna_margin_deg?: number;
  earth_criterion?: 'center' | 'full_disk' | 'any_limb';
  solar_array_type?: 'horizontal' | 'vertical' | 'vertical_azimuth_tracking' | 'sun_tracking';
  array_area_m2?: number;
  array_efficiency?: number;
}

/**
 * 1. Custom Coordinate & Registered Site Analysis
 */
export async function analyzeSite(params: AnalysisParams) {
  const res = await fetch(`${BASE_URL}/api/site/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Analysis failed (${res.status})`);
  }
  return await res.json();
}

/**
 * 2. Multi-Site Comparison (2 to 4 locations)
 */
export async function compareSites(payload: {
  sites: { site_id?: string; lat?: number; lon?: number; name?: string }[];
  start_utc: string;
  stop_utc: string;
  horizon_mode?: 'flat' | 'terrain';
  mast_height_m?: number;
  antenna_margin_deg?: number;
  solar_array_type?: string;
}) {
  const res = await fetch(`${BASE_URL}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Comparison failed (${res.status})`);
  }
  return await res.json();
}

/**
 * 3. Best Operating Window Search
 */
export async function searchBestWindows(payload: {
  site_id?: string;
  lat?: number;
  lon?: number;
  search_start_utc: string;
  search_stop_utc: string;
  min_window_hours?: number;
  horizon_mode?: 'flat' | 'terrain';
  mast_height_m?: number;
  top_n?: number;
}) {
  const res = await fetch(`${BASE_URL}/api/site/best-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Best windows search failed (${res.status})`);
  }
  return await res.json();
}

/**
 * 4. 360-Degree Topographic Skyline Mask
 */
export async function fetchHorizonMask(lat: number, lon: number, mastHeightM: number = 1.5) {
  const res = await fetch(`${BASE_URL}/api/horizon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, observer_height_m: mastHeightM, max_range_km: 50.0 }),
  });
  if (!res.ok) throw new Error(`Horizon fetch failed (${res.status})`);
  return await res.json();
}

/**
 * 5. Scientific Provenance & Benchmark Summary
 */
export async function fetchProvenance() {
  const res = await fetch(`${BASE_URL}/api/provenance`);
  if (!res.ok) throw new Error(`Provenance fetch failed (${res.status})`);
  return await res.json();
}
```

---

### 5.2 Frontend Store Integration & Precomputed Data Fallback Pattern

In `web/src/stores/scenarioStore.ts`, the frontend developer can wire the API with automatic fallback to static precomputed JSON:

```typescript
// Example integration for scenarioStore.ts loadTimeseries:
loadTimeseries: async (siteId: string) => {
  // Try live API first if server is running:
  try {
    const liveData = await analyzeSite({
      site_id: siteId,
      start_utc: '2026-01-01T00:00:00Z',
      stop_utc: '2026-01-31T00:00:00Z',
      horizon_mode: get().horizonMode,
      mast_height_m: get().mastHeightM,
    });
    set((state) => ({
      timeseriesCache: { ...state.timeseriesCache, [siteId]: liveData.instantaneous },
      loading: { ...state.loading, [siteId]: false },
    }));
    return;
  } catch (apiError) {
    console.warn(`[AXON] Live API unavailable (${apiError}). Falling back to precomputed static data.`);
  }

  // Precomputed fallback:
  const res = await fetch(`/data/timeseries/${siteId}.json`);
  const raw = await res.json();
  set((state) => ({
    timeseriesCache: { ...state.timeseriesCache, [siteId]: raw },
    loading: { ...state.loading, [siteId]: false },
  }));
}
```

---

### 5.3 Remaining Frontend Wiring Tasks for UI/UX Teammate

1. **Custom Coordinate Input:**
   Add a modal / input card in `ExplorerPage.tsx` or `SiteSelectModal.tsx` allowing arbitrary Latitude ($-90^\circ$ to $+90^\circ$) and Longitude ($-180^\circ$ to $+180^\circ$) input. When submitted, call `analyzeSite({ lat, lon, ... })` and pass the returned `analysis_id` to the visualization panels.
2. **Multi-Site Comparison Drawer:**
   In `ComparisonPage.tsx`, wire `compareSites` to pass up to 4 selected site IDs or custom coordinates, rendering the returned `pairwise_delta_1_minus_0` and `rankings`.
3. **Best Windows Discovery Panel:**
   Add a "Find Best Windows" button on the Explorer Page that calls `searchBestWindows` and displays the ranked candidate list with continuous sunlight and Earth line of sight.

---

### 5.4 cURL CLI
```bash
curl -X POST http://127.0.0.1:8000/api/site/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "lat": -89.5,
    "lon": 120.0,
    "start_utc": "2026-03-01T00:00:00Z",
    "stop_utc": "2026-03-08T00:00:00Z",
    "horizon_mode": "terrain",
    "mast_height_m": 1.5
  }'
```

