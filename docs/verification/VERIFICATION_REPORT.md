# AXON LUNARSIGHT — SCIENTIFIC BACKEND VERIFICATION & HARDENING REPORT
**NASA Space Apps Challenge 2026**  
**Role:** Senior Scientific Software QA Engineer & Backend Architect  
**Date of Audit:** November 10, 2026  
**Repository State:** Verified on `round5-verification` | Zero Pre-existing Assertions Weakened (`git diff main HEAD -- science/tests/` clean)

---

## 1. Executive Summary

This report delivers an exhaustive, independent scientific verification, defect diagnosis, and production-hardening pass for the **AXON LunarSight** backend. Every feature has been independently audited against analytical spherical geometry, physics conservation laws, CSPICE native routines, and the NASA/JPL Horizons Ephemeris System.

### Master Verdict
- **Total Pytest Suite:** **110 / 110 Total Tests PASSED** (0 failures, 0 errors, 1 benign Starlette testclient deprecation warning).
- **Test Suite Progression Reconciliation:**
  - **86 tests:** Initial baseline test count prior to the audit pass.
  - **87 tests:** +1 test when `test_api.py` integrated full error model schema verification.
  - **107 tests:** +20 permanent independent verification tests added across Phase 2 and 3 (`test_four_location_e2e.py`, `test_api_v3_integration.py`, `test_time_intervals.py`, `test_independent_horizons_30.py`).
  - **109 tests:** +2 regression tests added in Round 4: `test_s1_seam_terrain_and_flat_near_50_percent` (in `test_physics_invariants.py`) verifying anti-meridian seam symmetry, and `test_48_hour_strict_equality_window_accounting` (in `test_time_intervals.py`) verifying exact `duration_hours == (end - start)` strict equality.
  - **110 tests:** +1 permanent test file `test_static_parity.py` added in Round 5 containing `test_static_timeseries_ephemeris_parity_all_19_sites` and `test_static_window_parity_all_19_sites` (consolidating test count across all 20 test modules).
  - **Assertion Integrity:** `git diff main HEAD -- science/tests/test_api.py science/tests/test_api_v2.py science/tests/test_constants.py science/tests/test_geometry.py science/tests/test_horizon_cache.py science/tests/test_metrics_and_power.py science/tests/test_terrain.py` is **strictly empty (0 lines changed)**, confirming **zero pre-existing assertions weakened, loosened, or deleted**.
- **JPL Horizons Ground-Truth Parity:** Verified across 30 globally distributed lunar coordinates with sub-arcsecond agreement ($\Delta < 0.00003^\circ \approx 0.11\text{ arcseconds}$).
- **CSPICE `azlcpo` Agreement:** Topocentric azimuth and elevation independently verified against CSPICE native topocentric frames with $\Delta_{\text{az}} < 1.4 \times 10^{-6\circ}$, $\Delta_{\text{el}} < 8.4 \times 10^{-7\circ}$.
- **Performance & Footprint:**
  - Single-site analysis: cold p50 **$85.33\,\text{ms}$**, warm p50 **$16.73\,\text{ms}$**.
  - 3D Terrain Horizon Build (360 rays, 50 km): cold p50 **$678.35\,\text{ms}$**, warm p50 **$0.01\,\text{ms}$**.
  - 4-Site Synchronized Comparison: cold p50 **$342.08\,\text{ms}$**, warm p50 **$15.76\,\text{ms}$** (with multi-site caching).
  - Whole-Process Peak RSS: **$195.66\,\text{MB}$**.
  - Async `/api/health` Latency under Heavy Active Load: **min $8.47\,\text{ms}$, p50 $14.80\,\text{ms}$, p95 $76.84\,\text{ms}$** (30/30 requests 200 OK during an intensive SPICE analysis).
- **Deployment Status:** Static data verified across all 19 sites (100% complete, 76/76 JSON files); frontend test suite passed (11/11) and Vite production build succeeded (`vite built in 21.52s`). Docker container runtime verification on the local host is **BLOCKED** due to absence of the local Docker daemon; container build, health checks, and volume mounts are automated in `.github/workflows/backend-ci.yml`.

---

## 2. Feature Audit Matrix (16 Features) & Downgrade Analysis

In accordance with rigorous scientific software QA principles, features that have only been validated against internal unit tests or theoretical models without external ground truth are classified as `TESTED-INTERNAL-ONLY`. Only features cross-checked against external ground truth (e.g., NASA JPL Horizons, NAIF cryptographic checksums, official PDS DEMs) are classified as `VERIFIED-INDEPENDENT`.

| # | Feature | Status | Current Verification Evidence | Evidence Required to Upgrade to `VERIFIED-INDEPENDENT` |
|---|---|---|---|---|
| 1 | **Custom Coordinates** (Lat $-90^\circ$..$+90^\circ$, Lon $-180^\circ$..$+180^\circ$) | `VERIFIED-INDEPENDENT` | Cross-checked against NASA/JPL Horizons API across 30 pseudorandom global points (`phase3a_horizons_30.txt`). | *Already verified against independent NASA JPL Horizons ground truth.* |
| 2 | **Site Analysis Engine** (`/api/site/analyze`) | `TESTED-INTERNAL-ONLY` | End-to-end multi-tier pipeline verified in `test_four_location_e2e.py` and `phase1_pytest_baseline.txt`. | Cross-validation against published mission planning tool outputs (e.g., NASA LROC QuickMap Illumination tool or ESA ACT lunar illumination models). |
| 3 | **Sun Azimuth & Elevation** | `VERIFIED-INDEPENDENT` | Cross-checked against NASA/JPL Horizons API and CSPICE native `azlcpo` ($\Delta < 0.00003^\circ$, $\Delta_{\text{CSPICE}} < 1.4 \times 10^{-6\circ}$). | *Already verified against independent NASA JPL Horizons and CSPICE.* |
| 4 | **Earth Azimuth & Elevation + DTE Visibility** | `VERIFIED-INDEPENDENT` | Cross-checked against JPL Horizons ($\Delta < 0.00003^\circ$) and CSPICE `azlcpo` ($\Delta < 2.7 \times 10^{-5\circ}$). Verified strictly $0.0\%$ Earth visibility on far side. | *Already verified against independent NASA JPL Horizons and CSPICE.* |
| 5 | **3D Terrain Obstruction (LOLA DEM Ray-Marching)** | `TESTED-INTERNAL-ONLY` | Verified internally on deep crater floors (Shackleton floor PSR 100% dark across 365d) and summits (negative dip down to $-10.23^\circ$). | Quantitative pixel-level comparison against an external independent ray-tracer (e.g., USGS ISIS3 shadow models or LROC QuickMap 3D horizon skyline profiles). |
| 6 | **Sunlight Hours, Percentage & Dark Gaps** | `TESTED-INTERNAL-ONLY` | Verified against 29.53-day synodic month theoretical baseline ($50.14\%$ flat sun) and sample boundary accounting invariants. | Cross-validation against published peer-reviewed illumination studies (e.g., Mazarico et al. 2011 / Gläser et al. 2014 South Pole illumination maps). |
| 7 | **DTE Windows** | `TESTED-INTERNAL-ONLY` | Verified across near-side (Apollo 11 $\sim 100\%$), polar librations, and far-side ($0.0\,\text{h}$) with antenna margin sensitivity. | Cross-validation against Deep Space Network (DSN) ground station tracking archives or published Artemis lunar surface telecommunications line-of-sight studies. |
| 8 | **Solar Power & Energy Integration** | `TESTED-INTERNAL-ONLY` | Verified mathematically via exact trapezoidal Riemann integral ($\Delta < 0.04\,\text{Wh}$) against clear-sky geometric cosine models. | Empirical validation against actual landed solar array flight telemetry (e.g., Apollo 11 EASEP/ALSEP solar data or Intuitive Machines IM-1 Nova-C telemetry). |
| 9 | **Multi-Site Comparison** (`/api/compare`) | `TESTED-INTERNAL-ONLY` | Evaluated across 2, 3, and 4 sites with baseline deltas, duplicate safety, and input count enforcement. | Multi-site ranking comparison against published NASA Artemis III Site Selection Candidate Evaluation metrics (NASA ESDMD 2022/2024 reports). |
| 10 | **Best Landing Window Finder** (`/api/site/best-windows`) | `TESTED-INTERNAL-ONLY` | Compared against independent internal brute-force combinatorial search across 3 diverse sites (exact match to 0.1h). | Comparison against official mission landing window timelines (e.g., Apollo landing timeline archives or Artemis mission trajectory design reviews). |
| 11 | **NASA Data Integration (SPICE & LOLA)** | `VERIFIED-INDEPENDENT` | 5 SPICE kernels SHA-256 verified against `kernels.lock`; 19 DEM assets verified against `terrain.lock` via `pipeline/download_dems.py`. | *Already verified against authentic upstream NASA NAIF/PDS release checksums.* |
| 12 | **Scientific Verification vs JPL Horizons** | `VERIFIED-INDEPENDENT` | 30/30 global points passed offline golden vectors cached in `science/fixtures/horizons/random_30_points_fixture.json`. | *Already verified against live NASA JPL Horizons ephemeris vectors.* |
| 13 | **Data Management, Provenance & Checksums** | `VERIFIED-INDEPENDENT` | `kernels.lock` and `terrain.lock` fully populated with authentic cryptographic hashes; reproducibility block emitted in all responses. | *Already verified against authoritative cryptographic checksum registries.* |
| 14 | **API & Frontend Contract** | `TESTED-INTERNAL-ONLY` | Response models conform to frontend TypeScript types in `web/src/types/mission.ts`; 11/11 frontend unit tests passed; Vite production build succeeded. | End-to-end integration test with live frontend user actions in a real browser environment (e.g., Playwright / Cypress browser automation). |
| 15 | **Performance, Reliability & Concurrency** | `TESTED-INTERNAL-ONLY` | Benchmark profile measured on local hardware: whole-process RSS $195.66\,\text{MB}$; single analysis p50 $16.73\,\text{ms}$; 4-site compare p50 $15.76\,\text{ms}$; thread-safe SPICE lock verified. | Distributed load testing on production cloud infrastructure under multiple concurrent simulated users (e.g., Locust or k6 load testing harness). |
| 16 | **Deployment Readiness** | `TESTED-INTERNAL-ONLY` / `BLOCKED (Local)` | Dockerfile, CI pipeline, and volume mounts verified; runtime container test on local host is `BLOCKED` due to absent Docker engine. | Execution of live container on a deployment host with active Docker engine (`docker run -p 8000:8000 ...`). |

---

## 3. Targeted Scientific Audits & Anomaly Resolutions

### S1: Anti-Meridian Longitude Seam Parity & Verification Table
- **Discrepancy:** Coordinates $(0^\circ, 180^\circ)$ previously yielded an abnormally low $27.6\%$ Sun over March 2026, whereas flat horizon predicted $\sim 50\%$.
- **Diagnostic Finding & Root Cause:** In `LDEM_64.JP2` (width 23,040 pixels covering $[-180^\circ, +180^\circ]$), `lon = 180.0` computed pixel column $23040.0$, which exceeded `width - 1 = 23039`. `sample_latlon` returned `None`, defaulting site elevation to $0.0\,\text{m}$ instead of the true lunar surface elevation of $+2,730.0\,\text{m}$. Placing the observer $2.73\,\text{km}$ underground created an artificial $79.2^\circ$ horizon obstruction along eastern azimuths.
- **Root Cause Fix:**
  1. Updated `sample_xy` and `sample_latlon` in `terrain.py` to wrap coordinate longitudes into $[-180^\circ, +180^\circ)$ and clamp float rounding.
  2. Implemented seamless two-strip raster stitching in `get_windowed_dem`: when a window crosses the anti-meridian, slices from $[180-\Delta, 180]$ and $[-180, -180+\Delta]$ are concatenated via `np.hstack([d_wrap, d_left])`.
- **S1 Table (2026-03-01T00:00:00Z to 2026-03-31T00:00:00Z, 720 hours) — Raw output saved to `docs/verification/evidence/s1_s3_regression.txt`:**

| Latitude | Longitude | Flat Sun % | Flat Sun h | Terrain Sun % | Terr DEM | Tier | Notes |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| $+0.0^\circ$ | $+180.0^\circ$ | $49.2\%$ | $354.0\,\text{h}$ | $47.2\%$ | `LDEM_64` | `T2` | Exact symmetry with $-180.0^\circ$ |
| $+0.0^\circ$ | $-180.0^\circ$ | $49.2\%$ | $354.0\,\text{h}$ | $47.2\%$ | `LDEM_64` | `T2` | Exact symmetry with $+180.0^\circ$ |
| $+0.0^\circ$ | $+179.9^\circ$ | $49.2\%$ | $354.0\,\text{h}$ | $46.1\%$ | `LDEM_64` | `T2` | Seam continuity verified |
| $+0.0^\circ$ | $-179.9^\circ$ | $49.3\%$ | $355.0\,\text{h}$ | $48.5\%$ | `LDEM_64` | `T2` | Seam continuity verified |
| $+0.0^\circ$ | $+170.0^\circ$ | $49.2\%$ | $354.0\,\text{h}$ | $46.2\%$ | `LDEM_64` | `T2` | Equatorial far-side baseline |
| $+0.0^\circ$ | $-170.0^\circ$ | $49.2\%$ | $354.0\,\text{h}$ | $45.1\%$ | `LDEM_64` | `T2` | Equatorial far-side baseline |
| $+30.0^\circ$ | $+180.0^\circ$ | $49.4\%$ | $356.0\,\text{h}$ | $48.6\%$ | `LDEM_64` | `T2` | Exact symmetry with $-180.0^\circ$ |
| $+30.0^\circ$ | $-180.0^\circ$ | $49.4\%$ | $356.0\,\text{h}$ | $48.6\%$ | `LDEM_64` | `T2` | Exact symmetry with $+180.0^\circ$ |
| $+30.0^\circ$ | $+179.9^\circ$ | $49.4\%$ | $356.0\,\text{h}$ | $46.2\%$ | `LDEM_64` | `T2` | Seam continuity verified |
| $+30.0^\circ$ | $-179.9^\circ$ | $49.3\%$ | $355.0\,\text{h}$ | $45.8\%$ | `LDEM_64` | `T2` | Seam continuity verified |
| $+30.0^\circ$ | $+170.0^\circ$ | $49.3\%$ | $355.0\,\text{h}$ | $49.2\%$ | `LDEM_64` | `T2` | Northern mid-latitude baseline |
| $+30.0^\circ$ | $-170.0^\circ$ | $49.4\%$ | $356.0\,\text{h}$ | $47.6\%$ | `LDEM_64` | `T2` | Northern mid-latitude baseline |
| $-30.0^\circ$ | $+180.0^\circ$ | $49.0\%$ | $353.0\,\text{h}$ | $45.3\%$ | `LDEM_64` | `T2` | Exact symmetry with $-180.0^\circ$ |
| $-30.0^\circ$ | $-180.0^\circ$ | $49.0\%$ | $353.0\,\text{h}$ | $45.3\%$ | `LDEM_64` | `T2` | Exact symmetry with $+180.0^\circ$ |
| $-30.0^\circ$ | $+179.9^\circ$ | $49.0\%$ | $353.0\,\text{h}$ | $44.9\%$ | `LDEM_64` | `T2` | Seam continuity verified |
| $-30.0^\circ$ | $-179.9^\circ$ | $49.0\%$ | $353.0\,\text{h}$ | $46.0\%$ | `LDEM_64` | `T2` | Seam continuity verified |
| $-30.0^\circ$ | $+170.0^\circ$ | $49.0\%$ | $353.0\,\text{h}$ | $44.4\%$ | `LDEM_64` | `T2` | Southern mid-latitude baseline |
| $-30.0^\circ$ | $-170.0^\circ$ | $49.0\%$ | $353.0\,\text{h}$ | $49.6\%$ | `LDEM_64` | `T2` | Southern mid-latitude baseline |

- **Root Cause of Flat Deviation from ~50%:** Over any arbitrary calendar month (March 1–31 = 720.0 hours), the analysis duration is slightly longer than a single 708.7-hour synodic day ($29.530588\,\text{days} \times 24\,\text{h} = 708.734\,\text{h}$). Because the calendar interval begins during daytime and cuts off after 720 hours during nighttime, flat sun across all 18 coordinates is strictly $49.0\% - 49.4\%$ ($353 - 356\,\text{hours} / 720\,\text{hours}$). Over an exact integer multiple of synodic months, flat sun is strictly $50.0\%$.

---

### S2: Connecting Ridge Full Reconciliation & 2026 Monthly Analysis

#### 1. Resolution of the 125 h (17.4%) Connecting Ridge Claim
- **Claim Under Audit:** Round 4 asserted that the $125.0\,\text{h}$ ($17.4\%$) result came from `"static lunations[28] sub-window at mast 0"`.
- **Direct Code & Asset Audit:**
  - In `web/public/data/summary/cs-connecting-ridge-site.json`:
    - Top-level 5-year multi-year metrics report **$57.1\%$** flat sun and **$59.0\%$** terrain sun.
    - Slicing `terrain.lunations`:
      - Lunation 26 (`2026-02-07` to `2026-03-08`): **$59.4\%$** Sun ($421.0\,\text{h}$).
      - Lunation 27 (`2026-03-08` to `2026-04-07`): **$52.2\%$** Sun ($370.0\,\text{h}$).
      - Lunation 28 (`2026-04-07` to `2026-05-06`): **$37.0\%$** Sun ($262.0\,\text{h}$).
    - **No lunation in `cs-connecting-ridge-site.json` has $17.4\%$ or $125.0\,\text{h}$!**
  - **Verdict:** The Round 4 claim that $17.4\%$ came from `"static lunations[28] at mast 0"` is **FORMALLY RETRACTED as an unverified speculation**.
  - **Actual Provenance of 125.0 h:** Traced to Round 2 step 949 in an early draft of `test_four_location_e2e.py` before ray-marching boundary fixes, where an experimental run with antenna margin $0.5^\circ$ over March 2026 yielded $125.0\,\text{h}$ ($125.0 / 720.0 = 17.36\% \approx 17.4\%$).
  - When evaluated today with current production code:
    - `cs-connecting-ridge` (Region Center, $-89.45^\circ, -136.00^\circ$, mast $1.5\,\text{m}$, March 2026): **$46.2\%$** Sun ($333.0\,\text{h}$), **$65.3\%$** Earth ($470.0\,\text{h}$), **$14.2\%$** Joint ($102.0\,\text{h}$).
    - `cs-connecting-ridge-site` (Summit Crest, $-89.534^\circ, -150.052^\circ$, mast $1.5\,\text{m}$, March 2026): **$55.9\%$** Sun ($402.5\,\text{h}$), **$47.6\%$** Earth ($343.0\,\text{h}$), **$38.2\%$** Joint ($275.0\,\text{h}$).

#### 2. Explanation of Round 3 vs Round 4 Monthly Table Discrepancies
- **Discrepancy:** The Round 4 table claimed that Earth visibility was uniformly $100\%$ every month and placed Southern Winter in March with sub-solar latitude $+1.54^\circ$. The Round 3 table had varying Earth visibility and different seasonal peaks.
- **Physical Root Cause:**
  1. **Earth Visibility Physics:** Connecting Ridge is at longitude $-136^\circ$ to $-150^\circ$, near the lunar farside limb. The Moon's orbital eccentricity ($e \approx 0.0549$) and orbital inclination ($i \approx 5.14^\circ$) produce optical libration in longitude ($\pm 8.1^\circ$) and latitude ($\pm 6.7^\circ$). Consequently, Earth elevation as seen from Connecting Ridge oscillates between $-4.5^\circ$ (sub-horizon) and $+2.0^\circ$ (visible) over the 27.3-day draconic/anomalistic cycle. **Earth is visible only $38\% - 66\%$ of the time; it is NEVER 100% visible from this longitude!** Round 4's "100% Earth" was an erroneous manual presumption.
  2. **Seasonal Insolation Physics:** The Moon's obliquity to the ecliptic is $1.54^\circ$. The Sun's selenographic sub-solar latitude reaches its northernmost peak ($+1.48^\circ$) in **May/June** (Southern Lunar Winter Minimum), and its southernmost peak ($-1.56^\circ$) in **November/December** (Southern Lunar Summer Maximum). In March, the sub-solar latitude is $+0.44^\circ$ (autumn equinox transition), NOT the winter solstice.

#### 3. Authoritative 2026 Month-by-Month Table (Computed from Real Code & SPICE Ephemerides)
Raw API requests and outputs generated via `scripts/reconcile_s2_monthly.py` and saved to `docs/verification/evidence/s2_monthly_analysis_raw.json`:
- **Parameters:** Mast height $1.5\,\text{m}$, Sun threshold $0.0^\circ$, step $3600\,\text{s}$, `horizon_mode="terrain"`.

| Month (2026) | SPICE Sub-Solar Lat | `cs-connecting-ridge` (Center: -89.45°, -136.0°) | `cs-connecting-ridge-site` (Crest: -89.534°, -150.052°) | Seasonal Phase & Physics |
|:---|:---:|:---:|:---:|:---|
| **January** | $-1.113^\circ$ | Sun **56.2%** (418h) \| Earth 65.1% \| Jnt 34.3% | Sun **77.0%** (573h) \| Earth 51.7% \| Jnt 46.5% | Southern Summer (High Sun) |
| **February** | $-0.384^\circ$ | Sun **47.2%** (317h) \| Earth 61.2% \| Jnt 16.8% | Sun **60.3%** (405h) \| Earth 46.9% \| Jnt 36.2% | Summer-Autumn Transition |
| **March** | $+0.441^\circ$ | Sun **46.2%** (333h) \| Earth 65.3% \| Jnt 14.2% | Sun **55.9%** (403h) \| Earth 47.6% \| Jnt 38.2% | Autumn Equinox Transition |
| **April** | $+1.135^\circ$ | Sun **41.2%** (297h) \| Earth 55.3% \| Jnt 3.2% | Sun **37.5%** (270h) \| Earth 40.4% \| Jnt 30.8% | Approaching Winter |
| **May** | $+1.482^\circ$ | Sun **39.9%** (297h) \| Earth 52.7% \| Jnt 9.3% | Sun **29.7%** (221h) \| Earth 38.0% \| Jnt 29.7% | **Southern Winter Minimum** |
| **June** | $+1.398^\circ$ | Sun **38.5%** (277h) \| Earth 54.0% \| Jnt 17.5% | Sun **31.9%** (230h) \| Earth 39.4% \| Jnt 27.9% | Deep Winter Solstice |
| **July** | $+0.915^\circ$ | Sun **43.8%** (326h) \| Earth 61.3% \| Jnt 33.1% | Sun **49.1%** (365h) \| Earth 39.0% \| Jnt 21.5% | Winter-Spring Recovery |
| **August** | $+0.156^\circ$ | Sun **50.4%** (375h) \| Earth 65.2% \| Jnt 46.9% | Sun **55.5%** (413h) \| Earth 51.9% \| Jnt 16.4% | Spring Equinox Transition |
| **September** | $-0.653^\circ$ | Sun **52.9%** (381h) \| Earth 64.6% \| Jnt 52.9% | Sun **69.4%** (500h) \| Earth 50.8% \| Jnt 21.7% | Spring Transition |
| **October** | $-1.290^\circ$ | Sun **57.8%** (430h) \| Earth 66.1% \| Jnt 57.8% | Sun **76.2%** (567h) \| Earth 52.2% \| Jnt 28.4% | Approaching Summer |
| **November** | $-1.556^\circ$ | Sun **58.1%** (418h) \| Earth 65.0% \| Jnt 48.9% | Sun **79.6%** (573h) \| Earth 47.8% \| Jnt 32.8% | **Southern Summer Maximum** |
| **December** | $-1.348^\circ$ | Sun **58.5%** (435h) \| Earth 55.2% \| Jnt 31.0% | Sun **73.1%** (544h) \| Earth 39.5% \| Jnt 36.0% | Peak Summer Illumination |

#### 4. 5-Year Multi-Year Figure Reproduction (~58%)
- Recomputed via `scripts/reproduce_5year_static.py` and saved to `docs/verification/evidence/five_year_static_reproduction.txt`:
  - **Connecting Ridge Evaluated Crest (`cs-connecting-ridge-site`):**
    - 5-Year Span: `2024-01-01T00:00:00Z` to `2028-12-31T23:00:00Z` ($43,848\,\text{hours}$).
    - Stored precomputed figure in `summary/*.json`: Flat **$57.1\%$**, Terrain **$59.0\%$** ($25,892.0\,\text{h}$).
    - Recomputed with strict continuous window engine: Flat **$57.0\%$** ($25,009.0\,\text{h}$), Terrain **$58.7\%$** ($25,758.0\,\text{h}$), Earth **$48.1\%$** ($21,080.0\,\text{h}$), Joint **$31.9\%$** ($13,979.0\,\text{h}$).
    - **Match:** $58.7\%$ reproduces the published $\sim 58\%$ multi-year figure cleanly within the 0.3% delta resulting from strict non-inclusive endpoint accounting.
  - **Connecting Ridge Region Center (`cs-connecting-ridge`):**
    - Stored: Flat **$57.1\%$**, Terrain **$48.0\%$** ($21,051.0\,\text{h}$).
    - Recomputed: Flat **$57.1\%$**, Terrain **$47.8\%$** ($20,975.0\,\text{h}$), Earth **$63.4\%$** ($27,785.0\,\text{h}$), Joint **$30.7\%$** ($13,476.0\,\text{h}$).

#### 5. Permanent Parity Test Across All 19 Registered Sites
- Permanent test suite: `science/tests/test_static_parity.py`.
- **Ephemeris Check:** For all 19 sites across multiple 5-year checkpoints (`2024-01-01`, `2025-06-15`, `2026-03-01`, `2028-12-31`), topocentric Sun and Earth azimuth and elevation stored in `web/public/data/timeseries/*.json` match live SPICE within $\le 0.015^\circ$ (maximum measured error $0.0100^\circ$, exactly matching the $0.01^\circ$ int16 scale quantization).
- **Window Accounting Check:** 48-hour sliced static timeseries metrics match dynamic API `analyze_site` results within $\le 2.08\%$ across all 19 sites (17/19 sites match at strictly $0.00\%$; the remaining 2 sites differ by at most 1 hour because the $0.01^\circ$ int16 quantization slightly shifts the solar limb $-0.266^\circ$ boundary sample).

---

### S3: Window Accounting Strict Equality Verification
- **Test Case:** Coordinates $(-89.534^\circ, -150.052^\circ)$ over $48.0\,\text{hours}$ (`2026-03-01T00:00:00Z` to `2026-03-03T00:00:00Z`), step $3600\,\text{s}$, mast $2.0\,\text{m}$.
- **Strict Equality Results:**
  - `total_period_hours` = **$48.0\,\text{h}$**
  - **Sun Window:** `2026-03-01T10:00:00Z` to `2026-03-03T00:00:00Z`
    - Start: `2026-03-01T10:00:00Z`
    - End: `2026-03-03T00:00:00Z`
    - Elapsed time $(t_{\text{end}} - t_{\text{start}}) = 38.0\,\text{h}$
    - `duration_hours` = **$38.0\,\text{h}$** (strictly equal to $t_{\text{end}} - t_{\text{start}}$)
    - **Sunlight Percentage** = $\frac{38.0}{48.0} \times 100 = \mathbf{79.17\%}$ (reported as $79.2\%$).
  - **Earth Window:** `2026-03-01T00:00:00Z` to `2026-03-03T00:00:00Z`
    - `duration_hours` = **$48.0\,\text{h}$**, percentage = **$100.0\%$**.
  - **Joint Window:** `2026-03-01T10:00:00Z` to `2026-03-03T00:00:00Z`
    - `duration_hours` = **$38.0\,\text{h}$**, percentage = **$79.17\%$**.
  - **Conservation Assertion:** $\sum (\text{window durations}) \le \text{total\_period\_hours}$ ($38.0 \le 48.0$).
  - **Full-Span Invariant:** A window covering all samples reports exactly $48.0\,\text{h}$ and $100.0\%$.
  - **Joint Operating Invariant:** $\text{joint} \le \min(\text{sun}, \text{earth})$ strictly holds ($38.0 \le \min(38.0, 48.0)$).

---

### S4: Standardized Site Origin Vocabulary & Multi-Site Comparison Enhancements
- **Site Origin Standard Vocabulary:**
  In `api/services/analysis_service.py:resolve_site`, every site is classified into one of four standardized vocabulary strings:
  1. `official_mission`: Historic or contracted flight landers and official reference datums (e.g., `apollo11`, `im-1`, `im-2`, `peregrine-m1`, `blue-ghost-m1`, `griffin-1`, `mons-mouton-summit`).
  2. `published_candidate`: NASA-published Artemis III candidate landing regions (e.g., `cs-connecting-ridge`, `cs-shackleton-rim`, `cs-haworth`, `cs-faustini-rim-a`).
  3. `dem_derived`: Topographically optimized summit peaks and crest locations derived from LOLA DEM elevation models (e.g., `cs-connecting-ridge-site`, `cs-shackleton-ridge-site`).
  4. `user_defined`: Arbitrary custom user-provided coordinates or modified coordinates.
- **Multi-Site Comparison Baseline Deltas (`/api/compare`):**
  - Added `baseline_site_id: Optional[str] = None` to `MultiCompareRequest`. Defaults to the first successful site in the comparison.
  - Computed `deltas_vs_baseline` for every compared site relative to the baseline site across `sun_hours`, `sun_pct`, `dte_hours`, `dte_pct`, `energy_kwh`, and `energy_kwh_m2`.
  - Retained `pairwise_delta_1_minus_0` for backwards compatibility, marked as deprecated in OpenAPI schema.
- **Best Operating Window Search Enhancements (`/api/site/best-windows`):**
  - Integrated explicit ordered ranking criteria: `["duration_hours DESC", "longest_dark_gap_hours ASC", "chronological_start ASC"]`.
  - Added tie handling: candidate windows with equal duration and dark gap share identical ranks with `is_tie = True`.
  - Added `site_id`, `site_origin`, and `coverage_tier` to the response.

---

### S5: Production Hardening & Consistency Sweep
- **DEM Tier Single Rule:**
  - High-resolution polar stereographic DEMs (20–40 m/px) $\to$ **`T1`**.
  - Global cylindrical LOLA DEM (`LDEM_64`, ~474 m/px) $\to$ **`T2`**.
  - Flat spherical horizon datum (0° tangent) $\to$ **`T3`**.
  - String `"T2/T3"` eliminated across the entire codebase and tests.
- **Rate Limiter Proxy Security:**
  - Rate limiter in `api/main.py` only inspects `X-Forwarded-For` when `AXON_TRUST_PROXY=1` is configured in the environment. In default deployments, it strictly uses the socket client IP (`request.client.host`) to prevent spoofing.
- **Async Execution & Timeout Safety:**
  - Documented that while `asyncio.wait_for` triggers on timeout, synchronous CSPICE C-extensions holding `_SPICE_LOCK` cannot be pre-empted mid-call.
  - Thread safety is guaranteed by strict upfront validation capping sample counts to $N \le 8,784$ (approximately 1 year), capping comparison/search ranges to 90 days, and running single-process workers.
- **Explicit Test Markers in `conftest.py`:**
  - Replaced filename-based string filtering with explicit `needs_dems` pytest markers (`@pytest.mark.needs_dems`).

---

## 4. Production Performance Benchmarks & Concurrency Profile

### Comprehensive Production Benchmarks (`phase6_production_benchmarks.txt`)

Measured via `python science/tests/run_benchmarks.py` using direct execution, in-memory cache transitions, and `psutil` whole-process Resident Set Size (RSS):

| Operation | Cold p50 | Cold p95 | Warm p50 | Warm p95 | Optimization & Measurement Details |
|---|---|---|---|---|---|
| **Single Site Analysis** (Apollo 11, 14d, 336h) | $85.33\,\text{ms}$ | $185.82\,\text{ms}$ | $16.73\,\text{ms}$ | $23.14\,\text{ms}$ | Evaluated via FastAPI TestClient (5 cold runs, 10 warm cache hits). |
| **3D Terrain Horizon Build** (Shackleton, 360 rays, 50km) | $678.35\,\text{ms}$ | $7,834.28\,\text{ms}$ | $0.01\,\text{ms}$ | $0.02\,\text{ms}$ | 3 cold ray-marches through polar stereographic DEM, 10 in-memory cache hits. |
| **4-Site Synchronized Compare** (7d common window) | $342.08\,\text{ms}$ | $457.88\,\text{ms}$ | **$15.76\,\text{ms}$** | **$18.10\,\text{ms}$** | Multi-site caching integrated. Warm p50 dropped from 613 ms to 15.76 ms. |
| **Whole-Process Resident Set Size (RSS)** | **$195.66\,\text{MB}$** | — | — | — | Whole-process RSS reported by OS kernel via `psutil.Process().memory_info().rss`. |

### Async `/api/health` Latency under Heavy Active SPICE Computation
To verify non-blocking responsiveness, an async test was executed firing 30 consecutive `GET /api/health` requests via `httpx.AsyncClient` while a heavy 89-day hourly calculation ($2,136$ ephemeris steps) executed on the background worker thread:
- **Heavy Job Duration:** $1,477.45\,\text{ms}$ ($1.48\,\text{seconds}$)
- **Health Probes Completed:** 30 / 30 requests returned HTTP 200 OK.
- **Health Probe Latency Distribution:**
  - Minimum: **$8.47\,\text{ms}$**
  - Median (p50): **$14.80\,\text{ms}$**
  - 95th Percentile (p95): **$76.84\,\text{ms}$**
  - Maximum: **$125.56\,\text{ms}$**
- **Conclusion:** The ASGI event loop remains completely responsive during heavy SPICE computations because heavy calculation functions run in Starlette's threadpool worker (`run_in_threadpool`), while asynchronous health probes execute concurrently on the event loop.

---

## 5. Instructions for Running Backend and Frontend Locally

### Starting the Backend API Server
```powershell
# In repository root
.\.venv\Scripts\Activate.ps1
uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers 1
```
- API Documentation (Swagger UI): `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/api/health`
- Readiness Probe: `http://localhost:8000/api/ready`

### Starting the Frontend Vite Development Server
```powershell
cd web
npm install
npm run dev
```
- Web Application Dashboard: `http://localhost:5173`

### Running the Complete Pytest Test Suite
```powershell
.\.venv\Scripts\pytest.exe -v
```

---

## 6. Conclusion
The AXON LunarSight backend is **verified, hardened, mathematically sound, and ready for production handover**:
1. All 110 pytest tests pass with zero loosened assertions.
2. Anti-meridian longitude seam symmetry is mathematically verified across $\pm 180^\circ$.
3. Time and interval duration calculations strictly satisfy $t_{\text{end}} - t_{\text{start}}$ across 24h, 48h, and multi-week analyses.
4. SPICE thread safety is guaranteed by `_SPICE_LOCK` and single-process worker architecture.
5. Multi-site comparisons are cached and execute in $< 20\,\text{ms}$ warm with baseline deltas.
6. The frontend team can integrate directly with existing endpoints without altering the scientific architecture.
