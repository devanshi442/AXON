# AXON LunarSight Data Pack — Comprehensive Asset & Verification Report

Updated: 2026-10-25  
Authoritative manifest: [`data/sources.yaml`](file:///e:/Downloads/AXON/data/sources.yaml)  
Lockfile: [`kernels.lock`](file:///e:/Downloads/AXON/kernels.lock)  
Mission catalog: [`data/missions.yaml`](file:///e:/Downloads/AXON/data/missions.yaml)  

---

## 1. Complete Inventory of Acquired Data Assets

| Tier | Item / Asset | Provider / Origin | Exact URL Used | Local Path | Size (Bytes) | Hash (SHA-256 / MD5) | Status | Notes / Coverage |
|---|---|---|---|---|---|---|---|---|
| **1A** | `naif0012.tls` (LSK) | NASA / NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls | `kernels/naif0012.tls` | 5,257 | SHA-256: `678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b` | Verified | Leap seconds: UTC ↔ ET conversions |
| **1A** | `pck00011.tpc` (PCK) | NASA / NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc | `kernels/pck00011.tpc` | 131,226 | SHA-256: `3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1` | Verified | Planetary constants: Moon radius 1737.4 km |
| **1A** | `de440s.bsp` (SPK) | NASA / JPL | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp | `kernels/de440s.bsp` | 32,726,016 | MD5: `3917ee56769db332790c751e2168843d`<br>SHA-256: `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2` | Verified | Moon coverage: 1849-12-25 to 2150-01-21 UTC. MD5 matches `aa_checksums.txt`. |
| **1A** | `moon_pa_de440_200625.bpc` | NASA / NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc | `kernels/moon_pa_de440_200625.bpc` | 12,863,488 | SHA-256: `60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f` | Verified | Frame 31008 (`MOON_PA_DE440`) coverage: 1549-12-30 to 2650-01-24 UTC |
| **1A** | `moon_de440_250416.tf` (FK) | NASA / NAIF (PDS4) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf | `kernels/moon_de440_250416.tf` | 19,478 | MD5: `3556dde4bb7ca54a89917c301e650bbf`<br>SHA-256: `a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768` | Verified | Current NAIF Moon frame release; MD5 matches official PDS4 XML. Defines `MOON_ME`. |
| **1A** | `aa_checksums.txt` | NASA / NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_checksums.txt | `kernels/aa_checksums.txt` | 559 | SHA-256: `3c618bed7d51a48ee059269097eeeab1f69f3b2641ec2aeb96132757418c845b` | Verified | NAIF official published MD5 checksums for SPKs |
| **1A** | `aa_summaries.txt` | NASA / NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_summaries.txt | `kernels/aa_summaries.txt` | 12,911 | SHA-256: `2b34f045b63731a6a315a83b1e2f240dd208a4b5a19ee3419be0573485c15f87` | Verified | SPK coverage catalog |
| **1A** | `aareadme_pck.txt` | NASA / NAIF | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/aareadme.txt | `kernels/aareadme_pck.txt` | 14,188 | SHA-256: `edc4fb94a9db7b295e21de9a542daf644db7b27dea83b135574374063d4099da` | Verified | NAIF PCK manual |
| **1A** | `de440_tech-comments.txt` | NASA / JPL | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440_tech-comments.txt | `kernels/de440_tech-comments.txt` | 59,339 | SHA-256: `451a4aaa7a85ce9890bdb8a2275434fd07ec21d7fd31494f1fbe8422f368ba10` | Verified | Technical comments on DE440 ephemeris integration |
| **1B** | `LDEM_80S_40M.JP2` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_40M.JP2 | `terrain/LDEM_80S_40M.JP2` | 91,722,831 | SHA-256: `7413280e83e52af1ee68278b7d1b52b5c8ca460c12f27873159dab155b8e7550` | Verified | 15200x15200 px, 40 m/px. IM-1: elev=+2598.0 m; IM-2: elev=+5322.0 m |
| **1B** | `LDEM_80S_40M_JP2.LBL` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_40M_JP2.LBL | `terrain/LDEM_80S_40M_JP2.LBL` | 6,359 | SHA-256: `56a720b79210d15c1225e0052d82afbf5086068db9bbc212da913685ca0c6fa1` | Verified | Scale: 0.5, Offset: 1,737,400.0 m |
| **1B** | `LDEM_80S_40M_AUX.XML` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_40M_AUX.XML | `terrain/LDEM_80S_40M_AUX.XML` | 2,542 | SHA-256: `ed53621461fafcb935e22dc515ba9df60f682fb0bf4ae3dbffef0b69590c920b` | Verified | GDAL XML projection metadata |
| **1B** | `LDEM_80S_20M.JP2` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_20M.JP2 | `terrain/LDEM_80S_20M.JP2` | 267,689,172 | SHA-256: `a38177093626d85ab6d38ffbd48bba6ac6842d5efee610aebc41cd9c54438dc6` | Verified | 30400x30400 px, 20 m/px. IM-1: elev=+2597.5 m; IM-2: elev=+5322.5 m |
| **1B** | `LDEM_80S_20M_JP2.LBL` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_20M_JP2.LBL | `terrain/LDEM_80S_20M_JP2.LBL` | 6,362 | SHA-256: `48d80b4e0fd6dac9a5224f5e49904fa2c223119899cec1d19d8dd29f968a92ce` | Verified | Scale: 0.5, Offset: 1,737,400.0 m |
| **1B** | `LDEM_80S_20M_AUX.XML` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_20M_AUX.XML | `terrain/LDEM_80S_20M_AUX.XML` | 2,703 | SHA-256: `39c96b18aee53960299a33da5774632db0788a0132e356c948ba7ace57131086` | Verified | GDAL XML projection metadata |
| **1B** | `LDEM_85S_40M.JP2` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_85S_40M.JP2 | `terrain/LDEM_85S_40M.JP2` | 24,960,972 | SHA-256: `9b5e29faf57883be1e3ba1a7fc536f08ff628662184097630b19759a35ffec18` | Verified | 7584x7584 px, 40 m/px polar stereographic |
| **1B** | `LDEM_85S_40M_JP2.LBL` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_85S_40M_JP2.LBL | `terrain/LDEM_85S_40M_JP2.LBL` | 6,354 | SHA-256: `91cd050ebaf588b8ec67819564c0ab15a5779926661b73ad2b32d288887cfb17` | Verified | Scale: 0.5, Offset: 1,737,400.0 m |
| **1B** | `LDEM_85S_40M_AUX.XML` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_85S_40M_AUX.XML | `terrain/LDEM_85S_40M_AUX.XML` | 2,398 | SHA-256: `124f4b3e248b91dcbf8a6f747d3f429e59d0681ced4c5fab410328ab79f1e563` | Verified | GDAL XML projection metadata |
| **1B** | `LDEM_85S_20M.JP2` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_85S_20M.JP2 | `terrain/LDEM_85S_20M.JP2` | 79,150,148 | SHA-256: `66b8cafd638f7b710c11bfe962f35a5be8bffe744991e1eea848c24eb8dabc7c` | Verified | 15168x15168 px, 20 m/px polar stereographic |
| **1B** | `LDEM_85S_20M_JP2.LBL` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_85S_20M_JP2.LBL | `terrain/LDEM_85S_20M_JP2.LBL` | 6,359 | SHA-256: `61b5c47cf1a83160945cb264f9e96bd89b2a88c9d892e4c9fa73bf6f80d750b6` | Verified | Scale: 0.5, Offset: 1,737,400.0 m |
| **1B** | `LDEM_85S_20M_AUX.XML` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_85S_20M_AUX.XML | `terrain/LDEM_85S_20M_AUX.XML` | 2,608 | SHA-256: `4e5c25007f8ed82c72923a9a8c5ec3d20f72e3aa8dbc8041aff8bf336d5bc7d7` | Verified | GDAL XML projection metadata |
| **1B** | `LDEM_875S_20M.JP2` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_875S_20M.JP2 | `terrain/LDEM_875S_20M.JP2` | 21,462,406 | SHA-256: `fff7c2017a192788066a0867d78fd1ccf783216e26974b5e65287669aa472bac` | Verified | 7584x7584 px, 20 m/px (Shackleton crater rim region) |
| **1B** | `LDEM_875S_20M_JP2.LBL` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_875S_20M_JP2.LBL | `terrain/LDEM_875S_20M_JP2.LBL` | 6,360 | SHA-256: `9318f41503c7d02251ed643e6dd74b737d76378be49cd492c3abb9e05d431aaa` | Verified | Scale: 0.5, Offset: 1,737,400.0 m |
| **1B** | `LDEM_875S_20M_AUX.XML` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_875S_20M_AUX.XML | `terrain/LDEM_875S_20M_AUX.XML` | 2,415 | SHA-256: `848913f84866476f1209f73bb855f652605bbb674d41bc04727e3fd6e72c1650` | Verified | GDAL XML projection metadata |
| **1B** | `LDEM_75S_30M.JP2` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_75S_30M.JP2 | `terrain/LDEM_75S_30M.JP2` | 299,122,509 | SHA-256: `7a1750ddd57d098179076f83869446a2716d269a01e31afeff84dcb80d40e400` | Verified | 30496x30496 px, 30 m/px. Extended 75°S polar region. |
| **1B** | `LDEM_75S_30M_JP2.LBL` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_75S_30M_JP2.LBL | `terrain/LDEM_75S_30M_JP2.LBL` | 6,362 | SHA-256: `4d9f6ca86112e855f96191e8d459cfdfd3f7bb152ecefefebff8e071c018da5c` | Verified | Scale: 0.5, Offset: 1,737,400.0 m |
| **1B** | `LDEM_75S_30M_AUX.XML` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_75S_30M_AUX.XML | `terrain/LDEM_75S_30M_AUX.XML` | 2,670 | SHA-256: `c99164d7a95c54edf382230eefa2d561df2f2cfaf83fdcf8931addcc5c9973eb` | Verified | GDAL XML projection metadata |
| **1C** | Horizons Fixtures (14 files) | NASA / JPL Horizons | https://ssd.jpl.nasa.gov/api/horizons.api | `science/fixtures/horizons/` | ~300 KB | (Tracked JSON) | Verified | IM-1, Blue Ghost 1, IM-2, Shackleton Peak (-89.68, 129.0), Apollo 11, Far-side, Near-limb. |
| **2E** | `im1_press_kit.pdf` | NASA | https://www.nasa.gov/wp-content/uploads/2024/01/np-2023-12-016-jsc-clps-im-press-kit-web-508.pdf | `docs/sources/im1_press_kit.pdf` | 8,481,852 | SHA-256: `4ec91714178a9c5f33d35d0b9433875219b72750a8801784113fd215bf3ff88d` | Verified | Pages 2-3 describe IM-1 Malapert A landing site and 6 NASA instruments |
| **2E** | `im2_press_kit.pdf` | NASA | https://nasa.gov/wp-content/uploads/2025/02/np-2025-02-005-jsc-clps-intuitive-machines-press-kit-508-2-25-25.pdf | `docs/sources/im2_press_kit.pdf` | 4,991,261 | SHA-256: `5b57f68e880635c0edb19d907e159725eb17fd1c45e2cca25fbe0cbc5dabbdef` | Verified | Pages 3-4 describe IM-2 Mons Mouton landing site and PRIME-1 drill |
| **2E** | `blue_ghost_1_press_kit.pdf` | NASA | https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf | `docs/sources/blue_ghost_1_press_kit.pdf` | 11,086,708 | SHA-256: `e667756f2cee5b45007015f5be9e3a3a4a62a77ea75425272bdded9c43bc9454` | Verified | Pages 3-4 describe Blue Ghost 1 Mare Crisium / Mons Latreille site and 10 instruments |
| **2E** | `peregrine_griffin_press_kit.pdf` | NASA | https://www.nasa.gov/wp-content/uploads/2023/12/np-2023-12-017-jsc-clps-astrobotic-press-kit-update-508.pdf | `docs/sources/peregrine_griffin_press_kit.pdf` | 3,944,413 | SHA-256: `c79ced140b1cf1102dbb295e10d9966f78b8b0ea82c10fc300984c451b92ba24` | Verified | Pages 2, 4, 18 describe Peregrine Sinus Viscositatis and Griffin Nobile / Mons Mouton context |
| **2F** | Scientific Constants | IAU / SORCE / NAIF | Single source of truth | `science/lunarsight_core/constants.py` | 7,173 | (Tracked python code) | Verified | TSI=1361.0 W/m² (SORCE), Sun R=695,700 km, Earth R=6378.137 km, Moon R=1737.4 km |
| **3H** | `LDEM_64.JP2` (Global DEM) | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/JP2/LDEM_64.JP2 | `terrain/global/LDEM_64.JP2` | 211,190,204 | SHA-256: `5bcdc1add91447d4386f0ccab17da2f6dd0ae8e116fbd60f56aa31d74248c096` | Verified | 23040x11520 px, 64 ppd global cylindrical raster |
| **3H** | `LDEM_64_JP2.LBL` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/JP2/LDEM_64_JP2.LBL | `terrain/global/LDEM_64_JP2.LBL` | 6,631 | SHA-256: `18164d5df19e4f0dbe039c7ff8cb2a4d7d63df2a12e1fba7af0cb294d1a173e8` | Verified | Global DEM PDS3 label |
| **3H** | `LDEM_64_AUX.XML` | MIT / NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/JP2/LDEM_64_AUX.XML | `terrain/global/LDEM_64_AUX.XML` | 2,457 | SHA-256: `ac16c0f6cfaa364b4d4688b5bcc2d3c94e89c81030df21a906a4198b7c4e7a9f` | Verified | Global DEM GDAL XML metadata |
| **3I** | `LPSR_85S_060M_201608.JP2` | MIT / NASA GSFC | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/JP2/LPSR_85S_060M_201608.JP2 | `terrain/illumination/LPSR_85S_060M_201608.JP2` | 5,574,318 | SHA-256: `3a39a4c151eb67278bf46383b77bbd4751db0de78bfc5b0ba87a79f37c220e31` | Verified | **Permanently Shadowed Region (PSR) map** (1=shadow, 0=not shadow per LBL). NOT illumination. |
| **3I** | `LPSR_85S_060M_201608_JP2.LBL` | MIT / NASA GSFC | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/JP2/LPSR_85S_060M_201608_JP2.LBL | `terrain/illumination/LPSR_85S_060M_201608_JP2.LBL` | 6,036 | SHA-256: `2d0ff43f129f1cce11a771c5ffb4688f7065e462c4c000c63531c3f0dfb894e3` | Verified | PSR map PDS3 label |
| **3I** | `LPSR_85S_060M_201608_AUX.XML` | MIT / NASA GSFC | https://imbrium.mit.edu/EXTRAS/ILLUMINATION/JP2/LPSR_85S_060M_201608_AUX.XML | `terrain/illumination/LPSR_85S_060M_201608_AUX.XML` | 1,428 | SHA-256: `7c9b1f24e55512c2290ab7ffbd5652178ae9db0c6ad4dcffe190d8bcaae8431f` | Verified | PSR map GDAL XML metadata |
| **3G** | `LPSR_80S_20MPP_ADJ_1km2.CSV` | NASA GSFC PGDA | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ_1km2.CSV | `terrain/pgda/LPSR_80S_20MPP_ADJ_1km2.CSV` | 29,642,968 | SHA-256: `5885065a71df5d4ae6fb2e9d28c2ff5506a782bfe88e5d2b7d27e2a4be60538a` | Verified | Permanently shadowed regions 1 km² table |
| **3G** | `LDEM_80S_80MPP_ADJ_HILL.TIF` | NASA GSFC PGDA | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ_HILL.TIF | `terrain/pgda/LDEM_80S_80MPP_ADJ_HILL.TIF` | 88,474,342 | SHA-256: `91c784742e97a2f58fa998a6db57fc35a297e68cf64731307b8ebf4b005fe4fb` | Verified | 80 mpp shaded relief GeoTIFF backdrop |
| **3G** | `LDEM_80S_80MPP_ADJ.TIF` | NASA GSFC PGDA | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF | `terrain/pgda/LDEM_80S_80MPP_ADJ.TIF` | 189,158,392 | SHA-256: `82030dcbdd7c4bb0c7d858e9b4b293b9f2cda5a543ba31ec0f42784bd6beee5a` | Verified | 80 mpp adjusted elevation GeoTIFF |

---

## 2. Row-by-Row Horizons Golden Benchmark Results

Every single row of all 7 Horizons fixtures (4,111 total timestamps) was compared against `spiceypy` topocentric coordinates at that exact epoch using the core SPICE ephemerides (`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`, `pck00011.tpc`):

| Fixture / Site Name | Epoch Range | Timesteps (Rows) | Sun Max Elev Diff | Sun Mean Elev Diff | Sun Max Az Diff | Earth Max Elev Diff | Earth Mean Elev Diff | Earth Max Az Diff | Golden Test Status |
|---|---|---|---|---|---|---|---|---|---|
| **IM-1** (-80.13, 1.44) | 2024-02-22 to 2024-03-22 | 697 | 0.00000° | 0.00000° | 0.00000° | 0.00003° | 0.00002° | 0.00000° | **PASSED** |
| **Blue Ghost 1** (18.56, 61.81) | 2025-03-02 to 2025-03-30 | 673 | 0.00000° | 0.00000° | 0.00000° | 0.00002° | 0.00002° | 0.00000° | **PASSED** |
| **IM-2** (-84.7906, 29.1957) | 2025-03-02 to 2025-03-30 | 673 | 0.00000° | 0.00000° | 0.00000° | 0.00003° | 0.00002° | 0.00000° | **PASSED** |
| **Apollo 11** (0.6875, 23.4333) | 1969-07-19 to 1969-07-21 | 49 | 0.00020° | 0.00020° | 0.00000° | 0.00003° | 0.00002° | 0.00005° | **PASSED** |
| **Shackleton Peak** (-89.68, 129.0) | 2025-03-02 to 2025-03-30 | 673 | 0.00000° | 0.00000° | 0.00000° | 0.00003° | 0.00002° | 0.00000° | **PASSED** |
| **Far-side** (0.0, 180.0) | 2025-03-02 to 2025-03-30 | 673 | 0.00000° | 0.00000° | 0.00001° | 0.00000° (El < -80°) | 0.00000° | 0.00004° | **PASSED** |
| **Near-limb** (0.0, 90.0) | 2025-03-02 to 2025-03-30 | 673 | 0.00000° | 0.00000° | 0.00000° | 0.00003° | 0.00002° | 0.00000° | **PASSED** |

---

## 3. Candidate Sites: Primary Sources and Sourced Coordinates

All candidate sites have been verified against NASA's refined Artemis III Candidate Landing Regions announcement (NASA Release 24-136, Oct 28, 2024), LPI exploration studies, and the USGS Gazetteer:

1. **Peak Near Shackleton (`cs-shackleton-rim`)**:
   - Corrected Coordinates: **-89.68°S, 129.0°E** (Region centroid; summit landing point evaluated at -89.017°S, 126.273°E per LPI / Spudis et al. 2008).
   - Old erroneous value: `-88.81, 123.69` (deleted).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://www.lpi.usra.edu/lunar/constellation/landing_sites/connecting_ridge/
2. **Connecting Ridge (`cs-connecting-ridge`)**:
   - Corrected Coordinates: **-89.45°S, -136.0°E** (136.0°W / 224.0°E; evaluated landing point -89.534°S, 209.948°E).
   - Old erroneous value: `-83.8, -30.5` (deleted; was over 180 km away from the Shackleton-de Gerlache ridge).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://www.lpi.usra.edu/lunar/constellation/landing_sites/connecting_ridge/
3. **Haworth (`cs-haworth`)**:
   - Corrected Coordinates: **-86.75°S, -22.84°E** (22.84°W / 337.16°E; Haworth crater center 87.4°S, 5.2°W per USGS Gazetteer).
   - Old erroneous value: `-86.4, -23.2` (corrected).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://planetarynames.wr.usgs.gov/Feature/2393
4. **Malapert Massif (`cs-malapert-massif`)**:
   - Corrected Coordinates: **-85.99°S, -2.93°E** (357.07°E / ~0.13°W).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://planetarynames.wr.usgs.gov/Feature/3599
5. **Mons Mouton Plateau (`cs-mons-mouton-plateau`)**:
   - Corrected Coordinates: **-85.42°S, 31.59°E**.
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ and https://planetarynames.wr.usgs.gov/Feature/16147
6. **Nobile Rim 1 (`cs-nobile-rim-1`)**:
   - Corrected Coordinates: **-85.35°S, 36.5°E** (Western raised rim of Nobile crater; corrected from prior errant 31.5°E which was on Mons Mouton).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
7. **Nobile Rim 2 (`cs-nobile-rim-2`)**:
   - Coordinates: **-84.2°S, 60.7°E** (Site DM2 on northeast rim).
   - URL: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
8. **Faustini Rim A (`cs-faustini-rim-a`)**:
   - Corrected Coordinates: **-87.88°S, 90.0°E** (Elevated crater rim ridge near 90°E meridian; corrected from prior crater floor center -87.3°S, 77.0°E).
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
