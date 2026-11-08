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


DEM_HASHES = {
    "LDEM_875S_20M": "fff7c2017a192788066a0867d78fd1ccf783216e26974b5e65287669aa472bac",
    "LDEM_85S_20M": "66b8cafd638f7b710c11bfe962f35a5be8bffe744991e1eea848c24eb8dabc7c",
    "LDEM_85S_40M": "9b5e29faf57883be1e3ba1a7fc536f08ff628662184097630b19759a35ffec18",
    "LDEM_80S_20M": "a38177093626d85ab6d38ffbd48bba6ac6842d5efee610aebc41cd9c54438dc6",
    "LDEM_80S_40M": "7413280e83e52af1ee68278b7d1b52b5c8ca460c12f27873159dab155b8e7550",
    "LDEM_75S_30M": "7a1750ddd57d098179076f83869446a2716d269a01e31afeff84dcb80d40e400",
    "LDEM_64": "5bcdc1add91447d4386f0ccab17da2f6dd0ae8e116fbd60f56aa31d74248c096",
}


def build_all_horizons(verbose: bool = True, overwrite: bool = False, force: bool = False):
    OUT_WEB.mkdir(parents=True, exist_ok=True)
    OUT_LEGACY.mkdir(parents=True, exist_ok=True)

    force = force or overwrite or ("--force" in sys.argv)

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

        lat = float(s.lat)
        lon = float(s.lon)

        # Sensitivity analysis at 20, 50, 100 km for Shackleton reference site
        # Other polar sites use [20, 50] km, non-polar use [20, 30] km
        if "shackleton" in s.id.lower():
            ranges_to_eval = [20.0, 50.0, 100.0]
        elif lat <= -60.0:
            ranges_to_eval = [20.0, 50.0]
        else:
            ranges_to_eval = [20.0, 30.0]

        max_eval_range = max(ranges_to_eval)
        chosen_dem, _, _ = terrain.select_dem_for_site(lat, lon, max_range_km=max_eval_range)
        dem_id = chosen_dem.id if chosen_dem else "flat"
        dem_path = (terrain.get_terrain_dir() / chosen_dem.filename) if chosen_dem else None
        dem_file_size = dem_path.stat().st_size if dem_path and dem_path.exists() else 0
        dem_file_hash = DEM_HASHES.get(dem_id, "")

        out_file = OUT_WEB / f"{s.id}.json"
        if out_file.is_file() and not force:
            try:
                cached = json.loads(out_file.read_text(encoding="utf-8"))
                coords_match = (
                    abs(cached.get("lat", -999) - lat) < 1e-4
                    and abs(cached.get("lon", -999) - lon) < 1e-4
                )
                dem_matches = cached.get("dem_id") == dem_id
                masts_match = cached.get("mast_heights") == mast_heights
                size_matches = cached.get("dem_file_size") == dem_file_size
                hash_matches = cached.get("dem_file_hash") == dem_file_hash

                if coords_match and dem_matches and masts_match and size_matches and hash_matches:
                    if verbose:
                        print(f"  Skipping {s.id} (cache valid: coords/DEM/masts match).", flush=True)
                    # Ensure legacy folder has it too
                    legacy_file = OUT_LEGACY / f"{s.id}.json"
                    if not legacy_file.is_file():
                        legacy_file.write_text(out_file.read_text(encoding="utf-8"), encoding="utf-8")
                    count += 1
                    continue
                else:
                    if verbose:
                        print(f"  Stale cache for {s.id} (coords/DEM/masts changed) -> recomputing...", flush=True)
            except Exception:
                pass

        if verbose:
            print(f"  Calculating horizon for {s.id} ({lat:+.4f}°, {lon:+.4f}°)...", flush=True)

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
            "dem_file_size": dem_file_size,
            "dem_file_hash": dem_file_hash,
            "mast_heights": mast_heights,
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
