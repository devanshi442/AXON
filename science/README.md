# lunarsight_core

Python science engine for **AXON LunarSight** — computes topocentric Sun and Earth azimuth/elevation from lunar surface sites using NASA NAIF SPICE kernels.

## Contents

- `lunarsight_core/constants.py` — single source of truth for all science conventions (frame, units, thresholds)
- `lunarsight_core/geometry.py` — SPICE-based ENU transform, Az/El calculation, timeseries, opportunity windows
- `tests/` — pytest suite (kernel tests marked `needs_kernels`, skippable in CI)
- `fixtures/horizons/` — JPL Horizons golden-test fixtures for regression testing

## Install

```bash
# From repo root (with venv active)
pip install -e science/
```

## Science conventions

| Convention | Value |
|---|---|
| Frame | MOON_ME (mean-Earth/polar-axis) |
| Latitude | Planetocentric |
| Longitude | East-positive, −180 to +180° |
| Time | UTC → ET (via NAIF LSK) |
| Reference radius | 1737.4 km |
| Sun "up" definition | Upper limb (center el + 0.267°) |
| Earth visibility | Geometric centre LOS only |
| Aberration correction | LT+S |

## Validation

Compared against NASA JPL Horizons observer tables (keyless public API).
Agreement < 0.00001° at all tested epochs and sites.
