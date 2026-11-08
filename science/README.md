# lunarsight_core

Python core science engine for **AXON LunarSight** — computes high-precision topocentric ephemerides (Sun and Earth azimuth/elevation), DEM-derived horizon obstruction masks, and line-of-sight visibility metrics for lunar surface exploration sites.

---

## Contents & Architecture

The package is located at `science/lunarsight_core/` and comprises the following modular subsystems:

| Module | Purpose |
|---|---|
| `constants.py` | Single source of truth for lunar constants, reference frame names (`MOON_ME`), semi-diameters, Sun upper-limb offset ($+0.267^\circ$), and default observer mast height ($1.5\text{ m}$). |
| `geometry.py` | NAIF SPICE wrapper and topocentric geometry engine. Implements East-North-Up (ENU) surface projection, light-time and stellar aberration corrections (`LT+S`), vector Az/El computation, and discrete event window extraction. |
| `terrain.py` | LOLA DEM reader, spatial coordinate transformers, geodetic-to-polar-stereographic conversions, elevation sampling with 0.5 m/DN scale factor, and sub-window extraction. |
| `horizon.py` | Horizon mask generation via discrete radial ray-marching out to $50\text{ km}$ across 360 azimuth bins ($1^\circ$ resolution) at configurable mast heights ($0\text{ m}$ to $10\text{ m}$). Preserves physically authentic negative horizon dips for high peaks. |
| `visibility.py` | Direct line-of-sight evaluation comparing celestial body elevation against azimuth-matched horizon mask elevation (with optional tolerance thresholds). |
| `metrics.py` | Statistical analysis of illumination and direct-to-Earth communication: cumulative percentage, maximum consecutive daylight/darkness periods, and direct line-of-sight contact availability. |
| `power.py` | Idealized geometrical solar flux proxy ($\cos \theta$ solar incidence angle relative to horizontal plane, unattenuated by atmosphere). |
| `sites.py` | Site registry parser, coordinate resolver, and annotations registry (including documentation on region centres vs DEM-derived topographic crests). |
| `benchmark.py` | Validation utility executing automated regressions against committed NASA JPL Horizons observer tables. |

---

## Installation

Ensure your Python virtual environment is activated, then install the package in editable mode:

```bash
# From repository root
pip install -e science/
```

### Dependencies
- `numpy`, `scipy`
- `spiceypy` (NAIF SPICE C-toolkit wrapper)
- `rasterio` (GeoTIFF/DEM spatial processing)
- `pytest` (testing framework)

---

## Science Conventions & Constants

All geometric calculations adhere strictly to NAIF SPICE and planetary cartographic standards:

| Convention | Value / Standard | Notes |
|---|---|---|
| Coordinate Frame | `MOON_ME` | Mean-Earth / Polar-Axis reference frame |
| Latitude | Planetocentric | Measured northwards from equator ($-90^\circ$ to $+90^\circ$) |
| Longitude | East-Positive | $0^\circ$ to $360^\circ$ or $-180^\circ$ to $+180^\circ$ |
| Time System | UTC $\rightarrow$ TDB/ET | Converted via NAIF Leapseconds Kernel (`naif0012.tls`) |
| Lunar Reference Radius | $1737.4\text{ km}$ | Reference sphere radius for topocentric transformations |
| Ephemerides | DE440s / MOON_PA_DE440 | Planetary and lunar ephemeris kernels |
| Aberration Correction | `LT+S` | Light-time + stellar aberration |
| Sun Visibility Rule | $\text{el}_{\text{sun, center}} + 0.267^\circ > h_{\text{mask}}(\text{az})$ | Solar semi-diameter included (upper limb visible) |
| Earth Visibility Rule | $\text{el}_{\text{earth, center}} \ge h_{\text{mask}}(\text{az})$ | Geometric centre line-of-sight to Earth centre |
| Horizon Mask Clamping | None | Negative elevation angles preserved (peaks dip below local horizontal) |
| Observer Mast Height | $1.5\text{ m}$ (default) | Configurable up to $10\text{ m}$; visibility is monotonic non-decreasing |

---

## Validation & Testing

The package includes an extensive test suite verifying mathematical consistency, SPICE vector accuracy against NASA JPL Horizons tables, DEM scaling, and horizon generation logic.

```bash
# Run the full science test suite
pytest science/tests/
```

**Test Suite Coverage (52 passed):**
- `test_constants.py`: Verifies physical constants, frames, and threshold definitions.
- `test_geometry.py`: Verifies ENU matrix orthogonality, topocentric transformations, and known geometry controls.
- `test_api.py` & `test_api_v2.py`: Validates SPICE ephemerides against JPL Horizons observer tables (residuals $< 0.00001^\circ$).
- `test_terrain.py`: Verifies LOLA DEM scaling ($0.5\text{ m/DN}$), window slicing, coordinate transforms, and height retrieval.
- `test_horizon_cache.py`: Verifies hash-based cache invalidation, metadata integrity, and CLI regeneration.
- `test_metrics_and_power.py`: Verifies daylight window tracking, illumination statistics, and mast height monotonicity.
