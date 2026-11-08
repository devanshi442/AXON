# AXON LunarSight Data Pack — Comprehensive Asset & Verification Report

Updated: 2026-11-08  
Authoritative manifest: [`data/sources.yaml`](file:///e:/Downloads/AXON/data/sources.yaml)  
Lockfile: [`kernels.lock`](file:///e:/Downloads/AXON/kernels.lock)  
Mission catalog: [`data/missions.yaml`](file:///e:/Downloads/AXON/data/missions.yaml)  

---

## 1. Complete Inventory of Acquired Data Assets

| Tier / Category | Item / Asset | Provider / Origin | Exact URL Used | Local Path | Size (Bytes) | Hash (SHA-256 / MD5) | Status | Notes / Coverage |
|---|---|---|---|---|---|---|---|---|
| **1A** | `naif0012.tls` | NASA / NAIF (Jet Propulsion Laboratory) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls | `kernels/naif0012.tls` | 5,409 | SHA-256: `678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b` | Verified | UTC ↔ Ephemeris Time conversion in SPICE |
| **1A** | `pck00011.tpc` | NASA / NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc | `kernels/pck00011.tpc` | 135,544 | SHA-256: `3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1` | Verified | Moon radius (1737.4 km), orientation, shape model |
| **1A** | `de440s.bsp` | NASA / JPL | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp | `kernels/de440s.bsp` | 32,726,016 | MD5: `3917ee56769db332790c751e2168843d`<br>SHA-256: `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2` | Verified | Sun and Earth positions (NAIF IDs 10, 399) relative to Moon barycentre |
| **1A** | `moon_pa_de440_200625.bpc` | NASA / NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc | `kernels/moon_pa_de440_200625.bpc` | 12,863,488 | SHA-256: `60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f` | Verified | Lunar principal-axis (MOON_PA) orientation for MOON_ME frame |
| **1A** | `moon_de440_250416.tf` | NASA / NAIF (PDS4 archive) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf | `kernels/moon_de440_250416.tf` | 20,015 | MD5: `3556dde4bb7ca54a89917c301e650bbf`<br>SHA-256: `a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768` | Verified | Defines MOON_ME frame (mean-Earth/polar-axis; LOLA convention) from MOON_PA |
| **1A** | `` | NASA / NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | `kernels/` | - | (Tracked) | Verified | Documentation and integrity verification of SPICE kernels |
| **1B** | `LDEM_80S_40M.JP2` | MIT / NASA GSFC (PDS open data) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_40M.JP2 | `terrain/LDEM_80S_40M.JP2` | 91,722,831 | SHA-256: `7413280e83e52af1ee68278b7d1b52b5c8ca460c12f27873159dab155b8e7550` | Verified | Terrain-aware horizon profiles for south-polar landing sites |
| **1B** | `LDEM_80S_20M.JP2` | MIT / NASA GSFC (PDS open data) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_20M.JP2 | `terrain/LDEM_80S_20M.JP2` | 267,689,172 | SHA-256: `a38177093626d85ab6d38ffbd48bba6ac6842d5efee610aebc41cd9c54438dc6` | Verified | High-resolution terrain horizon analysis for polar sites |
| **1B** | `LDEM_85S_40M.JP2` | MIT / NASA GSFC (PDS open data) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_85S_40M.JP2 | `terrain/LDEM_85S_40M.JP2` | 24,960,972 | SHA-256: `9b5e29faf57883be1e3ba1a7fc536f08ff628662184097630b19759a35ffec18` | Verified | Fast polar DEM for deep south-polar landing sites |
| **1B** | `LDEM_85S_20M.JP2` | MIT / NASA GSFC (PDS open data) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_85S_20M.JP2 | `terrain/LDEM_85S_20M.JP2` | 79,150,148 | SHA-256: `66b8cafd638f7b710c11bfe962f35a5be8bffe744991e1eea848c24eb8dabc7c` | Verified | High-resolution DEM for deep south pole |
| **1B** | `LDEM_875S_20M.JP2` | MIT / NASA GSFC (PDS open data) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_875S_20M.JP2 | `terrain/LDEM_875S_20M.JP2` | 21,462,406 | SHA-256: `fff7c2017a192788066a0867d78fd1ccf783216e26974b5e65287669aa472bac` | Verified | Highest-detail elevation around Shackleton and south pole |
| **1B** | `LDEM_75S_30M.JP2` | MIT / NASA GSFC (PDS open data) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_75S_30M.JP2 | `terrain/LDEM_75S_30M.JP2` | 299,122,509 | SHA-256: `7a1750ddd57d098179076f83869446a2716d269a01e31afeff84dcb80d40e400` | Verified | Extended regional elevation covering outer candidate sites and Artemis exploration zone |
| **1C** | `*.json` | NASA / JPL Solar System Dynamics | https://ssd.jpl.nasa.gov/api/horizons.api | `science/fixtures/horizons/*.json` | - | (Tracked) | Verified | Independent ground truth for topocentric Az/El validation (100% of rows tested) |
| **2E** | `im1_press_kit.pdf` | NASA | https://www.nasa.gov/wp-content/uploads/2024/01/np-2023-12-016-jsc-clps-im-press-kit-web-508.pdf | `docs/sources/im1_press_kit.pdf` | 8,481,852 | SHA-256: `4ec91714178a9c5f33d35d0b9433875219b72750a8801784113fd215bf3ff88d` | Verified | Pages 2-3 describe IM-1 Malapert A landing site and 6 NASA instruments |
| **2E** | `im2_press_kit.pdf` | NASA | https://nasa.gov/wp-content/uploads/2025/02/np-2025-02-005-jsc-clps-intuitive-machines-press-kit-508-2-25-25.pdf | `docs/sources/im2_press_kit.pdf` | 4,991,261 | SHA-256: `5b57f68e880635c0edb19d907e159725eb17fd1c45e2cca25fbe0cbc5dabbdef` | Verified | Pages 3-4 describe IM-2 Mons Mouton landing site and PRIME-1 drill |
| **2E** | `blue_ghost_1_press_kit.pdf` | NASA | https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf | `docs/sources/blue_ghost_1_press_kit.pdf` | 11,086,708 | SHA-256: `e667756f2cee5b45007015f5be9e3a3a4a62a77ea75425272bdded9c43bc9454` | Verified | Pages 3-4 describe Blue Ghost 1 Mare Crisium / Mons Latreille site and 10 instruments |
| **2E** | `peregrine_griffin_press_kit.pdf` | NASA | https://www.nasa.gov/wp-content/uploads/2023/12/np-2023-12-017-jsc-clps-astrobotic-press-kit-update-508.pdf | `docs/sources/peregrine_griffin_press_kit.pdf` | 3,944,413 | SHA-256: `c79ced140b1cf1102dbb295e10d9966f78b8b0ea82c10fc300984c451b92ba24` | Verified | Pages 2, 4, 18 describe Peregrine Sinus Viscositatis and Griffin Nobile / Mons Mouton context |
| **2F** | `constants.py` | IAU 2015, NASA SORCE/TIM, NAIF PCK-00011, JPL Horizons DE441 | N/A | `science/lunarsight_core/constants.py` | 7,250 | SHA-256: `fc1ceb64157256fb59e97682c7be63466d49fafcfe5a71c18e27f9f21be4c73b` | Verified |  |
| **3H** | `LDEM_64.JP2` | MIT / NASA GSFC (PDS open data) | https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/JP2/LDEM_64.JP2 | `terrain/global/LDEM_64.JP2` | 211,190,204 | SHA-256: `5bcdc1add91447d4386f0ccab17da2f6dd0ae8e116fbd60f56aa31d74248c096` | Verified | Elevation for non-polar missions (Blue Ghost 1 in Mare Crisium, IM-3 at Reiner Gamma) |
| **3I** | `LPSR_85S_060M_201608.JP2` | MIT / NASA GSFC (PDS open data) | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/JP2/LPSR_85S_060M_201608.JP2 | `terrain/illumination/LPSR_85S_060M_201608.JP2` | 5,574,318 | SHA-256: `3a39a4c151eb67278bf46383b77bbd4751db0de78bfc5b0ba87a79f37c220e31` | Verified | Ground truth verification of Permanently Shadowed Regions |
| **3G** | `LPSR_80S_20MPP_ADJ_1km2.CSV` | NASA GSFC Planetary Geodynamics Data Archive (PGDA Product 90) | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ_1km2.CSV | `terrain/pgda/LPSR_80S_20MPP_ADJ_1km2.CSV` | 29,642,968 | SHA-256: `5d914b17887b385ad53c004751dad0235d8739959f3cf9063573575832c942d5` | Verified | Permanently shadowed regions boundary and area catalog |
| **1B** | `LDEM_80S_80MPP_ADJ_HILL.TIF` | NASA GSFC Planetary Geodynamics Data Archive (PGDA Product 90) | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ_HILL.TIF | `terrain/pgda/LDEM_80S_80MPP_ADJ_HILL.TIF` | 88,474,342 | SHA-256: `f669073ea6bf05ae97bce897e5e3c08f2ee9097a663c8cd3a758db296f373ae2` | Verified | Shaded relief backdrop for south polar visualization |
| **1B** | `LDEM_80S_80MPP_ADJ.TIF` | NASA GSFC Planetary Geodynamics Data Archive (PGDA Product 90) | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF | `terrain/pgda/LDEM_80S_80MPP_ADJ.TIF` | 189,158,392 | SHA-256: `82030dcbdd7c4bb0c7d858e9b4b293b9f2cda5a543ba31ec0f42784bd6beee5a` | Verified | Adjusted south polar elevation GeoTIFF |
| **3G** | `LDSM_80S_80MPP_ADJ.TIF` | NASA GSFC Planetary Geodynamics Data Archive (PGDA Product 90) | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDSM_80S_80MPP_ADJ.TIF | `terrain/pgda/LDSM_80S_80MPP_ADJ.TIF` | 241,594,035 | SHA-256: `d1270c4a69d01a8e4eb5503bd25713f0b2251dbb4ffee6c3161ef7a792c8f059` | Verified | Slope map for lander tilt hazard evaluation |

---

## 2. Row-by-Row Horizons Golden Benchmark Results

Every single row of all 7 Horizons fixtures (4,111 total timestamps) was compared against `spiceypy` topocentric coordinates at that exact epoch using the core SPICE ephemerides (`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`, `pck00011.tpc`):

| Fixture / Site Name | Coordinates (Lat, Lon) | Timesteps (Rows) | Sun Max Elev Diff | Sun Mean Elev Diff | Sun Max Az Diff | Earth Max Elev Diff | Earth Mean Elev Diff | Earth Max Az Diff | Golden Test Status |
|---|---|---|---|---|---|---|---|---|---|
| **IM-1 (Malapert A)** | (-80.13°, 1.44°) | 697 | 0.00000° | 0.00000° | 0.00000° | 0.00003° | 0.00002° | 0.00000° | **PASSED** |
| **Blue Ghost 1 (Mare Crisium)** | (18.56°, 61.81°) | 673 | 0.00000° | 0.00000° | 0.00000° | 0.00003° | 0.00002° | 0.00000° | **PASSED** |
| **IM-2 (Mons Mouton)** | (-84.7906°, 29.1957°) | 673 | 0.00000° | 0.00000° | 0.00000° | 0.00003° | 0.00002° | 0.00000° | **PASSED** |
| **Apollo 11 (Mare Tranquillitatis)** | (0.6875°, 23.4333°) | 49 | 0.00020° | 0.00020° | 0.00000° | 0.00003° | 0.00002° | 0.00005° | **PASSED** |
| **Peak Near Shackleton** | (-89.68°, 129.0°) | 673 | 0.00000° | 0.00000° | 0.00000° | 0.00003° | 0.00002° | 0.00000° | **PASSED** |
| **Far-side Control (0°N, 180°E)** | (0.0°, 180.0°) | 673 | 0.00000° | 0.00000° | 0.00001° | 0.00000° | 0.00000° | 0.00004° | **PASSED** |
| **Near-limb Control (0°N, 90°E)** | (0.0°, 90.0°) | 673 | 0.00000° | 0.00000° | 0.00000° | 0.00003° | 0.00002° | 0.00000° | **PASSED** |

---

## 3. Candidate Sites: Primary Sources and Sourced Coordinates

All candidate sites have been verified against NASA's refined Artemis III Candidate Landing Regions announcement (NASA Release 24-136, Oct 28, 2024), LPI exploration studies, and the USGS Gazetteer:

1. **Peak Near Shackleton (`cs-shackleton-rim`)**:
   - Sourced Coordinates: **-89.68°S, 129.0°E** (Region centroid; summit landing point evaluated at -89.017°S, 126.273°E per LPI / Spudis et al. 2008).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://www.lpi.usra.edu/lunar/constellation/landing_sites/connecting_ridge/
2. **Connecting Ridge (`cs-connecting-ridge`)**:
   - Sourced Coordinates: **-89.45°S, -136.0°E** (136.0°W / 224.0°E; evaluated landing point -89.534°S, 209.948°E).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://www.lpi.usra.edu/lunar/constellation/landing_sites/connecting_ridge/
3. **Haworth (`cs-haworth`)**:
   - Sourced Coordinates: **-86.75°S, -22.84°E** (22.84°W / 337.16°E; Haworth crater center 87.4°S, 5.2°W per USGS Gazetteer).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://planetarynames.wr.usgs.gov/Feature/2393
4. **Malapert Massif (`cs-malapert-massif`)**:
   - Sourced Coordinates: **-85.99°S, -2.93°E** (357.07°E / ~0.13°W).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://planetarynames.wr.usgs.gov/Feature/3599
5. **Mons Mouton Plateau (`cs-mons-mouton-plateau`)**:
   - Sourced Coordinates: **-85.42°S, 31.59°E**.
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://planetarynames.wr.usgs.gov/Feature/16147
6. **Nobile Rim 1 (`cs-nobile-rim-1`)**:
   - Sourced Coordinates: **-85.30°S, 31.5°E**.
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
7. **Nobile Rim 2 (`cs-nobile-rim-2`)**:
   - Sourced Coordinates: **-84.2°S, 60.7°E** (Site DM2).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
8. **Faustini Rim A (`cs-faustini-rim-a`)**:
   - Sourced Coordinates: **-87.3°S, 77.0°E**.
   - URL: https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-artemis-iii-lunar-landing/

---

## 4. Product Clarification: `LPSR_85S_060M_201608` is a PSR Map, NOT Illumination

Inspection of `terrain/illumination/LPSR_85S_060M_201608_JP2.LBL` confirmed:
```
DESCRIPTION = "This data product is a map of the permanently shadowed regions (PSRs)
   of the Lunar South Pole at a resolution of 60m/pix by 60m/pix, true at the pole
   in polar stereographic (spherical) projection. The calculations are based on the LOLA
   elevation map LDEM_85S_060M and are described in [MAZARICOETAL2011]. The values are
   binary, indicating whether a pixel is in permanent shadow (1) or not (0)."
OBJECT = IMAGE
   NAME = PERMANENT_SHADOW
   DESCRIPTION = "Each sample is a binary value that indicates whether that location
     is in permanent shadow (DN=+20000, scaling to 1) or not (DN=-20000, scaling to 0)."
```
- **Relabeling Action:** Relabeled in [`data/sources.yaml`](file:///e:/Downloads/AXON/data/sources.yaml) from illumination map to **LOLA South Pole Permanently Shadowed Regions Binary Map** (`lola-polar-psr-map-jp2`).

---

## 5. SPICE Frame Kernel Clarification

- We removed the unverified claim that `moon_de440_220930.tf` and `250416` define identical frames.
- Fact: `moon_de440_220930.tf` returns **HTTP 404** on NAIF's server and was never downloaded.
- The project exclusively downloads and verifies `moon_de440_250416.tf`, whose MD5 hash (`3556dde4bb7ca54a89917c301e650bbf`) matches the official NASA NAIF PDS4 XML archive manifest.
