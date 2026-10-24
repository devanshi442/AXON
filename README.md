# AXON LunarSight
**CLPS Lunar Mission Browser — NASA Space Apps Challenge 2026**

> *Real sources. Clear calculations. Useful comparisons.*

Compare CLPS landing sites by Sun availability, Earth visibility, and mission facts — powered by SPICE ephemerides, validated against JPL Horizons.

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- Git

### 1. Clone & set up Python env
```bash
git clone <repo-url> axon-lunarsight
cd axon-lunarsight
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
pip install -e science/   # install lunarsight_core package
```

### 2. Download SPICE kernels
```bash
python pipeline/fetch_kernels.py
```
> ⚠️ Verify kernel filenames at https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ first.
> Record SHA-256 hashes in `kernels.lock`.

Required files (saved to `kernels/`):
| File | Path at NAIF |
|---|---|
| `naif0012.tls` | `lsk/naif0012.tls` |
| `pck00011.tpc` | `pck/pck00011.tpc` |
| `de440s.bsp` | `spk/planets/de440s.bsp` |
| `moon_pa_de440_200625.bpc` | `pck/moon_pa_de440_200625.bpc` |
| `moon_de440_250416.tf` | `fk/satellites/moon_de440_250416.tf` |

### 3. Validate missions data & compile JSON
```bash
python pipeline/validate_missions.py
```
Validates YAML mission catalog against schema and writes `web/public/data/missions.json` and `web_public_data/missions.json`. Warnings are expected (`verified: false` pending 2nd review).

### 4. Build Precomputed Geometry Timeseries (2024–2028)
```bash
python pipeline/build_geometry.py
```
Computes hourly Sun/Earth ephemerides and opportunity windows (43,848 hours per site across 2024–2028) using SPICE `MOON_ME` body-fixed coordinates with `LT+S` aberration correction. Output files are written to `web/public/data/` (`timeseries/`, `events/`, `summary/`, and `manifest.json`).

### 5. Run Python & Frontend Tests
```bash
# Python SPICE geometry & API tests (17 tests)
pytest science/tests/ -v

# Frontend unit tests, linting, and type-check
cd web
npm install
npm test
npm run type-check
npm run lint
```

### 6. Start the frontend
```bash
cd web
npm run dev
```
Open http://localhost:5173

To build the static production bundle:
```bash
npm run build
```

### 7. Start the API (optional, for custom real-time queries)
```bash
uvicorn api.main:app --reload
```

---

## Repository Layout
```
axon-lunarsight/
├─ data/           missions.yaml, schema/
├─ science/        lunarsight_core/ package, tests/, fixtures/
├─ pipeline/       fetch_kernels.py, fetch_terrain.py, validate_missions.py,
│                  fetch_horizons_fixtures.py, build_geometry.py
├─ api/            FastAPI app, Dockerfile
├─ web/            React + Vite + TS + Tailwind SPA
│   └─ public/data/  missions.json (committed), precomputed series (gitignored)
├─ docs/           Blueprint, BUILD_LOG, METHODS, VALIDATION, LIMITATIONS
├─ kernels/        SPICE kernels (gitignored — download locally)
├─ terrain/        LOLA DEMs (gitignored — download locally)
├─ kernels.lock    SHA-256 checksums for pinned kernels
└─ README.md
```

---

## Science conventions (full list: see web app Methods page)
| Convention | Value |
|---|---|
| Time input/display | UTC |
| Internal time scale | Ephemeris Time (ET) via NAIF leap-seconds kernel |
| Longitude | East-positive, −180 to +180° |
| Latitude | Planetocentric |
| Frame | Lunar mean-Earth/polar-axis (MOON_ME) |
| Reference radius | 1737.4 km |
| Atmospheric refraction | None (Moon has no atmosphere) |
| Sun "up" definition | Upper limb (center elevation + 0.267°) |
| Flat-horizon label | "Idealized horizon, not terrain-aware" |
| Earth visibility label | "Geometric only — not a link budget" |

---

## Data sources & licences
- Mission data: NASA CLPS pages, LROC, provider press kits, Jatan.space, Wikipedia (secondary)
- Ephemeris: NAIF SPICE (public domain, JPL/NASA)
- Terrain: LOLA GDR (NASA/MIT; PDS open data)
- Validation: JPL Horizons API (keyless, public)
- All source URLs are embedded in `data/missions.yaml` and visible in the UI

---

## Team
NASA Space Apps Challenge 2026 — AXON

---

## Limitations (summary — see Methods page for full list)
- Earth visibility is geometric only; it is **not** a communication guarantee
- Phase 0–3 uses a flat (idealized) horizon only; results at the south pole are especially sensitive to terrain
- Coordinates for some missions are estimated or unverified; check the `verified` badge
- Do not use this tool for flight planning or mission-critical decisions
