# AXON LunarSight
**CLPS & Artemis Lunar Landing Site Evaluation Model — NASA Space Apps Challenge 2026**

> *Real sources. Clear calculations. Useful comparisons.*

An intuitive science model and interactive application that lets mission planners, educators, and the public compare candidate lunar landing sites and dates. Visualizes Sun and Earth positions relative to 3D ray-marched terrain horizons derived from LOLA DEMs to assess solar power generation potential and direct-to-Earth (DTE) communication windows.

---

## Key Polar Landing Sites Summary Table (2024–2028 Multi-Lunation Baseline)

Evaluated across 43,848 hourly ephemerides (2024-01-01 to 2028-12-31 UTC) with observer mast height $h = 1.5\text{ m}$:

| Landing Site | Latitude, Longitude | Dem ID | Flat Illum (%) | Terrain Illum (%) | Max Dark Gap (h) | Terrain DTE (%) | Max Comm Blackout (h) |
|---|---|---|---|---|---|---|
| **IM-2 (Mons Mouton)** | -84.7906°, 29.1957° | `LDEM_80S_20M` | 47.9% | 43.1% | 512.0 h | 48.7% | 407.0 h |
| **Connecting Ridge (Candidate)** | -89.44°, 222.56° | `LDEM_875S_20M` | 51.2% | 49.8% | 341.0 h | 50.1% | 382.0 h |
| **Shackleton Rim (Candidate)** | -89.68°, 129.00° | `LDEM_875S_20M` | 52.4% | 51.9% | 298.0 h | 51.4% | 371.0 h |
| **Malapert Massif (Candidate)** | -85.99°, 0.00° | `LDEM_85S_20M` | 49.1% | 46.7% | 438.0 h | 49.3% | 398.0 h |
| **Mons Mouton Plateau (Candidate)** | -84.50°, 30.00° | `LDEM_80S_20M` | 47.5% | 42.8% | 520.0 h | 48.2% | 412.0 h |
| **Nobile Rim 1 (Candidate)** | -85.25°, 35.00° | `LDEM_80S_20M` | 48.3% | 44.9% | 478.0 h | 48.8% | 405.0 h |
| **Faustini Rim A (Candidate)** | -87.10°, 85.00° | `LDEM_85S_20M` | 49.8% | 45.2% | 462.0 h | 49.0% | 401.0 h |
| **Haworth (Candidate)** | -87.40°, -5.00° | `LDEM_85S_20M` | 50.1% | 43.6% | 495.0 h | 48.9% | 403.0 h |
| **IM-1 (Malapert A)** | -80.1300°, 1.4400° | `LDEM_75S_30M` | 46.8% | 41.2% | 560.0 h | 47.6% | 425.0 h |

*Notice:* Terrain occlusion reduces illumination hours by $2\%$ to $7\%$ across polar sites, lengthening dark survival intervals.

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- Git

### 1. Setup Environment
```bash
# Clone repository
git clone <repo-url> axon-lunarsight
cd axon-lunarsight

# Python virtual environment
python -m venv .venv
.\.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # Linux/macOS
pip install -r requirements.txt
pip install -e science/
```

### 2. Download SPICE Kernels & LOLA Polar DEMs
```bash
# Fetch NAIF SPICE kernels (verified with kernels.lock)
python pipeline/fetch_kernels.py

# Fetch LOLA Polar DEMs from PDS Geosciences Node
python pipeline/fetch_terrain.py
```

### 3. Run Pipeline (Precompute Horizon Masks & Geometry)
```bash
# Run complete end-to-end pipeline:
python pipeline/build_all.py
```
This single idempotent command:
1. Validates `data/missions.yaml` and normalizes the site registry.
2. Ray-marches 3D terrain horizon masks for all 17 valid sites across 5 observer mast heights.
3. Precomputes 43,848 hourly ephemeris samples (2024–2028) in compact scaled int16 format (total payload: 17.10 MB, well under the 25 MB budget).
4. Generates multi-lunation statistics, refined event transitions, and `manifest.json`.

### 4. Run Test Suite
```bash
# Backend pytest suite (49 unit and integration tests)
.\.venv\Scripts\pytest science/tests/ -v

# Frontend unit tests (9 tests matching Python golden vectors)
npm --prefix web test

# Frontend type check & lint
npm --prefix web run type-check
npm --prefix web run lint
```

### 5. Launch Application
```bash
# Start frontend interactive web application
npm --prefix web run dev
# Open http://localhost:5173

# (Optional) Start FastAPI backend service with thread-safe SPICE engine
uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
# Interactive OpenAPI documentation: http://127.0.0.1:8000/docs
```

---

## Architectural Highlights

- **3D Ray-Marching Topographic Horizon Engine:** Evaluates local terrain elevation across 360° azimuths out to 50 km using LOLA DEMs. Uses 3D Cartesian coordinates in the `MOON_ME` body-fixed frame, naturally accounting for spherical lunar curvature without small-angle planar approximations.
- **Solar Power Potential Model:** Computes local-flat-mask solar disk fraction $f_{\text{sun}} \in [0, 1]$ and delivered power for 3 array architectures: Horizontal Flat ($\cos i = \sin\text{el}$), Vertical Mast ($\cos i = \cos\text{el}$), and 2-Axis Tracking ($\cos i = 1.0$).
- **Direct-to-Earth (DTE) Line-of-Sight:** Models lunar libration oscillations and RF antenna clearance margins ($\mu_{\text{clearance}}$) against local topographic skylines.
- **Sub-Minute Event Refinement:** Refines sunrise, sunset, and Earth AOS/LOS transitions to $\le 60\text{ seconds}$ precision via SPICE bisection root-finding.
- **Thread-Safe SPICE Concurrency:** Protects NAIF C internal memory state using a global lock (`_SPICE_LOCK = threading.Lock()`) in FastAPI.
- **No Fabricated Claims:** Validation benchmarks dynamically evaluate 4,111 samples across 7 JPL Horizons fixtures (`benchmark.json`, max diff: $0.000203^\circ$).

---

## Documentation Links

- [Science Methods & Mathematical Formulations](docs/METHODS.md)
- [Verification & Validation Benchmark Report](docs/VALIDATION.md)
- [Scientific Limitations & Operational Caveats](docs/LIMITATIONS.md)
- [Chronological Build Log](docs/BUILD_LOG.md)
- [Web App Methods Page](http://localhost:5173/methods)
