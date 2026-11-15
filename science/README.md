# lunarsight_core

Python core scientific computation engine for **AXON LunarSight** — calculates high-precision topocentric ephemerides (Sun and Earth azimuth, elevation, distance, and angular diameter), Digital Elevation Model (DEM)-derived topographic horizon obstruction masks, solar disk fraction illumination, photovoltaic power potential, and Direct-to-Earth (DTE) communication visibility for lunar exploration sites.

---

## Contents & Architecture

The package is located at `science/lunarsight_core/` and comprises the following modular subsystems:

| Module | Purpose | Key Responsibilities |
|---|---|---|
| `constants.py` | Single source of truth for lunar constants | IAU 2015 mean lunar radius ($R = 1,737.4\text{ km}$), frame names (`MOON_ME`), NAIF body codes (Sun: 10, Moon: 301, Earth: 399), solar irradiance constant ($S_0 = 1,361.0\text{ W/m}^2$), solar angular radius ($0.2665^\circ$, $0.267^\circ$ rounded-up), and default observer mast height ($1.5\text{ m}$). |
| `geometry.py` | NAIF SPICE wrapper & topocentric engine | Orthonormal local East-North-Up (ENU) surface basis projection, light-time and stellar aberration corrections (`LT+S`), vector Azimuth/Elevation/Distance computation, instantaneous angular radius evaluation, and discrete event window extraction. |
| `terrain.py` | LOLA DEM reader & projection math | Spatial coordinate transformations, Moon spherical polar stereographic projection ($R = 1,737,400\text{ m}$, $lat_{\text{ts}} = -90^\circ$, $lon_0 = 0^\circ$), windowed sub-box raster caching via `rasterio.windows.Window` to avoid multi-GB memory allocations, and $0.5\text{ m/DN}$ elevation unit scaling. |
| `horizon.py` | 3D great-circle ray-marching engine | Computes 360-degree horizon skyline masks ($1.0^\circ$ azimuth resolution) out to $50.0\text{ km}$ at half-pixel increments ($\Delta s = \Delta x / 2$) in full 3D Cartesian coordinates (`MOON_ME`). Preserves physically authentic negative horizon dips (down to $-3.37^\circ$) for high peaks and includes an independent pixel-binning cross-check. |
| `visibility.py` | Direct line-of-sight & solar disk fraction | Direct line-of-sight evaluation comparing celestial body elevation against azimuth-matched horizon mask elevation. Implements analytical circular-segment solar disk fraction $f_{\text{sun}} \in [0, 1]$ and customizable Earth antenna clearance margins ($\mu \ge 0^\circ$). |
| `power.py` | Photovoltaic generation potential model | Clear-sky astronomical inverse-square solar flux $S(d) = S_0 (1\text{ AU} / d)^2$ and electrical power potential $P(t) = S(d) \cdot A \cdot \eta \cdot \max(0, \cos i) \cdot f_{\text{sun}}(t)$ across 4 array architectures (horizontal flat, vertical fixed, vertical azimuth tracking, 2-axis tracking). |
| `metrics.py` | Statistical analysis & event extraction | Contiguous daylight/darkness/DTE window extraction, multi-lunation statistics (sunlight %, DTE %, max dark gap, blackout count, energy), sub-minute event edge refinement via SPICE bisection root-finding ($< 60\text{ s}$ precision), multi-site comparison, and best landing window search. |
| `sites.py` | Sourced landing site catalog registry | Registry parser, coordinate normalization (latitude $[-90^\circ, +90^\circ]$, longitude $[-180^\circ, +180^\circ]$), terrain tier resolution (T1: polar DEMs, T2: global DEM, T3: flat datum), and scientific annotations (e.g. Malapert Massif region centroid vs ridge crest). |
| `benchmark.py` | NASA JPL Horizons regression runner | Automated regression runner ingesting 7 committed JPL Horizons observer tables (4,111 samples) and verifying topocentric Az/El calculations against independent NASA ground truth within sub-arcsecond precision. |

---

## Installation

Ensure your Python virtual environment is activated, then install the package in editable mode:

```bash
# From repository root
pip install -e science/
```

### Dependencies
- `spiceypy>=6.0` (C-SPICE toolkit wrapper)
- `numpy>=1.26` (vectorized numerical computing)
- `rasterio>=1.3.0` (GDAL/JP2 spatial raster processing)
- `pyyaml` (mission database parser)
- `pytest>=8.0`, `pytest-asyncio`, `httpx` (testing and validation)

---

## Science Conventions & Constants

All geometric and physical calculations adhere strictly to NAIF SPICE and planetary cartographic conventions:

| Convention | Value / Standard | Notes |
|---|---|---|
| **Coordinate Frame** | `MOON_ME` | Mean-Earth / Polar-Axis body-fixed reference frame (LOLA and JPL Horizons convention). |
| **Latitude** | Planetocentric | Measured northwards from equator ($-90.0^\circ$ to $+90.0^\circ$). |
| **Longitude** | East-Positive | $-180.0^\circ$ to $+180.0^\circ$ (both boundaries supported). |
| **Time System** | UTC $\rightarrow$ TDB/ET | Converted via NAIF Leapseconds Kernel (`naif0012.tls`). |
| **Lunar Reference Radius** | $1,737.4\text{ km}$ ($1,737,400\text{ m}$) | IAU mean radius from `pck00011.tpc`. |
| **Solar Constant ($S_0$)** | $1,361.0\text{ W/m}^2$ | NASA SORCE / TIM composite mean (IAU 2015 nominal). |
| **Solar Angular Radius** | $0.2665^\circ$ ($0.267^\circ$ rounded) | $\text{atan}(R_{\text{sun}} / 1\text{ AU})$. |
| **Aberration Correction** | `LT+S` | Light-time + stellar aberration correction. |
| **Sun Visibility Rule** | $\text{el}_{\text{sun, center}} + 0.267^\circ > h_{\text{mask}}(\text{az})$ | Solar semi-diameter included (upper limb visible). |
| **Earth Visibility Rule** | $\text{el}_{\text{earth, center}} \ge h_{\text{mask}}(\text{az}) + \mu$ | Center LOS (default), full disk clear, or any limb visible. |
| **Horizon Mask Clamping** | None | Negative elevation angles preserved (peaks dip below local tangent plane). |
| **Observer Mast Height** | $1.5\text{ m}$ (default) | Configurable ($0\text{ m}$ to $10\text{ m}$); visibility is monotonically non-decreasing. |

---

## Validation & Testing (112 Pytest Tests)

The package includes an extensive test suite verifying mathematical consistency, SPICE vector accuracy against NASA JPL Horizons tables, DEM scaling, and horizon generation logic.

The test suite is organized into two disjoint verification groups:

```bash
# 1. Run Core CI (96 tests, non-DEM)
pytest science/tests/ -v -m "not needs_dems"

# 2. Run Terrain Integration (16 tests, requires LOLA DEMs in terrain/)
pytest science/tests/ -v -m "needs_dems"

# 3. Run complete test suite (112 tests)
pytest science/tests/ -v
```

### Test Suite Structure (23 Test Modules):
- `test_constants.py`: Physical constants, coordinate bounds, frame identifiers, and tolerance definitions.
- `test_geometry.py`: ENU matrix orthogonality, topocentric transformations, light-time corrections, and JPL Horizons regression across 4,111 samples.
- `test_independent_geometry_azlcpo.py`: Cross-checks topocentric azimuth and elevation against CSPICE native `azlcpo` ($\Delta < 1.4 \times 10^{-6\circ}$).
- `test_independent_horizons_30.py`: Cross-validates topocentric vectors against 30 globally distributed pseudorandom coordinates from JPL Horizons.
- `test_terrain.py`: LOLA DEM scaling ($0.5\text{ m/DN}$), polar stereographic math, windowed raster caching, and elevation retrieval.
- `test_terrain_coverage_matrix.py`: Verifies dynamic DEM selection hierarchy across latitude boundaries.
- `test_horizon_sanity.py`: 3D ray-marching correctness, pixel-binning agreement, and negative horizon preservation.
- `test_horizon_cache.py`: Hash-based cache invalidation, metadata integrity, and CLI regeneration.
- `test_metrics_and_power.py`: Illumination statistics, dark gaps, mast height monotonicity, solar power models, and Shackleton floor PSR zero-illumination assertion.
- `test_physics_invariants.py`: Anti-meridian longitude seam parity ($\pm 180^\circ$), polar symmetry, and conservation laws.
- `test_time_bounds.py` & `test_time_intervals.py`: Date range validation, leap-second accounting, and exact window duration strict equality.
- `test_best_windows.py` & `test_best_windows_bruteforce.py`: Candidate landing window search validated against independent brute-force combinatorial search.
- `test_multi_site_baseline.py`: Multi-site trade-off comparisons across 2, 3, and 4 sites with baseline deltas.
- `test_api.py`, `test_api_v2.py`, `test_api_v3_integration.py`: End-to-end FastAPI endpoint integration, query parameters, and lifespan kernel management.
- `test_api_request_integrity.py` & `test_api_response_contracts.py`: Pydantic schema validation, response models, and standardized error envelopes.
- `test_api_platform_reliability.py`: Concurrency safety under the global `_SPICE_LOCK`, LRU memory caching, and rate limiting.
- `test_four_location_e2e.py`: End-to-end integration across polar, equatorial, near-side, and far-side sites.
- `test_static_parity.py`: Verifies parity between precomputed static JSON files and live SPICE calculations across all 19 catalog sites.
