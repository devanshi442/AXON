"""
reproduce_5year_static.py — Reproduce the 5-year multi-year illumination and Earth metrics
for candidate sites over 2024-01-01 to 2028-12-31 (43,848 hours).
"""

import json
import pathlib
import sys
import time

from lunarsight_core import metrics as M

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "web" / "public" / "data"

def run_reproduction():
    sites_to_test = ["cs-connecting-ridge-site", "cs-connecting-ridge", "cs-shackleton-rim"]
    lines = []
    lines.append("=" * 80)
    lines.append("5-YEAR MULTI-YEAR REPRODUCTION OVER 2024-01-01 TO 2028-12-31 (43,848 HOURS)")
    lines.append("=" * 80)

    for site_id in sites_to_test:
        ts_path = DATA_DIR / "timeseries" / f"{site_id}.json"
        h_path = DATA_DIR / "horizon" / f"{site_id}.json"
        summary_path = DATA_DIR / "summary" / f"{site_id}.json"

        if not ts_path.is_file() or not h_path.is_file() or not summary_path.is_file():
            lines.append(f"Skipping {site_id}: missing assets")
            continue

        ts = json.loads(ts_path.read_text(encoding="utf-8"))
        h_data = json.loads(h_path.read_text(encoding="utf-8"))
        summary = json.loads(summary_path.read_text(encoding="utf-8"))

        h_mask = {
            "mask_deg": h_data["masks"].get("h_1_5m") or h_data["masks"].get("h_0m"),
            "az_step": 1.0,
            "dem_id": h_data.get("dem_id"),
        }

        scale = ts.get("scale", 100)
        unscaled_ts = {
            "times": [f"t_{i}" for i in range(len(ts["sun_elevation_deg"]))],
            "sun_elevation_deg": [v / scale for v in ts["sun_elevation_deg"]],
            "sun_azimuth_deg": [v / scale for v in ts["sun_azimuth_deg"]],
            "earth_elevation_deg": [v / scale for v in ts["earth_elevation_deg"]],
            "earth_azimuth_deg": [v / scale for v in ts["earth_azimuth_deg"]],
        }

        t0 = time.perf_counter()
        res = M.compute_site_flat_and_terrain_metrics(
            unscaled_ts,
            horizon_mask=h_mask,
            sun_threshold_deg=0.0,
            dte_margin_deg=0.0,
            site_lat=ts["lat"],
            site_lon=ts["lon"],
        )
        elapsed_s = time.perf_counter() - t0

        lines.append(f"\nSite: {site_id} ({summary.get('site_name', site_id)})")
        lines.append(f"  Coordinates: {ts['lat']:+.4f}°, {ts['lon']:+.4f}°")
        lines.append(f"  Total Period: 2024-01-01 to 2028-12-31 (43,848 h)")
        lines.append(f"  Compute Time: {elapsed_s:.3f} s")
        lines.append(f"  Static file (stored):")
        lines.append(f"    Flat Sun %:    {summary.get('flat', {}).get('sun', {}).get('percentage')}% ({summary.get('flat', {}).get('sun', {}).get('total_hours')} h)")
        lines.append(f"    Terrain Sun %: {summary.get('terrain', {}).get('sun', {}).get('percentage')}% ({summary.get('terrain', {}).get('sun', {}).get('total_hours')} h)")
        lines.append(f"    Terrain Earth%: {summary.get('terrain', {}).get('earth', {}).get('percentage')}% ({summary.get('terrain', {}).get('earth', {}).get('total_hours')} h)")
        lines.append(f"  Recomputed with current strict window engine:")
        lines.append(f"    Flat Sun %:    {res['flat']['sun']['percentage']}% ({res['flat']['sun']['total_hours']} h)")
        lines.append(f"    Terrain Sun %: {res['terrain']['sun']['percentage']}% ({res['terrain']['sun']['total_hours']} h)")
        lines.append(f"    Terrain Earth%: {res['terrain']['earth']['percentage']}% ({res['terrain']['earth']['total_hours']} h)")
        lines.append(f"    Terrain Joint%: {res['terrain']['joint']['percentage']}% ({res['terrain']['joint']['total_hours']} h)")

    output = "\n".join(lines)
    print(output)
    out_file = ROOT / "docs" / "verification" / "evidence" / "five_year_static_reproduction.txt"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(output, encoding="utf-8")
    print(f"\nSaved raw evidence to {out_file}")

if __name__ == "__main__":
    run_reproduction()

