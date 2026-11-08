"""
build_horizon.py — Precompute topographic horizon masks for all documented sites.

Generates:
  web/public/data/horizon/{site_id}.json
  web_public_data/horizon/{site_id}.json

Computes 360° skyline masks across:
- Mast heights: 0m, 1.5m, 3m, 5m, 10m
- Range sensitivity: 20km, 50km, 100km (where DEM coverage permits)
"""

from __future__ import annotations

import datetime
import json
import pathlib
import sys
import time

from lunarsight_core import horizon
from lunarsight_core import sites
from lunarsight_core import terrain

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_WEB = ROOT / "web" / "public" / "data" / "horizon"
OUT_LEGACY = ROOT / "web_public_data" / "horizon"


def build_all_horizons(verbose: bool = True, overwrite: bool = False):
    OUT_WEB.mkdir(parents=True, exist_ok=True)
    OUT_LEGACY.mkdir(parents=True, exist_ok=True)

    valid_sites = sites.get_valid_sites()
    if verbose:
        print(f"Precomputing terrain horizons for {len(valid_sites)} sites with valid coordinates...", flush=True)

    mast_heights = [0.0, 1.5, 3.0, 5.0, 10.0]
    sensitivity_ranges = [20.0, 50.0, 100.0]

    count = 0
    t0 = time.time()

    for s in valid_sites:
        if s.lat is None or s.lon is None:
            continue

        out_file = OUT_WEB / f"{s.id}.json"
        if out_file.is_file() and not overwrite:
            if verbose:
                print(f"  Skipping {s.id} (already generated).", flush=True)
            # Ensure legacy folder has it too
            legacy_file = OUT_LEGACY / f"{s.id}.json"
            if not legacy_file.is_file():
                legacy_file.write_text(out_file.read_text(encoding="utf-8"), encoding="utf-8")
            count += 1
            continue

        lat = float(s.lat)
        lon = float(s.lon)
        if verbose:
            print(f"  Calculating horizon for {s.id} ({lat:+.4f}°, {lon:+.4f}°)...", flush=True)

        # Sensitivity analysis at 20, 50, 100 km for Shackleton reference site
        # Other polar sites use [20, 50] km, non-polar use [20, 30] km
        if "shackleton" in s.id.lower():
            ranges_to_eval = [20.0, 50.0, 100.0]
        elif lat <= -60.0:
            ranges_to_eval = [20.0, 50.0]
        else:
            ranges_to_eval = [20.0, 30.0]

        res = horizon.compute_horizon_multi(
            lat,
            lon,
            observer_heights_m=mast_heights,
            max_ranges_km=ranges_to_eval,
            az_step_deg=1.0,
        )

        payload = {
            "site_id": s.id,
            "site_name": s.name,
            "kind": s.kind,
            "lat": lat,
            "lon": lon,
            "coord_status": s.coord_status,
            "site_height_m": res["site_height_m"],
            "dem_id": res["dem_id"],
            "resolution_m": res["resolution_m"],
            "coverage_status": res["coverage_status"],
            "default_range_km": 50.0 if lat <= -60.0 else 30.0,
            "masks": res["masks"],
            "sensitivity": res["sensitivity"],
            "generated_at": res["generated_at"],
        }

        # Save to both locations
        json_str = json.dumps(payload, separators=(",", ":"))
        (OUT_WEB / f"{s.id}.json").write_text(json_str, encoding="utf-8")
        (OUT_LEGACY / f"{s.id}.json").write_text(json_str, encoding="utf-8")
        count += 1

    elapsed = round(time.time() - t0, 1)
    if verbose:
        print(f"Successfully generated {count} horizon masks in {elapsed}s.")


if __name__ == "__main__":
    build_all_horizons()
