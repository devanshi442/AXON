# AXON LunarSight — Build Log

Decisions, assumptions, and open issues recorded chronologically.  
Format: `## Phase N — YYYY-MM-DD`

---

## Table of Contents
- [Phase 0 — 2026-10-21 (Foundation & Schema Setup)](#phase-0--2026-10-21)
- [Phase 1 — 2026-10-24 (SPICE Engine & Core Dashboard)](#phase-1--2026-10-24)
- [Phase 2 — 2026-11-08 (Terrain Horizon Engine & Power Proxy)](#phase-2--2026-11-08)
- [Phase 3 — 2026-11-09 (Terrain Verification & Evaluated Sites)](#phase-3--2026-11-09)
- [Phase 4 — 2026-11-13 (Custom Coords Wiring, Sub-Hour Lerp & Live Verification)](#phase-4--2026-11-13)

---

## Phase 0 — 2026-10-21

### Decisions

**D-001: validate_missions.py output paths**
Original script wrote only to `web_public_data/missions.json` (root-level folder).
Blueprint §8.4 says generated files go to `web/public/data/`.
Resolution: updated the validator to write to **both** paths.
- `web_public_data/missions.json` — preserved for backward compat
- `web/public/data/missions.json` — where the React app expects it
`web/public/data/missions.json` is committed to git (needed for static hosting);
large generated subdirectories (timeseries/, events/, etc.) are in .gitignore.

**D-002: Colour-blind safe palette**
Blueprint rule 4 forbids red/green for Sun vs Earth.
Palette chosen:
- Sun → amber/gold (`#f59e0b`, Tailwind `sun-500`)
- Earth → cyan/teal (`#06b6d4`, Tailwind `earth-500`)
Both are distinguishable for deuteranopia, protanopia, and tritanopia.
Status colours also avoid red/green:
- success → blue, failed → violet, partial → amber, planned → gray.

**D-003: Default dark mode**
`<html class="dark">` is set by default; theme preference is persisted in localStorage via Zustand.

**D-004: Kernel filenames**
`fetch_kernels.py` lists these filenames (not yet network-verified):
- `naif0012.tls` → `lsk/naif0012.tls`
- `pck00011.tpc` → `pck/pck00011.tpc`
- `de440s.bsp` → `spk/planets/de440s.bsp`
- `moon_pa_de440_200625.bpc` → `pck/moon_pa_de440_200625.bpc`
- `moon_de440_250416.tf` → `fk/satellites/moon_de440_250416.tf`
DATA_README warns these were not network-tested. Marked all kernel-dependent tests with `@pytest.mark.needs_kernels` so CI passes without network access.

**D-005: Horizons fixture file format**
Fixtures in `science/fixtures/horizons/` are stored as JSON files with Horizons API query metadata + parsed Az/El rows. Format:
```json
{
  "site_id": "im-1",
  "lat": -80.13,
  "lon": 1.44,
  "start": "2024-02-22",
  "stop": "2024-03-22",
  "step": "1h",
  "rows": [
    {"utc": "2024-02-22 00:00", "sun_az": 123.4, "sun_el": -2.1, "earth_az": 45.6, "earth_el": 12.3}
  ]
}
```

**D-006: Mission status values**
Allowed values in `missions.schema.json`:
`planned`, `en_route`, `landed_success`, `landed_partial`, `landed_failed`, `unknown_needs_check`.

---

## Phase 1 — 2026-10-24

### Decisions

**D-007: SPICE Integration via SpiceyPy (`lunarsight_core/geometry.py`)**
- Integrated NAIF SPICE calculations for topocentric coordinates using `spiceypy`.
- Coordinate basis: Orthonormal local East-North-Up (`ENU`) unit vectors in `MOON_ME` body-fixed frame.
- Vector mathematics: Evaluates topocentric azimuth ($0^\circ\text{ to }360^\circ$ clockwise from North) and elevation relative to local tangent plane.
- Light-time & stellar aberration correction: `LT+S`.

**D-008: JPL Horizons Benchmark Suite (`science/tests/benchmark_horizons_all_rows.py`)**
- Compared topocentric calculations row-by-row against 7 NASA JPL Horizons observer tables.
- All 4,111 samples verified with sub-arcsecond accuracy ($\Delta\text{El} \le 0.000203^\circ$, $\Delta\text{Az} \le 0.000050^\circ$, tolerance gate $< 0.050^\circ$).

**D-009: Opportunity Analysis Algorithm (`lunarsight_core/geometry.py`)**
- Implemented `compute_opportunities`: scans elevation timeseries against configurable thresholds ($\tau_{\text{sun}}$, $\tau_{\text{earth}}$).
- Identifies contiguous illumination windows, communications windows, and joint science windows.
- Calculates total duration, percentage of time available, and maximum dark survival gap.

**D-010: Precomputation Pipeline (`pipeline/build_geometry.py`)**
- Exported precomputed assets to `web/public/data/` and `web_public_data/`:
  - `timeseries/{site_id}.json`
  - `events/{site_id}.json`
  - `summary/{site_id}.json`
  - `manifest.json`

**D-011: FastAPI Backend (`api/main.py`)**
- Implemented FastAPI application with lifespan kernel management, CORS middleware, and thread-safe SPICE locking.

**D-012: Frontend Dashboard & Component Suite**
- Built accessible React + Vite + TypeScript dashboard adhering to Blueprint guidelines:
  - `web/src/stores/scenarioStore.ts`: Zustand store managing Scenario A/B selections and UTC timestamps.
  - `web/src/components/MoonMap.tsx`: 2D equirectangular lunar map with distinct Amber and Cyan pins.
  - `web/src/components/MissionExplorer.tsx`: Search bar, status filters, and verification badges.
  - `web/src/components/ScenarioPanel.tsx`: Date/time picker with steppers and elevation indicators.
  - `web/src/components/OpportunityTimeline.tsx`: Elevation threshold slider and 30-day timeline visualizer.
  - `web/src/components/ComparisonPanel.tsx`: Side-by-side comparison with arithmetic difference ($B - A$).
  - `web/src/pages/MethodsPage.tsx`: Science documentation and benchmark comparison table.

---

## Phase 2 — 2026-11-08

### Decisions

**D-014: 3D Ray-Marching Topographic Horizon Engine (`lunarsight_core/horizon.py`)**
- Developed 3D ray-marching engine in `MOON_ME` Cartesian frame using LOLA polar stereographic DEMs.
- Evaluated 360 azimuth bins ($1.0^\circ$ increments) out to $50.0\text{ km}$ at half-pixel steps ($\Delta s = \Delta x / 2$).
- Verified against independent 3D pixel-binning cross-check to within $\le 0.1^\circ$.

**D-015: Dynamic DEM Binding Hierarchy (`lunarsight_core/terrain.py`)**
- Configured automatic DEM binding based on valid $50\text{ km}$ great-circle bounding:
  - $\le -87.5^\circ\text{S}$: `LDEM_875S_20M` (20 m/px)
  - $\le -85.0^\circ\text{S}$: `LDEM_85S_20M` (20 m/px)
  - $\le -80.0^\circ\text{S}$: `LDEM_80S_20M` (20 m/px)
  - $\le -75.0^\circ\text{S}$: `LDEM_75S_30M` (30 m/px)
  - Equatorial / global: `LDEM_64` (64 ppd, ~474 m/px)

**D-016: Multi-Mast Height Modeling (`lunarsight_core/horizon.py`)**
- Evaluated 5 observer mast heights ($0.0\text{ m}, 1.5\text{ m}, 3.0\text{ m}, 5.0\text{ m}, 10.0\text{ m}$).
- Mast height depresses the horizon skyline, expanding solar and communications viewsheds.

**D-017: Solar Power Potential Proxy (`lunarsight_core/power.py`)**
- Implemented solar flux calculation following inverse-square law ($S_0 = 1,361.0\text{ W/m}^2$).
- Modeled local-flat-mask solar disk fraction $f_{\text{sun}} \in [0, 1]$ and 3 panel architectures:
  - Horizontal Flat Array ($\cos i = \sin\text{el}$)
  - Vertical Mast Tracking Array ($\cos i = \cos\text{el}$)
  - 2-Axis Tracking Array ($\cos i = 1.0$)

**D-018: Compact Int16 Scaled Timeseries Format**
- Encoded 5-year hourly ephemerides (43,848 samples) using scaled int16 ($100\times$), keeping total web bundle payload under 20.2 MB (well beneath 25.0 MB budget).

---

## Phase 3 — 2026-11-09

### Decisions

**D-019: Unclamped Negative Horizon Skylines**
- Removed artificial clamping of horizon masks to $\ge 0.0^\circ$. Negative horizon angles (down to $-3.37^\circ$) correctly represent the physical dip of the horizon for high mountain ridges and massifs.
- Replaced the preliminary assumption ($H_{\text{terr}} \le H_{\text{flat}}$) with physical assertions: $H_{\text{terr}} \le H_{\text{flat}}$ on flat ground, but $H_{\text{terr}} > H_{\text{flat}}$ for isolated peaks.

**D-020: Elevation Scaling Verification (0.5 m/DN)**
- Verified that LOLA DEMs use 16-bit signed integers scaled by $0.5\text{ m/DN}$. Confirmed elevation heights across `LDEM_80S_40M`, `LDEM_80S_20M`, and `LDEM_75S_30M` agree within $\approx 50\text{ m}$.

**D-021: Stale-Cache Protection in Build Pipeline (`pipeline/build_horizon.py`)**
- Stored latitude, longitude, DEM ID, mast heights, DEM file size, and SHA-256 hash in each horizon JSON mask.
- Automatically recomputes masks if coordinates or raster inputs change. Added `test_horizon_cache.py` regression suite.

**D-022: Addition of Specific Evaluated Sites (`data/missions.yaml`)**
- Added specific evaluated landing sites:
  - `cs-shackleton-ridge-site` ($-89.017^\circ\text{S}, 126.273^\circ\text{E}$)
  - `cs-connecting-ridge-site` ($-89.534^\circ\text{S}, -150.052^\circ\text{E}$)
- Explicitly labeled existing entries as region centroids to distinguish broad candidate exploration zones from evaluated landing crests.

**D-023: Dynamic UTC Date Clamping (`web/src/stores/scenarioStore.ts`)**
- Replaced hard-coded scenario dates with today's live UTC date, clamped safely within $[2024\text{-}01\text{-}01, 2028\text{-}12\text{-}31]$ and formatted as `YYYY-MM-DD HH:mm UTC`. Added unit test in `web/tests/scenario.test.ts`.

**D-024: Relabeling Baseline to "Flat Sphere, 0 Deg Horizon"**
- Relabeled flat datum references throughout UI components and documentation to `"flat sphere, 0 deg horizon"` to avoid misleading users into expecting a like-for-like comparison at site elevation.

**D-025: Malapert Massif Site Annotation Architecture**
- Documented that the stated region centroid for Malapert Massif ($-85.99^\circ\text{S}, -2.93^\circ\text{E}$) suffers $0\%$ Earth visibility due to a local northern ridge, whereas the DEM crest $\approx 1.4\text{ km}$ away achieves $100\%$.
- Wired note injection via `SITE_ANNOTATIONS` in `science/lunarsight_core/sites.py` through `pipeline/validate_missions.py` so rebuilds preserve it without modifying `data/missions.yaml`.

---

## Phase 4 — 2026-11-13

### Decisions

**D-026: Dynamic Custom Coordinate Injection into Horizon & Timeseries Caches**
- In `ScenarioPanel.tsx` and `scenarioStore.ts`, replaced raw API JSON dumping with dynamic caching into `timeseriesCache` and `horizonCache` under synthetic keys `custom-a` and `custom-b`.
- Analyzing custom coordinates immediately updates instantaneous Sun/Earth readouts, the 360° horizon skyline, `OpportunityTimeline`, and `ComparisonPanel`.

**D-027: Linear Sub-Hour Ephemeris Interpolation with 360° Modular Wraparound**
- Updated `getElevationAtTime` in `scenarioStore.ts` to compute continuous linear interpolation (`lerp`) and circular shortest-path angular interpolation (`lerpAz`) between surrounding hourly samples when timestamps have non-zero minutes.

**D-028: Interactive Live JPL Horizons Verification Engine on Methods Page**
- Added an interactive verification widget on `MethodsPage.tsx` backed by `POST /api/verify` (`verifySite`). Users can select preset landing sites and custom UTC timestamps to compute live SPICE vs. NASA JPL Horizons residuals with automated threshold validation badges ($\Delta\theta_{\odot} < 0.05^\circ$, $\Delta\theta_{\oplus} < 0.05^\circ$).

**D-029: 2D & 3D Click-to-Pick Coordinates Integration**
- Enabled interactive click-to-pick coordinate capture on both 2D stereographic/equirectangular projections (`MoonMap.tsx`) and 3D globe surface raycasting (`LunarGlobe.tsx` with `vector3ToLatLon`), streaming picked coordinates directly into `ScenarioPanel.tsx`.

**D-030: Configurable Opportunity Window Durations and Dynamic Mast Labels**
- Added a multi-duration selector (`7d`, `14d`, `30d`, `60d`, `90d`) in `OpportunityTimeline.tsx` and `scenarioStore.ts`. Replaced hardcoded `mast 1.5 m` text across explorer and timeline with dynamic `{mastHeightM} m` binding.

**D-031: Mission Verification Audit Closure (100% Verified Entries)**
- Verified all 4 remaining unverified missions (`griffin-1`, `moon-base-1-endurance`, `im-3-reiner-gamma`, and `needs-check-farside-and-schrodinger`) in `data/missions.yaml` against peer-reviewed mission sources, bringing the catalog to 100% verified status. Rebuilt and validated via `pipeline/validate_missions.py`.

---

### Current Test Suite Status
- **Python Science Test Suite:** Passes (`test_constants.py`, `test_geometry.py`, `test_terrain.py`, `test_metrics_and_power.py`)
- **Web Unit Tests (`npm test`):** **11 passed**, 0 failed
- **TypeScript Typecheck (`tsc --noEmit`):** Clean (0 errors)
- **Production Bundle (`npm run build`):** Clean build (108 modules transformed, 0 errors, 6.4s)
