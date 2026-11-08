# AXON LunarSight Data Pack — Comprehensive Asset & Verification Report

**Authoritative manifest:** [`data/sources.yaml`](data/sources.yaml)  
**Kernel lockfile:** [`kernels.lock`](kernels.lock)  
**Mission catalog:** [`data/missions.yaml`](data/missions.yaml)  
**Compiled catalog:** [`web/public/data/missions.json`](web/public/data/missions.json)  

---

## Table of Contents
- [1. Data Assets & Acquisition Provenance](#1-data-assets--acquisition-provenance)
- [2. Digital Elevation Models (DEMs) & Coverage Architecture](#2-digital-elevation-models-dems--coverage-architecture)
- [3. Precomputed Data Products & Storage Budget](#3-precomputed-data-products--storage-budget)
- [4. Mission Catalog Schema & Coordinate Semantics](#4-mission-catalog-schema--coordinate-semantics)
- [5. JPL Horizons Golden Benchmarks (4,111 Verification Points)](#5-jpl-horizons-golden-benchmarks-4111-verification-points)
- [6. Primary Source Citations for Evaluated & Candidate Sites](#6-primary-source-citations-for-evaluated--candidate-sites)
- [7. Clarifications on Historical Data Items](#7-clarifications-on-historical-data-items)

---

## 1. Data Assets & Acquisition Provenance

All foundational data assets used by AXON LunarSight are sourced from official planetary data nodes and verified by cryptographic hashes:

| Tier / Category | Asset / Filename | Provider / Origin | Exact Sourced URL | Local Path | File Size | Hash (SHA-256 / MD5) | Verification | Purpose / Description |
|---|---|---|---|---|---|---|---|---|
| **1A** | `naif0012.tls` | NASA / JPL NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls | `kernels/naif0012.tls` | 5,409 B | SHA-256: `678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b` | Verified | Leap seconds kernel for UTC ↔ Ephemeris Time (ET/TDB) conversion |
| **1A** | `pck00011.tpc` | NASA / JPL NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc | `kernels/pck00011.tpc` | 135,544 B | SHA-256: `3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1` | Verified | Planetary constants, triaxial ellipsoids, IAU mean lunar radius ($R = 1,737.4\text{ km}$) |
| **1A** | `de440s.bsp` | NASA / JPL | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp | `kernels/de440s.bsp` | 32,726,016 B | MD5: `3917ee56769db332790c751e2168843d`<br>SHA-256: `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2` | Verified | Sun and Earth ephemerides (NAIF IDs 10, 399) relative to Moon barycentre |
| **1A** | `moon_pa_de440_200625.bpc` | NASA / JPL NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc | `kernels/moon_pa_de440_200625.bpc` | 12,863,488 B | SHA-256: `60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f` | Verified | High-accuracy lunar principal-axis orientation (`MOON_PA`) |
| **1A** | `moon_de440_250416.tf` | NASA / NAIF (PDS4 Archive) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf | `kernels/moon_de440_250416.tf` | 20,015 B | MD5: `3556dde4bb7ca54a89917c301e650bbf`<br>SHA-256: `a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768` | Verified | Frame kernel connecting `MOON_PA` to `MOON_ME` (mean-Earth / polar-axis) |
| **1B** | `LDEM_875S_20M.JP2` | NASA GSFC / LOLA GDR | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_875S_20M.JP2 | `terrain/LDEM_875S_20M.JP2` | 21,462,406 B | SHA-256: `fff7c2017a192788066a0867d78fd1ccf783216e26974b5e65287669aa472bac` | Verified | 20 m/px polar stereographic DEM covering 87.5°S to 90.0°S |
| **1B** | `LDEM_85S_20M.JP2` | NASA GSFC / LOLA GDR | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_85S_20M.JP2 | `terrain/LDEM_85S_20M.JP2` | 79,150,148 B | SHA-256: `66b8cafd638f7b710c11bfe962f35a5be8bffe744991e1eea848c24eb8dabc7c` | Verified | 20 m/px polar stereographic DEM covering 85.0°S to 90.0°S |
| **1B** | `LDEM_80S_20M.JP2` | NASA GSFC / LOLA GDR | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_20M.JP2 | `terrain/LDEM_80S_20M.JP2` | 267,689,172 B | SHA-256: `a38177093626d85ab6d38ffbd48bba6ac6842d5efee610aebc41cd9c54438dc6` | Verified | 20 m/px polar stereographic DEM covering 80.0°S to 90.0°S |
| **1B** | `LDEM_75S_30M.JP2` | NASA GSFC / LOLA GDR | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_75S_30M.JP2 | `terrain/LDEM_75S_30M.JP2` | 299,122,509 B | SHA-256: `7a1750ddd57d098179076f83869446a2716d269a01e31afeff84dcb80d40e400` | Verified | 30 m/px polar stereographic DEM covering 75.0°S to 90.0°S |
| **1B** | `LDEM_64.JP2` | NASA GSFC / LOLA GDR | https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/JP2/LDEM_64.JP2 | `terrain/global/LDEM_64.JP2` | 211,190,204 B | SHA-256: `5bcdc1add91447d4386f0ccab17da2f6dd0ae8e116fbd60f56aa31d74248c096` | Verified | Global equirectangular cylindrical DEM (64 pixels/degree, ~474 m/px) |
| **1C** | `*.json` (7 files) | NASA JPL Horizons | https://ssd.jpl.nasa.gov/api/horizons.api | `science/fixtures/horizons/*.json` | - | Tracked in git | Verified | Independent ground truth for Az/El regression (4,111 total timestamps) |
| **3I** | `LPSR_85S_060M_201608.JP2` | NASA GSFC / LOLA GDR | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/JP2/LPSR_85S_060M_201608.JP2 | `terrain/illumination/LPSR_85S_060M_201608.JP2` | 5,574,318 B | SHA-256: `3a39a4c151eb67278bf46383b77bbd4751db0de78bfc5b0ba87a79f37c220e31` | Verified | Permanently Shadowed Region (PSR) binary validation control |

---

## 2. Digital Elevation Models (DEMs) & Coverage Architecture

### DEM Unit Scaling: 0.5 m/DN
All LOLA polar stereographic DEM products (`LDEM_*`) store planetary surface elevation as 16-bit signed integers (Digital Numbers). To convert from raster pixel DN to meters above the IAU mean lunar radius ($R = 1,737.4\text{ km}$):
$$\text{Elevation (m)} = \text{DN} \times 0.5\text{ m}$$
This scaling factor is strictly applied by [`lunarsight_core/terrain.py`](science/lunarsight_core/terrain.py) when constructing local terrain windows for ray-marching.

### Dynamic DEM Selection per Site
Horizon masks march rays outward to $50.0\text{ km}$ along great circles. A site binds to the highest-resolution DEM whose spatial boundaries enclose the full $50\text{ km}$ radius around the site coordinates:

| Site Identifier | Latitude, Longitude | Bound DEM Product | Resolution | Stated Elevation | Coverage Status | Notes |
|---|---|---|---|---|---|---|
| `cs-connecting-ridge-site` | -89.534°, -150.052° | `LDEM_875S_20M` | 20 m/px | +1,653.0 m | Full | Specific evaluated ridge landing site |
| `cs-connecting-ridge` | -89.450°, -136.000° | `LDEM_875S_20M` | 20 m/px | +1,931.3 m | Full | Region centroid |
| `cs-shackleton-ridge-site` | -89.017°, 126.273° | `LDEM_85S_20M` | 20 m/px | +1,167.2 m | Full | Specific evaluated summit site |
| `cs-shackleton-rim` | -89.680°, 129.000° | `LDEM_85S_20M` | 20 m/px | -2,784.9 m | Full | Region centroid (crater floor) |
| `cs-faustini-rim-a` | -87.880°, 90.000° | `LDEM_85S_20M` | 20 m/px | +62.5 m | Full | Candidate region |
| `cs-haworth` | -86.750°, -22.840° | `LDEM_85S_20M` | 20 m/px | +1,630.4 m | Full | Candidate region |
| `cs-malapert-massif` | -85.990°, -2.930° | `LDEM_80S_20M` | 20 m/px | +4,841.0 m | Full | Region centroid (0% Earth DTE) |
| `cs-mons-mouton-plateau` | -85.420°, 31.590° | `LDEM_80S_20M` | 20 m/px | +6,414.2 m | Full | Candidate region |
| `cs-nobile-rim-1` | -85.350°, 36.500° | `LDEM_80S_20M` | 20 m/px | +6,350.4 m | Full | Candidate region |
| `cs-nobile-rim-2` | -84.200°, 60.700° | `LDEM_80S_20M` | 20 m/px | +1,124.8 m | Full | Candidate region |
| `griffin-1` | -85.300°, 31.500° | `LDEM_80S_20M` | 20 m/px | +6,144.7 m | Full | Planned CLPS mission |
| `im-2` | -84.791°, 29.196° | `LDEM_80S_20M` | 20 m/px | +5,322.5 m | Full | Specific CLPS landing site |
| `malapert-crater` | -84.900°, 12.900° | `LDEM_80S_20M` | 20 m/px | -1,867.8 m | Full | Reference crater |
| `mons-mouton-summit` | -84.600°, 31.000° | `LDEM_80S_20M` | 20 m/px | +5,044.6 m | Full | Reference summit point |
| `im-1` | -80.130°, 1.440° | `LDEM_75S_30M` | 30 m/px | +2,598.9 m | Full | Landed CLPS mission |
| `blue-ghost-m1` | +18.560°, +61.810° | `LDEM_64` | ~474 m/px | -3,651.3 m | Full | Mare Crisium landing site |
| `im-3-reiner-gamma` | +7.500°, -59.000° | `LDEM_64` | ~474 m/px | -1,753.5 m | Full | Reiner Gamma swirl site |
| `needs-check-farside-and-schrodinger` | -75.000°, 132.500° | `LDEM_64` | ~474 m/px | -4,644.5 m | Full | Far-side reference site |
| `peregrine-m1` | +35.100°, -40.700° | `LDEM_64` | ~474 m/px | -2,110.2 m | Full | Sinus Viscositatis site |

---

## 3. Precomputed Data Products & Storage Budget

To support static hosting (GitHub Pages) and eliminate real-time raster processing delays in the browser, all datasets are precomputed and committed directly to [`web/public/data/`](web/public/data/).

### Exact File Counts & Structure
- **Horizon Masks (`horizon/*.json`):** Exactly **19 files** (0.30 MB). Contains 360 azimuth bins for 5 observer mast heights ($0\text{ m}, 1.5\text{ m}, 3\text{ m}, 5\text{ m}, 10\text{ m}$) plus DEM provenance hashes.
- **Summary Metrics (`summary/*.json`):** Exactly **19 files** (2.50 MB). Side-by-side comparison of flat sphere vs terrain illumination, DTE percentages, dark gaps, and energy yields.
- **Timeseries (`timeseries/*.json`):** Exactly **19 files** (16.24 MB). Scaled int16 compact arrays ($100\times$) storing topocentric azimuth and elevation across 43,848 hourly samples.
- **Refined Events (`events/*.json`):** Exactly **19 files** (1.07 MB). Contiguous visibility intervals and gap statistics.
- **Standalone Artifacts:** `missions.json` (22.8 KB), `manifest.json` (10.4 KB), `benchmark.json` (3.9 KB).
- **Total Storage:** **20.15 MB** (comfortably below the 25.0 MB repository budget; no individual file exceeds 1.5 MB).

### Summary Window Parameters
- **Time Span:** `2024-01-01T00:00:00Z` to `2028-12-31T23:00:00Z` (5 complete calendar years, including the 2024 leap day).
- **Time Step:** Hourly ($3,600\text{ seconds}$).
- **Sample Count:** Exactly **43,848 samples** per site timeseries ($1,827\text{ days} \times 24\text{ hours}$).

---

## 4. Mission Catalog Schema & Coordinate Semantics

The mission database is maintained in [`data/missions.yaml`](data/missions.yaml) and validated against [`data/schema/missions.schema.json`](data/schema/missions.schema.json).

### Coordinate Kinds (`coordinate_kind`)
1. **`specific_site` (or `actual`):** Refers to a specific evaluated summit landing coordinate (e.g. `cs-shackleton-ridge-site` at $-89.017^\circ\text{S}, 126.273^\circ\text{E}$) or an actual confirmed landing point (e.g. `im-1` at $-80.13^\circ\text{S}, 1.44^\circ\text{E}$).
2. **`region_centre` (or `candidate_region_center` / `planned_region_center`):** Refers to the geometric centroid of a broad candidate exploration zone ($2\text{ km}$ to $50\text{ km}$ across) defined by NASA Artemis announcements.
   > [!WARNING]
   > Topographic horizon results at region centroids can diverge drastically from crest sites. Mission planners must not conflate candidate region centroids with evaluated landing crests.

### The Malapert Massif Finding & `SITE_ANNOTATIONS` Architecture
- **Observed Discrepancy:** Stated centroid coordinates for Malapert Massif ($-85.99^\circ\text{S}, -2.93^\circ\text{E}$) sit at $+4,841\text{ m}$ in a local depression behind a northern topographic wall, yielding **$0.0\%$ Earth line-of-sight**.
- **Crest Ground Truth:** Moving $\approx 1.4\text{ km}$ northeast to the DEM-derived crest ($-85.9627^\circ\text{S}, -2.3725^\circ\text{E}, 4,993\text{ m}$) achieves continuous **$100.0\%$ Earth line-of-sight**.
- **Idempotent Maintenance:** To ensure this critical note persists without altering unverified fields in `data/missions.yaml`, the annotation is authored in `SITE_ANNOTATIONS` within [`science/lunarsight_core/sites.py`](science/lunarsight_core/sites.py) and injected during build compilation by [`pipeline/validate_missions.py`](pipeline/validate_missions.py).

---

## 5. JPL Horizons Golden Benchmarks (4,111 Verification Points)

Every row of all 7 keyless NASA JPL Horizons observer fixtures was verified against our SPICE topocentric engine:

| Fixture File | Target Site | Coordinates | Verified Rows | Max $\Delta$ Elevation | Max $\Delta$ Azimuth | Status |
|---|---|---|---|---|---|---|
| `im-1_sun_2024-02-22_2024-03-22.json` | IM-1 (Malapert A) | -80.13°, 1.44° | 697 | 0.000026° | 0.000001° | **PASSED** |
| `blue-ghost-1_sun_2025-03-02_2025-04-02.json` | Blue Ghost 1 (Mare Crisium) | 18.56°, 61.81° | 673 | 0.000001° | 0.000001° | **PASSED** |
| `im-2_sun_2025-03-01_2025-03-31.json` | IM-2 (Mons Mouton) | -84.7906°, 29.1957° | 673 | 0.000001° | 0.000001° | **PASSED** |
| `apollo11_sun_2024-01-01_2024-01-31.json` | Apollo 11 (Tranquillitatis) | 0.6875°, 23.4333° | 49 | 0.000203° | 0.000050° | **PASSED** |
| `shackleton-rim_sun_2026-03-01_2026-03-31.json` | Shackleton Rim Reference | -89.68°, 129.0° | 673 | 0.000001° | 0.000001° | **PASSED** |
| `farside-0N-180E_earth_2026-01-01_2026-01-11.json` | Far Side Isolation | 0.0°, 180.0° | 673 | 0.000001° | 0.000004° | **PASSED** |
| `nearlimb-0N-90E_earth_2026-01-01_2026-01-11.json` | Eastern Limb Horizon | 0.0°, 90.0° | 673 | 0.000030° | 0.000001° | **PASSED** |
| **Total / Overall** | **7 Locations** | - | **4,111** | **0.000203°** | **0.000050°** | **ALL PASSED** |

---

## 6. Primary Source Citations for Evaluated & Candidate Sites

All landing site records are tied to peer-reviewed exploration studies and NASA announcements:

1. **Peak Near Shackleton (Evaluated Site, `cs-shackleton-ridge-site`):**
   - Coordinates: **-89.017°S, 126.273°E** (Specific landing point on Shackleton rim ridge).
   - Citations: NASA Artemis III Candidate Regions (2022/2024 updates) and LPI Exploration Study (Spudis et al. 2008).
   - URLs: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://www.lpi.usra.edu/lunar/constellation/landing_sites/connecting_ridge/
2. **Connecting Ridge (Evaluated Site, `cs-connecting-ridge-site`):**
   - Coordinates: **-89.534°S, -150.052°E** ($209.948^\circ\text{E}$).
   - Citations: NASA Artemis III Refined Regions (NASA Release 24-136) and LPI Constellation Landing Site Analysis.
   - URLs: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
3. **Malapert Massif (`cs-malapert-massif`):**
   - Centroid Coordinates: **-85.99°S, -2.93°E** ($357.07^\circ\text{E}$).
   - Citations: USGS Gazetteer Feature 3599 and NASA Artemis III Announcements.
   - URLs: https://planetarynames.wr.usgs.gov/Feature/3599
4. **Mons Mouton Plateau & Summit (`cs-mons-mouton-plateau`, `mons-mouton-summit`):**
   - Centroid: **-85.42°S, 31.59°E**; Summit Reference: **-84.60°S, 31.00°E**.
   - Citations: USGS Gazetteer Feature 16147 (named for NASA mathematician Melba Roy Mouton).
   - URLs: https://planetarynames.wr.usgs.gov/Feature/16147

---

## 7. Clarifications on Historical Data Items

1. **`LPSR_85S_060M_201608` is a PSR Map, NOT an Illumination Map:**
   Inspection of `terrain/illumination/LPSR_85S_060M_201608_JP2.LBL` verified that pixel values are strictly binary flags: $\text{DN} = +20,000$ ($1$, permanently shadowed) or $\text{DN} = -20,000$ ($0$, illuminated). The file is relabeled in `data/sources.yaml` as the LOLA South Pole PSR Binary Map.
2. **SPICE Frame Kernel `moon_de440_250416.tf`:**
   NAIF documentation confirmed that `moon_de440_220930.tf` was a preliminary build returning HTTP 404. AXON exclusively uses `moon_de440_250416.tf` verified against the official NASA PDS4 XML manifest (MD5: `3556dde4bb7ca54a89917c301e650bbf`).
