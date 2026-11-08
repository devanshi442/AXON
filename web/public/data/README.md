# Precomputed Static Data Assets

This directory contains precomputed JSON data assets consumed directly by the AXON LunarSight web application.

All data files in this directory are **committed to git** to enable standalone static deployment (e.g. GitHub Pages or CDN hosting) without requiring an active Python SPICE backend server:

- `missions.json` — compiled site catalog generated from `data/missions.yaml` via `python pipeline/validate_missions.py` (with authoritative site annotations from `sites.py`).
- `manifest.json` — SHA-256 provenance hashes, sample counts, and generation timestamps.
- `benchmark.json` — verified JPL Horizons regression results across 4,111 timestamps.
- `timeseries/*.json` — 19 per-site hourly topocentric elevation/azimuth series (scaled int16 factor 100, 43,848 samples covering 2024–2028).
- `horizon/*.json` — 19 per-site 3D ray-marched terrain horizon masks across 5 mast heights (0 m, 1.5 m, 3 m, 5 m, 10 m).
- `events/*.json` — 19 per-site contiguous illumination and communication window intervals.
- `summary/*.json` — 19 per-site side-by-side comparison summaries (flat sphere 0° horizon vs terrain).

To regenerate all precomputed data assets idempotently:
```bash
python pipeline/build_all.py
```
Total data directory size is approximately 20.15 MB, well below the 25.0 MB repository budget.
