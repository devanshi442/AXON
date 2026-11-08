# AXON LunarSight — Verification & Validation Benchmark Report

## 1. NASA JPL Horizons Ground Truth Comparison

All SPICE ephemerides and topocentric geometry calculations are validated against keyless NASA JPL Horizons observer tables (`science/fixtures/horizons/*.json`).
The benchmark evaluation script (`science/lunarsight_core/benchmark.py`) dynamically generated `science/validation/benchmark.json` and `web/public/data/benchmark.json`.

### Benchmark Summary Metrics
- **Artifact:** `science/validation/benchmark.json`
- **Total Locations Evaluated:** 7
- **Total Ephemeris Sample Rows:** 4,111
- **Overall Maximum Elevation Difference:** $0.000203^\circ$ (0.73 arcseconds)
- **Overall Maximum Azimuth Difference:** $0.000050^\circ$ (0.18 arcseconds)
- **Tolerance Gate Criterion:** $< 0.010^\circ$ (36 arcseconds)
- **Status:** **ALL 7 FIXTURES PASSED**

### Fixture-by-Fixture Verification Table

| Fixture File | Target Site | Lat, Lon | Samples | Max $\Delta$ Elevation | Max $\Delta$ Azimuth | Status |
|---|---|---|---|---|---|---|
| `im-1_sun_2024-02-22_2024-03-22.json` | IM-1 (Malapert A) | -80.13°, 1.44° | 697 | 0.000026° | 0.000001° | **PASSED** |
| `blue-ghost-1_sun_2025-03-02_2025-04-02.json` | Blue Ghost 1 (Mare Crisium) | 18.56°, 61.81° | 745 | 0.000001° | 0.000001° | **PASSED** |
| `im-2_sun_2025-03-01_2025-03-31.json` | IM-2 (Mons Mouton) | -84.7906°, 29.1957° | 721 | 0.000001° | 0.000001° | **PASSED** |
| `apollo11_sun_2024-01-01_2024-01-31.json` | Apollo 11 (Tranquillitatis) | 0.6875°, 23.4333° | 721 | 0.000001° | 0.000001° | **PASSED** |
| `shackleton-rim_sun_2026-03-01_2026-03-31.json` | Shackleton Rim Reference | -89.68°, 129.0° | 721 | 0.000001° | 0.000001° | **PASSED** |
| `farside-0N-180E_earth_2026-01-01_2026-01-11.json` | Far Side Isolation | 0.0°, 180.0° | 241 | 0.000203° | 0.000050° | **PASSED** |
| `nearlimb-0N-90E_earth_2026-01-01_2026-01-11.json` | Eastern Limb Horizon | 0.0°, 90.0° | 265 | 0.000142° | 0.000008° | **PASSED** |

---

## 2. Far-Side Geometric Isolation Test
- **Location:** 0.0° N, 180.0° E (Antipodal to Earth center).
- **Physical Criterion:** Lunar body permanently occults Earth.
- **Result:** Earth elevation remains between $-65.2^\circ$ and $-85.1^\circ$ across all libration cycles.
- **Test:** `test_farside_earth_invisible` in `test_geometry.py` confirmed 0.0 hours direct visibility.

---

## 3. Flat vs Terrain Monotonicity & Mast Height Test
- **Topography Property:** Adding terrain topography blocks rays; therefore, for any site and time window, $H_{\text{terrain}} \le H_{\text{flat}}$.
- **Mast Height Property:** Raising observer height $h$ depresses the local horizon; therefore, illumination hours $H(h_2) \ge H(h_1)$ for $h_2 > h_1$.
- **Test:** `test_monotonicity_flat_vs_terrain_and_mast` in `test_metrics_and_power.py` validated both properties across multiple sites and mast heights (0 m, 1.5 m, 3 m, 5 m, 10 m).

---

## 4. Permanently Shadowed Region (PSR) Sanity Assertion
- **Location:** Shackleton crater floor (depth ~4.2 km).
- **Physical Criterion:** High crater walls block all direct sunlight year-round.
- **Test:** Synthetic bowl crater model and polar ray-trace confirmed 0 hours direct solar illumination ($f_{\text{sun}} = 0.0$).

---

## 5. SPICE Concurrency & Thread-Safety Stress Test
- **Constraint:** The NAIF C library underlying `SpiceyPy` relies on internal static memory buffers and is not natively thread-safe.
- **Solution:** Enforced a global mutual exclusion lock (`_SPICE_LOCK = threading.Lock()`) around every SPICE entry point in `api/main.py`.
- **Test:** `test_api_concurrency_stress` in `test_api_v2.py` launched 12 concurrent threads making rapid interleaved SPICE requests for different sites and dates.
- **Result:** 100% of concurrent requests completed with HTTP 200 and zero corrupted vectors.
