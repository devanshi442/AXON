# AXON LunarSight

**CLPS & Artemis Lunar Landing Site Evaluation Model — NASA Space Apps Challenge 2026**

> *Real sources. Clear calculations. Useful comparisons.*

An intuitive science model and interactive application that lets mission planners, educators, and the public compare candidate lunar landing sites and dates quickly. AXON LunarSight visualizes Sun and Earth positions relative to 3D ray-marched terrain horizons derived from LOLA DEMs to assess solar power generation potential and direct-to-Earth (DTE) communication visibility.

---

## Table of Contents
- [1. Challenge & Problem Statement](#1-challenge--problem-statement)
- [2. Scientific Scope: Geometry vs Link/Power Engineering](#2-scientific-scope-geometry-vs-linkpower-engineering)
- [3. Key Polar Landing Sites Summary Table](#3-key-polar-landing-sites-summary-table)
- [4. Quick Start](#4-quick-start)
- [5. Repository Structure & Folder Map](#5-repository-structure--folder-map)
- [6. Science Methodology & Horizon Architecture](#6-science-methodology--horizon-architecture)
- [7. Verification, Validation & Test Counts](#7-verification-validation--test-counts)
- [8. Known Limitations & Operational Caveats](#8-known-limitations--operational-caveats)
- [9. Demo Notes](#9-demo-notes)
- [10. Team & AI-Use Disclosure](#10-team--ai-use-disclosure)

---

## 1. Challenge & Problem Statement

Missions to the Moon's South Pole face extreme lighting and communication constraints. Due to the Moon's small axial tilt of $1.54^\circ$ relative to the ecliptic, the Sun perpetually skims low along the horizon, casting multi-kilometer terrain shadows across deep impact basins while elevated crater rims and ridge summits receive extended illumination. Similarly, the Earth remains low in the sky, oscillating across a $\approx 27.3\text{-day}$ libration cycle that periodically occults direct line-of-sight behind topography.

AXON LunarSight was built to solve this challenge:
1. **Site and Date Comparison:** Rapid, side-by-side trade-off evaluations between any two landing sites (Scenario A vs Scenario B) across arbitrary UTC dates between 2024 and 2028.
2. **Terrain-Aware Topographic Horizons:** Accurate 3D ray-marching through high-resolution LOLA DEMs, ensuring polar horizon skylines are realistic rather than misleadingly flat.
3. **Solar Power Generation Potential:** Topocentric solar disk visibility modeling ($f_{\text{sun}} \in [0, 1]$) with solar array architecture trade-offs (horizontal flat, vertical mast, 2-axis tracking).
4. **Direct-to-Earth (DTE) Communication Windows:** Geometric line-of-sight tracking with customizable antenna elevation clearance margins.
5. **Interactive Opportunity Visualizer:** A 30-day timeline visualizer (720 hourly segments) computing contiguous illuminated windows and dark survival gaps.

---

## 2. Scientific Scope: Geometry vs Link/Power Engineering

> [!IMPORTANT]
> **AXON LunarSight models topocentric line-of-sight geometry, NOT an empirical electrical power or RF telecommunications link-budget simulation.**

- **Solar Visibility $\ne$ Delivered Electrical Power:** A site is counted as illuminated when the Sun's upper limb ($\text{center elevation} + 0.267^\circ$) rises above the local terrain skyline ($f_{\text{sun}} > 0$). In reality, delivered kilowatt-hours depend on photovoltaic panel efficiency ($\eta$), solar incidence angle ($\cos i$), temperature derating during the lunar midday, battery round-trip efficiency, and surface dust accumulation from descent engine plumes.
- **Earth Line-of-Sight $\ne$ Telecommunications Link Margin:** Direct-to-Earth visibility indicates an unobstructed geometric vector from the lunar surface to Earth's center of mass. Actual radio communications depend on antenna gain patterns, transmitter EIRP, free-space path loss (~210 dB at X/Ka-band), ground station receiver sensitivity (e.g. NASA DSN 34m/70m dishes), and lunar surface multipath reflections.
- **The "Flat Sphere, 0 Deg Horizon" Baseline:** The baseline flat datum models the Moon as an idealized, uniform sphere ($R = 1,737.4\text{ km}$, $\text{alt} = 0\text{ m}$) with a $0.0^\circ$ tangent horizon. It is **not** a like-for-like comparison for elevated sites: mountain peaks (such as Connecting Ridge at $+1,653\text{ m}$) look down over surrounding lowlands, depressing the local horizon dip angle below $0^\circ$ (down to $-3.37^\circ$), which enables peaks to capture solar illumination even when the Sun dips below the flat sphere datum.

---

## 3. Key Polar Landing Sites Summary Table

Evaluated across the full 5-year multi-lunation baseline (43,848 hourly ephemerides from **2024-01-01 to 2028-12-31 UTC**) with an observer mast height of $h = 1.5\text{ m}$ and threshold $\tau = 0.0^\circ$:

| Landing Site | Latitude, Longitude | DEM Product | Site Elevation | Flat Sphere 0° Sun % | Terrain Sun % | Max Dark Gap (h) | Terrain DTE % | Site Type |
|---|---|---|---|---|---|---|---|---|
| **Connecting Ridge (Evaluated Site)** | -89.534°, -150.052° | `LDEM_875S_20M` (20 m/px) | +1,653.0 m | 53.4% | **58.3%** | 321.0 h | 48.9% | Specific evaluated site |
| **Connecting Ridge (Centroid)** | -89.450°, -136.000° | `LDEM_875S_20M` (20 m/px) | +1,931.3 m | 53.3% | **55.9%** | 338.0 h | 47.7% | Region center |
| **Shackleton Ridge (Evaluated Site)** | -89.017°, 126.273° | `LDEM_85S_20M` (20 m/px) | +1,167.2 m | 55.2% | **35.2%** | 1,489.0 h | 52.8% | Specific evaluated site |
| **Shackleton Rim (Centroid)** | -89.680°, 129.000° | `LDEM_85S_20M` (20 m/px) | -2,784.9 m | 52.8% | **0.0%** | 43,848.0 h | 0.0% | Region center (crater floor) |
| **Malapert Massif (Region Centre)** | -85.990°, -2.930° | `LDEM_80S_20M` (20 m/px) | +4,841.0 m | 49.3% | **46.8%** | 438.0 h | **0.0%** | Region center (crest reaches 100%) |
| **Mons Mouton Summit** | -84.600°, 31.000° | `LDEM_80S_20M` (20 m/px) | +5,044.6 m | 47.7% | **44.9%** | 498.0 h | 48.6% | Reference point |
| **IM-2 (Mons Mouton / PRIME-1)** | -84.791°, 29.196° | `LDEM_80S_20M` (20 m/px) | +5,322.5 m | 47.9% | **43.1%** | 512.0 h | 48.7% | Specific mission site |
| **IM-1 (Malapert A)** | -80.130°, 1.440° | `LDEM_75S_30M` (30 m/px) | +2,598.9 m | 46.8% | **41.2%** | 560.0 h | 47.6% | Actual landed site |
| **Nobile Rim 1 (Candidate)** | -85.350°, 36.500° | `LDEM_80S_20M` (20 m/px) | +6,350.4 m | 48.5% | **45.0%** | 478.0 h | 48.8% | Candidate region |
| **Faustini Rim A (Candidate)** | -87.880°, 90.000° | `LDEM_85S_20M` (20 m/px) | +62.5 m | 50.8% | **46.1%** | 462.0 h | 49.0% | Candidate region |
| **Haworth Rim (Candidate)** | -86.750°, -22.840° | `LDEM_85S_20M` (20 m/px) | +1,630.4 m | 49.9% | **43.7%** | 495.0 h | 48.9% | Candidate region |
| **Blue Ghost 1 (Mare Crisium)** | +18.560°, +61.810° | `LDEM_64` (~474 m/px) | -3,651.3 m | 50.0% | **49.8%** | 355.0 h | 100.0% | Equatorial / near-side |

*Key Findings from the Data:*
- **Peak Illumination Gain:** At Connecting Ridge ($-89.534^\circ\text{S}$), terrain illumination ($58.3\%$) exceeds the flat sphere datum ($53.4\%$) because its $+1,653\text{ m}$ elevation dips the local horizon to $-3.37^\circ$, capturing sunlight even throughout mid-winter months.
- **Region Centre vs Summit Crest:** At Malapert Massif, the stated region centroid ($-85.99^\circ\text{S}, -2.93^\circ\text{E}$) suffers $0.0\%$ Earth visibility due to a local northern ridge obstacle. However, the DEM-derived crest $\approx 1.4\text{ km}$ away ($-85.9627^\circ\text{S}, -2.3725^\circ\text{E}, 4,993\text{ m}$) achieves continuous **$100.0\%$ Earth line-of-sight**.

---

## 4. Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- Git

### Installation & Execution Sequence
Run the following standard sequence from the repository root:

```bash
# 1. Setup Python virtual environment
python -m venv .venv
.\.venv\Scripts\activate            # Windows PowerShell
# source .venv/bin/activate         # Linux / macOS

# 2. Install dependencies and science package
pip install -r requirements.txt
pip install -e science/

# 3. Validate mission database schema and compile missions.json
python pipeline/validate_missions.py

# 4. Run the full idempotent precomputation pipeline
# (Validates schema, checks benchmarks, builds horizon masks, precomputes timeseries)
python pipeline/build_all.py

# 5. Execute Python scientific test suite
pytest science/tests/ -v

# 6. Start the production backend API service
uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers 1

# 7. In a separate terminal: Install web dependencies, run tests, build and launch the application
cd web
npm install
npm test
npm run build
npm run dev
# Interactive dashboard will open at http://localhost:5173
```

---

## 5. Repository Structure & Folder Map

```
AXON/
├── data/                               # Mission catalog and schema definitions
│   ├── missions.yaml                   # Sourced mission, reference, and candidate sites
│   └── schema/
│       └── missions.schema.json        # JSON Schema Draft 2020-12 validation specification
├── kernels/                            # NASA NAIF SPICE binary and text kernels
│   ├── de440s.bsp                      # Pinned planetary ephemeris (Sun/Earth/Moon barycentre)
│   ├── pck00011.tpc                    # Planetary constants and Moon radius (1,737.4 km)
│   ├── moon_pa_de440_200625.bpc        # High-accuracy lunar principal axis orientation
│   ├── moon_de440_250416.tf            # PDS4 frame definition linking MOON_PA to MOON_ME
│   └── naif0012.tls                    # Leapseconds kernel for UTC <-> ET conversion
├── terrain/                            # LOLA Polar Digital Elevation Model (DEM) rasters
│   ├── LDEM_875S_20M.JP2               # Deep South Pole (87.5°S to 90°S, 20 m/px)
│   ├── LDEM_85S_20M.JP2                # South Polar zone (85°S to 90°S, 20 m/px)
│   ├── LDEM_80S_20M.JP2                # Extended South Pole (80°S to 90°S, 20 m/px)
│   ├── LDEM_75S_30M.JP2                # Outer South Polar zone (75°S to 90°S, 30 m/px)
│   └── global/LDEM_64.JP2              # Global cylindrical DEM (64 pixels/degree)
├── science/                            # Scientific computation package and unit tests
│   ├── lunarsight_core/
│   │   ├── constants.py                # IAU/NASA constants, frames, and NAIF IDs
│   │   ├── geometry.py                 # SPICE topocentric ENU transforms and timeseries
│   │   ├── horizon.py                  # 3D great-circle ray-marching through LOLA DEMs
│   │   ├── metrics.py                  # Multi-lunation availability, intervals, and dark gaps
│   │   ├── power.py                    # Solar flux and array incidence models
│   │   ├── sites.py                    # Single-source-of-truth site registry and metadata
│   │   ├── visibility.py               # Solar fraction and Earth clearance evaluation
│   │   └── benchmark.py                # JPL Horizons automated regression generator
│   ├── fixtures/horizons/              # 7 NASA JPL Horizons ground truth benchmark fixtures
│   └── tests/                          # 52 pytest test suites (SPICE, DEMs, PSR sanity)
├── pipeline/                           # End-to-end data processing pipelines
│   ├── validate_missions.py            # Validates missions.yaml and generates missions.json
│   ├── build_horizon.py                # Multi-height horizon ray-marching with stale caching
│   ├── build_geometry.py               # 5-year hourly ephemeris generation and scaling
│   ├── generate_data_readme.py         # Automated DATA_README generation with file hashes
│   └── build_all.py                    # Master one-command idempotent build pipeline
├── web/                                # React 18, TypeScript, and Tailwind CSS frontend
│   ├── src/
│   │   ├── components/                 # MoonMap, ScenarioPanel, OpportunityTimeline, etc.
│   │   ├── pages/                      # ExplorerPage, MethodsPage
│   │   ├── stores/scenarioStore.ts     # Dynamic date clamping, caching, and window slicing
│   │   └── utils/scienceMath.ts        # Client-side solar power, visibility, and horizon math
│   ├── tests/                          # 11 web unit tests (date clamping, horizon interpolation)
│   └── public/data/                    # Precomputed static JSON assets for serverless hosting
├── docs/                               # In-depth technical documentation
│   ├── METHODS.md                      # Mathematical formulations and coordinate transforms
│   ├── VALIDATION.md                   # JPL Horizons benchmark verification report
│   ├── LIMITATIONS.md                  # Scientific limitations and operational caveats
│   └── BUILD_LOG.md                    # Chronological design decisions and milestone log
├── DATA_README.md                      # Complete data provenance, file hashes, and DEM mapping
└── README.md                           # Main repository guide (this file)
```

---

## 6. Science Methodology & Horizon Architecture

1. **3D Ray-Marching in MOON_ME:**
   Topographic horizon skylines are computed by tracing rays in 3D Cartesian coordinates directly in the lunar mean-Earth / polar-axis frame (`MOON_ME`). For each of the 360 azimuth bins ($1.0^\circ$ increments), rays march out along lunar great-circle arcs out to $50.0\text{ km}$ at half-pixel increments ($\Delta s = \Delta x / 2$).
2. **Dynamic DEM Selection:**
   Sites automatically bind to the highest resolution LOLA DEM whose valid boundaries enclose the full $50\text{ km}$ ray-marching radius:
   - Sites $\le -87.5^\circ\text{S}$: `LDEM_875S_20M` ($20\text{ m/px}$)
   - Sites $\le -85.0^\circ\text{S}$: `LDEM_85S_20M` ($20\text{ m/px}$)
   - Sites $\le -80.0^\circ\text{S}$: `LDEM_80S_20M` ($20\text{ m/px}$)
   - Sites $\le -75.0^\circ\text{S}$: `LDEM_75S_30M` ($30\text{ m/px}$)
   - Non-polar sites: `LDEM_64` ($64\text{ ppd}$, $\approx 474\text{ m/px}$)
3. **Observer Mast Height Modeling:**
   Observer height above local surface ($0\text{ m}, 1.5\text{ m}, 3.0\text{ m}, 5.0\text{ m}, 10.0\text{ m}$) depresses the horizon skyline. Sunlight availability is monotonically non-decreasing as mast height rises ($H(h_2) \ge H(h_1)$ for $h_2 > h_1$).
4. **Unclamped Negative Horizons:**
   Skyline elevation angles are **never** clamped to $\ge 0.0^\circ$. Elevated mountain ridges look out over lower terrain, producing negative horizon angles (down to $-3.37^\circ$) that represent the true physical dip of the horizon.
5. **Solar Disk Fraction & Solar Upper Limb:**
   Sun "up" is defined as solar upper limb elevation $> \text{skyline}$:
   $$\text{el}_{\text{sun, center}} + 0.267^\circ > h_{\text{mask}}(\text{az})$$
   Solar disk fraction $f_{\text{sun}} \in [0, 1]$ represents the portion of the solar disk visible above the local skyline.
6. **Live UTC Date Clamping:**
   The UI default date initializes to today's current UTC date, clamped safely within the ephemeris interval $[2024\text{-}01\text{-}01, 2028\text{-}12\text{-}31]$ and displayed as `YYYY-MM-DD HH:mm UTC`. Site cards display illumination metrics for a **30-day window** (720 hours) starting from this selected date.

---

## 7. Verification, Validation & Test Counts

Every calculation in AXON LunarSight is verified against independent NASA ground truth and automated regression gates:

- **NASA JPL Horizons Benchmark:** Topocentric coordinates evaluated against 7 Horizons observer tables spanning 4,111 total timestamps. All 7 fixtures pass within sub-arcsecond precision:
  - Overall Maximum Elevation Difference: **$0.000203^\circ$** ($0.73\text{ arcseconds}$)
  - Overall Maximum Azimuth Difference: **$0.000050^\circ$** ($0.18\text{ arcseconds}$)
  - Tolerance Gate: $< 0.050^\circ$
- **Permanently Shadowed Region (PSR) Ground Truth:** Asserted that points deep within the floors of Shackleton, Faustini, and Haworth craters receive $0.00\%$ direct sunlight year-round ($f_{\text{sun}} = 0.00$).
- **Test Suite Results:**
  - **Python Suite (`pytest science/tests/`):** **52 passed**, 0 failed
  - **Web Suite (`npm test`):** **11 passed**, 0 failed
  - **TypeScript Build (`npm run build`):** Clean build (108 modules transformed, 0 errors)

---

## 8. Known Limitations & Operational Caveats

1. **Topographic Line-of-Sight vs Electrical/Link Budget:** As emphasized in Section 2, geometric line-of-sight is a necessary prerequisite for solar power and communications, but does not substitute for detailed RF link budgets or battery/thermal electrical simulations.
2. **DEM Resolution Limits:** $20\text{ m}$ to $40\text{ m}$ pixels resolve major massifs and craters, but do not resolve sub-pixel rocks, meter-scale boulders, or lander micro-tilt that may induce local shadowing.
3. **Region Centroid vs Evaluated Crest Uncertainty:** Region centroids from NASA exploration announcements represent broad regions of interest ($2\text{ km}$ to $50\text{ km}$ wide). Results at region centroids can diverge drastically from specific evaluated crest sites (as demonstrated by Malapert Massif, where the center has $0\%$ Earth visibility while the crest $\approx 1.4\text{ km}$ away achieves $100\%$).
4. **Horizons Benchmark Sample Accounting (4,111 vs 4,107):** The automated benchmark tests all 4,111 available rows across the 7 JPL Horizons fixture files. A minor historical variance noted in early planning (4,107 vs 4,111 rows) stemmed from whether the 4 boundary endpoints in leap-second intervals were counted; full row-by-row regression testing covers all 4,111 rows without exception.
5. **Far-Side Communications:** Far-side lunar sites maintain $0.0\%$ direct-to-Earth visibility across all libration cycles due to lunar occultation and require orbital relay satellites.

---

## 9. Demo Notes

- **Recommended Comparison 1 (South Polar Light Traps vs Peaks):** Compare **Connecting Ridge (Evaluated Site)** against **Shackleton Rim (Centroid)**. Notice that Connecting Ridge captures $58.3\%$ illumination across 5 years and never experiences mid-winter blackout, whereas the Shackleton floor center remains in perpetual shadow ($0\%$).
- **Recommended Comparison 2 (Region Centre vs Ridge Crest):** Inspect **Malapert Massif**. Notice the note clarifying that the stated centroid coordinates have $0\%$ Earth visibility due to a local northern ridge obstacle, but walking $\approx 1.4\text{ km}$ northeast to the DEM-derived crest yields continuous $100\%$ Earth communication.
- **Recommended Comparison 3 (Observer Mast Height):** Raise the observer mast slider from $0.0\text{ m}$ to $10.0\text{ m}$ on polar ridge sites to see how elevating antennas and solar arrays over local rim crests dramatically cuts dark gap durations.

---

## 10. Team & AI-Use Disclosure

### Project Team (TODO-TEAM)
- **Team Name:** AXON (TODO-TEAM: Update team name / members)
- **Team Members:**
  - `TODO-TEAM`: Member 1 (Role / Contribution)
  - `TODO-TEAM`: Member 2 (Role / Contribution)
  - `TODO-TEAM`: Member 3 (Role / Contribution)
  - `TODO-TEAM`: Member 4 (Role / Contribution)

### AI-Assisted Development Disclosure (TODO-TEAM)
- **AI Tools Used:** `TODO-TEAM`: Describe AI coding assistants used (e.g. Antigravity IDE, Google DeepMind models).
- **Scope of AI Assistance:** `TODO-TEAM`: State specific areas where AI contributed (e.g. boilerplate generation, algorithm translation, documentation drafting).
- **Human Verification & Oversight:** `TODO-TEAM`: Describe how team members validated calculations against NASA Horizons ground truth and primary mission publications.
