"""
print_flat_vs_terrain_table.py — Flat vs Terrain illumination & DTE table with printed thresholds.

Unified rule:
  Sun is up when: sun_center_elevation + sun_angular_radius(0.267°) > terrain_mask_elevation + sun_extra_margin(0.0°)
  Earth visible when: earth_center_elevation >= terrain_mask_elevation + antenna_margin(0.0°)
  Terrain mask is NOT clamped at 0°.
  Observer mast height: 1.5 m.
"""

from __future__ import annotations

import json
import pathlib
import sys
import numpy as np

from lunarsight_core import constants as C
from lunarsight_core import geometry as G
from lunarsight_core import horizon
from lunarsight_core import metrics
from lunarsight_core import terrain
from lunarsight_core import visibility

ROOT = pathlib.Path(__file__).resolve().parent.parent
HORIZON_DIR = ROOT / "web" / "public" / "data" / "horizon"

SITES_CONFIG = [
    # 2 new evaluated sites
    ("cs-shackleton-ridge-site", -89.017, 126.273, "Shackleton Ridge (Evaluated Site)", True),
    ("cs-connecting-ridge-site", -89.534, -150.052, "Connecting Ridge (Evaluated Site)", True),
    # Region centroids
    ("cs-connecting-ridge", -89.45, -136.0, "Connecting Ridge (Centroid)", True),
    ("cs-shackleton-rim", -89.68, 129.0, "Shackleton Rim (Centroid)", True),
    # Candidate sites
    ("cs-malapert-massif", -85.99, -2.93, "Malapert Massif", True),
    ("cs-nobile-rim-1", -85.35, 36.50, "Nobile Rim 1", True),
    ("cs-nobile-rim-2", -84.20, 60.70, "Nobile Rim 2", True),
    ("cs-faustini-rim-a", -87.88, 90.00, "Faustini Rim A", True),
    ("cs-haworth", -86.75, -22.84, "Haworth Rim", True),
    ("cs-mons-mouton-plateau", -85.42, 31.59, "Mons Mouton Plateau", True),
    # Landers
    ("im-1", -80.13, 1.44, "IM-1 (Malapert A)", True),
    ("im-2", -84.7906, 29.1957, "IM-2 (Shackleton Connecting Ridge)", True),
    # 3 crater-floor PSR points
    ("psr-shackleton-floor", -89.90, 0.00, "Shackleton Crater Floor (PSR)", False),
    ("psr-faustini-floor", -87.30, 77.00, "Faustini Crater Floor (PSR)", False),
    ("psr-haworth-floor", -87.40, -5.00, "Haworth Crater Floor (PSR)", False),
]


def load_or_compute_mask(sid: str, lat: float, lon: float, is_catalog: bool) -> dict:
    if is_catalog:
        fpath = HORIZON_DIR / f"{sid}.json"
        if fpath.is_file():
            d = json.loads(fpath.read_text(encoding="utf-8"))
            mask_deg = d.get("masks", {}).get("h_1_5m") or d.get("masks", {}).get("h_0m")
            return {
                "mask_deg": mask_deg,
                "az_step": 1.0,
                "dem_id": d.get("dem_id", "NONE"),
                "site_height_m": d.get("site_height_m", 0.0),
            }
    # For PSR points or uncomputed, compute with 1.5m mast
    mask_res = horizon.compute_horizon(lat, lon, observer_height_m=1.5, max_range_km=50.0)
    return mask_res


def evaluate_window(
    start_utc: str,
    stop_utc: str,
    window_label: str,
):
    print("=" * 130)
    print(f"EVALUATION WINDOW: {window_label} ({start_utc} to {stop_utc})")
    print("THRESHOLDS & SEMANTICS:")
    print("  • Sun up rule       : sun_center_el + 0.267° > mask_el + 0.0° (sun_extra_margin = 0.0°)")
    print("  • Earth visible rule: earth_center_el >= mask_el + 0.0° (antenna_margin = 0.0°)")
    print("  • Observer mast     : 1.5 m")
    print("  • Mask clamping     : UNCLAMPED (negative skyline angles preserved for high peaks)")
    print("=" * 130)

    header = f"| {'Site ID':27s} | {'Lat':6s} | {'Lon':7s} | {'DEM ID':14s} | {'Flat Sun %':10s} | {'Terr Sun %':10s} | {'Flat DTE %':10s} | {'Terr DTE %':10s} | {'Dark Gap':8s} | {'Flags / Notes':30s} |"
    sep = "|" + "-"*29 + "|" + "-"*8 + "|" + "-"*9 + "|" + "-"*16 + "|" + "-"*12 + "|" + "-"*12 + "|" + "-"*12 + "|" + "-"*12 + "|" + "-"*10 + "|" + "-"*32 + "|"
    print(header)
    print(sep)

    for sid, lat, lon, name, is_cat in SITES_CONFIG:
        mask_data = load_or_compute_mask(sid, lat, lon, is_cat)
        dem_id = mask_data.get("dem_id", "NONE")

        # SPICE timeseries
        ts = G.compute_site_timeseries(lat, lon, start_utc, stop_utc, step_seconds=3600)
        sun_el = ts["sun_elevation_deg"]
        sun_az = ts["sun_azimuth_deg"]
        earth_el = ts["earth_elevation_deg"]
        earth_az = ts["earth_azimuth_deg"]

        # Flat vs Terrain
        v_sun_flat = visibility.compute_sun_visibility(sun_el, sun_az, mask=None, threshold_deg=0.0)
        v_sun_terr = visibility.compute_sun_visibility(sun_el, sun_az, mask=mask_data, threshold_deg=0.0)

        v_earth_flat = visibility.compute_earth_visibility(earth_el, earth_az, mask=None, margin_deg=0.0)
        v_earth_terr = visibility.compute_earth_visibility(earth_el, earth_az, mask=mask_data, margin_deg=0.0)

        n_samples = len(sun_el)
        flat_sun_pct = (np.sum(v_sun_flat["visible"]) / n_samples) * 100.0
        terr_sun_pct = (np.sum(v_sun_terr["visible"]) / n_samples) * 100.0

        flat_earth_pct = (np.sum(v_earth_flat["visible"]) / n_samples) * 100.0
        terr_earth_pct = (np.sum(v_earth_terr["visible"]) / n_samples) * 100.0

        # Longest dark gap
        terr_sun_vis = list(v_sun_terr["visible"])
        longest_dark_gap_h = metrics._longest_run_hours(terr_sun_vis, 3600, False)

        # Flags
        flags = []
        if terr_sun_pct == 0.0:
            flags.append("FLAG 0% (Permanent Shadow)")
        elif terr_sun_pct == 100.0:
            flags.append("FLAG 100% (Continuous Sunlight)")

        if "ridge" in sid or "rim" in sid or "massif" in sid:
            if terr_sun_pct < flat_sun_pct:
                flags.append("Peak < Flat (Far ridges block low sun)")
            elif terr_sun_pct > flat_sun_pct:
                flags.append("Peak > Flat (Horizon dip gain)")

        flag_str = "; ".join(flags) if flags else "-"
        print(f"| {sid:27s} | {lat:6.2f} | {lon:7.2f} | {dem_id:14s} | {flat_sun_pct:9.2f}% | {terr_sun_pct:9.2f}% | {flat_earth_pct:9.2f}% | {terr_earth_pct:9.2f}% | {longest_dark_gap_h:7.1f}h | {flag_str:30s} |")

    print(sep)
    print()


def main():
    G.load_kernels()

    # 1. Full Year (2026-01-01 to 2027-01-01)
    evaluate_window("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z", "FULL 1-YEAR (2026)")

    # 2. 30-Day UI Window (starting at default date 2026-03-01T00:00:00Z)
    evaluate_window("2026-03-01T00:00:00Z", "2026-03-31T00:00:00Z", "30-DAY UI WINDOW (March 2026)")

    G.unload_kernels()


if __name__ == "__main__":
    main()
